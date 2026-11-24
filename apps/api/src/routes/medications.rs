use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::StatusCode,
    routing::{get, patch, post},
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    db::UserMedication,
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    mq::PillyEvent,
    state::AppState,
};

const MAX_IMAGE_SIZE_BYTES: usize = 10 * 1024 * 1024;
const IMAGE_BODY_OVERHEAD_BYTES: usize = 256 * 1024;
const ALLOWED_IMAGE_MIMES: [&str; 4] = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const VISION_PROMPT: &str = "이 사진에서 약 정보를 추출해 주세요. 사진에 보이는 모든 약품명(name), 용량 및 용법(dosage), 복용 빈도(frequency)를 JSON 배열 {\"medications\": [{\"name\": \"...\", \"dosage\": \"...\", \"frequency\": \"...\"}]} 형식으로만 응답해 주세요.";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMedicationRequest {
    pub name: String,
    pub dosage: String,
    pub frequency: String,
    pub start_date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMedicationRequest {
    pub name: String,
    pub dosage: String,
    pub frequency: String,
}

#[derive(Debug, Deserialize)]
pub struct RecordHistoryRequest {
    pub status: String,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct MedicationHistoryItem {
    id: i32,
    medication_id: Option<i32>,
    status: Option<String>,
    taken_at: Option<DateTime<Utc>>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_medications).post(create_medication))
        .route("/{id}", patch(update_medication).delete(delete_medication))
        .route(
            "/{id}/history",
            get(get_medication_history).post(record_medication_history),
        )
        .route(
            "/analyze-image",
            post(analyze_image).layer(DefaultBodyLimit::max(
                MAX_IMAGE_SIZE_BYTES + IMAGE_BODY_OVERHEAD_BYTES,
            )),
        )
}

fn validate_medication_name(raw: &str) -> Result<&str, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest(
            "약물 이름을 입력해 주세요.".to_string(),
        ));
    }
    Ok(trimmed)
}

async fn extract_validated_image(mut multipart: Multipart) -> Result<(Vec<u8>, String), AppError> {
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart 파싱 실패: {e}")))?
    {
        if field.name() != Some("image") {
            continue;
        }

        let mime_type = field
            .content_type()
            .map(|v| {
                v.split(';')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_ascii_lowercase()
            })
            .unwrap_or_else(|| "image/jpeg".to_string());

        if !ALLOWED_IMAGE_MIMES.contains(&mime_type.as_str()) {
            return Err(AppError::BadRequest(
                "지원하지 않는 이미지 형식입니다. (JPEG, PNG, WEBP, HEIC만 허용)".to_string(),
            ));
        }

        let bytes = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(format!("이미지 읽기 실패: {e}")))?;

        if bytes.is_empty() {
            return Err(AppError::BadRequest("빈 이미지 파일입니다.".to_string()));
        }
        if bytes.len() > MAX_IMAGE_SIZE_BYTES {
            return Err(AppError::BadRequest(
                "이미지 파일 크기는 10MB 이하여야 합니다.".to_string(),
            ));
        }

        return Ok((bytes.to_vec(), mime_type));
    }

    Err(AppError::BadRequest("image 필드가 필요합니다.".to_string()))
}

/// 사용자의 복약 목록 조회
async fn get_medications(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<Value>> {
    let meds: Vec<UserMedication> = sqlx::query_as(
        "SELECT id, user_id, name, dosage, frequency, start_date, end_date, status, created_at FROM user_medications WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(&auth_user.user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "medications": meds,
    })))
}

/// 새로운 복약 정보 추가
async fn create_medication(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(body): Json<CreateMedicationRequest>,
) -> AppResult<(StatusCode, Json<Value>)> {
    let name = validate_medication_name(&body.name)?;
    let start_date = body.start_date.unwrap_or_else(|| Utc::now().to_rfc3339());

    let med: UserMedication = sqlx::query_as(
        "INSERT INTO user_medications (user_id, name, dosage, frequency, start_date) VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, name, dosage, frequency, start_date, end_date, status, created_at",
    )
    .bind(&auth_user.user_id)
    .bind(name)
    .bind(body.dosage.trim())
    .bind(body.frequency.trim())
    .bind(&start_date)
    .fetch_one(&state.pool)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "medication": med,
        })),
    ))
}

/// 복약 정보 수정 (본인 소유 확인)
async fn update_medication(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(id): Path<i32>,
    Json(body): Json<UpdateMedicationRequest>,
) -> AppResult<Json<Value>> {
    let name = validate_medication_name(&body.name)?;

    let updated: Option<UserMedication> = sqlx::query_as(
        "UPDATE user_medications SET name = $1, dosage = $2, frequency = $3 \
         WHERE id = $4 AND user_id = $5 \
         RETURNING id, user_id, name, dosage, frequency, start_date, end_date, status, created_at",
    )
    .bind(name)
    .bind(body.dosage.trim())
    .bind(body.frequency.trim())
    .bind(id)
    .bind(&auth_user.user_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(med) = updated else {
        return Err(AppError::NotFound(
            "수정할 복약 정보를 찾을 수 없습니다.".to_string(),
        ));
    };

    Ok(Json(json!({
        "success": true,
        "medication": med,
    })))
}

/// 복약 정보 삭제 (미존재/타인 소유 시 404 반환)
async fn delete_medication(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(id): Path<i32>,
) -> AppResult<Json<Value>> {
    let result = sqlx::query("DELETE FROM user_medications WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(&auth_user.user_id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "삭제할 복약 정보를 찾을 수 없습니다.".to_string(),
        ));
    }

    Ok(Json(json!({
        "success": true,
        "message": "삭제되었습니다.",
    })))
}

/// 특정 약물의 복약 이력 조회
async fn get_medication_history(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(medication_id): Path<i32>,
) -> AppResult<Json<Value>> {
    let items: Vec<MedicationHistoryItem> = sqlx::query_as(
        "SELECT mh.id, mh.medication_id, mh.status::text, mh.taken_at \
         FROM medication_history mh \
         INNER JOIN user_medications um ON mh.medication_id = um.id \
         WHERE mh.medication_id = $1 AND um.user_id = $2 \
         ORDER BY mh.taken_at DESC LIMIT 100",
    )
    .bind(medication_id)
    .bind(&auth_user.user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "history": items,
    })))
}

/// 복약 체크 이력 기록 (PENDING / COMPLETED / SKIPPED) + Iggy 활동 이벤트 발행
async fn record_medication_history(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(medication_id): Path<i32>,
    Json(body): Json<RecordHistoryRequest>,
) -> AppResult<(StatusCode, Json<Value>)> {
    if !matches!(body.status.as_str(), "PENDING" | "COMPLETED" | "SKIPPED") {
        return Err(AppError::BadRequest(
            "상태는 PENDING, COMPLETED, SKIPPED 중 하나여야 합니다.".to_string(),
        ));
    }

    let owns: Option<(i32,)> =
        sqlx::query_as("SELECT id FROM user_medications WHERE id = $1 AND user_id = $2 LIMIT 1")
            .bind(medication_id)
            .bind(&auth_user.user_id)
            .fetch_optional(&state.pool)
            .await?;

    if owns.is_none() {
        return Err(AppError::NotFound(
            "복약 정보를 찾을 수 없습니다.".to_string(),
        ));
    }

    let item: MedicationHistoryItem = sqlx::query_as(
        "INSERT INTO medication_history (medication_id, status) VALUES ($1, $2::medication_status) \
         RETURNING id, medication_id, status::text, taken_at",
    )
    .bind(medication_id)
    .bind(&body.status)
    .fetch_one(&state.pool)
    .await?;

    let producer = state.producer.clone();
    let user_id = auth_user.user_id;
    let status = body.status;
    tokio::spawn(async move {
        producer
            .publish(PillyEvent::UserActivity {
                user_id,
                action: format!("MEDICATION_{status}"),
                details: Some(format!("medication_id={medication_id}")),
            })
            .await;
    });

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "data": item,
        })),
    ))
}

/// 이미지 분석을 통한 복약 정보 추출 (Gemini Vision AI)
async fn analyze_image(
    State(state): State<AppState>,
    _auth_user: AuthUser,
    multipart: Multipart,
) -> AppResult<Json<Value>> {
    let (bytes, mime_type) = extract_validated_image(multipart).await?;
    let base64_image = BASE64.encode(&bytes);

    let url = format!(
        "{}/v1beta/models/{}:generateContent?key={}",
        state.config.gemini_base_url, state.config.gemini_model, state.config.gemini_api_key
    );

    let payload = json!({
        "contents": [{
            "parts": [
                { "text": VISION_PROMPT },
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

    if !res.status().is_success() {
        return Err(AppError::External(format!(
            "Gemini Vision API 오류 응답: {}",
            res.status()
        )));
    }

    let body: Value = res
        .json()
        .await
        .map_err(|e| AppError::External(format!("Gemini 응답 파싱 실패: {e}")))?;

    let text = body["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .ok_or_else(|| {
            AppError::External("Gemini Vision 응답 본문이 비어 있습니다.".to_string())
        })?;

    let parsed: Value = serde_json::from_str(text).unwrap_or_else(|_| json!({ "medications": [] }));

    Ok(Json(json!({
        "success": true,
        "data": parsed["medications"],
    })))
}
