use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use thiserror::Error;

/// API 전역 에러 타입
#[derive(Debug, Error)]
pub enum AppError {
    #[error("인증이 필요합니다: {0}")]
    Unauthorized(String),

    #[error("접근 권한이 없습니다: {0}")]
    Forbidden(String),

    #[error("요청하신 리소스를 찾을 수 없습니다: {0}")]
    NotFound(String),

    #[error("잘못된 요청입니다: {0}")]
    BadRequest(String),

    #[error("데이터베이스 오류: {0}")]
    Database(#[from] sqlx::Error),

    #[error("외부 서비스 오류: {0}")]
    External(String),

    #[error("서버 내부 오류: {0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg.clone()),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Database(err) => {
                tracing::error!("Database error: {:?}", err);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.".to_string(),
                )
            }
            AppError::External(msg) => {
                tracing::error!("External service error: {}", msg);
                (StatusCode::BAD_GATEWAY, msg.clone())
            }
            AppError::Internal(err) => {
                tracing::error!("Internal error: {:?}", err);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.".to_string(),
                )
            }
        };

        let body = Json(json!({
            "success": false,
            "message": message,
        }));

        (status, body).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
