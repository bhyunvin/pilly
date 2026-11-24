use axum::{
    Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, patch, post},
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::{
    db::{
        AiChatLog, ChatAccessApproval, InquiryAttachment, UserProfile, UserRestrictionHistory,
        fetch_inquiry_attachments_map,
    },
    error::{AppError, AppResult},
    middleware::auth::AdminUser,
    mq::PillyEvent,
    state::AppState,
    utils::{mail::send_jit_access_notification, security::decrypt},
};

const JIT_ACCESS_VALID_HOURS: i64 = 24;

#[derive(Debug, Deserialize)]
pub struct UpdateStatusRequest {
    pub status: String,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateInquiryStatusRequest {
    pub status: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct AdminUserSummary {
    user_id: String,
    nickname: String,
    role: String,
    status: String,
    created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct AdminInquiryRow {
    id: i32,
    user_id: String,
    nickname: Option<String>,
    chat_session_id: Option<i32>,
    title: String,
    content: String,
    allow_chat_access: Option<bool>,
    chat_access_id: Option<Uuid>,
    status: Option<String>,
    created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminInquiryItem {
    #[serde(flatten)]
    inquiry: AdminInquiryRow,
    attachments: Vec<InquiryAttachment>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sync-pills", post(sync_pills))
        .route("/users", get(list_users))
        .route("/withdrawals", get(list_withdrawals))
        .route("/inquiries", get(list_admin_inquiries))
        .route("/inquiries/{id}/status", patch(update_inquiry_status))
        .route("/users/{userId}", get(get_user_detail))
        .route("/users/{userId}/role", patch(toggle_user_role))
        .route("/users/{userId}/status", patch(update_user_status))
        .route("/chat/{sessionId}", get(get_jit_chat_logs))
}

/// 타이밍 공격을 방지하기 위한 상수 시간 바이트 슬라이스 비교 함수
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len()
        && a.iter()
            .zip(b.iter())
            .fold(0u8, |diff, (x, y)| diff | (x ^ y))
            == 0
}

fn reject_self_modification(admin_id: &str, target_user_id: &str) -> Result<(), AppError> {
    if admin_id == target_user_id {
        return Err(AppError::BadRequest(
            "본인 계정의 권한이나 이용 상태는 변경할 수 없습니다.".to_string(),
        ));
    }
    Ok(())
}

fn spawn_admin_audit(state: &AppState, admin_id: String, action: String, target_id: String) {
    let producer = state.producer.clone();
    tokio::spawn(async move {
        producer
            .publish(PillyEvent::AdminAudit {
                admin_id,
                action,
                target_id,
            })
            .await;
    });
}

/// 의약품 데이터 동기화 트리거 (x-admin-key 헤더 상수 시간 검증)
async fn sync_pills(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let client_key = headers
        .get("x-admin-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();

    if state.config.admin_api_key.is_empty()
        || !constant_time_eq(client_key.as_bytes(), state.config.admin_api_key.as_bytes())
    {
        return Err(AppError::Unauthorized("Unauthorized".to_string()));
    }

    state
        .producer
        .publish(PillyEvent::SyncPills {
            triggered_by: "admin".to_string(),
        })
        .await;

    Ok(Json(json!({
        "success": true,
        "message": "Sync started",
    })))
}

/// 전체 사용자 목록 조회
async fn list_users(State(state): State<AppState>, _admin: AdminUser) -> AppResult<Json<Value>> {
    let users: Vec<AdminUserSummary> = sqlx::query_as(
        "SELECT user_id, nickname, role, status, created_at FROM user_profiles ORDER BY created_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "users": users,
    })))
}

/// 탈퇴 대기 사용자 목록 조회
async fn list_withdrawals(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<Value>> {
    let withdrawals: Vec<UserProfile> = sqlx::query_as(
        "SELECT user_id, nickname, role, status, restricted_reason, restricted_at, deleted_at, deletion_reason, created_at, updated_at FROM user_profiles WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": withdrawals,
    })))
}

/// 관리자 1:1 문의 전체 목록 조회 (첨부파일 및 JIT 승인 UUID 포함)
async fn list_admin_inquiries(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> AppResult<Json<Value>> {
    let rows: Vec<AdminInquiryRow> = sqlx::query_as(
        "SELECT ui.id, ui.user_id, up.nickname, ui.chat_session_id, ui.title, ui.content, \
         ui.allow_chat_access, ui.chat_access_id, ui.status::text, ui.created_at \
         FROM user_inquiries ui \
         LEFT JOIN user_profiles up ON ui.user_id = up.user_id \
         ORDER BY ui.created_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;

    if rows.is_empty() {
        return Ok(Json(json!({
            "success": true,
            "data": [],
        })));
    }

    let inquiry_ids: Vec<i32> = rows.iter().map(|r| r.id).collect();
    let mut attachment_map = fetch_inquiry_attachments_map(&state.pool, &inquiry_ids).await?;

    let items: Vec<AdminInquiryItem> = rows
        .into_iter()
        .map(|inquiry| {
            let attachments = attachment_map.remove(&inquiry.id).unwrap_or_default();
            AdminInquiryItem {
                inquiry,
                attachments,
            }
        })
        .collect();

    Ok(Json(json!({
        "success": true,
        "data": items,
    })))
}

/// 관리자 1:1 문의 상태 변경 (`PENDING` / `RESOLVED`)
async fn update_inquiry_status(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(inquiry_id): Path<i32>,
    Json(body): Json<UpdateInquiryStatusRequest>,
) -> AppResult<Json<Value>> {
    if !matches!(body.status.as_str(), "PENDING" | "RESOLVED") {
        return Err(AppError::BadRequest(
            "문의 상태는 PENDING 또는 RESOLVED여야 합니다.".to_string(),
        ));
    }

    let result = sqlx::query("UPDATE user_inquiries SET status = $1::inquiry_status WHERE id = $2")
        .bind(&body.status)
        .bind(inquiry_id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(
            "해당 문의 내역을 찾을 수 없습니다.".to_string(),
        ));
    }

    spawn_admin_audit(
        &state,
        admin.user_id,
        format!("INQUIRY_STATUS_{}", body.status),
        format!("inquiry:{inquiry_id}"),
    );

    Ok(Json(json!({
        "success": true,
        "status": body.status,
    })))
}

/// 특정 사용자 상세 정보 및 제재 히스토리 조회
async fn get_user_detail(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(user_id): Path<String>,
) -> AppResult<Json<Value>> {
    let user: Option<UserProfile> = sqlx::query_as(
        "SELECT user_id, nickname, role, status, restricted_reason, restricted_at, deleted_at, deletion_reason, created_at, updated_at FROM user_profiles WHERE user_id = $1 LIMIT 1",
    )
    .bind(&user_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(user) = user else {
        return Err(AppError::NotFound("사용자를 찾을 수 없습니다.".to_string()));
    };

    let history: Vec<UserRestrictionHistory> = sqlx::query_as(
        "SELECT id, user_id, admin_id, reason, created_at FROM user_restriction_history WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(&user_id)
    .fetch_all(&state.pool)
    .await?;

    let mut user_val = serde_json::to_value(&user).unwrap_or_default();
    if let Some(obj) = user_val.as_object_mut() {
        obj.insert(
            "restrictionHistory".to_string(),
            serde_json::to_value(&history).unwrap_or_default(),
        );
    }

    Ok(Json(json!({
        "success": true,
        "user": user_val,
    })))
}

/// 사용자 권한 변경 (USER <-> ADMIN 토글, 본인 계정 변경 차단)
async fn toggle_user_role(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(user_id): Path<String>,
) -> AppResult<Json<Value>> {
    reject_self_modification(&admin.user_id, &user_id)?;

    let current_role: Option<(String,)> =
        sqlx::query_as("SELECT role FROM user_profiles WHERE user_id = $1 LIMIT 1")
            .bind(&user_id)
            .fetch_optional(&state.pool)
            .await?;

    let Some((role,)) = current_role else {
        return Err(AppError::NotFound("사용자를 찾을 수 없습니다.".to_string()));
    };

    let new_role = if role == "ADMIN" { "USER" } else { "ADMIN" };
    sqlx::query("UPDATE user_profiles SET role = $1, updated_at = NOW() WHERE user_id = $2")
        .bind(new_role)
        .bind(&user_id)
        .execute(&state.pool)
        .await?;

    spawn_admin_audit(
        &state,
        admin.user_id,
        format!("TOGGLE_ROLE_{new_role}"),
        user_id,
    );

    Ok(Json(json!({
        "success": true,
        "role": new_role,
    })))
}

/// 사용자 계정 상태 변경 (ACTIVE / RESTRICTED, 본인 계정 변경 차단)
async fn update_user_status(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(user_id): Path<String>,
    Json(body): Json<UpdateStatusRequest>,
) -> AppResult<Json<Value>> {
    reject_self_modification(&admin.user_id, &user_id)?;

    let exists: Option<(String,)> =
        sqlx::query_as("SELECT user_id FROM user_profiles WHERE user_id = $1 LIMIT 1")
            .bind(&user_id)
            .fetch_optional(&state.pool)
            .await?;

    if exists.is_none() {
        return Err(AppError::NotFound("사용자를 찾을 수 없습니다.".to_string()));
    }

    match body.status.as_str() {
        "RESTRICTED" => {
            let reason = body
                .reason
                .map(|r| r.trim().to_string())
                .filter(|r| !r.is_empty())
                .unwrap_or_else(|| "관리자에 의해 계정이 제한되었습니다.".to_string());
            let mut tx = state.pool.begin().await?;

            sqlx::query(
                "UPDATE user_profiles SET status = 'RESTRICTED', restricted_reason = $1, restricted_at = NOW(), updated_at = NOW() WHERE user_id = $2",
            )
            .bind(&reason)
            .bind(&user_id)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "INSERT INTO user_restriction_history (user_id, admin_id, reason) VALUES ($1, $2, $3)",
            )
            .bind(&user_id)
            .bind(&admin.user_id)
            .bind(&reason)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;
        }
        "ACTIVE" => {
            sqlx::query(
                "UPDATE user_profiles SET status = 'ACTIVE', restricted_reason = NULL, restricted_at = NULL, updated_at = NOW() WHERE user_id = $1",
            )
            .bind(&user_id)
            .execute(&state.pool)
            .await?;
        }
        _ => {
            return Err(AppError::BadRequest(
                "올바르지 않은 상태값입니다.".to_string(),
            ));
        }
    }

    spawn_admin_audit(
        &state,
        admin.user_id,
        format!("USER_STATUS_{}", body.status),
        user_id,
    );

    Ok(Json(json!({
        "success": true,
        "message": format!("사용자 상태가 {}로 변경되었습니다.", body.status),
    })))
}

async fn find_chat_access_approval(
    pool: &PgPool,
    target: &str,
) -> Result<ChatAccessApproval, AppError> {
    let approval: Option<ChatAccessApproval> = if let Ok(approval_uuid) = Uuid::parse_str(target) {
        sqlx::query_as(
            "SELECT id, user_id, chat_session_id, granted_at, accessed_at, expires_at, created_at FROM chat_access_approvals WHERE id = $1 LIMIT 1",
        )
        .bind(approval_uuid)
        .fetch_optional(pool)
        .await?
    } else if let Ok(session_id) = target.parse::<i32>() {
        sqlx::query_as(
            "SELECT id, user_id, chat_session_id, granted_at, accessed_at, expires_at, created_at FROM chat_access_approvals WHERE chat_session_id = $1 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(session_id)
        .fetch_optional(pool)
        .await?
    } else {
        return Err(AppError::BadRequest(
            "유효하지 않은 채팅 조회 식별자입니다.".to_string(),
        ));
    };

    approval.ok_or_else(|| {
        AppError::Forbidden("해당 채팅방에 대한 접근 권한이 승인되지 않았습니다.".to_string())
    })
}

fn spawn_jit_access_notification(state: &AppState, target_user_id: String, session_id: i32) {
    let pool = state.pool.clone();
    let config = state.config.clone();
    tokio::spawn(async move {
        let email_opt: Option<String> =
            sqlx::query_scalar("SELECT email FROM neon_auth.\"user\" WHERE id = $1 LIMIT 1")
                .bind(&target_user_id)
                .fetch_optional(&pool)
                .await
                .ok()
                .flatten();

        let Some(to_email) = email_opt else {
            tracing::info!(
                "사용자 이메일을 찾을 수 없어 JIT 열람 알림 발송을 건너뜁니다. (user_id={}, session_id={})",
                target_user_id,
                session_id
            );
            return;
        };

        if let Err(err) = send_jit_access_notification(&config, &to_email, session_id).await {
            tracing::error!("JIT 열람 알림 이메일 발송 오류: {}", err);
        }
    });
}

/// JIT(Just-In-Time) 채팅 로그 접근 제어 (원자적 최초 열람 처리, 24시간 유효, 감사 로그 발행)
async fn get_jit_chat_logs(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(target): Path<String>,
) -> AppResult<Json<Value>> {
    let approval = find_chat_access_approval(&state.pool, &target).await?;
    let session_id = approval
        .chat_session_id
        .ok_or_else(|| AppError::NotFound("연결된 채팅 세션을 찾을 수 없습니다.".to_string()))?;

    let now = Utc::now();
    let expires_at = now + Duration::hours(JIT_ACCESS_VALID_HOURS);

    // 최초 열람인 경우 원자적으로 `accessed_at IS NULL` 조건부 업데이트를 시도해 중복 이메일 발송 차단
    let first_claimed: Option<(Option<DateTime<Utc>>,)> = sqlx::query_as(
        "UPDATE chat_access_approvals SET accessed_at = $1, expires_at = $2 WHERE id = $3 AND accessed_at IS NULL RETURNING expires_at",
    )
    .bind(now)
    .bind(expires_at)
    .bind(approval.id)
    .fetch_optional(&state.pool)
    .await?;

    if first_claimed.is_some() {
        spawn_jit_access_notification(&state, approval.user_id.clone(), session_id);
    } else if let Some(existing_expires_at) = approval.expires_at
        && now > existing_expires_at
    {
        return Err(AppError::Forbidden(
            "접근 권한이 만료되었습니다.".to_string(),
        ));
    }

    let raw_logs: Vec<AiChatLog> = sqlx::query_as(
        "SELECT id, session_id, user_id, prompt, response, created_at FROM ai_chat_logs WHERE session_id = $1 ORDER BY created_at ASC",
    )
    .bind(session_id)
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

    spawn_admin_audit(
        &state,
        admin.user_id,
        "JIT_CHAT_VIEW".to_string(),
        format!("session:{session_id}"),
    );

    Ok(Json(json!({
        "success": true,
        "data": logs,
    })))
}
