use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::{StatusCode, header},
    response::Response,
    routing::{get, patch, post},
};
use futures::StreamExt;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::mpsc;

use crate::{
    db::{AiChatLog, ChatSession},
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    state::AppState,
    utils::security::{decrypt, encrypt},
};

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChatHistoryPart {
    pub text: String,
}

#[derive(Debug, Deserialize)]
pub struct ChatHistoryItem {
    pub role: String,
    pub parts: Vec<ChatHistoryPart>,
}

#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub history: Vec<ChatHistoryItem>,
}

const SYSTEM_PROMPT: &str = "당신은 전문 약사 AI \"Pilly\"입니다. \
사용자의 건강 상태와 약물 정보를 바탕으로 빠르고 간결하며 친절하게 복약 지도를 수행하세요. \
최종적인 의학적 진단은 내리지 말고, 필요시 의사/약사 상담을 권고하세요.";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sessions", get(get_sessions).post(create_session))
        .route("/sessions/{id}", get(get_session_logs))
        .route("/sessions/{id}/title", patch(update_session_title))
        .route("/sessions/{id}/message", post(send_message))
}

#[derive(Debug, Deserialize)]
pub struct UpdateSessionTitleRequest {
    pub title: String,
}

/// 채팅 세션 제목 수정 (본인 세션만 가능)
async fn update_session_title(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(session_id): Path<i32>,
    Json(body): Json<UpdateSessionTitleRequest>,
) -> AppResult<Json<Value>> {
    let title = body.title.trim();
    if title.is_empty() || title.chars().count() > 100 {
        return Err(AppError::BadRequest(
            "제목은 1자 이상 100자 이하로 입력해 주세요.".to_string(),
        ));
    }

    let updated: Option<ChatSession> = sqlx::query_as(
        "UPDATE chat_sessions SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id, user_id, title, created_at, updated_at",
    )
    .bind(title)
    .bind(session_id)
    .bind(&auth_user.user_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(session) = updated else {
        return Err(AppError::NotFound(
            "채팅 세션을 찾을 수 없습니다.".to_string(),
        ));
    };

    Ok(Json(json!({
        "success": true,
        "data": session,
    })))
}

/// 사용자의 활성화된 모든 채팅 세션 목록 조회
async fn get_sessions(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<Vec<ChatSession>>> {
    let sessions: Vec<ChatSession> = sqlx::query_as(
        "SELECT id, user_id, title, created_at, updated_at FROM chat_sessions WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(&auth_user.user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(sessions))
}

/// 새로운 채팅 상담 세션 생성
async fn create_session(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(body): Json<CreateSessionRequest>,
) -> AppResult<Json<Value>> {
    let title = body.title.unwrap_or_else(|| "새로운 상담".to_string());

    let session: ChatSession = sqlx::query_as(
        "INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id, user_id, title, created_at, updated_at",
    )
    .bind(&auth_user.user_id)
    .bind(&title)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": session,
    })))
}

/// 특정 채팅 세션의 대화 내역 조회 (복호화)
async fn get_session_logs(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(session_id): Path<i32>,
) -> AppResult<Json<Value>> {
    let raw_logs: Vec<AiChatLog> = sqlx::query_as(
        "SELECT id, session_id, user_id, prompt, response, created_at FROM ai_chat_logs WHERE session_id = $1 AND user_id = $2 ORDER BY created_at ASC",
    )
    .bind(session_id)
    .bind(&auth_user.user_id)
    .fetch_all(&state.pool)
    .await?;

    let logs: Vec<AiChatLog> = raw_logs
        .into_iter()
        .map(|mut log| {
            log.prompt = decrypt(&log.prompt, &state.config.encryption_key);
            log.response = decrypt(&log.response, &state.config.encryption_key);
            log
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "logs": logs,
    })))
}

/// 실시간 AI 메시징 및 스트리밍 응답 (AES-256-GCM 암호화 저장)
async fn send_message(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(session_id): Path<i32>,
    Json(body): Json<SendMessageRequest>,
) -> AppResult<Response> {
    let owned: Option<(i32,)> =
        sqlx::query_as("SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2")
            .bind(session_id)
            .bind(&auth_user.user_id)
            .fetch_optional(&state.pool)
            .await?;
    if owned.is_none() {
        return Err(AppError::NotFound(
            "채팅 세션을 찾을 수 없습니다.".to_string(),
        ));
    }

    let user_prompt = body
        .history
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .and_then(|m| m.parts.first())
        .map(|p| p.text.clone())
        .unwrap_or_default();

    let encrypted_prompt = encrypt(&user_prompt, &state.config.encryption_key);

    let log_record: AiChatLog = sqlx::query_as(
        "INSERT INTO ai_chat_logs (session_id, user_id, prompt, response) VALUES ($1, $2, $3, '') RETURNING id, session_id, user_id, prompt, response, created_at",
    )
    .bind(session_id)
    .bind(&auth_user.user_id)
    .bind(&encrypted_prompt)
    .fetch_one(&state.pool)
    .await?;

    let mut contents: Vec<Value> = body
        .history
        .iter()
        .map(|item| {
            let role = if item.role == "user" { "user" } else { "model" };
            let text = item.parts.first().map(|p| p.text.as_str()).unwrap_or("");
            json!({
                "role": role,
                "parts": [{ "text": text }]
            })
        })
        .collect();

    let url = format!(
        "{}/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse&key={}",
        state.config.gemini_base_url, state.config.gemini_api_key
    );

    let tools = gemini_tools();
    let payload = json!({
        "system_instruction": {
            "parts": [{ "text": SYSTEM_PROMPT }]
        },
        "contents": contents,
        "tools": tools,
    });

    let res = state
        .http_client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::External(format!("Gemini 스트리밍 호출 실패: {e}")))?;

    if !res.status().is_success() {
        return Err(AppError::External(format!(
            "Gemini API 오류 응답: {}",
            res.status()
        )));
    }

    let (tx, rx) = mpsc::channel::<Result<bytes::Bytes, std::io::Error>>(32);
    let pool = state.pool.clone();
    let http_client = state.http_client.clone();
    let enc_key = state.config.encryption_key.clone();
    let user_id = auth_user.user_id.clone();
    let log_id = log_record.id;

    tokio::spawn(async move {
        let mut stream = res.bytes_stream();
        let mut full_text = String::new();
        let mut pending_function_call: Option<(String, Value)> = None;

        while let Some(chunk_res) = stream.next().await {
            if let Ok(chunk) = chunk_res {
                let s = String::from_utf8_lossy(&chunk);
                for line in s.lines() {
                    if let Some(json_str) = line.strip_prefix("data: ")
                        && let Ok(val) = serde_json::from_str::<Value>(json_str)
                    {
                        let part = &val["candidates"][0]["content"]["parts"][0];
                        if let Some(fc) = part.get("functionCall")
                            && let Some(name) = fc["name"].as_str()
                        {
                            pending_function_call = Some((name.to_string(), fc["args"].clone()));
                        } else if let Some(text) = part["text"].as_str() {
                            full_text.push_str(text);
                            let _ = tx.send(Ok(bytes::Bytes::from(text.to_string()))).await;
                        }
                    }
                }
            }
        }

        // 모델이 Function Calling을 요청한 경우 DB 조회 후 2차 스트리밍 수행
        if let Some((fn_name, fn_args)) = pending_function_call {
            let fn_result = execute_tool_call(&pool, &user_id, &fn_name, &fn_args).await;

            contents.push(json!({
                "role": "model",
                "parts": [{
                    "functionCall": {
                        "name": fn_name,
                        "args": fn_args,
                    }
                }]
            }));
            contents.push(json!({
                "role": "user",
                "parts": [{
                    "functionResponse": {
                        "name": fn_name,
                        "response": { "result": fn_result },
                    }
                }]
            }));

            let followup_payload = json!({
                "system_instruction": {
                    "parts": [{ "text": SYSTEM_PROMPT }]
                },
                "contents": contents,
                "tools": tools,
            });

            if let Ok(followup_res) = http_client.post(&url).json(&followup_payload).send().await {
                let mut followup_stream = followup_res.bytes_stream();
                while let Some(chunk_res) = followup_stream.next().await {
                    if let Ok(chunk) = chunk_res {
                        let s = String::from_utf8_lossy(&chunk);
                        for line in s.lines() {
                            if let Some(json_str) = line.strip_prefix("data: ")
                                && let Ok(val) = serde_json::from_str::<Value>(json_str)
                                && let Some(text) =
                                    val["candidates"][0]["content"]["parts"][0]["text"].as_str()
                            {
                                full_text.push_str(text);
                                let _ = tx.send(Ok(bytes::Bytes::from(text.to_string()))).await;
                            }
                        }
                    }
                }
            } else {
                tracing::error!("Gemini Function Calling 후속 스트리밍 호출 실패");
            }
        }

        let encrypted_response = encrypt(&full_text, &enc_key);
        if let Err(err) = sqlx::query("UPDATE ai_chat_logs SET response = $1 WHERE id = $2")
            .bind(&encrypted_response)
            .bind(log_id)
            .execute(&pool)
            .await
        {
            tracing::error!("AI 응답 암호화 저장 실패: {:?}", err);
        }
    });

    let body = Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx));
    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(body)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    Ok(response)
}

/// Gemini API에 전달할 Function Calling 도구 선언 목록을 반환합니다.
fn gemini_tools() -> Value {
    json!([{
        "functionDeclarations": [
            {
                "name": "searchMedication",
                "description": "의약품 이름으로 카탈로그(효능, 용법, 주의사항)를 검색합니다.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "검색할 의약품 이름 또는 키워드"
                        }
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "getMyMedications",
                "description": "현재 로그인한 사용자가 등록하여 복용 중인 의약품 목록을 조회합니다.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        ]
    }])
}

/// 모델이 요청한 Function Call을 내부 DB에서 실행하고 결과를 JSON으로 반환합니다.
async fn execute_tool_call(
    pool: &sqlx::PgPool,
    user_id: &str,
    fn_name: &str,
    args: &Value,
) -> Value {
    match fn_name {
        "searchMedication" => {
            let query = args["query"].as_str().unwrap_or("").trim();
            if query.is_empty() {
                return json!({ "medications": [], "message": "검색어가 비어 있습니다." });
            }
            let pattern = format!("%{query}%");
            let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<String>, Option<String>)>(
                "SELECT item_seq, item_name, entp_name, chart, drug_shape, color_class1 FROM pill_catalog WHERE item_name ILIKE $1 LIMIT 5",
            )
            .bind(&pattern)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            let meds: Vec<Value> = rows
                .into_iter()
                .map(
                    |(item_seq, name, company, chart, drug_shape, color_class1)| {
                        json!({
                            "itemSeq": item_seq,
                            "itemName": name,
                            "entpName": company,
                            "chart": chart,
                            "drugShape": drug_shape,
                            "colorClass1": color_class1,
                        })
                    },
                )
                .collect();

            json!({ "medications": meds })
        }
        "getMyMedications" => {
            let rows = sqlx::query_as::<_, (String, Option<String>, Option<String>)>(
                "SELECT name, dosage, frequency FROM user_medications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
            )
            .bind(user_id)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            let meds: Vec<Value> = rows
                .into_iter()
                .map(|(name, dosage, frequency)| {
                    json!({
                        "medicationName": name,
                        "dosage": dosage,
                        "frequency": frequency,
                    })
                })
                .collect();

            json!({ "myMedications": meds })
        }
        _ => json!({ "error": format!("지원하지 않는 도구 호출입니다: {fn_name}") }),
    }
}
