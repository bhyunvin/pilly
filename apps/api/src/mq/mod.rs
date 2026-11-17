use std::sync::Arc;
use std::time::Duration;

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
    client: Option<Arc<IggyClient>>,
    pool: PgPool,
}

impl EventProducer {
    /// Iggy 서버에 연결하고 스트림/토픽을 초기화합니다.
    /// 연결 실패 시에도 서버가 중단되지 않도록 PostgreSQL 직접 적재 모드로 폴백합니다.
    pub async fn connect(address: &str, username: &str, password: &str, pool: PgPool) -> Self {
        match Self::try_connect(address, username, password).await {
            Ok(client) => {
                tracing::info!("Apache Iggy 연결 성공 ({})", address);
                Self {
                    client: Some(Arc::new(client)),
                    pool,
                }
            }
            Err(err) => {
                tracing::warn!(
                    "Apache Iggy 연결 실패 ({}): {:?}. PostgreSQL 직접 적재 폴백 모드로 동작합니다.",
                    address,
                    err
                );
                Self { client: None, pool }
            }
        }
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
    /// Iggy가 오프라인인 경우 이벤트 유실 방지를 위해 PostgreSQL에 직접 기록합니다.
    pub async fn publish(&self, event: PillyEvent) {
        let Some(client) = &self.client else {
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
            return;
        };

        let Ok(payload) = bincode::serialize(&event) else {
            tracing::error!("이벤트 bincode 직렬화 실패");
            return;
        };

        let Ok(stream_id) = Identifier::named(STREAM_NAME) else {
            return;
        };
        let Ok(topic_id) = Identifier::named(ACTIVITY_TOPIC) else {
            return;
        };

        let message = Message::new(None, payload.into(), None);
        let mut messages = vec![message];

        if let Err(err) = client
            .send_messages(
                &stream_id,
                &topic_id,
                &Partitioning::partition_id(PARTITION_ID),
                &mut messages,
            )
            .await
        {
            tracing::error!("Iggy 메시지 발행 실패: {:?}", err);
        }
    }
}

/// 백그라운드에서 Iggy 스트림을 배치 단위로 폴링하여 PostgreSQL에 Bulk INSERT 하는 워커를 시작합니다.
pub fn spawn_batch_consumer(
    address: String,
    username: String,
    password: String,
    pool: PgPool,
) {
    tokio::spawn(async move {
        let producer = EventProducer::connect(&address, &username, &password, pool.clone()).await;
        let Some(client) = producer.client else {
            tracing::warn!("Iggy 컨슈머 워커: Iggy 연결이 없어 대기 모드로 종료합니다.");
            return;
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
                    tracing::debug!("Iggy 폴링 중 오류: {:?}", err);
                }
            }
        }
    });
}
