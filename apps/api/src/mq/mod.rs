use std::sync::Arc;
use std::time::Duration;

use iggy::prelude::*;
use moka::future::Cache;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, QueryBuilder};
use tokio::sync::{Mutex, RwLock, watch};
use tokio::task::JoinHandle;

use crate::db::PillCatalog;
use crate::sync::{PillSyncConfig, SyncOutcome, build_sync_http_client, sync_pill_catalog};

const STREAM_NAME: &str = "pilly-events";
const ACTIVITY_TOPIC: &str = "user-activity";
const CONSUMER_NAME: &str = "pilly-api-worker";
const PARTITION_ID: u32 = 1;
const MESSAGE_EXPIRY_SECS: u64 = 7 * 24 * 60 * 60;
const INSERT_MAX_RETRIES: u32 = 3;
const INSERT_INITIAL_BACKOFF_MS: u64 = 200;
const RECONNECT_INITIAL_BACKOFF_SECS: u64 = 5;
const RECONNECT_MAX_BACKOFF_SECS: u64 = 60;
const CONSUMER_POLL_INTERVAL_MS: u64 = 500;
const CONSUMER_POLL_BATCH_SIZE: u32 = 100;
const CONSUMER_RETRY_WAIT_SECS: u64 = 1;

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
    pill_cache: Option<Cache<String, Vec<PillCatalog>>>,
    sync_lock: Arc<Mutex<()>>,
}

impl EventProducer {
    /// Iggy 서버에 연결하고 스트림/토픽을 초기화합니다. (기본 종료 신호 없음 — 테스트/단순 호출용)
    pub async fn connect(address: &str, username: &str, password: &str, pool: PgPool) -> Self {
        let (_tx, rx) = watch::channel(false);
        let (producer, _handle) =
            Self::connect_with_shutdown(address, username, password, pool, rx).await;
        producer
    }

    /// Graceful Shutdown 신호와 연동하여 Iggy 프로듀서를 연결하고 재연결 루프 핸들을 반환합니다.
    pub async fn connect_with_shutdown(
        address: &str,
        username: &str,
        password: &str,
        pool: PgPool,
        shutdown: watch::Receiver<bool>,
    ) -> (Self, JoinHandle<()>) {
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
            http: build_sync_http_client(),
            pill_sync: None,
            pill_cache: None,
            sync_lock: Arc::new(Mutex::new(())),
        };

        let reconnect_handle = producer.spawn_reconnect_loop(
            address.to_string(),
            username.to_string(),
            password.to_string(),
            shutdown,
        );

        (producer, reconnect_handle)
    }

    /// 의약품 동기화(`SyncPills`) 이벤트 처리에 사용할 공공데이터 API 설정을 지정합니다.
    pub fn with_pill_sync(mut self, cfg: PillSyncConfig) -> Self {
        self.pill_sync = Some(Arc::new(cfg));
        self
    }

    /// 동기화 완료 후 무효화할 의약품 검색 캐시 핸들을 연결합니다.
    pub fn with_pill_cache(mut self, cache: Cache<String, Vec<PillCatalog>>) -> Self {
        self.pill_cache = Some(cache);
        self
    }

    /// 연결된 의약품 검색 캐시 핸들을 반환합니다.
    pub fn pill_cache(&self) -> Option<Cache<String, Vec<PillCatalog>>> {
        self.pill_cache.clone()
    }

    /// 현재 Iggy 스트리밍 연결 활성 여부를 반환합니다.
    pub async fn is_connected(&self) -> bool {
        self.client.read().await.is_some()
    }

    /// 백그라운드에서 Iggy 연결 상태를 감시하고 단절 시 지수 백오프(5초 -> 최대 60초)로 재연결합니다.
    fn spawn_reconnect_loop(
        &self,
        address: String,
        username: String,
        password: String,
        mut shutdown: watch::Receiver<bool>,
    ) -> JoinHandle<()> {
        let client_lock = self.client.clone();
        tokio::spawn(async move {
            let mut backoff_secs = RECONNECT_INITIAL_BACKOFF_SECS;
            loop {
                if sleep_or_shutdown(Duration::from_secs(backoff_secs), &mut shutdown).await {
                    tracing::info!("종료 신호로 인해 Iggy 프로듀서 재연결 루프를 종료합니다.");
                    break;
                }

                if client_lock.read().await.is_some() {
                    backoff_secs = RECONNECT_INITIAL_BACKOFF_SECS;
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
                        backoff_secs = RECONNECT_INITIAL_BACKOFF_SECS;
                    }
                    Err(err) => {
                        tracing::warn!(
                            "Apache Iggy 재연결 실패 ({:?}). {}초 후 재시도합니다.",
                            err,
                            backoff_secs
                        );
                        backoff_secs = (backoff_secs * 2).min(RECONNECT_MAX_BACKOFF_SECS);
                    }
                }
            }
        })
    }

    /// Iggy 서버에 접속하여 로그인하고, 스트림/토픽이 없으면 7일 보존 기한으로 생성합니다.
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
                        message_expiry: Some(IggyExpiry::ExpireDuration(IggyDuration::from(
                            Duration::from_secs(MESSAGE_EXPIRY_SECS),
                        ))),
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
                if let Some(row) = other.into_activity()
                    && let Err(err) = insert_activities_with_retry(&self.pool, &[row]).await
                {
                    tracing::error!("폴백 활동 로그 저장 최종 실패: {:?}", err);
                }
            }
        }
    }

    /// 공공데이터포털 의약품 카탈로그를 동기화하고, 성공 시 검색 캐시를 무효화한 뒤 활동 로그에 기록합니다.
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
                Ok(SyncOutcome::Synced(total)) => {
                    if let Some(cache) = &self.pill_cache {
                        cache.invalidate_all();
                        tracing::info!(
                            "의약품 동기화 완료({total}건)에 따라 인메모리 검색 캐시를 무효화했습니다."
                        );
                    }
                    ("SYNC_PILLS", format!("synced={total}"))
                }
                Ok(SyncOutcome::SkippedAlreadyRunning) => (
                    "SYNC_PILLS_SKIPPED",
                    "다른 워커 또는 CLI가 동기화를 실행 중입니다.".to_string(),
                ),
                Err(err) => {
                    tracing::error!("의약품 동기화 실패: {err:?}");
                    ("SYNC_PILLS_FAILED", err.to_string())
                }
            },
        };

        let row = [(triggered_by.to_string(), action.to_string(), Some(details))];
        if let Err(err) = insert_activities_with_retry(&self.pool, &row).await {
            tracing::error!("의약품 동기화 결과 로그 저장 실패: {:?}", err);
        }
    }
}

/// 활동 로그를 Bulk INSERT 합니다.
async fn insert_activities(pool: &PgPool, activities: &[ActivityRow]) -> Result<(), sqlx::Error> {
    if activities.is_empty() {
        return Ok(());
    }
    let mut qb = QueryBuilder::new("INSERT INTO user_activity_logs (user_id, action, details) ");
    qb.push_values(activities, |mut b, (user_id, action, details)| {
        b.push_bind(user_id).push_bind(action).push_bind(details);
    });
    qb.build().execute(pool).await?;
    Ok(())
}

/// 일시적 DB 오류 발생 시 지수 백오프(200ms -> 400ms)로 최대 3회까지 Bulk INSERT를 재시도합니다.
async fn insert_activities_with_retry(
    pool: &PgPool,
    activities: &[ActivityRow],
) -> Result<(), sqlx::Error> {
    if activities.is_empty() {
        return Ok(());
    }

    let mut backoff_ms = INSERT_INITIAL_BACKOFF_MS;
    for attempt in 1..=INSERT_MAX_RETRIES {
        match insert_activities(pool, activities).await {
            Ok(()) => return Ok(()),
            Err(err) => {
                if attempt == INSERT_MAX_RETRIES {
                    return Err(err);
                }
                tracing::warn!(
                    "활동 로그 Bulk INSERT 일시 실패 (attempt={attempt}/{INSERT_MAX_RETRIES}): {err:?}. {backoff_ms}ms 후 재시도합니다."
                );
                tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                backoff_ms *= 2;
            }
        }
    }

    unreachable!("루프는 모든 시도에서 반환되거나 에러를 전파합니다.")
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

async fn sleep_or_shutdown(duration: Duration, shutdown: &mut watch::Receiver<bool>) -> bool {
    if *shutdown.borrow() {
        return true;
    }
    tokio::select! {
        _ = tokio::time::sleep(duration) => false,
        changed = shutdown.changed() => changed.is_err() || *shutdown.borrow(),
    }
}

struct ParsedBatch {
    activities: Vec<ActivityRow>,
    pending_sync_trigger: Option<String>,
    should_cleanup: bool,
    last_offset: Option<u64>,
}

fn parse_polled_batch(messages: Vec<IggyMessage>) -> ParsedBatch {
    let last_offset = messages.last().map(|m| m.header.offset);
    let mut activities = Vec::new();
    let mut pending_sync_trigger: Option<String> = None;
    let mut should_cleanup = false;

    for msg in messages {
        let Ok(event) = postcard::from_bytes::<PillyEvent>(&msg.payload) else {
            tracing::warn!(
                "역직렬화할 수 없는 Iggy 메시지(Poison Pill, offset={})를 건너뜁니다.",
                msg.header.offset
            );
            continue;
        };
        match event {
            PillyEvent::SyncPills { triggered_by } => {
                pending_sync_trigger = Some(triggered_by);
            }
            PillyEvent::CleanupWithdrawnUsers => {
                should_cleanup = true;
            }
            other => activities.extend(other.into_activity()),
        }
    }

    ParsedBatch {
        activities,
        pending_sync_trigger,
        should_cleanup,
        last_offset,
    }
}

async fn process_polled_batch(
    client: &IggyClient,
    consumer: &Consumer,
    stream_id: &Identifier,
    topic_id: &Identifier,
    producer: &EventProducer,
    messages: Vec<IggyMessage>,
) -> Result<(), sqlx::Error> {
    let batch = parse_polled_batch(messages);
    insert_activities_with_retry(&producer.pool, &batch.activities).await?;

    if let Some(triggered_by) = batch.pending_sync_trigger {
        let this = producer.clone();
        tokio::spawn(async move { this.run_pill_sync(&triggered_by).await });
    }
    if batch.should_cleanup {
        let pool = producer.pool.clone();
        tokio::spawn(async move { log_cleanup_result(cleanup_withdrawn_users(&pool).await) });
    }

    if let Some(offset) = batch.last_offset
        && let Err(err) = client
            .store_consumer_offset(consumer, stream_id, topic_id, Some(PARTITION_ID), offset)
            .await
    {
        tracing::warn!("Iggy 컨슈머 오프셋 저장 실패(offset={offset}): {err:?}");
    }

    Ok(())
}

/// 백그라운드에서 Iggy 스트림을 배치 단위로 폴링하여 이벤트를 처리하는 워커를 시작합니다.
/// 명시적 컨슈머 식별자(`pilly-api-worker`)와 수동 오프셋 커밋(`CommitPolicy::Manual`)을 사용하여
/// DB 적재 성공 시에만 오프셋을 커밋하고, 손상 메시지(Poison Pill)는 경고 로그 후 건너뜁니다.
pub fn spawn_batch_consumer(
    address: String,
    username: String,
    password: String,
    producer: EventProducer,
    mut shutdown: watch::Receiver<bool>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut backoff_secs = RECONNECT_INITIAL_BACKOFF_SECS;
        loop {
            if *shutdown.borrow() {
                tracing::info!("종료 신호로 인해 Iggy 배치 컨슈머를 종료합니다.");
                break;
            }

            let client = match EventProducer::try_connect(&address, &username, &password).await {
                Ok(c) => {
                    tracing::info!("Iggy 배치 컨슈머 연결 성공 ({})", address);
                    backoff_secs = RECONNECT_INITIAL_BACKOFF_SECS;
                    c
                }
                Err(err) => {
                    tracing::warn!(
                        "Iggy 컨슈머 연결 대기 중 ({:?}). {}초 후 재시도합니다.",
                        err,
                        backoff_secs
                    );
                    if sleep_or_shutdown(Duration::from_secs(backoff_secs), &mut shutdown).await {
                        tracing::info!("종료 신호를 수신해 Iggy 컨슈머 대기를 중단합니다.");
                        break;
                    }
                    backoff_secs = (backoff_secs * 2).min(RECONNECT_MAX_BACKOFF_SECS);
                    continue;
                }
            };

            let (Ok(stream_id), Ok(topic_id), Ok(consumer_id)) = (
                Identifier::named(STREAM_NAME),
                Identifier::named(ACTIVITY_TOPIC),
                Identifier::named(CONSUMER_NAME),
            ) else {
                return;
            };
            let consumer = Consumer::new(consumer_id);
            let mut interval =
                tokio::time::interval(Duration::from_millis(CONSUMER_POLL_INTERVAL_MS));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

            loop {
                tokio::select! {
                    _ = interval.tick() => {}
                    changed = shutdown.changed() => {
                        if changed.is_err() || *shutdown.borrow() {
                            tracing::info!("종료 신호 수신: Iggy 배치 컨슈머 폴링 루프를 종료합니다.");
                            return;
                        }
                    }
                }

                match client
                    .poll_messages(
                        &stream_id,
                        &topic_id,
                        PARTITION_ID,
                        &consumer,
                        &PollingStrategy::next(),
                        PollOptions {
                            count: CONSUMER_POLL_BATCH_SIZE,
                            commit: CommitPolicy::Manual,
                            ..Default::default()
                        },
                    )
                    .await
                {
                    Ok(polled) if !polled.messages.is_empty() => {
                        if let Err(err) = process_polled_batch(
                            &client,
                            &consumer,
                            &stream_id,
                            &topic_id,
                            &producer,
                            polled.messages,
                        )
                        .await
                        {
                            tracing::error!(
                                "배치 활동 로그 적재 최종 실패({:?}). 오프셋 커밋을 보류하고 다음 폴링에서 재시도합니다.",
                                err
                            );
                            if sleep_or_shutdown(
                                Duration::from_secs(CONSUMER_RETRY_WAIT_SECS),
                                &mut shutdown,
                            )
                            .await
                            {
                                tracing::info!("종료 신호 수신으로 오프셋 보류 대기를 중단합니다.");
                                return;
                            }
                        }
                    }
                    Ok(_) => {}
                    Err(err) => {
                        tracing::warn!("Iggy 폴링 중 연결 오류: {:?}. 재연결을 시도합니다.", err);
                        break;
                    }
                }
            }
        }
    })
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
