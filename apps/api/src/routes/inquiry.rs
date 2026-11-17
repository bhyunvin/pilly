use axum::{
    Json, Router,
    extract::{Multipart, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::Utc;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};

use crate::{
    db::UserInquiry,
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    state::AppState,
};

const MAX_FILE_SIZE_BYTES: usize = 5 * 1024 * 1024;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(create_inquiry))
        .route("/list", get(list_inquiries))
}

/// 1:1 문의 등록 (Multipart + Cloudinary 업로드)
async fn create_inquiry(
    State(state): State<AppState>,
    auth_user: AuthUser,
    mut multipart: Multipart,
) -> AppResult<(StatusCode, Json<Value>)> {
    let mut title = String::new();
    let mut content = String::new();
    let mut chat_session_id: Option<i32> = None;
    let mut allow_chat_access = false;
    let mut attachments: Vec<(String, String, Vec<u8>)> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart 파싱 실패: {e}")))?
    {
        let name = field.name().unwrap_or_default().to_string();
        match name.as_str() {
            "title" => {
                title = field.text().await.unwrap_or_default();
            }
            "content" => {
                content = field.text().await.unwrap_or_default();
            }
            "chat_session_id" => {
                let txt = field.text().await.unwrap_or_default();
                chat_session_id = txt.parse::<i32>().ok();
            }
            "allow_chat_access" => {
                let txt = field.text().await.unwrap_or_default();
                allow_chat_access = txt == "true";
            }
            "attachments" => {
                let filename = field.file_name().unwrap_or("attachment").to_string();
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("파일 읽기 실패: {e}")))?;
                if bytes.len() > MAX_FILE_SIZE_BYTES {
                    return Err(AppError::BadRequest(
                        "File size exceeds 5MB limit".to_string(),
                    ));
                }
                attachments.push((filename, content_type, bytes.to_vec()));
            }
            _ => {}
        }
    }

    if title.is_empty() || content.is_empty() {
        return Err(AppError::BadRequest(
            "제목과 내용을 모두 입력해 주세요.".to_string(),
        ));
    }

    let inquiry: UserInquiry = sqlx::query_as(
        "INSERT INTO user_inquiries (user_id, title, content, chat_session_id, allow_chat_access) VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, chat_session_id, title, content, allow_chat_access, chat_access_id, status::text, created_at",
    )
    .bind(&auth_user.user_id)
    .bind(&title)
    .bind(&content)
    .bind(chat_session_id)
    .bind(allow_chat_access)
    .fetch_one(&state.pool)
    .await?;

    // Cloudinary 업로드
    if !attachments.is_empty() && !state.config.cloudinary_cloud_name.is_empty() {
        for (filename, content_type, bytes) in attachments {
            let timestamp = Utc::now().timestamp();
            let folder = "inquiries";
            let to_sign = format!(
                "folder={folder}&timestamp={timestamp}{}",
                state.config.cloudinary_api_secret
            );
            let mut hasher = Sha1::new();
            hasher.update(to_sign.as_bytes());
            let signature = hex::encode(hasher.finalize());

            let part = reqwest::multipart::Part::bytes(bytes)
                .file_name(filename.clone())
                .mime_str(&content_type)
                .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

            let form = reqwest::multipart::Form::new()
                .text("api_key", state.config.cloudinary_api_key.clone())
                .text("timestamp", timestamp.to_string())
                .text("folder", folder)
                .text("signature", signature)
                .part("file", part);

            let upload_url = format!(
                "https://api.cloudinary.com/v1_1/{}/auto/upload",
                state.config.cloudinary_cloud_name
            );

            if let Ok(res) = state.http_client.post(&upload_url).multipart(form).send().await
                && let Ok(json_res) = res.json::<Value>().await
                && let Some(secure_url) = json_res["secure_url"].as_str()
            {
                let _ = sqlx::query(
                    "INSERT INTO inquiry_attachments (inquiry_id, file_url, original_name) VALUES ($1, $2, $3)",
                )
                .bind(inquiry.id)
                .bind(secure_url)
                .bind(&filename)
                .execute(&state.pool)
                .await;
            }
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "inquiryId": inquiry.id,
        })),
    ))
}

/// 사용자의 문의 내역 리스트 조회
async fn list_inquiries(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<Vec<UserInquiry>>> {
    let inquiries: Vec<UserInquiry> = sqlx::query_as(
        "SELECT id, user_id, chat_session_id, title, content, allow_chat_access, chat_access_id, status::text, created_at FROM user_inquiries WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(&auth_user.user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(inquiries))
}
