use axum::{
    Json, Router,
    extract::{Multipart, Path, State},
    http::StatusCode,
    routing::{delete, get, post},
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    db::UserMedication,
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    state::AppState,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMedicationRequest {
    pub name: String,
    pub dosage: String,
    pub frequency: String,
    pub start_date: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_medications).post(create_medication))
        .route("/{id}", delete(delete_medication))
        .route("/analyze-image", post(analyze_image))
}

/// 사용자의 복약 목록 조회
async fn get_medications(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<Vec<UserMedication>>> {
    let meds: Vec<UserMedication> = sqlx::query_as(
        "SELECT id, user_id, name, dosage, frequency, start_date, end_date, status, created_at FROM user_medications WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(&auth_user.user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(meds))
}

/// 새로운 복약 정보 추가
async fn create_medication(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(body): Json<CreateMedicationRequest>,
) -> AppResult<(StatusCode, Json<Value>)> {
    let start_date = body
        .start_date
        .unwrap_or_else(|| Utc::now().to_rfc3339());

    let med: UserMedication = sqlx::query_as(
        "INSERT INTO user_medications (user_id, name, dosage, frequency, start_date) VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, name, dosage, frequency, start_date, end_date, status, created_at",
    )
    .bind(&auth_user.user_id)
    .bind(&body.name)
    .bind(&body.dosage)
    .bind(&body.frequency)
    .bind(&start_date)
    .fetch_one(&state.pool)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "data": med,
        })),
    ))
}

/// 복약 정보 삭제
async fn delete_medication(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(id): Path<i32>,
) -> AppResult<Json<Value>> {
    sqlx::query("DELETE FROM user_medications WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(&auth_user.user_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(json!({
        "success": true,
        "message": "삭제되었습니다.",
    })))
}

/// 이미지 분석을 통한 복약 정보 추출 (Gemini Vision AI)
async fn analyze_image(
    State(state): State<AppState>,
    _auth_user: AuthUser,
    mut multipart: Multipart,
) -> AppResult<Json<Value>> {
    let mut image_bytes: Option<Vec<u8>> = None;
    let mut mime_type = "image/jpeg".to_string();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart 파싱 실패: {e}")))?
    {
        if field.name() == Some("image") {
            if let Some(ct) = field.content_type() {
                mime_type = ct.to_string();
            }
            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("이미지 읽기 실패: {e}")))?;
            image_bytes = Some(bytes.to_vec());
            break;
        }
    }

    let bytes = image_bytes.ok_or_else(|| AppError::BadRequest("image 필드가 필요합니다.".to_string()))?;
    let base64_image = BASE64.encode(&bytes);

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
        state.config.gemini_api_key
    );

    let payload = json!({
        "contents": [{
            "parts": [
                {
                    "text": "이 사진에서 약 정보를 추출해 주세요. 사진에 보이는 모든 약품명(name), 용량 및 용법(dosage), 복용 빈도(frequency)를 JSON 배열 {\"medications\": [{\"name\": \"...\", \"dosage\": \"...\", \"frequency\": \"...\"}]} 형식으로만 응답해 주세요."
                },
                {
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": base64_image
                    }
                }
            ]
        }],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    });

    let res = state
        .http_client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::External(format!("Gemini API 호출 실패: {e}")))?;

    let body: Value = res
        .json()
        .await
        .map_err(|e| AppError::External(format!("Gemini 응답 파싱 실패: {e}")))?;

    let text = body["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("{\"medications\":[]}");

    let parsed: Value = serde_json::from_str(text).unwrap_or_else(|_| json!({ "medications": [] }));

    Ok(Json(json!({
        "success": true,
        "data": parsed["medications"],
    })))
}
