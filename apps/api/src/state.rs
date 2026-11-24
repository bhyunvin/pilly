use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use dashmap::DashMap;
use jsonwebtoken::jwk::Jwk;
use moka::future::Cache;
use sqlx::PgPool;
use tokio::sync::Mutex;

use crate::{config::Config, db::PillCatalog, mq::EventProducer};

/// Axum 애플리케이션 전역 공유 상태
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
    pub producer: EventProducer,
    pub http_client: reqwest::Client,
    /// 인메모리 초고속 의약품 검색 캐시 (최대 10,000건, TTL 10분)
    pub pill_cache: Cache<String, Vec<PillCatalog>>,
    /// JWKS 공개키 캐시 (kid -> Jwk)
    pub jwks_cache: Arc<DashMap<String, Jwk>>,
    /// JWKS 원격 조회 Singleflight 및 쿨다운 제어용 락 (마지막 조회 시도 시각)
    pub jwks_refresh_lock: Arc<Mutex<Option<Instant>>>,
}

impl AppState {
    /// 운영 서버와 테스트가 공통으로 사용하는 기본 상태를 생성합니다.
    pub fn new(pool: PgPool, config: Config, producer: EventProducer) -> Self {
        Self {
            pool,
            config,
            producer,
            http_client: reqwest::Client::new(),
            pill_cache: Cache::builder()
                .max_capacity(10_000)
                .time_to_live(Duration::from_secs(600))
                .build(),
            jwks_cache: Arc::new(DashMap::new()),
            jwks_refresh_lock: Arc::new(Mutex::new(None)),
        }
    }
}
