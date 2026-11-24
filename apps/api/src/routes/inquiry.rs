use std::collections::HashMap;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::Utc;
use serde::Serialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};

use crate::{
    db::{InquiryAttachment, UserInquiry},
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    state::AppState,
};

const MAX_ATTACHMENTS: usize = 5;
const MAX_FILE_SIZE_BYTES: usize = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES: usize = 30 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserInquiryWithAttachments {
    #[serde(flatten)]
    inquiry: UserInquiry,
    attachments: Vec<InquiryAttachment>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            post(create_inquiry).layer(DefaultBodyLimit::max(MAX_MULTIPART_BYTES)),
        )
        .route("/list", get(list_inquiries))
}

async fn upload_attachment_to_cloudinary(
    state: &AppState,
    filename: &str,
    content_type: &str,
    bytes: Vec<u8>,
) -> Result<String, AppError> {
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
        .file_name(filename.to_string())
        .mime_str(content_type)
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

    let res = state
        .http_client
        .post(&upload_url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| AppError::External(format!("첨부파일 업로드 요청 실패: {e}")))?;

    if !res.status().is_success() {
        return Err(AppError::External(format!(
            "첨부파일 업로드 서버 오류 응답: {}",
            res.status()
        )));
    }

    let json_res: Value = res
        .json()
        .await
        .map_err(|e| AppError::External(format!("첨부파일 업로드 응답 파싱 실패: {e}")))?;

    let secure_url = json_res["secure_url"].as_str().ok_or_else(|| {
        AppError::External("첨부파일 업로드 URL을 반환받지 못했습니다.".to_string())
    })?;

    Ok(secure_url.to_string())
}

/// 1:1 문의 등록 (Multipart + Cloudinary 업로드 + 단일 DB 트랜잭션)
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
                let trimmed = txt.trim();
                if !trimmed.is_empty() {
                    chat_session_id = Some(trimmed.parse::<i32>().map_err(|_| {
                        AppError::BadRequest("유효하지 않은 채팅 세션 ID입니다.".to_string())
                    })?);
                }
            }
            "allow_chat_access" => {
                let txt = field.text().await.unwrap_or_default();
                allow_chat_access = txt.trim() == "true";
            }
            "attachments" => {
                if attachments.len() >= MAX_ATTACHMENTS {
                    return Err(AppError::BadRequest(format!(
                        "첨부파일은 최대 {MAX_ATTACHMENTS}개까지 업로드할 수 있습니다."
                    )));
                }
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
                        "첨부파일 크기는 개당 5MB 이하여야 합니다.".to_string(),
                    ));
                }
                attachments.push((filename, content_type, bytes.to_vec()));
            }
            _ => {}
        }
    }

    let title = title.trim();
    let content = content.trim();
    if title.is_empty() || content.is_empty() {
        return Err(AppError::BadRequest(
            "제목과 내용을 모두 입력해 주세요.".to_string(),
        ));
    }

    if allow_chat_access && chat_session_id.is_none() {
        return Err(AppError::BadRequest(
            "채팅 내역 열람 동의 시 연결할 채팅 세션을 선택해 주세요.".to_string(),
        ));
    }

    if let Some(session_id) = chat_session_id {
        let owned: Option<(i32,)> =
            sqlx::query_as("SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2")
                .bind(session_id)
                .bind(&auth_user.user_id)
                .fetch_optional(&state.pool)
                .await?;
        if owned.is_none() {
            return Err(AppError::BadRequest(
                "본인의 채팅 세션만 문의에 연결할 수 있습니다.".to_string(),
            ));
        }
    }

    // Cloudinary가 설정된 경우 트랜잭션 커밋 전 업로드 완료(실패 시 고아 문의 미생성)
    let mut uploaded_attachments: Vec<(String, String)> = Vec::new();
    if !attachments.is_empty() && !state.config.cloudinary_cloud_name.is_empty() {
        for (filename, content_type, bytes) in attachments {
            let secure_url =
                upload_attachment_to_cloudinary(&state, &filename, &content_type, bytes).await?;
            uploaded_attachments.push((secure_url, filename));
        }
    }

    let mut tx = state.pool.begin().await?;

    let inquiry: UserInquiry = sqlx::query_as(
        "INSERT INTO user_inquiries (user_id, title, content, chat_session_id, allow_chat_access) VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, chat_session_id, title, content, allow_chat_access, chat_access_id, status::text, created_at",
    )
    .bind(&auth_user.user_id)
    .bind(title)
    .bind(content)
    .bind(chat_session_id)
    .bind(allow_chat_access)
    .fetch_one(&mut *tx)
    .await?;

    if allow_chat_access && let Some(session_id) = chat_session_id {
        let (approval_id,): (uuid::Uuid,) = sqlx::query_as(
            "INSERT INTO chat_access_approvals (user_id, chat_session_id) VALUES ($1, $2) RETURNING id",
        )
        .bind(&auth_user.user_id)
        .bind(session_id)
        .fetch_one(&mut *tx)
        .await?;

        sqlx::query("UPDATE user_inquiries SET chat_access_id = $1 WHERE id = $2")
            .bind(approval_id)
            .bind(inquiry.id)
            .execute(&mut *tx)
            .await?;
    }

    for (file_url, original_name) in uploaded_attachments {
        sqlx::query(
            "INSERT INTO inquiry_attachments (inquiry_id, file_url, original_name) VALUES ($1, $2, $3)",
        )
        .bind(inquiry.id)
        .bind(&file_url)
        .bind(&original_name)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "inquiryId": inquiry.id,
        })),
    ))
}

/// 사용자의 문의 내역 리스트 조회 (첨부파일 목록 포함)
async fn list_inquiries(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<Vec<UserInquiryWithAttachments>>> {
    let inquiries: Vec<UserInquiry> = sqlx::query_as(
        "SELECT id, user_id, chat_session_id, title, content, allow_chat_access, chat_access_id, status::text, created_at FROM user_inquiries WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(&auth_user.user_id)
    .fetch_all(&state.pool)
    .await?;

    if inquiries.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let inquiry_ids: Vec<i32> = inquiries.iter().map(|i| i.id).collect();
    let all_attachments: Vec<InquiryAttachment> = sqlx::query_as(
        "SELECT id, inquiry_id, file_url, original_name, created_at FROM inquiry_attachments WHERE inquiry_id = ANY($1) ORDER BY id ASC",
    )
    .bind(&inquiry_ids)
    .fetch_all(&state.pool)
    .await?;

    let mut attachment_map: HashMap<i32, Vec<InquiryAttachment>> = HashMap::new();
    for att in all_attachments {
        if let Some(inq_id) = att.inquiry_id {
            attachment_map.entry(inq_id).or_default().push(att);
        }
    }

    let result = inquiries
        .into_iter()
        .map(|inquiry| {
            let attachments = attachment_map.remove(&inquiry.id).unwrap_or_default();
            UserInquiryWithAttachments {
                inquiry,
                attachments,
            }
        })
        .collect();

    Ok(Json(result))
}
