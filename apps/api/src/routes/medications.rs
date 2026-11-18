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
    mq::PillyEvent,
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
    taken_at: Option<chrono::NaiveDateTime>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_medications).post(create_medication))
        .route("/{id}", delete(delete_medication))
        .route(
            "/{id}/history",
            get(get_medication_history).post(record_medication_history),
        )
        .route("/analyze-image", post(analyze_image))
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
    let start_date = body.start_date.unwrap_or_else(|| Utc::now().to_rfc3339());

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
            "medication": med,
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

    let bytes =
        image_bytes.ok_or_else(|| AppError::BadRequest("image 필드가 필요합니다.".to_string()))?;
    let base64_image = BASE64.encode(&bytes);

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={}",
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
