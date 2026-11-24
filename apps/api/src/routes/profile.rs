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
        .route(
            "/",
            get(get_profile).post(create_profile).patch(update_profile),
        )
        .route("/withdraw", post(withdraw_profile))
        .route("/restore", post(restore_profile))
}

/// 신규 사용자 초기 프로필 생성 (닉네임 중복 시 409 Conflict)
async fn create_profile(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(body): Json<UpdateProfileRequest>,
) -> AppResult<Json<Value>> {
    let nickname =
        validate_and_check_nickname(&state.pool, &auth_user.user_id, &body.nickname).await?;

    let profile: UserProfile = sqlx::query_as(
        "INSERT INTO user_profiles (user_id, nickname, role, status) VALUES ($1, $2, 'USER', 'ACTIVE') \
         ON CONFLICT (user_id) DO UPDATE SET nickname = EXCLUDED.nickname, updated_at = NOW() \
         RETURNING user_id, nickname, role, status, restricted_reason, restricted_at, deleted_at, deletion_reason, created_at, updated_at",
    )
    .bind(&auth_user.user_id)
    .bind(nickname)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "data": profile,
    })))
}

/// 내 프로필 정보 조회
async fn get_profile(State(state): State<AppState>, auth_user: AuthUser) -> AppResult<Json<Value>> {
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

/// 닉네임 수정 (2~40자 제한, 공백 trim 및 중복 409 검사)
async fn update_profile(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(body): Json<UpdateProfileRequest>,
) -> AppResult<Json<Value>> {
    let nickname =
        validate_and_check_nickname(&state.pool, &auth_user.user_id, &body.nickname).await?;

    let updated: Option<UserProfile> = sqlx::query_as(
        "UPDATE user_profiles SET nickname = $1, updated_at = NOW() WHERE user_id = $2 RETURNING user_id, nickname, role, status, restricted_reason, restricted_at, deleted_at, deletion_reason, created_at, updated_at",
    )
    .bind(nickname)
    .bind(&auth_user.user_id)
    .fetch_optional(&state.pool)
    .await?;

    let Some(profile) = updated else {
        return Err(AppError::NotFound("사용자를 찾을 수 없습니다.".to_string()));
    };

    Ok(Json(json!({
        "success": true,
        "data": profile,
    })))
}

/// 회원 탈퇴 (Soft Delete - 30일 유예, 탈퇴 사유는 deletion_reason 컬럼에 저장)
async fn withdraw_profile(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Json(body): Json<WithdrawRequest>,
) -> AppResult<Json<Value>> {
    let reason = body
        .reason
        .map(|r| r.trim().to_string())
        .filter(|r| !r.is_empty())
        .unwrap_or_else(|| "자발적 탈퇴".to_string());

    sqlx::query(
        "UPDATE user_profiles SET deleted_at = NOW(), deletion_reason = $1, updated_at = NOW() WHERE user_id = $2",
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

/// 탈퇴 계정 복구 (탈퇴 유예 상태인 본인 계정만 복구 가능, restricted_reason은 건드리지 않음)
async fn restore_profile(
    State(state): State<AppState>,
    auth_user: AuthUser,
) -> AppResult<Json<Value>> {
    let result = sqlx::query(
        "UPDATE user_profiles SET deleted_at = NULL, deletion_reason = NULL, updated_at = NOW() WHERE user_id = $1 AND deleted_at IS NOT NULL",
    )
    .bind(&auth_user.user_id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::BadRequest(
            "복구할 탈퇴 유예 상태의 계정이 아닙니다.".to_string(),
        ));
    }

    Ok(Json(json!({
        "success": true,
        "message": "계정이 성공적으로 복구되었습니다.",
    })))
}

async fn validate_and_check_nickname<'a>(
    pool: &sqlx::PgPool,
    user_id: &str,
    raw_nickname: &'a str,
) -> Result<&'a str, AppError> {
    let nickname = raw_nickname.trim();
    let len = nickname.chars().count();
    if !(2..=40).contains(&len) {
        return Err(AppError::BadRequest(
            "닉네임은 2자 이상 40자 이하로 입력해 주세요.".to_string(),
        ));
    }

    let duplicate: Option<(String,)> = sqlx::query_as(
        "SELECT user_id FROM user_profiles WHERE nickname = $1 AND user_id <> $2 LIMIT 1",
    )
    .bind(nickname)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    if duplicate.is_some() {
        return Err(AppError::Conflict(
            "이미 사용 중인 닉네임입니다.".to_string(),
        ));
    }

    Ok(nickname)
}
