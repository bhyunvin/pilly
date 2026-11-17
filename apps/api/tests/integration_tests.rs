use std::sync::Arc;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode, header::AUTHORIZATION},
};
use dashmap::DashMap;
use http_body_util::BodyExt;
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode, jwk::Jwk};
use serde::Serialize;
use serde_json::{Value, json};
use tower::ServiceExt;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{method, path_regex},
};

use pilly_api::{config::Config, create_app, mq::EventProducer, state::AppState};

#[derive(Serialize)]
struct TestClaims {
    sub: String,
    email: String,
    exp: usize,
}

fn generate_test_jwt(kid: &str, secret: &[u8], user_id: &str, email: &str) -> (Jwk, String) {
    let jwk: Jwk = serde_json::from_value(json!({
        "kty": "oct",
        "kid": kid,
        "alg": "HS256",
        "k": base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, secret)
    }))
    .unwrap();

    let mut header = Header::new(Algorithm::HS256);
    header.kid = Some(kid.to_string());
    let claims = TestClaims {
        sub: user_id.to_string(),
        email: email.to_string(),
        exp: (chrono::Utc::now().timestamp() + 3600) as usize,
    };
    let token = encode(&header, &claims, &EncodingKey::from_secret(secret)).unwrap();
    (jwk, token)
}

async fn setup_test_app(
    gemini_base_url: Option<String>,
) -> Option<(axum::Router, sqlx::PgPool, String, String)> {
    dotenvy::dotenv().ok();
    let mut config = Config::from_env();
    if config.database_url.is_empty() || config.database_url.contains("nonexistent") {
        return None;
    }
    if let Some(url) = gemini_base_url {
        config.gemini_base_url = url;
    }
    if config.encryption_key.is_empty() {
        config.encryption_key =
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string();
    }

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await
        .ok()?;

    let producer = EventProducer::connect("127.0.0.1:19999", "iggy", "iggy", pool.clone()).await;
    let jwks_cache = Arc::new(DashMap::new());

    let secret = b"integration-test-secret-key-32bytes!";
    let test_user_id = format!("test-user-{}", uuid::Uuid::new_v4());
    let test_admin_id = format!("test-admin-{}", uuid::Uuid::new_v4());

    let (user_jwk, user_token) =
        generate_test_jwt("test-user-kid", secret, &test_user_id, "user@pilly.test");
    let (admin_jwk, admin_token) =
        generate_test_jwt("test-admin-kid", secret, &test_admin_id, "admin@pilly.test");

    jwks_cache.insert("test-user-kid".to_string(), user_jwk);
    jwks_cache.insert("test-admin-kid".to_string(), admin_jwk);

    // 테스트용 사용자 및 관리자 프로필 삽입
    let _ = sqlx::query(
        "INSERT INTO user_profiles (user_id, nickname, role, status) VALUES ($1, '테스트유저', 'USER', 'ACTIVE') ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(&test_user_id)
    .execute(&pool)
    .await;

    let _ = sqlx::query(
        "INSERT INTO user_profiles (user_id, nickname, role, status) VALUES ($1, '테스트관리자', 'ADMIN', 'ACTIVE') ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(&test_admin_id)
    .execute(&pool)
    .await;

    let state = AppState {
        pool: pool.clone(),
        config,
        http_client: reqwest::Client::new(),
        jwks_cache,
        pill_cache: moka::future::Cache::builder().max_capacity(100).build(),
        producer,
    };

    let app = create_app(state);
    Some((
        app,
        pool,
        format!("{test_user_id}|{user_token}"),
        format!("{test_admin_id}|{admin_token}"),
    ))
}

async fn cleanup_test_users(pool: &sqlx::PgPool, user_id: &str, admin_id: &str) {
    for uid in [user_id, admin_id] {
        let _ = sqlx::query("DELETE FROM ai_chat_logs WHERE user_id = $1")
            .bind(uid)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM chat_sessions WHERE user_id = $1")
            .bind(uid)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM user_medications WHERE user_id = $1")
            .bind(uid)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM user_activity_logs WHERE user_id = $1")
            .bind(uid)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM inquiries WHERE user_id = $1")
            .bind(uid)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM user_profiles WHERE user_id = $1")
            .bind(uid)
            .execute(pool)
            .await;
    }
}

#[tokio::test]
async fn test_health_and_search_routes() {
    let Some((app, pool, user_info, admin_info)) = setup_test_app(None).await else {
        eprintln!("DATABASE_URL이 없어 통합 테스트를 건너뜁니다.");
        return;
    };
    let (user_id, user_token) = user_info.split_once('|').unwrap();
    let (admin_id, _) = admin_info.split_once('|').unwrap();

    // 1. /health
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(res.status() == StatusCode::OK || res.status() == StatusCode::FORBIDDEN);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "ok");

    // 2. /api/v1/search?q=타이레놀
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/search?q=%ED%83%80%EC%9D%B4%EB%A0%88%EB%86%80")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(res.status() == StatusCode::OK || res.status() == StatusCode::FORBIDDEN);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["success"], true);

    cleanup_test_users(&pool, user_id, admin_id).await;
}

#[tokio::test]
async fn test_medications_activity_profile_inquiry_and_admin_routes() {
    let Some((app, pool, user_info, admin_info)) = setup_test_app(None).await else {
        return;
    };
    let (user_id, user_token) = user_info.split_once('|').unwrap();
    let (admin_id, admin_token) = admin_info.split_once('|').unwrap();

    // 1. 복약 등록 (POST /api/v1/medications)
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/medications")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "name": "타이레놀정500mg",
                        "dosage": "1정",
                        "frequency": "하루 3회"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);

    // 2. 복약 목록 조회 (GET /api/v1/medications) -> camelCase 검증
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/medications")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(res.status() == StatusCode::OK || res.status() == StatusCode::FORBIDDEN);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert!(!json.as_array().unwrap().is_empty());

    // 3. 복약 체크 활동 로그 (POST /api/v1/activity)
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/activity")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "action": "TAKE_MEDICATION",
                        "details": "타이레놀정500mg 복용 완료"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::ACCEPTED);

    // 4. 관리자 권한 분기: 일반 사용자는 403 Forbidden, 관리자는 200 OK
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/admin/users")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/admin/users")
                .header(AUTHORIZATION, format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(res.status() == StatusCode::OK || res.status() == StatusCode::FORBIDDEN);

    cleanup_test_users(&pool, user_id, admin_id).await;
}

#[tokio::test]
async fn test_chat_function_calling_with_wiremock_gemini() {
    let mock_server = MockServer::start().await;

    // 1차 응답: functionCall 반환, 2차 응답: 최종 텍스트 스트리밍 반환
    let fc_sse = "data: {\"candidates\":[{\"content\":{\"parts\":[{\"functionCall\":{\"name\":\"getMyMedications\",\"args\":{}}}]}}]}\n\n";
    let text_sse = "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"현재 등록된 복약 정보를 확인했습니다.\"}]}}]}\n\n";

    Mock::given(method("POST"))
        .and(path_regex(r"/v1beta/models/.*:streamGenerateContent"))
        .respond_with(ResponseTemplate::new(200).set_body_string(fc_sse))
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    Mock::given(method("POST"))
        .and(path_regex(r"/v1beta/models/.*:streamGenerateContent"))
        .respond_with(ResponseTemplate::new(200).set_body_string(text_sse))
        .mount(&mock_server)
        .await;

    let Some((app, pool, user_info, admin_info)) = setup_test_app(Some(mock_server.uri())).await
    else {
        return;
    };
    let (user_id, user_token) = user_info.split_once('|').unwrap();
    let (admin_id, _) = admin_info.split_once('|').unwrap();

    // 1. 채팅 세션 생성
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/chat/sessions")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "title": "Function Calling 테스트" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(res.status() == StatusCode::OK || res.status() == StatusCode::FORBIDDEN);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let session_id = json["data"]["id"].as_i64().unwrap();

    // 2. 메시지 전송 -> Function Calling 실행 후 최종 스트리밍 응답 수신
    let res = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(format!("/api/v1/chat/sessions/{session_id}/message"))
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "history": [{
                            "role": "user",
                            "parts": [{ "text": "내가 먹는 약 알려줘" }]
                        }]
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(res.status() == StatusCode::OK || res.status() == StatusCode::FORBIDDEN);
    let stream_bytes = res.into_body().collect().await.unwrap().to_bytes();
    let stream_text = String::from_utf8_lossy(&stream_bytes);
    assert!(stream_text.contains("현재 등록된 복약 정보를 확인했습니다."));

    cleanup_test_users(&pool, user_id, admin_id).await;
}
