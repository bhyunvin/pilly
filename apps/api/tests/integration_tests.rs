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
    matchers::{body_string_contains, method, path_regex},
};

use pilly_api::{
    config::Config, create_app, mq::EventProducer, state::AppState, utils::security::decrypt,
};

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
) -> (
    axum::Router,
    sqlx::PgPool,
    Config,
    String,
    String,
    String,
    String,
) {
    dotenvy::dotenv().ok();
    let mut config = Config::from_env();
    assert!(
        !config.database_url.is_empty() && !config.database_url.contains("nonexistent"),
        "통합 테스트 실행을 위해 DATABASE_URL 환경 변수가 필요합니다."
    );
    if let Some(url) = gemini_base_url {
        config.gemini_base_url = url;
    }
    if config.encryption_key.is_empty() {
        config.encryption_key =
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string();
    }
    // 통합 테스트 중 외부 SMTP 발송 차단
    config.smtp_host.clear();

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await
        .expect("Neon PostgreSQL 연결 실패");

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

    let suffix = &uuid::Uuid::new_v4().simple().to_string()[..8];
    let user_nickname = format!("테스트유저-{suffix}");
    let admin_nickname = format!("테스트관리자-{suffix}");

    sqlx::query(
        "INSERT INTO user_profiles (user_id, nickname, role, status) VALUES ($1, $2, 'USER', 'ACTIVE')",
    )
    .bind(&test_user_id)
    .bind(&user_nickname)
    .execute(&pool)
    .await
    .expect("테스트 유저 프로필 생성 실패");

    sqlx::query(
        "INSERT INTO user_profiles (user_id, nickname, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE')",
    )
    .bind(&test_admin_id)
    .bind(&admin_nickname)
    .execute(&pool)
    .await
    .expect("테스트 관리자 프로필 생성 실패");

    let state = AppState::new(pool.clone(), config.clone(), producer);
    {
        for entry in jwks_cache.iter() {
            state
                .jwks_cache
                .insert(entry.key().clone(), entry.value().clone());
        }
    }

    let app = create_app(state);
    (
        app,
        pool,
        config,
        test_user_id,
        user_token,
        test_admin_id,
        admin_token,
    )
}

async fn cleanup_test_users(pool: &sqlx::PgPool, user_id: &str, admin_id: &str) {
    for uid in [user_id, admin_id] {
        let _ = sqlx::query("DELETE FROM ai_chat_logs WHERE user_id = $1")
            .bind(uid)
            .execute(pool)
            .await;
        let _ = sqlx::query(
            "DELETE FROM inquiry_attachments WHERE inquiry_id IN (SELECT id FROM user_inquiries WHERE user_id = $1)",
        )
        .bind(uid)
        .execute(pool)
        .await;
        let _ = sqlx::query("DELETE FROM user_inquiries WHERE user_id = $1")
            .bind(uid)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM chat_access_approvals WHERE user_id = $1")
            .bind(uid)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM chat_sessions WHERE user_id = $1")
            .bind(uid)
            .execute(pool)
            .await;
        let _ = sqlx::query(
            "DELETE FROM medication_history WHERE medication_id IN (SELECT id FROM user_medications WHERE user_id = $1)",
        )
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
        let _ = sqlx::query("DELETE FROM user_restriction_history WHERE user_id = $1")
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
    let (app, pool, _cfg, user_id, user_token, admin_id, _) = setup_test_app(None).await;

    let test_seq = format!("TEST-SEQ-{}", uuid::Uuid::new_v4().simple());
    sqlx::query(
        "INSERT INTO pill_catalog (item_seq, item_name, entp_name, drug_shape, color_class1) VALUES ($1, '필리테스트정500밀리그램', '필리제약', '원형', '하양')",
    )
    .bind(&test_seq)
    .execute(&pool)
    .await
    .expect("테스트 의약품 삽입 실패");

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
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["success"], true);

    // 2. /api/v1/search?name=필리테스트정
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/search?name=%ED%95%84%EB%A6%AC%ED%85%8C%EC%8A%A4%ED%8A%B8%EC%A0%95")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["success"], true);
    let pills = json["pills"].as_array().expect("pills 배열 필수");
    assert!(pills.iter().any(|p| p["itemSeq"] == test_seq));

    // 3. /api/v1/search/sitemap
    let res = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/search/sitemap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["success"], true);
    assert!(json["pills"].as_array().is_some());

    let _ = sqlx::query("DELETE FROM pill_catalog WHERE item_seq = $1")
        .bind(&test_seq)
        .execute(&pool)
        .await;
    cleanup_test_users(&pool, &user_id, &admin_id).await;
}

#[tokio::test]
async fn test_medications_activity_profile_inquiry_and_admin_routes() {
    let (app, pool, _cfg, user_id, user_token, admin_id, admin_token) = setup_test_app(None).await;

    // 1. 복약 등록 (POST /api/v1/medications) -> 201 CREATED 및 medication 필드 확인
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
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let created_json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(created_json["success"], true);
    assert_eq!(created_json["medication"]["name"], "타이레놀정500mg");
    let med_id = created_json["medication"]["id"].as_i64().unwrap();

    // 2. 복약 목록 조회 (GET /api/v1/medications)
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
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["success"], true);
    assert!(
        json["medications"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["name"] == "타이레놀정500mg")
    );

    // 3. 복약 체크 이력 기록 및 조회
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(format!("/api/v1/medications/{med_id}/history"))
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "status": "COMPLETED" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/medications/{med_id}/history"))
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["history"].as_array().unwrap().len(), 1);

    // 4. 활동 로그 등록 (POST /api/v1/activity -> 202) & 조회 (GET /api/v1/activity)
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

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/activity")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 5. 프로필 조회/수정 & 탈퇴/복구 흐름
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/profile")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert!(
        json["data"]["nickname"]
            .as_str()
            .unwrap()
            .starts_with("테스트유저-")
    );

    // 1글자 닉네임 거부 검증 (400 BAD_REQUEST)
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::PATCH)
                .uri("/api/v1/profile")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "nickname": "가" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);

    // 정상 닉네임 변경
    let new_nickname = format!(
        "새닉네임-{}",
        &uuid::Uuid::new_v4().simple().to_string()[..6]
    );
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::PATCH)
                .uri("/api/v1/profile")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "nickname": new_nickname }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 회원 탈퇴 -> 일반 API 403 차단, GET /profile 200 허용, 복구 후 200 복원
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/profile/withdraw")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "reason": "테스트 탈퇴" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

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
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/profile/restore")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 6. 관리자 권한 분기 & 제재/해제 & JIT 채팅 열람
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
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/admin/users")
                .header(AUTHORIZATION, format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert!(json["users"].as_array().is_some());

    // 채팅 세션 생성 후 문의(allow_chat_access=true) -> 관리자 JIT 열람 검증
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/chat/sessions")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "title": "문의 연결 세션" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let session_json: Value = serde_json::from_slice(&body).unwrap();
    let session_id = session_json["data"]["id"].as_i64().unwrap();

    // 세션 제목 수정 (PATCH /api/v1/chat/sessions/{id}/title)
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::PATCH)
                .uri(format!("/api/v1/chat/sessions/{session_id}/title"))
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "title": "수정된 세션 제목" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 승인 전에는 관리자 JIT 열람 403 Forbidden
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/admin/chat/{session_id}"))
                .header(AUTHORIZATION, format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    // Multipart 1:1 문의 생성 (allow_chat_access=true)
    let boundary = "----PillyTestBoundary7MA4YWxkTrZu0gW";
    let multipart_body = format!(
        "--{boundary}\r\n\
         Content-Disposition: form-data; name=\"title\"\r\n\r\n상담 문의\r\n\
         --{boundary}\r\n\
         Content-Disposition: form-data; name=\"content\"\r\n\r\n대화 내역 확인 부탁드립니다.\r\n\
         --{boundary}\r\n\
         Content-Disposition: form-data; name=\"chat_session_id\"\r\n\r\n{session_id}\r\n\
         --{boundary}\r\n\
         Content-Disposition: form-data; name=\"allow_chat_access\"\r\n\r\ntrue\r\n\
         --{boundary}--\r\n"
    );
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/inquiry")
                .header(AUTHORIZATION, format!("Bearer {user_token}"))
                .header(
                    "content-type",
                    format!("multipart/form-data; boundary={boundary}"),
                )
                .body(Body::from(multipart_body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);

    // 승인 후 관리자 JIT 열람 200 OK (세션 ID 및 승인 UUID 모두 지원)
    let approval_uuid: uuid::Uuid = sqlx::query_scalar(
        "SELECT id FROM chat_access_approvals WHERE chat_session_id = $1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(session_id as i32)
    .fetch_one(&pool)
    .await
    .unwrap();

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/admin/chat/{approval_uuid}"))
                .header(AUTHORIZATION, format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/v1/admin/chat/{session_id}"))
                .header(AUTHORIZATION, format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    // 관리자 제재 -> 유저 API 403 확인 -> ACTIVE 복구
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::PATCH)
                .uri(format!("/api/v1/admin/users/{user_id}/status"))
                .header(AUTHORIZATION, format!("Bearer {admin_token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "status": "RESTRICTED", "reason": "테스트 제재" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

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
    assert_eq!(res.status(), StatusCode::FORBIDDEN);

    let res = app
        .oneshot(
            Request::builder()
                .method(Method::PATCH)
                .uri(format!("/api/v1/admin/users/{user_id}/status"))
                .header(AUTHORIZATION, format!("Bearer {admin_token}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "status": "ACTIVE" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    cleanup_test_users(&pool, &user_id, &admin_id).await;
}

#[tokio::test]
async fn test_chat_function_calling_with_wiremock_gemini() {
    let mock_server = MockServer::start().await;

    // 1차 응답: functionCall 반환
    let fc_sse = "data: {\"candidates\":[{\"content\":{\"parts\":[{\"functionCall\":{\"name\":\"getMyMedications\",\"args\":{}}}]}}]}\n\n";
    // 2차 응답: 요청 바디에 실제 DB에서 조회한 약물("아스피린정100mg")이 포함된 경우에만 성공 응답
    let text_sse = "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"아스피린정100mg 복용 중이시군요.\"}]}}]}\n\n";

    Mock::given(method("POST"))
        .and(path_regex(r"/v1beta/models/.*:streamGenerateContent"))
        .respond_with(ResponseTemplate::new(200).set_body_string(fc_sse))
        .up_to_n_times(1)
        .mount(&mock_server)
        .await;

    Mock::given(method("POST"))
        .and(path_regex(r"/v1beta/models/.*:streamGenerateContent"))
        .and(body_string_contains("functionResponse"))
        .and(body_string_contains("아스피린정100mg"))
        .respond_with(ResponseTemplate::new(200).set_body_string(text_sse))
        .mount(&mock_server)
        .await;

    let (app, pool, config, user_id, user_token, admin_id, admin_token) =
        setup_test_app(Some(mock_server.uri())).await;

    // 0. 테스트 유저에게 복용 중인 약물 등록
    sqlx::query(
        "INSERT INTO user_medications (user_id, name, dosage, frequency) VALUES ($1, '아스피린정100mg', '1정', '아침 식후')",
    )
    .bind(&user_id)
    .execute(&pool)
    .await
    .expect("테스트 약물 삽입 실패");

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
    assert_eq!(res.status(), StatusCode::OK);
    let body = res.into_body().collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&body).unwrap();
    let session_id = json["data"]["id"].as_i64().unwrap();

    // 타인의 세션에 메시지 전송 시 404 NOT_FOUND 확인
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri(format!("/api/v1/chat/sessions/{session_id}/message"))
                .header(AUTHORIZATION, format!("Bearer {admin_token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "history": [{ "role": "user", "parts": [{ "text": "무단 접근" }] }] })
                        .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);

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
    assert_eq!(res.status(), StatusCode::OK);
    let stream_bytes = res.into_body().collect().await.unwrap().to_bytes();
    let stream_text = String::from_utf8_lossy(&stream_bytes);
    assert!(stream_text.contains("아스피린정100mg 복용 중이시군요."));

    // 백그라운드 AES-256-GCM 암호화 저장 완료 대기 후 DB 복호화 검증
    let mut stored: Option<(String, String)> = None;
    for _ in 0..20 {
        let row: Option<(String, String)> = sqlx::query_as(
            "SELECT prompt, response FROM ai_chat_logs WHERE session_id = $1 ORDER BY id DESC LIMIT 1",
        )
        .bind(session_id as i32)
        .fetch_optional(&pool)
        .await
        .unwrap();
        if let Some((p, r)) = row
            && !r.is_empty()
        {
            stored = Some((p, r));
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    let (enc_prompt, enc_response) = stored.expect("ai_chat_logs 암호화 저장이 완료되지 않음");
    assert_ne!(enc_prompt, "내가 먹는 약 알려줘");
    assert_ne!(enc_response, "아스피린정100mg 복용 중이시군요.");
    assert_eq!(
        decrypt(&enc_prompt, &config.encryption_key),
        "내가 먹는 약 알려줘"
    );
    assert_eq!(
        decrypt(&enc_response, &config.encryption_key),
        "아스피린정100mg 복용 중이시군요."
    );

    cleanup_test_users(&pool, &user_id, &admin_id).await;
}
