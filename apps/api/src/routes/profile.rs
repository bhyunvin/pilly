use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    db::UserProfile,
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub nickname: String,
}

#[derive(Debug, Deserialize)]
pub struct WithdrawRequest {
    pub reason: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(get_profile).patch(update_profile))
        .route("/withdraw", post(withdraw_profile))
        .route("/restore", post(restore_profile))
}

/// 내 프로필 정보 조회
async fn get_profile(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<Value>> {
    let user: Option<UserProfile> = sqlx::query_as(
        "SELECT user_id, nickname, role, status, restricted_reason, restricted_at, deleted_at, deletion_reason, created_at, updated_at FROM user_profiles WHERE user_id = $1 LIMIT 1",
    )
    .bind(&auth_user.user_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(user) = user else {
        return Err(AppError::NotFound("사용자를 찾을 수 없습니다.".to_string()));
    };

    Ok(Json(json!({
        "success": true,
        "data": user,
    })))
}

/// 닉네임 수정 (2~40자 제한)
async fn update_profile(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(body): Json<UpdateProfileRequest>,
) -> AppResult<Json<Value>> {
    let len = body.nickname.chars().count();
    if !(2..=40).contains(&len) {
        return Err(AppError::BadRequest(
            "닉네임은 2자 이상 40자 이하로 입력해 주세요.".to_string(),
        ));
    }

    let updated: UserProfile = sqlx::query_as(
        "UPDATE user_profiles SET nickname = $1, updated_at = NOW() WHERE user_id = $2 RETURNING user_id, nickname, role, status, restricted_reason, restricted_at, deleted_at, deletion_reason, created_at, updated_at",
    )
    .bind(&body.nickname)
    .bind(&auth_user.user_id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": updated,
    })))
}

/// 회원 탈퇴 (Soft Delete - 30일 유예)
async fn withdraw_profile(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(body): Json<WithdrawRequest>,
) -> AppResult<Json<Value>> {
    let reason = body.reason.unwrap_or_else(|| "자발적 탈퇴".to_string());

    sqlx::query(
        "UPDATE user_profiles SET deleted_at = NOW(), restricted_reason = $1 WHERE user_id = $2",
    )
    .bind(&reason)
    .bind(&auth_user.user_id)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "message": "탈퇴 유예 처리가 완료되었습니다. 30일 이내에 다시 로그인하여 철회할 수 있습니다.",
    })))
}

/// 탈퇴 계정 복구
async fn restore_profile(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<Value>> {
    sqlx::query(
        "UPDATE user_profiles SET deleted_at = NULL, restricted_reason = NULL WHERE user_id = $1",
    )
    .bind(&auth_user.user_id)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "message": "계정이 성공적으로 복구되었습니다.",
    })))
}
