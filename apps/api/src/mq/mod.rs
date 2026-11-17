use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

use iggy::client::{Client, MessageClient, StreamClient, TopicClient, UserClient};
use iggy::clients::client::IggyClient;
use iggy::compression::compression_algorithm::CompressionAlgorithm;
use iggy::consumer::Consumer;
use iggy::error::IggyError;
use iggy::identifier::Identifier;
use iggy::messages::poll_messages::PollingStrategy;
use iggy::messages::send_messages::{Message, Partitioning};
use iggy::utils::expiry::IggyExpiry;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, QueryBuilder};

const STREAM_NAME: &str = "pilly-events";
const ACTIVITY_TOPIC: &str = "user-activity";
const PARTITION_ID: u32 = 1;

/// Iggy 스트림으로 전송되는 비동기 이벤트 페이로드
#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

/// Apache Iggy 비동기 이벤트 프로듀서
#[derive(Clone)]
pub struct EventProducer {
    client: Arc<RwLock<Option<Arc<IggyClient>>>>,
    pool: PgPool,
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
        };

        producer.spawn_reconnect_loop(
            address.to_string(),
            username.to_string(),
            password.to_string(),
        );

        producer
    }

    /// 현재 Iggy 스트리밍 연결 활성 여부를 반환합니다.
    #[allow(dead_code)]
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

        // 스트림 및 토픽이 없으면 생성
        let stream_id = Identifier::named(STREAM_NAME)?;
        if client.get_stream(&stream_id).await.is_err() {
            let _ = client.create_stream(STREAM_NAME, None).await;
        }

        let topic_id = Identifier::named(ACTIVITY_TOPIC)?;
        if client.get_topic(&stream_id, &topic_id).await.is_err() {
            let _ = client
                .create_topic(
                    &stream_id,
                    ACTIVITY_TOPIC,
                    1,
                    CompressionAlgorithm::None,
                    None,
                    None,
                    IggyExpiry::NeverExpire,
                    None.into(),
                )
                .await;
        }

        Ok(client)
    }

    /// 이벤트를 bincode 바이너리로 직렬화하여 Iggy 스트림에 초고속 발행합니다.
    /// Iggy가 오프라인이거나 발행에 실패한 경우 이벤트 유실 방지를 위해 PostgreSQL에 직접 기록합니다.
    pub async fn publish(&self, event: PillyEvent) {
        let client_opt = self.client.read().await.clone();
        if let Some(client) = client_opt
            && let Ok(payload) = bincode::serialize(&event)
            && let (Ok(stream_id), Ok(topic_id)) = (
                Identifier::named(STREAM_NAME),
                Identifier::named(ACTIVITY_TOPIC),
            )
        {
            let message = Message::new(None, payload.into(), None);
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

        self.fallback_to_db(event).await;
    }

    /// Iggy 오프라인 또는 발행 실패 시 PostgreSQL에 직접 이벤트를 기록합니다.
    async fn fallback_to_db(&self, event: PillyEvent) {
        let (user_id, action, details) = match event {
            PillyEvent::UserActivity {
                user_id,
                action,
                details,
            } => (user_id, action, details),
            PillyEvent::SearchStat { user_id, query } => {
                (user_id, "SEARCH".to_string(), Some(query))
            }
            PillyEvent::AdminAudit {
                admin_id,
                action,
                target_id,
            } => (admin_id, format!("ADMIN_{action}"), Some(target_id)),
        };

        if let Err(err) = sqlx::query(
            "INSERT INTO user_activity_logs (user_id, action, details) VALUES ($1, $2, $3)",
        )
        .bind(user_id)
        .bind(action)
        .bind(details)
        .execute(&self.pool)
        .await
        {
            tracing::error!("DB 폴백 이벤트 기록 실패: {:?}", err);
        }
    }
}

/// 백그라운드에서 Iggy 스트림을 배치 단위로 폴링하여 PostgreSQL에 Bulk INSERT 하는 워커를 시작합니다.
/// 연결이 없거나 단절되면 지수 백오프(5초 -> 최대 60초)로 자동 재연결합니다.
pub fn spawn_batch_consumer(address: String, username: String, password: String, pool: PgPool) {
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

            let Ok(stream_id) = Identifier::named(STREAM_NAME) else {
                return;
            };
            let Ok(topic_id) = Identifier::named(ACTIVITY_TOPIC) else {
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
                        Some(PARTITION_ID),
                        &consumer,
                        &PollingStrategy::next(),
                        100,
                        true,
                    )
                    .await
                {
                    Ok(polled) if !polled.messages.is_empty() => {
                        let mut activities = Vec::new();
                        for msg in polled.messages {
                            if let Ok(event) = bincode::deserialize::<PillyEvent>(&msg.payload) {
                                match event {
                                    PillyEvent::UserActivity {
                                        user_id,
                                        action,
                                        details,
                                    } => {
                                        activities.push((user_id, action, details));
                                    }
                                    PillyEvent::SearchStat { user_id, query } => {
                                        activities.push((
                                            user_id,
                                            "SEARCH".to_string(),
                                            Some(query),
                                        ));
                                    }
                                    PillyEvent::AdminAudit {
                                        admin_id,
                                        action,
                                        target_id,
                                    } => {
                                        activities.push((
                                            admin_id,
                                            format!("ADMIN_{action}"),
                                            Some(target_id),
                                        ));
                                    }
                                }
                            }
                        }

                        if !activities.is_empty() {
                            let mut qb = QueryBuilder::new(
                                "INSERT INTO user_activity_logs (user_id, action, details) ",
                            );
                            qb.push_values(activities, |mut b, (user_id, action, details)| {
                                b.push_bind(user_id).push_bind(action).push_bind(details);
                            });

                            if let Err(err) = qb.build().execute(&pool).await {
                                tracing::error!("Iggy 배치 Bulk INSERT 실패: {:?}", err);
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
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pilly_event_bincode_roundtrip() {
        let events = vec![
            PillyEvent::UserActivity {
                user_id: "user-123".to_string(),
                action: "TAKE_MEDICATION".to_string(),
                details: Some("타이레놀 1정".to_string()),
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
        ];

        for event in events {
            let encoded = bincode::serialize(&event).expect("bincode 직렬화 성공");
            let decoded: PillyEvent =
                bincode::deserialize(&encoded).expect("bincode 역직렬화 성공");
            match (event, decoded) {
                (
                    PillyEvent::UserActivity {
                        user_id: u1,
                        action: a1,
                        details: d1,
                    },
                    PillyEvent::UserActivity {
                        user_id: u2,
                        action: a2,
                        details: d2,
                    },
                ) => {
                    assert_eq!(u1, u2);
                    assert_eq!(a1, a2);
                    assert_eq!(d1, d2);
                }
                (
                    PillyEvent::SearchStat {
                        user_id: u1,
                        query: q1,
                    },
                    PillyEvent::SearchStat {
                        user_id: u2,
                        query: q2,
                    },
                ) => {
                    assert_eq!(u1, u2);
                    assert_eq!(q1, q2);
                }
                (
                    PillyEvent::AdminAudit {
                        admin_id: a1,
                        action: ac1,
                        target_id: t1,
                    },
                    PillyEvent::AdminAudit {
                        admin_id: a2,
                        action: ac2,
                        target_id: t2,
                    },
                ) => {
                    assert_eq!(a1, a2);
                    assert_eq!(ac1, ac2);
                    assert_eq!(t1, t2);
                }
                _ => panic!("역직렬화된 이벤트 타입 불일치"),
            }
        }
    }

    #[tokio::test]
    async fn test_iggy_offline_fallback_mode() {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://localhost/nonexistent")
            .expect("lazy pool 생성");

        // 존재하지 않는 포트로 연결 시 패닉 없이 DB 폴백 모드로 초기화되어야 함
        let producer = EventProducer::connect("127.0.0.1:19999", "iggy", "iggy", pool).await;
        assert!(!producer.is_connected().await);
    }
}
