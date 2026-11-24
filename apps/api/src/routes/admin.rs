use axum::{
    Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, patch, post},
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    db::{AiChatLog, ChatAccessApproval, UserProfile, UserRestrictionHistory},
    error::{AppError, AppResult},
    middleware::auth::AdminUser,
    mq::PillyEvent,
    state::AppState,
    utils::{mail::send_jit_access_notification, security::decrypt},
};

#[derive(Debug, Deserialize)]
pub struct UpdateStatusRequest {
    pub status: String,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminUserSummary {
    user_id: String,
    nickname: String,
    role: String,
    status: String,
    #[serde(with = "crate::db::opt_utc_naive_datetime")]
    created_at: Option<chrono::NaiveDateTime>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sync-pills", post(sync_pills))
        .route("/users", get(list_users))
        .route("/withdrawals", get(list_withdrawals))
        .route("/users/{userId}", get(get_user_detail))
        .route("/users/{userId}/role", patch(toggle_user_role))
        .route("/users/{userId}/status", patch(update_user_status))
        .route("/chat/{sessionId}", get(get_jit_chat_logs))
}

/// 의약품 데이터 동기화 트리거 (x-admin-key 헤더 검증)
async fn sync_pills(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let client_key = headers
        .get("x-admin-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();

    if state.config.admin_api_key.is_empty() || client_key != state.config.admin_api_key {
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
    let rows: Vec<(String, String, String, String, Option<chrono::NaiveDateTime>)> = sqlx::query_as(
        "SELECT user_id, nickname, role, status, created_at FROM user_profiles ORDER BY created_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;

    let users: Vec<AdminUserSummary> = rows
        .into_iter()
        .map(
            |(user_id, nickname, role, status, created_at)| AdminUserSummary {
                user_id,
                nickname,
                role,
                status,
                created_at,
            },
        )
        .collect();

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

/// 사용자 권한 변경 (USER <-> ADMIN 토글)
async fn toggle_user_role(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(user_id): Path<String>,
) -> AppResult<Json<Value>> {
    let current_role: Option<(String,)> =
        sqlx::query_as("SELECT role FROM user_profiles WHERE user_id = $1 LIMIT 1")
            .bind(&user_id)
            .fetch_optional(&state.pool)
            .await?;

    let Some((role,)) = current_role else {
        return Err(AppError::NotFound("사용자를 찾을 수 없습니다.".to_string()));
    };

    let new_role = if role == "ADMIN" { "USER" } else { "ADMIN" };
    sqlx::query("UPDATE user_profiles SET role = $1 WHERE user_id = $2")
        .bind(new_role)
        .bind(&user_id)
        .execute(&state.pool)
        .await?;

    // 관리자 감사 로그 비동기 발행
    let producer = state.producer.clone();
    tokio::spawn(async move {
        producer
            .publish(PillyEvent::AdminAudit {
                admin_id: admin.user_id,
                action: format!("TOGGLE_ROLE_{new_role}"),
                target_id: user_id,
            })
            .await;
    });

    Ok(Json(json!({
        "success": true,
        "role": new_role,
    })))
}

/// 사용자 계정 상태 변경 (ACTIVE / RESTRICTED)
async fn update_user_status(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(user_id): Path<String>,
    Json(body): Json<UpdateStatusRequest>,
) -> AppResult<Json<Value>> {
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

    Ok(Json(json!({
        "success": true,
        "message": format!("사용자 상태가 {}로 변경되었습니다.", body.status),
    })))
}

/// JIT(Just-In-Time) 채팅 로그 접근 제어 (세션 ID 또는 승인 UUID 지원, 24시간 유효)
async fn get_jit_chat_logs(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(target): Path<String>,
) -> AppResult<Json<Value>> {
    let approval: Option<ChatAccessApproval> = if let Ok(approval_uuid) =
        uuid::Uuid::parse_str(&target)
    {
        sqlx::query_as(
            "SELECT id, user_id, chat_session_id, granted_at, accessed_at, expires_at, created_at FROM chat_access_approvals WHERE id = $1 LIMIT 1",
        )
        .bind(approval_uuid)
        .fetch_optional(&state.pool)
        .await?
    } else if let Ok(session_id) = target.parse::<i32>() {
        sqlx::query_as(
            "SELECT id, user_id, chat_session_id, granted_at, accessed_at, expires_at, created_at FROM chat_access_approvals WHERE chat_session_id = $1 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(session_id)
        .fetch_optional(&state.pool)
        .await?
    } else {
        return Err(AppError::BadRequest(
            "유효하지 않은 채팅 조회 식별자입니다.".to_string(),
        ));
    };

    let Some(approval) = approval else {
        return Err(AppError::Forbidden(
            "해당 채팅방에 대한 접근 권한이 승인되지 않았습니다.".to_string(),
        ));
    };

    let session_id = approval
        .chat_session_id
        .ok_or_else(|| AppError::NotFound("연결된 채팅 세션을 찾을 수 없습니다.".to_string()))?;

    let now = Utc::now().naive_utc();
    if approval.accessed_at.is_some() {
        if let Some(expires_at) = approval.expires_at
            && now > expires_at
        {
            return Err(AppError::Forbidden(
                "접근 권한이 만료되었습니다.".to_string(),
            ));
        }
    } else {
        let expires_at = now + Duration::hours(24);
        sqlx::query(
            "UPDATE chat_access_approvals SET accessed_at = $1, expires_at = $2 WHERE id = $3",
        )
        .bind(now)
        .bind(expires_at)
        .bind(approval.id)
        .execute(&state.pool)
        .await?;

        // 최초 열람 시 사용자에게 개인정보 열람 고지 이메일 비동기 발송
        let pool_clone = state.pool.clone();
        let config_clone = state.config.clone();
        let target_user_id = approval.user_id.clone();
        tokio::spawn(async move {
            let email_opt: Option<String> =
                sqlx::query_scalar("SELECT email FROM neon_auth.\"user\" WHERE id = $1 LIMIT 1")
                    .bind(&target_user_id)
                    .fetch_optional(&pool_clone)
                    .await
                    .ok()
                    .flatten();

            if let Some(to_email) = email_opt {
                if let Err(err) =
                    send_jit_access_notification(&config_clone, &to_email, session_id).await
                {
                    tracing::error!("JIT 열람 알림 이메일 발송 오류: {}", err);
                }
            } else {
                tracing::info!(
                    "사용자 이메일을 찾을 수 없어 JIT 열람 알림 발송을 건너뜁니다. (user_id={}, session_id={})",
                    target_user_id,
                    session_id
                );
            }
        });
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

    Ok(Json(json!({
        "success": true,
        "data": logs,
    })))
}
