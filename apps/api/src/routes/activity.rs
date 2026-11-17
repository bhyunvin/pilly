use axum::{Json, Router, extract::State, http::StatusCode, routing::get};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    db::UserActivityLog, error::AppResult, middleware::auth::AuthUser, mq::PillyEvent,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct CreateActivityRequest {
    pub action: String,
    pub details: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(get_activities).post(create_activity))
}

/// 사용자의 최근 활동 내역 조회 (최대 50개)
async fn get_activities(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<Vec<UserActivityLog>>> {
    let logs: Vec<UserActivityLog> = sqlx::query_as(
        "SELECT id, user_id, action, details, created_at FROM user_activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    )
    .bind(&auth_user.user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(logs))
}

/// 복약 활동 기록 (Apache Iggy 스트림에 비동기 발행 후 즉시 응답)
async fn create_activity(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(body): Json<CreateActivityRequest>,
) -> (StatusCode, Json<Value>) {
    let producer = state.producer.clone();
    let event = PillyEvent::UserActivity {
        user_id: auth_user.user_id,
        action: body.action,
        details: body.details,
    };

    tokio::spawn(async move {
        producer.publish(event).await;
    });

    (
        StatusCode::ACCEPTED,
        Json(json!({
            "success": true,
            "message": "Activity queued",
        })),
    )
}
