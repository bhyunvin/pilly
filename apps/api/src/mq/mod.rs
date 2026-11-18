use std::sync::Arc;
use std::time::Duration;

use iggy::prelude::*;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, QueryBuilder};
use tokio::sync::{Mutex, RwLock};

use crate::sync::{PillSyncConfig, sync_pill_catalog};

const STREAM_NAME: &str = "pilly-events";
const ACTIVITY_TOPIC: &str = "user-activity";
const PARTITION_ID: u32 = 1;

/// Iggy 스트림으로 전송되는 비동기 이벤트 페이로드
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum PillyEvent {
    UserActivity {
        user_id: String,
        action: String,
        details: Option<String>,
    },
    SearchStat {
        user_id: String,
        query: String,
    },
    AdminAudit {
        admin_id: String,
        action: String,
        target_id: String,
    },
    SyncPills {
        triggered_by: String,
    },
    CleanupWithdrawnUsers,
}

type ActivityRow = (String, String, Option<String>);

impl PillyEvent {
    /// 활동 로그(`user_activity_logs`)로 기록되는 이벤트를 `(user_id, action, details)`로 변환합니다.
    /// 배치 작업 이벤트(`SyncPills`, `CleanupWithdrawnUsers`)는 `None`입니다.
    fn into_activity(self) -> Option<ActivityRow> {
        match self {
            Self::UserActivity {
                user_id,
                action,
                details,
            } => Some((user_id, action, details)),
            Self::SearchStat { user_id, query } => {
                Some((user_id, "SEARCH".to_string(), Some(query)))
            }
            Self::AdminAudit {
                admin_id,
                action,
                target_id,
            } => Some((admin_id, format!("ADMIN_{action}"), Some(target_id))),
            Self::SyncPills { .. } | Self::CleanupWithdrawnUsers => None,
        }
    }
}

/// Apache Iggy 비동기 이벤트 프로듀서
#[derive(Clone)]
pub struct EventProducer {
    client: Arc<RwLock<Option<Arc<IggyClient>>>>,
    pool: PgPool,
    http: reqwest::Client,
    pill_sync: Option<Arc<PillSyncConfig>>,
    sync_lock: Arc<Mutex<()>>,
}

impl EventProducer {
    /// Iggy 서버에 연결하고 스트림/토픽을 초기화합니다.
    /// 연결 실패 시에도 서버가 중단되지 않도록 PostgreSQL 직접 적재 모드로 폴백하며,
    /// 백그라운드에서 지수 백오프로 자동 재연결을 시도합니다.
    pub async fn connect(address: &str, username: &str, password: &str, pool: PgPool) -> Self {
        let initial_client = match tokio::time::timeout(
            Duration::from_secs(2),
            Self::try_connect(address, username, password),
        )
        .await
        {
            Ok(Ok(client)) => {
                tracing::info!("Apache Iggy 연결 성공 ({})", address);
                Some(Arc::new(client))
            }
            Ok(Err(err)) => {
                tracing::warn!(
                    "Apache Iggy 연결 실패 ({}): {:?}. PostgreSQL 직접 적재 폴백 모드로 동작합니다.",
                    address,
                    err
                );
                None
            }
            Err(_) => {
                tracing::warn!(
                    "Apache Iggy 연결 타임아웃 ({}). PostgreSQL 직접 적재 폴백 모드로 동작합니다.",
                    address
                );
                None
            }
        };

        let producer = Self {
            client: Arc::new(RwLock::new(initial_client)),
            pool,
            http: reqwest::Client::new(),
            pill_sync: None,
            sync_lock: Arc::new(Mutex::new(())),
        };

        producer.spawn_reconnect_loop(
            address.to_string(),
            username.to_string(),
            password.to_string(),
        );

        producer
    }

    /// 의약품 동기화(`SyncPills`) 이벤트 처리에 사용할 공공데이터 API 설정을 지정합니다.
    pub fn with_pill_sync(mut self, cfg: PillSyncConfig) -> Self {
        self.pill_sync = Some(Arc::new(cfg));
        self
    }

    /// 현재 Iggy 스트리밍 연결 활성 여부를 반환합니다.
    pub async fn is_connected(&self) -> bool {
        self.client.read().await.is_some()
    }

    /// 백그라운드에서 Iggy 연결 상태를 감시하고 단절 시 지수 백오프(5초 -> 최대 60초)로 재연결합니다.
    fn spawn_reconnect_loop(&self, address: String, username: String, password: String) {
        let client_lock = self.client.clone();
        tokio::spawn(async move {
            let mut backoff_secs = 5u64;
            loop {
                tokio::time::sleep(Duration::from_secs(backoff_secs)).await;

                if client_lock.read().await.is_some() {
                    backoff_secs = 5;
                    continue;
                }

                tracing::info!("Apache Iggy 백그라운드 재연결 시도 ({})...", address);
                match Self::try_connect(&address, &username, &password).await {
                    Ok(new_client) => {
                        *client_lock.write().await = Some(Arc::new(new_client));
                        tracing::info!(
                            "Apache Iggy 재연결 및 스트리밍 모드 복구 완료 ({})",
                            address
                        );
                        backoff_secs = 5;
                    }
                    Err(err) => {
                        tracing::warn!(
                            "Apache Iggy 재연결 실패 ({:?}). {}초 후 재시도합니다.",
                            err,
                            backoff_secs
                        );
                        backoff_secs = (backoff_secs * 2).min(60);
                    }
                }
            }
        });
    }

    /// Iggy 서버에 접속하여 로그인하고, 스트림/토픽이 없으면 생성합니다.
    async fn try_connect(
        address: &str,
        username: &str,
        password: &str,
    ) -> Result<IggyClient, IggyError> {
        let client = IggyClient::builder()
            .with_tcp()
            .with_server_address(address.to_string())
            .build()?;

        client.connect().await?;
        client.login_user(username, password).await?;

        // 주의: get_stream/get_topic은 미존재 시 Err가 아닌 Ok(None)을 반환한다.
        let stream_id = Identifier::named(STREAM_NAME)?;
        if client.get_stream(&stream_id).await?.is_none() {
            client
                .create_stream(STREAM_NAME, &StreamCreateOptions::default())
                .await?;
        }

        let topic_id = Identifier::named(ACTIVITY_TOPIC)?;
        if client.get_topic(&stream_id, &topic_id).await?.is_none() {
            client
                .create_topic(
                    &stream_id,
                    ACTIVITY_TOPIC,
                    &TopicCreateOptions {
                        partitions_count: Some(1),
                        compression_algorithm: Some(CompressionAlgorithm::None),
                        message_expiry: Some(IggyExpiry::NeverExpire),
                        ..Default::default()
                    },
                )
                .await?;
        }

        Ok(client)
    }

    /// 이벤트를 postcard 바이너리로 직렬화하여 Iggy 스트림에 초고속 발행합니다.
    /// Iggy가 오프라인이거나 발행에 실패한 경우 이벤트 유실 방지를 위해 직접 처리(DB 폴백)합니다.
    pub async fn publish(&self, event: PillyEvent) {
        let client_opt = self.client.read().await.clone();
        if let Some(client) = client_opt
            && let Ok(payload) = postcard::to_allocvec(&event)
            && let (Ok(stream_id), Ok(topic_id)) = (
                Identifier::named(STREAM_NAME),
                Identifier::named(ACTIVITY_TOPIC),
            )
        {
            let Ok(message) = IggyMessage::builder().payload(payload.into()).build() else {
                return;
            };
            let mut messages = vec![message];

            match client
                .send_messages(
                    &stream_id,
                    &topic_id,
                    &Partitioning::partition_id(PARTITION_ID),
                    &mut messages,
                )
                .await
            {
                Ok(_) => return,
                Err(err) => {
                    tracing::error!(
                        "Iggy 메시지 발행 실패 ({:?}). DB 폴백 모드로 전환하고 재연결을 대기합니다.",
                        err
                    );
                    *self.client.write().await = None;
                }
            }
        }

        self.handle_directly(event).await;
    }

    /// Iggy를 거치지 않고 이벤트를 즉시 처리합니다. (Iggy 오프라인 시 폴백)
    async fn handle_directly(&self, event: PillyEvent) {
        match event {
            PillyEvent::SyncPills { triggered_by } => {
                let this = self.clone();
                tokio::spawn(async move { this.run_pill_sync(&triggered_by).await });
            }
            PillyEvent::CleanupWithdrawnUsers => {
                let pool = self.pool.clone();
                tokio::spawn(
                    async move { log_cleanup_result(cleanup_withdrawn_users(&pool).await) },
                );
            }
            other => {
                if let Some(row) = other.into_activity() {
                    insert_activities(&self.pool, vec![row]).await;
                }
            }
        }
    }

    /// 공공데이터포털 의약품 카탈로그를 동기화하고 결과를 활동 로그에 기록합니다.
    /// 이미 동기화가 진행 중이면 중복 실행하지 않습니다.
    pub async fn run_pill_sync(&self, triggered_by: &str) {
        let Ok(_guard) = self.sync_lock.try_lock() else {
            tracing::info!("의약품 동기화가 이미 진행 중이어서 요청을 건너뜁니다.");
            return;
        };

        let (action, details) = match &self.pill_sync {
            None => (
                "SYNC_PILLS_SKIPPED",
                "공공데이터 API 설정이 없습니다.".to_string(),
            ),
            Some(cfg) => match sync_pill_catalog(&self.pool, &self.http, cfg).await {
                Ok(total) => ("SYNC_PILLS", format!("synced={total}")),
                Err(err) => {
                    tracing::error!("의약품 동기화 실패: {err:?}");
                    ("SYNC_PILLS_FAILED", err.to_string())
                }
            },
        };

        insert_activities(
            &self.pool,
            vec![(triggered_by.to_string(), action.to_string(), Some(details))],
        )
        .await;
    }
}

/// 활동 로그를 Bulk INSERT 합니다.
async fn insert_activities(pool: &PgPool, activities: Vec<ActivityRow>) {
    if activities.is_empty() {
        return;
    }
    let mut qb = QueryBuilder::new("INSERT INTO user_activity_logs (user_id, action, details) ");
    qb.push_values(activities, |mut b, (user_id, action, details)| {
        b.push_bind(user_id).push_bind(action).push_bind(details);
    });
    if let Err(err) = qb.build().execute(pool).await {
        tracing::error!("활동 로그 Bulk INSERT 실패: {:?}", err);
    }
}

/// 30일 유예 기간이 경과한 탈퇴 계정과 해당 사용자의 모든 개인 데이터를 물리 삭제(Hard Delete)합니다.
/// 삭제된 계정 수를 반환합니다.
pub async fn cleanup_withdrawn_users(pool: &PgPool) -> Result<usize, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let expired: Vec<String> = sqlx::query_scalar(
        "SELECT user_id FROM user_profiles \
         WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'",
    )
    .fetch_all(&mut *tx)
    .await?;

    if expired.is_empty() {
        tx.commit().await?;
        return Ok(0);
    }

    let statements = [
        "DELETE FROM ai_chat_logs WHERE user_id = ANY($1)",
        "DELETE FROM inquiry_attachments WHERE inquiry_id IN (SELECT id FROM user_inquiries WHERE user_id = ANY($1))",
        "DELETE FROM user_inquiries WHERE user_id = ANY($1)",
        "DELETE FROM chat_access_approvals WHERE user_id = ANY($1)",
        "DELETE FROM chat_sessions WHERE user_id = ANY($1)",
        "DELETE FROM medication_history WHERE medication_id IN (SELECT id FROM user_medications WHERE user_id = ANY($1))",
        "DELETE FROM user_medications WHERE user_id = ANY($1)",
        "DELETE FROM user_activity_logs WHERE user_id = ANY($1)",
        "DELETE FROM user_restriction_history WHERE user_id = ANY($1)",
        "DELETE FROM user_profiles WHERE user_id = ANY($1)",
    ];
    for sql in statements {
        sqlx::query(sql).bind(&expired).execute(&mut *tx).await?;
    }

    tx.commit().await?;
    Ok(expired.len())
}

fn log_cleanup_result(result: Result<usize, sqlx::Error>) {
    match result {
        Ok(0) => tracing::info!("삭제 대상 만료 계정이 없습니다."),
        Ok(n) => tracing::info!("만료된 탈퇴 계정 {n}건 물리 삭제 완료"),
        Err(err) => tracing::error!("탈퇴 계정 정리 오류: {err:?}"),
    }
}

/// 백그라운드에서 Iggy 스트림을 배치 단위로 폴링하여 이벤트를 처리하는 워커를 시작합니다.
/// 활동성 이벤트는 PostgreSQL에 Bulk INSERT 하고, 배치 작업 이벤트는 별도 태스크로 실행합니다.
/// 연결이 없거나 단절되면 지수 백오프(5초 -> 최대 60초)로 자동 재연결합니다.
pub fn spawn_batch_consumer(
    address: String,
    username: String,
    password: String,
    producer: EventProducer,
) {
    tokio::spawn(async move {
        let mut backoff_secs = 5u64;
        loop {
            let client = match EventProducer::try_connect(&address, &username, &password).await {
                Ok(c) => {
                    tracing::info!("Iggy 배치 컨슈머 연결 성공 ({})", address);
                    backoff_secs = 5;
                    c
                }
                Err(err) => {
                    tracing::warn!(
                        "Iggy 컨슈머 연결 대기 중 ({:?}). {}초 후 재시도합니다.",
                        err,
                        backoff_secs
                    );
                    tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
                    backoff_secs = (backoff_secs * 2).min(60);
                    continue;
                }
            };

            let (Ok(stream_id), Ok(topic_id)) = (
                Identifier::named(STREAM_NAME),
                Identifier::named(ACTIVITY_TOPIC),
            ) else {
                return;
            };
            let consumer = Consumer::default();
            let mut interval = tokio::time::interval(Duration::from_millis(500));

            loop {
                interval.tick().await;

                match client
                    .poll_messages(
                        &stream_id,
                        &topic_id,
                        PARTITION_ID,
                        &consumer,
                        &PollingStrategy::next(),
                        PollOptions {
                            count: 100,
                            ..Default::default()
                        },
                    )
                    .await
                {
                    Ok(polled) if !polled.messages.is_empty() => {
                        let mut activities = Vec::new();
                        for msg in polled.messages {
                            let Ok(event) = postcard::from_bytes::<PillyEvent>(&msg.payload) else {
                                tracing::warn!("역직렬화할 수 없는 Iggy 메시지를 건너뜁니다.");
                                continue;
                            };
                            match event {
                                PillyEvent::SyncPills { triggered_by } => {
                                    let this = producer.clone();
                                    tokio::spawn(
                                        async move { this.run_pill_sync(&triggered_by).await },
                                    );
                                }
                                PillyEvent::CleanupWithdrawnUsers => {
                                    let pool = producer.pool.clone();
                                    tokio::spawn(async move {
                                        log_cleanup_result(cleanup_withdrawn_users(&pool).await)
                                    });
                                }
                                other => activities.extend(other.into_activity()),
                            }
                        }
                        insert_activities(&producer.pool, activities).await;
                    }
                    Ok(_) => {}
                    Err(err) => {
                        tracing::warn!("Iggy 폴링 중 연결 오류: {:?}. 재연결을 시도합니다.", err);
                        break;
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_events() -> Vec<PillyEvent> {
        vec![
            PillyEvent::UserActivity {
                user_id: "user-123".to_string(),
                action: "TAKE_MEDICATION".to_string(),
                details: Some("타이레놀 1정".to_string()),
            },
            PillyEvent::UserActivity {
                user_id: "user-123".to_string(),
                action: "NO_DETAILS".to_string(),
                details: None,
            },
            PillyEvent::SearchStat {
                user_id: "user-123".to_string(),
                query: "게보린".to_string(),
            },
            PillyEvent::AdminAudit {
                admin_id: "admin-1".to_string(),
                action: "ROLE_CHANGE".to_string(),
                target_id: "user-123".to_string(),
            },
            PillyEvent::SyncPills {
                triggered_by: "scheduler".to_string(),
            },
            PillyEvent::CleanupWithdrawnUsers,
        ]
    }

    #[test]
    fn test_all_events_postcard_roundtrip() {
        for event in all_events() {
            let encoded = postcard::to_allocvec(&event).expect("직렬화 성공");
            let decoded: PillyEvent = postcard::from_bytes(&encoded).expect("역직렬화 성공");
            assert_eq!(event, decoded);
        }
    }

    #[test]
    fn test_postcard_rejects_corrupted_payload() {
        assert!(postcard::from_bytes::<PillyEvent>(&[0xFF, 0xFF, 0xFF, 0xFF, 0x01]).is_err());
        assert!(postcard::from_bytes::<PillyEvent>(&[]).is_err());
    }

    #[test]
    fn test_into_activity_mapping() {
        let rows: Vec<_> = all_events()
            .into_iter()
            .map(PillyEvent::into_activity)
            .collect();
        assert_eq!(
            rows[0],
            Some((
                "user-123".into(),
                "TAKE_MEDICATION".into(),
                Some("타이레놀 1정".into())
            ))
        );
        assert_eq!(
            rows[2],
            Some(("user-123".into(), "SEARCH".into(), Some("게보린".into())))
        );
        assert_eq!(
            rows[3],
            Some((
                "admin-1".into(),
                "ADMIN_ROLE_CHANGE".into(),
                Some("user-123".into())
            ))
        );
        // 배치 작업 이벤트는 활동 로그로 기록되지 않는다.
        assert_eq!(rows[4], None);
        assert_eq!(rows[5], None);
    }

    #[tokio::test]
    async fn test_iggy_offline_starts_in_fallback_mode() {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://localhost/nonexistent")
            .expect("lazy pool 생성");

        let producer = EventProducer::connect("127.0.0.1:19999", "iggy", "iggy", pool).await;
        assert!(!producer.is_connected().await);
    }
}
