use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use jsonwebtoken::{DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use serde::Deserialize;

use crate::{error::AppError, state::AppState};

#[derive(Debug, Deserialize)]
struct Claims {
    sub: String,
    #[serde(default)]
    email: String,
}

/// 인증된 사용자 정보 추출기
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: String,
    #[allow(dead_code)]
    pub email: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("Unauthorized: Missing token".to_string()))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Unauthorized("Unauthorized: Missing token".to_string()))?;

        let header = decode_header(token)
            .map_err(|_| AppError::Unauthorized("Unauthorized: Invalid token header".to_string()))?;

        let kid = header.kid.unwrap_or_default();

        // JWKS 캐시 조회 또는 원격 fetch
        if !state.jwks_cache.contains_key(&kid) && !state.config.neon_auth_jwks_url.is_empty() {
            let jwks: JwkSet = state
                .http_client
                .get(&state.config.neon_auth_jwks_url)
                .send()
                .await
                .map_err(|_| AppError::Unauthorized("Unauthorized: JWKS fetch failed".to_string()))?
                .json()
                .await
                .map_err(|_| AppError::Unauthorized("Unauthorized: JWKS parse failed".to_string()))?;

            for jwk in jwks.keys {
                if let Some(id) = jwk.common.key_id.clone() {
                    state.jwks_cache.insert(id, jwk);
                }
            }
        }

        let jwk = state
            .jwks_cache
            .get(&kid)
            .ok_or_else(|| AppError::Unauthorized("Unauthorized: Key not found".to_string()))?;

        let decoding_key = DecodingKey::from_jwk(&jwk)
            .map_err(|_| AppError::Unauthorized("Unauthorized: Invalid JWK".to_string()))?;

        let mut validation = Validation::new(header.alg);
        validation.validate_aud = false;

        let token_data = decode::<Claims>(token, &decoding_key, &validation)
            .map_err(|_| AppError::Unauthorized("Unauthorized: Invalid token".to_string()))?;

        let user_id = token_data.claims.sub;
        let email = token_data.claims.email;

        // 사용자 프로필 상태 확인
        let row: Option<(String, Option<chrono::NaiveDateTime>)> = sqlx::query_as(
            "SELECT status, deleted_at FROM user_profiles WHERE user_id = $1 LIMIT 1",
        )
        .bind(&user_id)
        .fetch_optional(&state.pool)
        .await?;

        let is_restore_path = parts.uri.path().ends_with("/profile/restore");
        if let Some((status, deleted_at)) = row
            && !is_restore_path
        {
            if status == "RESTRICTED" {
                return Err(AppError::Forbidden(
                    "Forbidden: Your account has been restricted.".to_string(),
                ));
            }
            if deleted_at.is_some() {
                return Err(AppError::Forbidden(
                    "Forbidden: Your account is scheduled for deletion.".to_string(),
                ));
            }
        }

        Ok(AuthUser { user_id, email })
    }
}

/// 관리자 권한 검증 추출기
#[derive(Debug, Clone)]
pub struct AdminUser {
    pub user_id: String,
}

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_user = AuthUser::from_request_parts(parts, state).await?;

        let role: Option<(String,)> =
            sqlx::query_as("SELECT role FROM user_profiles WHERE user_id = $1 LIMIT 1")
                .bind(&auth_user.user_id)
                .fetch_optional(&state.pool)
                .await?;

        match role {
            Some((r,)) if r == "ADMIN" => Ok(AdminUser {
                user_id: auth_user.user_id,
            }),
            _ => Err(AppError::Forbidden(
                "Forbidden: Admin access required".to_string(),
            )),
        }
    }
}
