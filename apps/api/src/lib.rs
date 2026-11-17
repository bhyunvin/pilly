pub mod config;
pub mod db;
pub mod error;
pub mod middleware;
pub mod mq;
pub mod routes;
pub mod scheduler;
pub mod state;
pub mod sync;
pub mod utils;

use axum::{Json, Router, routing::get};
use chrono::Utc;
use serde_json::{Value, json};

use crate::state::AppState;

/// 전체 API 라우터를 조립하여 반환합니다. (main 서버와 통합 테스트가 동일한 라우터를 사용)
pub fn create_app(state: AppState) -> Router {
    let api_v1 = Router::new()
        .nest("/profile", routes::profile::router())
        .nest("/chat", routes::chat::router())
        .nest("/medications", routes::medications::router())
        .nest("/search", routes::search::router())
        .nest("/activity", routes::activity::router())
        .nest("/inquiry", routes::inquiry::router())
        .nest("/admin", routes::admin::router());

    Router::new()
        .route("/", get(health_check))
        .route("/health", get(health_check))
        .nest("/api/v1", api_v1)
        .with_state(state)
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "success": true,
        "message": "Pilly API Server is running!",
        "timestamp": Utc::now().to_rfc3339(),
    }))
}
