use std::time::{Duration, Instant};

use axum::{
    extract::FromRequestParts,
    http::{Method, header::AUTHORIZATION, request::Parts},
};
use jsonwebtoken::{
    Algorithm, DecodingKey, Header, Validation, decode, decode_header,
    jwk::{Jwk, JwkSet, KeyAlgorithm},
};
use serde::Deserialize;

use crate::{config::Config, error::AppError, state::AppState};

const JWKS_REFRESH_COOLDOWN: Duration = Duration::from_secs(30);
const JWKS_FETCH_TIMEOUT: Duration = Duration::from_secs(5);

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
    pub role: Option<String>,
}

fn map_jwk_algorithm(alg: KeyAlgorithm) -> Option<Algorithm> {
    match alg {
        KeyAlgorithm::HS256 => Some(Algorithm::HS256),
        KeyAlgorithm::HS384 => Some(Algorithm::HS384),
        KeyAlgorithm::HS512 => Some(Algorithm::HS512),
        KeyAlgorithm::ES256 => Some(Algorithm::ES256),
        KeyAlgorithm::ES384 => Some(Algorithm::ES384),
        KeyAlgorithm::RS256 => Some(Algorithm::RS256),
        KeyAlgorithm::RS384 => Some(Algorithm::RS384),
        KeyAlgorithm::RS512 => Some(Algorithm::RS512),
        KeyAlgorithm::PS256 => Some(Algorithm::PS256),
        KeyAlgorithm::PS384 => Some(Algorithm::PS384),
        KeyAlgorithm::PS512 => Some(Algorithm::PS512),
        KeyAlgorithm::EdDSA => Some(Algorithm::EdDSA),
        _ => None,
    }
}

/// JWKS 캐시 미스 시 Singleflight 락 + 30초 쿨다운 + 5초 타임아웃으로 원격 JWKS를 안전하게 갱신합니다.
async fn refresh_jwks_if_needed(state: &AppState, kid: &str) -> Result<(), AppError> {
    if state.jwks_cache.contains_key(kid) || state.config.neon_auth_jwks_url.is_empty() {
        return Ok(());
    }

    let mut last_refresh = state.jwks_refresh_lock.lock().await;
    if state.jwks_cache.contains_key(kid) {
        return Ok(());
    }

    if let Some(prev) = *last_refresh
        && prev.elapsed() < JWKS_REFRESH_COOLDOWN
    {
        return Err(AppError::Unauthorized(
            "Unauthorized: Key not found".to_string(),
        ));
    }

    // 성공/실패 여부와 무관하게 재조회 시각을 기록하여 미등록 kid 폭주(DoS)를 차단한다.
    *last_refresh = Some(Instant::now());

    let response = state
        .http_client
        .get(&state.config.neon_auth_jwks_url)
        .timeout(JWKS_FETCH_TIMEOUT)
        .send()
        .await
        .map_err(|_| AppError::Unauthorized("Unauthorized: JWKS fetch failed".to_string()))?;

    if !response.status().is_success() {
        return Err(AppError::Unauthorized(
            "Unauthorized: JWKS fetch failed".to_string(),
        ));
    }

    let jwks: JwkSet = response
        .json()
        .await
        .map_err(|_| AppError::Unauthorized("Unauthorized: JWKS parse failed".to_string()))?;

    for jwk in jwks.keys {
        if let Some(id) = jwk.common.key_id.clone() {
            state.jwks_cache.insert(id, jwk);
        }
    }

    Ok(())
}

/// JWK 알고리즘 교차 검증과 `iss`/`aud` 검증을 포함해 JWT 클레임을 디코딩합니다.
fn verify_jwt_claims(
    token: &str,
    header: &Header,
    jwk: &Jwk,
    config: &Config,
) -> Result<Claims, AppError> {
    if let Some(jwk_alg) = jwk.common.key_algorithm {
        let expected_alg = map_jwk_algorithm(jwk_alg)
            .ok_or_else(|| AppError::Unauthorized("Unauthorized: Invalid JWK".to_string()))?;
        if expected_alg != header.alg {
            return Err(AppError::Unauthorized(
                "Unauthorized: Token algorithm mismatch".to_string(),
            ));
        }
    }

    let decoding_key = DecodingKey::from_jwk(jwk)
        .map_err(|_| AppError::Unauthorized("Unauthorized: Invalid JWK".to_string()))?;

    let mut validation = Validation::new(header.alg);
    if config.neon_auth_audience.is_empty() {
        validation.validate_aud = false;
    } else {
        validation.set_audience(&[&config.neon_auth_audience]);
        validation.validate_aud = true;
    }
    if !config.neon_auth_issuer.is_empty() {
        validation.set_issuer(&[&config.neon_auth_issuer]);
    }

    decode::<Claims>(token, &decoding_key, &validation)
        .map(|data| data.claims)
        .map_err(|_| AppError::Unauthorized("Unauthorized: Invalid token".to_string()))
}

/// 탈퇴 유예(`deleted_at`) 및 이용 제한(`RESTRICTED`) 계정의 허용 경로 정책을 검증합니다.
fn enforce_account_status_policy(
    method: &Method,
    original_path: &str,
    status: &str,
    deleted_at: Option<chrono::NaiveDateTime>,
) -> Result<(), AppError> {
    let normalized_path = original_path.trim_end_matches('/');
    let is_profile_read = *method == Method::GET && normalized_path.ends_with("/profile");
    let is_restore_path = *method == Method::POST && normalized_path.ends_with("/profile/restore");
    let is_inquiry_path = (*method == Method::POST && normalized_path.ends_with("/inquiry"))
        || (*method == Method::GET && normalized_path.ends_with("/inquiry/list"));

    if deleted_at.is_some() {
        if !is_profile_read && !is_restore_path {
            return Err(AppError::Forbidden(
                "탈퇴 유예 중인 계정입니다. 계정 복구 후 이용해 주세요.".to_string(),
            ));
        }
    } else if status == "RESTRICTED" && !is_profile_read && !is_inquiry_path {
        return Err(AppError::Forbidden(
            "운영 정책에 따라 계정 이용이 제한되었습니다.".to_string(),
        ));
    }

    Ok(())
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

        let kid = header.kid.as_deref().unwrap_or_default();
        refresh_jwks_if_needed(state, kid).await?;

        let jwk = state
            .jwks_cache
            .get(kid)
            .ok_or_else(|| AppError::Unauthorized("Unauthorized: Key not found".to_string()))?;

        let claims = verify_jwt_claims(token, &header, &jwk, &state.config)?;
        let user_id = claims.sub;
        let email = claims.email;

        // 사용자 역할 및 계정 상태를 단일 쿼리로 조회 (기존 DB TIMESTAMP WITHOUT TIME ZONE 호환을 위해 NaiveDateTime 사용)
        let row: Option<(String, String, Option<chrono::NaiveDateTime>)> = sqlx::query_as(
            "SELECT role, status, deleted_at FROM user_profiles WHERE user_id = $1 LIMIT 1",
        )
        .bind(&user_id)
        .fetch_optional(&state.pool)
        .await?;

        // 중첩 라우터는 URI 접두사가 제거되므로 원본 경로(OriginalUri)로 판별한다.
        let original_path = parts
            .extensions
            .get::<axum::extract::OriginalUri>()
            .map_or_else(|| parts.uri.path().to_string(), |u| u.0.path().to_string());

        let mut role = None;
        if let Some((user_role, status, deleted_at)) = row {
            role = Some(user_role);
            enforce_account_status_policy(&parts.method, &original_path, &status, deleted_at)?;
        }

        Ok(AuthUser {
            user_id,
            email,
            role,
        })
    }
}

/// 관리자 권한 검증 추출기 (`AuthUser`에서 이미 조회한 `role`을 재사용)
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

        if auth_user.role.as_deref() == Some("ADMIN") {
            Ok(AdminUser {
                user_id: auth_user.user_id,
            })
        } else {
            Err(AppError::Forbidden(
                "Forbidden: Admin access required".to_string(),
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{Request, StatusCode};
    use axum::response::IntoResponse;
    use jsonwebtoken::{Algorithm, EncodingKey, Header, encode, jwk::Jwk};
    use serde::Serialize;

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
        config.neon_auth_issuer = String::new();
        config.neon_auth_audience = String::new();

        AppState::new(pool, config, producer)
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
    async fn test_auth_user_rejects_expired_forged_and_alg_mismatched_jwt_with_jwk() {
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

        // JWK alg(HS256)와 다른 alg(HS512) 헤더를 가진 토큰 거부
        let mut mismatch_header = Header::new(Algorithm::HS512);
        mismatch_header.kid = Some("test-kid".to_string());
        let mismatch_token = encode(
            &mismatch_header,
            &forged_claims,
            &EncodingKey::from_secret(secret),
        )
        .unwrap();

        let req = Request::builder()
            .header(AUTHORIZATION, format!("Bearer {mismatch_token}"))
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
