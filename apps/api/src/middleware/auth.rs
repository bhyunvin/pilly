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

        let header = decode_header(token).map_err(|_| {
            AppError::Unauthorized("Unauthorized: Invalid token header".to_string())
        })?;

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
                .map_err(|_| {
                    AppError::Unauthorized("Unauthorized: JWKS parse failed".to_string())
                })?;

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

        // 사용자 프로필 상태 확인 (기존 DB TIMESTAMP WITHOUT TIME ZONE 호환을 위해 NaiveDateTime으로 조회)
        let row: Option<(String, Option<chrono::NaiveDateTime>)> = sqlx::query_as(
            "SELECT status, deleted_at FROM user_profiles WHERE user_id = $1 LIMIT 1",
        )
        .bind(&user_id)
        .fetch_optional(&state.pool)
        .await?;

        // 중첩 라우터는 URI 접두사가 제거되므로 원본 경로(OriginalUri)로 판별한다.
        let original_path = parts
            .extensions
            .get::<axum::extract::OriginalUri>()
            .map_or_else(|| parts.uri.path().to_string(), |u| u.0.path().to_string());
        let is_restore_path = original_path.ends_with("/profile/restore");
        // 제한/탈퇴 유예 사용자도 자신의 상태 확인을 위해 프로필 조회(GET)는 허용한다.
        let is_profile_read =
            parts.method == axum::http::Method::GET && original_path.ends_with("/profile");
        if let Some((status, deleted_at)) = row
            && !is_restore_path
            && !is_profile_read
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{Request, StatusCode};
    use axum::response::IntoResponse;
    use dashmap::DashMap;
    use jsonwebtoken::{Algorithm, EncodingKey, Header, encode, jwk::Jwk};
    use serde::Serialize;
    use std::sync::Arc;

    use crate::{config::Config, mq::EventProducer};

    #[derive(Serialize)]
    struct TestClaims {
        sub: String,
        email: String,
        exp: usize,
    }

    async fn make_test_state() -> AppState {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://localhost/nonexistent")
            .expect("lazy pool");
        let producer =
            EventProducer::connect("127.0.0.1:19999", "iggy", "iggy", pool.clone()).await;
        let mut config = Config::from_env();
        config.neon_auth_jwks_url = String::new();

        AppState {
            pool,
            config,
            http_client: reqwest::Client::new(),
            jwks_cache: Arc::new(DashMap::new()),
            pill_cache: moka::future::Cache::builder().max_capacity(10).build(),
            producer,
        }
    }

    #[tokio::test]
    async fn test_auth_user_rejects_missing_and_invalid_tokens() {
        let state = make_test_state().await;

        // 1. Authorization 헤더 누락
        let req = Request::builder().uri("/").body(()).unwrap();
        let (mut parts, _) = req.into_parts();
        let err = AuthUser::from_request_parts(&mut parts, &state)
            .await
            .unwrap_err();
        assert_eq!(err.into_response().status(), StatusCode::UNAUTHORIZED);

        // 2. 위조된/잘못된 형식의 토큰
        let req = Request::builder()
            .header(AUTHORIZATION, "Bearer invalid.jwt.token")
            .uri("/")
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        let err = AuthUser::from_request_parts(&mut parts, &state)
            .await
            .unwrap_err();
        assert_eq!(err.into_response().status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_auth_user_rejects_expired_and_forged_jwt_with_jwk() {
        let state = make_test_state().await;

        // HS256 테스트용 JWK 등록
        let secret = b"super-secret-test-key-for-hs256-32b";
        let jwk: Jwk = serde_json::from_value(serde_json::json!({
            "kty": "oct",
            "kid": "test-kid",
            "alg": "HS256",
            "k": base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, secret)
        }))
        .unwrap();
        state.jwks_cache.insert("test-kid".to_string(), jwk);

        // 만료된 토큰
        let mut header = Header::new(Algorithm::HS256);
        header.kid = Some("test-kid".to_string());
        let expired_claims = TestClaims {
            sub: "user-1".to_string(),
            email: "user@test.com".to_string(),
            exp: 1000, // 과거 시간
        };
        let expired_token =
            encode(&header, &expired_claims, &EncodingKey::from_secret(secret)).unwrap();

        let req = Request::builder()
            .header(AUTHORIZATION, format!("Bearer {expired_token}"))
            .uri("/")
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        let err = AuthUser::from_request_parts(&mut parts, &state)
            .await
            .unwrap_err();
        assert_eq!(err.into_response().status(), StatusCode::UNAUTHORIZED);

        // 다른 키로 서명된 위조 토큰
        let valid_exp = (chrono::Utc::now().timestamp() + 3600) as usize;
        let forged_claims = TestClaims {
            sub: "user-1".to_string(),
            email: "user@test.com".to_string(),
            exp: valid_exp,
        };
        let forged_token = encode(
            &header,
            &forged_claims,
            &EncodingKey::from_secret(b"wrong-secret-key-for-hs256-32bytes!"),
        )
        .unwrap();

        let req = Request::builder()
            .header(AUTHORIZATION, format!("Bearer {forged_token}"))
            .uri("/")
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        let err = AuthUser::from_request_parts(&mut parts, &state)
            .await
            .unwrap_err();
        assert_eq!(err.into_response().status(), StatusCode::UNAUTHORIZED);
    }
}
