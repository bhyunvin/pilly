use std::sync::Arc;

use dashmap::DashMap;
use jsonwebtoken::jwk::Jwk;
use moka::future::Cache;
use sqlx::PgPool;

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
}
