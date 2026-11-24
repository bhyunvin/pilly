use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::{StatusCode, header},
    response::Response,
    routing::{get, patch, post},
};
use futures::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Executor, FromRow, PgPool, Postgres};
use tokio::sync::mpsc;

use crate::{
    db::{AiChatLog, ChatSession},
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    state::AppState,
    utils::security::{decrypt, encrypt},
};

const MAX_SESSION_TITLE_CHARS: usize = 100;
const DEFAULT_SESSION_TITLE: &str = "새로운 상담";
const SSE_CHANNEL_CAPACITY: usize = 32;

const SYSTEM_PROMPT: &str = "당신은 전문 약사 AI \"Pilly\"입니다. \
사용자의 건강 상태와 약물 정보를 바탕으로 빠르고 간결하며 친절하게 복약 지도를 수행하세요. \
최종적인 의학적 진단은 내리지 말고, 필요시 의사/약사 상담을 권고하세요.";

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

#[derive(Debug, Deserialize)]
pub struct UpdateSessionTitleRequest {
    pub title: String,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
struct MedicationSearchItem {
    item_seq: String,
    item_name: String,
    entp_name: Option<String>,
    chart: Option<String>,
    drug_shape: Option<String>,
    color_class1: Option<String>,
}

#[derive(Debug, FromRow, Serialize)]
struct UserMedicationSummary {
    #[serde(rename = "medicationName")]
    name: String,
    dosage: Option<String>,
    frequency: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sessions", get(get_sessions).post(create_session))
        .route(
            "/sessions/{id}",
            get(get_session_logs).delete(delete_session),
        )
        .route("/sessions/{id}/title", patch(update_session_title))
        .route("/sessions/{id}/message", post(send_message))
}

async fn ensure_session_owner<'e, E>(
    executor: E,
    session_id: i32,
    user_id: &str,
) -> Result<(), AppError>
where
    E: Executor<'e, Database = Postgres>,
{
    let owned: Option<(i32,)> =
        sqlx::query_as("SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2 LIMIT 1")
            .bind(session_id)
            .bind(user_id)
            .fetch_optional(executor)
            .await?;

    if owned.is_none() {
        return Err(AppError::NotFound(
            "채팅 세션을 찾을 수 없습니다.".to_string(),
        ));
    }

    Ok(())
}

/// 채팅 세션 제목 수정 (본인 세션만 가능)
async fn update_session_title(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(session_id): Path<i32>,
    Json(body): Json<UpdateSessionTitleRequest>,
) -> AppResult<Json<Value>> {
    let title = body.title.trim();
    if title.is_empty() || title.chars().count() > MAX_SESSION_TITLE_CHARS {
        return Err(AppError::BadRequest(format!(
            "제목은 1자 이상 {MAX_SESSION_TITLE_CHARS}자 이하로 입력해 주세요."
        )));
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

/// 사용자의 활성화된 모든 채팅 세션 목록 조회 (최근 대화순)
async fn get_sessions(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<Vec<ChatSession>>> {
    let sessions: Vec<ChatSession> = sqlx::query_as(
        "SELECT id, user_id, title, created_at, updated_at FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC, created_at DESC",
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
    let title = body
        .title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| DEFAULT_SESSION_TITLE.to_string());

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

/// 채팅 세션 삭제 (본인 소유 확인 후 관련 로그·열람 승인 정리, 문의는 세션 연결만 해제)
async fn delete_session(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(session_id): Path<i32>,
) -> AppResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    ensure_session_owner(&mut *tx, session_id, &auth_user.user_id).await?;

    sqlx::query(
        "UPDATE user_inquiries SET chat_session_id = NULL, chat_access_id = NULL, allow_chat_access = FALSE WHERE chat_session_id = $1 AND user_id = $2",
    )
    .bind(session_id)
    .bind(&auth_user.user_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM chat_access_approvals WHERE chat_session_id = $1 AND user_id = $2")
        .bind(session_id)
        .bind(&auth_user.user_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM ai_chat_logs WHERE session_id = $1 AND user_id = $2")
        .bind(session_id)
        .bind(&auth_user.user_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2")
        .bind(session_id)
        .bind(&auth_user.user_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(Json(json!({
        "success": true,
        "message": "채팅 세션이 삭제되었습니다.",
    })))
}

/// 특정 채팅 세션의 대화 내역 조회 (복호화)
async fn get_session_logs(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(session_id): Path<i32>,
) -> AppResult<Json<Value>> {
    ensure_session_owner(&state.pool, session_id, &auth_user.user_id).await?;

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

/// Gemini API 멀티턴 규격에 맞게 선행 `model` 메시지를 제거하고 `contents` 배열을 조립합니다.
fn build_gemini_contents(history: &[ChatHistoryItem]) -> Result<(String, Vec<Value>), AppError> {
    let normalized: Vec<(String, String)> = history
        .iter()
        .skip_while(|item| item.role != "user")
        .filter_map(|item| {
            let text = item.parts.first().map(|p| p.text.trim()).unwrap_or("");
            if text.is_empty() {
                return None;
            }
            let role = if item.role == "user" { "user" } else { "model" };
            Some((role.to_string(), text.to_string()))
        })
        .collect();

    let user_prompt = normalized
        .iter()
        .rev()
        .find(|(role, _)| role == "user")
        .map(|(_, text)| text.clone())
        .ok_or_else(|| AppError::BadRequest("전송할 질문 내용을 입력해 주세요.".to_string()))?;

    let contents = normalized
        .into_iter()
        .map(|(role, text)| {
            json!({
                "role": role,
                "parts": [{ "text": text }]
            })
        })
        .collect();

    Ok((user_prompt, contents))
}

fn build_gemini_payload(contents: &[Value], tools: &Value) -> Value {
    json!({
        "system_instruction": {
            "parts": [{ "text": SYSTEM_PROMPT }]
        },
        "contents": contents,
        "tools": tools,
    })
}

#[derive(Debug, Default)]
struct SseLineParser {
    buffer: Vec<u8>,
}

#[derive(Debug, Default)]
struct ParsedSseEvents {
    texts: Vec<String>,
    function_call: Option<(String, Value)>,
}

impl SseLineParser {
    fn feed(&mut self, chunk: &[u8]) -> ParsedSseEvents {
        self.buffer.extend_from_slice(chunk);
        let mut events = ParsedSseEvents::default();

        while let Some(pos) = self.buffer.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = self.buffer.drain(..=pos).collect();
            self.process_line(&line_bytes, &mut events);
        }

        events
    }

    fn finish(&mut self) -> ParsedSseEvents {
        let mut events = ParsedSseEvents::default();
        if !self.buffer.is_empty() {
            let remaining = std::mem::take(&mut self.buffer);
            self.process_line(&remaining, &mut events);
        }
        events
    }

    fn process_line(&self, line_bytes: &[u8], events: &mut ParsedSseEvents) {
        let line = String::from_utf8_lossy(line_bytes);
        let trimmed = line.trim_end_matches(['\r', '\n']);
        let Some(json_str) = trimmed.strip_prefix("data: ") else {
            return;
        };
        if json_str == "[DONE]" {
            return;
        }
        let Ok(val) = serde_json::from_str::<Value>(json_str) else {
            return;
        };
        let Some(parts) = val["candidates"][0]["content"]["parts"].as_array() else {
            return;
        };

        for part in parts {
            if let Some(fc) = part.get("functionCall")
                && let Some(name) = fc["name"].as_str()
            {
                events.function_call = Some((name.to_string(), fc["args"].clone()));
            }
            if let Some(text) = part["text"].as_str() {
                events.texts.push(text.to_string());
            }
        }
    }
}

async fn dispatch_sse_events(
    events: ParsedSseEvents,
    tx: &mpsc::Sender<Result<bytes::Bytes, std::io::Error>>,
    full_text: &mut String,
    pending_fc: &mut Option<(String, Value)>,
) {
    if let Some(fc) = events.function_call {
        *pending_fc = Some(fc);
    }
    for text in events.texts {
        full_text.push_str(&text);
        let _ = tx.send(Ok(bytes::Bytes::from(text))).await;
    }
}

async fn consume_gemini_sse_stream<S, E>(
    mut stream: S,
    tx: &mpsc::Sender<Result<bytes::Bytes, std::io::Error>>,
    full_text: &mut String,
) -> Option<(String, Value)>
where
    S: Stream<Item = Result<bytes::Bytes, E>> + Unpin,
    E: std::fmt::Debug,
{
    let mut parser = SseLineParser::default();
    let mut pending_fc: Option<(String, Value)> = None;

    while let Some(chunk_res) = stream.next().await {
        match chunk_res {
            Ok(chunk) => {
                let events = parser.feed(&chunk);
                dispatch_sse_events(events, tx, full_text, &mut pending_fc).await;
            }
            Err(err) => {
                tracing::error!("Gemini SSE 스트림 수신 오류: {:?}", err);
                break;
            }
        }
    }

    let trailing = parser.finish();
    dispatch_sse_events(trailing, tx, full_text, &mut pending_fc).await;

    pending_fc
}

async fn persist_encrypted_response(pool: &PgPool, log_id: i32, full_text: &str, enc_key: &str) {
    match encrypt(full_text, enc_key) {
        Ok(encrypted_response) => {
            if let Err(err) = sqlx::query("UPDATE ai_chat_logs SET response = $1 WHERE id = $2")
                .bind(&encrypted_response)
                .bind(log_id)
                .execute(pool)
                .await
            {
                tracing::error!("AI 응답 암호화 저장 실패: {:?}", err);
            }
        }
        Err(err) => {
            tracing::error!(
                "AI 응답 암호화 실패로 평문 저장을 중단합니다 (log_id={log_id}): {err}"
            );
        }
    }
}

/// 실시간 AI 메시징 및 스트리밍 응답 (AES-256-GCM 암호화 저장)
async fn send_message(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Path(session_id): Path<i32>,
    Json(body): Json<SendMessageRequest>,
) -> AppResult<Response> {
    ensure_session_owner(&state.pool, session_id, &auth_user.user_id).await?;

    let (user_prompt, mut contents) = build_gemini_contents(&body.history)?;
    let encrypted_prompt = encrypt(&user_prompt, &state.config.encryption_key)?;

    let log_record: AiChatLog = sqlx::query_as(
        "INSERT INTO ai_chat_logs (session_id, user_id, prompt, response) VALUES ($1, $2, $3, '') RETURNING id, session_id, user_id, prompt, response, created_at",
    )
    .bind(session_id)
    .bind(&auth_user.user_id)
    .bind(&encrypted_prompt)
    .fetch_one(&state.pool)
    .await?;

    sqlx::query("UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1 AND user_id = $2")
        .bind(session_id)
        .bind(&auth_user.user_id)
        .execute(&state.pool)
        .await?;

    let url = format!(
        "{}/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
        state.config.gemini_base_url, state.config.gemini_model, state.config.gemini_api_key
    );

    let tools = gemini_tools();
    let payload = build_gemini_payload(&contents, &tools);

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

    let (tx, rx) = mpsc::channel::<Result<bytes::Bytes, std::io::Error>>(SSE_CHANNEL_CAPACITY);
    let pool = state.pool.clone();
    let http_client = state.http_client.clone();
    let enc_key = state.config.encryption_key.clone();
    let user_id = auth_user.user_id.clone();
    let log_id = log_record.id;

    tokio::spawn(async move {
        let mut full_text = String::new();
        let pending_function_call =
            consume_gemini_sse_stream(res.bytes_stream(), &tx, &mut full_text).await;

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

            let followup_payload = build_gemini_payload(&contents, &tools);

            match http_client.post(&url).json(&followup_payload).send().await {
                Ok(followup_res) if followup_res.status().is_success() => {
                    let _ =
                        consume_gemini_sse_stream(followup_res.bytes_stream(), &tx, &mut full_text)
                            .await;
                }
                Ok(followup_res) => {
                    tracing::error!(
                        "Gemini Function Calling 후속 스트리밍 오류 응답: {}",
                        followup_res.status()
                    );
                }
                Err(err) => {
                    tracing::error!("Gemini Function Calling 후속 스트리밍 호출 실패: {err:?}");
                }
            }
        }

        persist_encrypted_response(&pool, log_id, &full_text, &enc_key).await;
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
async fn execute_tool_call(pool: &PgPool, user_id: &str, fn_name: &str, args: &Value) -> Value {
    match fn_name {
        "searchMedication" => {
            let query = args["query"].as_str().unwrap_or("").trim();
            if query.is_empty() {
                return json!({ "medications": [], "message": "검색어가 비어 있습니다." });
            }
            let pattern = format!("%{query}%");
            let meds: Vec<MedicationSearchItem> = sqlx::query_as(
                "SELECT item_seq, item_name, entp_name, chart, drug_shape, color_class1 FROM pill_catalog WHERE item_name ILIKE $1 LIMIT 5",
            )
            .bind(&pattern)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            json!({ "medications": meds })
        }
        "getMyMedications" => {
            let meds: Vec<UserMedicationSummary> = sqlx::query_as(
                "SELECT name, dosage, frequency FROM user_medications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
            )
            .bind(user_id)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

            json!({ "myMedications": meds })
        }
        _ => json!({ "error": format!("지원하지 않는 도구 호출입니다: {fn_name}") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sse_stream_handles_chunked_korean_and_function_call() {
        let sse_payload = concat!(
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"타이레놀은 하루 최대 4000mg까지만 복용하세요.\"}]}}]}\n\n",
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"functionCall\":{\"name\":\"getMyMedications\",\"args\":{\"filter\":\"all\"}}}]}}]}\n\n"
        );

        // 3~5바이트씩 강제 분할하여 멀티바이트 한글 및 JSON 경계 분할 시뮬레이션
        for chunk_size in [3, 5] {
            let chunks: Vec<Result<bytes::Bytes, std::io::Error>> = sse_payload
                .as_bytes()
                .chunks(chunk_size)
                .map(|c| Ok(bytes::Bytes::copy_from_slice(c)))
                .collect();

            let (tx, mut rx) = mpsc::channel(16);
            let mut full_text = String::new();
            let fc =
                consume_gemini_sse_stream(futures::stream::iter(chunks), &tx, &mut full_text).await;
            drop(tx);

            let mut streamed = String::new();
            while let Some(Ok(b)) = rx.recv().await {
                streamed.push_str(&String::from_utf8_lossy(&b));
            }

            assert_eq!(full_text, "타이레놀은 하루 최대 4000mg까지만 복용하세요.");
            assert_eq!(streamed, full_text);
            let (fn_name, fn_args) = fc.expect("functionCall 파싱 성공");
            assert_eq!(fn_name, "getMyMedications");
            assert_eq!(fn_args["filter"], "all");
        }
    }

    #[test]
    fn test_build_gemini_contents_strips_leading_model_messages() {
        let history = vec![
            ChatHistoryItem {
                role: "model".to_string(),
                parts: vec![ChatHistoryPart {
                    text: "환영합니다!".to_string(),
                }],
            },
            ChatHistoryItem {
                role: "user".to_string(),
                parts: vec![ChatHistoryPart {
                    text: "아스피린 주의사항 알려줘".to_string(),
                }],
            },
            ChatHistoryItem {
                role: "model".to_string(),
                parts: vec![ChatHistoryPart {
                    text: "위장장애에 주의하세요.".to_string(),
                }],
            },
            ChatHistoryItem {
                role: "user".to_string(),
                parts: vec![ChatHistoryPart {
                    text: "식후에 먹어야 하나요?".to_string(),
                }],
            },
        ];

        let (prompt, contents) = build_gemini_contents(&history).expect("유효한 히스토리");
        assert_eq!(prompt, "식후에 먹어야 하나요?");
        assert_eq!(contents.len(), 3);
        assert_eq!(contents[0]["role"], "user");
        assert_eq!(contents[1]["role"], "model");
        assert_eq!(contents[2]["role"], "user");

        let only_model = vec![ChatHistoryItem {
            role: "model".to_string(),
            parts: vec![ChatHistoryPart {
                text: "인사".to_string(),
            }],
        }];
        assert!(build_gemini_contents(&only_model).is_err());
    }
}
