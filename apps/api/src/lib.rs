pub mod config;
pub mod db;
pub mod error;
pub mod middleware;
pub mod mq;
pub mod routes;
pub mod scheduler;
pub mod state;
pub mod utils;

use axum::{Router, routing::get};
use serde_json::json;

use crate::state::AppState;

/// 전체 API 라우터를 조립하여 반환합니다. (통합 테스트 및 main 서버 공용)
pub fn create_app(state: AppState) -> Router {
    Router::new()
        .route(
            "/health",
            get(|| async {
                axum::Json(json!({
                    "status": "ok",
                    "service": "pilly-api"
                }))
            }),
        )
        .nest("/api/v1/search", routes::search::router())
        .nest("/api/v1/medications", routes::medications::router())
        .nest("/api/v1/activity", routes::activity::router())
        .nest("/api/v1/chat", routes::chat::router())
        .nest("/api/v1/profile", routes::profile::router())
        .nest("/api/v1/inquiries", routes::inquiry::router())
        .nest("/api/v1/admin", routes::admin::router())
        .with_state(state)
}
