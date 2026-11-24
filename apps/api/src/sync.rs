use std::{fmt::Write, time::Duration};

use serde::Deserialize;
use sqlx::{PgPool, QueryBuilder};

/// 공공데이터포털 의약품 동기화 설정
#[derive(Debug, Clone)]
pub struct PillSyncConfig {
    pub endpoint: String,
    pub api_key: String,
}

/// 의약품 카탈로그 동기화 결과
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncOutcome {
    Synced(usize),
    SkippedAlreadyRunning,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
struct PillItem {
    item_seq: String,
    item_name: String,
    entp_name: Option<String>,
    chart: Option<String>,
    drug_shape: Option<String>,
    color_class1: Option<String>,
    color_class2: Option<String>,
    line_front: Option<String>,
    line_back: Option<String>,
    item_image: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiBody {
    items: Option<Vec<PillItem>>,
}

#[derive(Debug, Deserialize)]
struct PillApiResponse {
    body: Option<ApiBody>,
}

const NUM_OF_ROWS: u32 = 100;
const MAX_PAGES: u32 = 10_000;
const SYNC_HTTP_TIMEOUT: Duration = Duration::from_secs(15);
const SYNC_HTTP_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const PAGE_MAX_RETRIES: u32 = 3;
const PAGE_INITIAL_BACKOFF_MS: u64 = 500;
const PAGE_DELAY_MS: u64 = 50;
const XML_ERROR_SNIPPET_CHARS: usize = 300;
const PILL_SYNC_ADVISORY_LOCK_KEY: i64 = 0x5049_4C4C_5359_4E43;

/// 공공데이터 API 호출용 타임아웃이 적용된 HTTP 클라이언트를 생성합니다.
pub fn build_sync_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(SYNC_HTTP_TIMEOUT)
        .connect_timeout(SYNC_HTTP_CONNECT_TIMEOUT)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// 이미 퍼센트 인코딩(`%`)된 서비스 키가 이중 인코딩(`%25`)되지 않도록 1회만 안전하게 인코딩합니다.
fn encode_service_key_once(raw_key: &str) -> String {
    if raw_key.contains('%') {
        return raw_key.to_string();
    }

    let mut encoded = String::with_capacity(raw_key.len());
    for byte in raw_key.bytes() {
        if matches!(
            byte,
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~'
        ) {
            encoded.push(byte as char);
        } else {
            let _ = write!(encoded, "%{byte:02X}");
        }
    }
    encoded
}

fn build_page_url(endpoint: &str, api_key: &str, page_no: u32) -> String {
    let separator = if endpoint.contains('?') { '&' } else { '?' };
    let encoded_key = encode_service_key_once(api_key);
    format!(
        "{endpoint}{separator}serviceKey={encoded_key}&type=json&numOfRows={NUM_OF_ROWS}&pageNo={page_no}"
    )
}

fn format_xml_error_snippet(body: &str) -> String {
    body.chars().take(XML_ERROR_SNIPPET_CHARS).collect()
}

fn is_xml_error_response(body: &str) -> bool {
    let trimmed = body.trim_start();
    trimmed.contains("<OpenAPI_ServiceResponse>") || trimmed.starts_with('<')
}

fn parse_pill_page_body(body_text: &str, page_no: u32) -> anyhow::Result<Vec<PillItem>> {
    if is_xml_error_response(body_text) {
        anyhow::bail!(
            "공공데이터 API XML 오류 응답 (page {page_no}): {}",
            format_xml_error_snippet(body_text)
        );
    }

    let data: PillApiResponse = serde_json::from_str(body_text)
        .map_err(|err| anyhow::anyhow!("공공데이터 API JSON 파싱 실패 (page {page_no}): {err}"))?;
    Ok(data.body.and_then(|b| b.items).unwrap_or_default())
}

async fn fetch_pill_page_with_retry(
    client: &reqwest::Client,
    cfg: &PillSyncConfig,
    page_no: u32,
) -> anyhow::Result<Vec<PillItem>> {
    let url = build_page_url(&cfg.endpoint, &cfg.api_key, page_no);
    let mut backoff_ms = PAGE_INITIAL_BACKOFF_MS;

    for attempt in 1..=PAGE_MAX_RETRIES {
        match client.get(&url).send().await {
            Ok(res) => {
                let status = res.status();
                if status.is_success() {
                    let body_text = res.text().await?;
                    return parse_pill_page_body(&body_text, page_no);
                }

                let retryable =
                    status.is_server_error() || status == reqwest::StatusCode::TOO_MANY_REQUESTS;
                if !retryable || attempt == PAGE_MAX_RETRIES {
                    anyhow::bail!("공공데이터 API 오류 응답 (page {page_no}): {status}");
                }

                tracing::warn!(
                    "공공데이터 API 일시 오류 (page={page_no}, status={status}, attempt={attempt}/{PAGE_MAX_RETRIES}). {backoff_ms}ms 후 재시도합니다."
                );
            }
            Err(err) => {
                if attempt == PAGE_MAX_RETRIES {
                    anyhow::bail!(
                        "공공데이터 API 네트워크 오류 (page {page_no}, 최종 실패): {err}"
                    );
                }
                tracing::warn!(
                    "공공데이터 API 요청 실패 (page={page_no}, attempt={attempt}/{PAGE_MAX_RETRIES}): {err}. {backoff_ms}ms 후 재시도합니다."
                );
            }
        }

        tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
        backoff_ms *= 2;
    }

    unreachable!("루프는 모든 시도에서 반환되거나 에러를 전파합니다.")
}

/// 공공데이터포털에서 의약품 카탈로그를 페이지 단위로 가져와 `pill_catalog`에 upsert 합니다.
/// API 워커와 CLI 동시 실행 충돌 방지를 위해 PostgreSQL 세션 레벨 Advisory Lock을 사용합니다.
pub async fn sync_pill_catalog(
    pool: &PgPool,
    client: &reqwest::Client,
    cfg: &PillSyncConfig,
) -> anyhow::Result<SyncOutcome> {
    if cfg.api_key.is_empty() {
        anyhow::bail!("DATA_GO_KR_API_KEY가 설정되지 않았습니다.");
    }

    let mut lock_conn = pool.acquire().await?;
    let acquired: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock($1)")
        .bind(PILL_SYNC_ADVISORY_LOCK_KEY)
        .fetch_one(&mut *lock_conn)
        .await?;

    if !acquired {
        tracing::info!(
            "다른 프로세스 또는 워커가 의약품 동기화를 실행 중이어서 건너뜁니다. (advisory_lock)"
        );
        return Ok(SyncOutcome::SkippedAlreadyRunning);
    }

    let sync_result = run_sync_pages(pool, client, cfg).await;

    if let Err(err) = sqlx::query_scalar::<_, bool>("SELECT pg_advisory_unlock($1)")
        .bind(PILL_SYNC_ADVISORY_LOCK_KEY)
        .fetch_one(&mut *lock_conn)
        .await
    {
        tracing::warn!("의약품 동기화 Advisory Lock 해제 실패: {err:?}");
    }

    sync_result.map(SyncOutcome::Synced)
}

async fn run_sync_pages(
    pool: &PgPool,
    client: &reqwest::Client,
    cfg: &PillSyncConfig,
) -> anyhow::Result<usize> {
    let mut total = 0usize;
    for page_no in 1..=MAX_PAGES {
        let items = fetch_pill_page_with_retry(client, cfg, page_no).await?;
        if items.is_empty() {
            break;
        }

        total += items.len();
        upsert_items(pool, items).await?;
        tokio::time::sleep(Duration::from_millis(PAGE_DELAY_MS)).await;
    }

    Ok(total)
}

async fn upsert_items(pool: &PgPool, items: Vec<PillItem>) -> anyhow::Result<()> {
    let mut qb = QueryBuilder::new(
        "INSERT INTO pill_catalog (item_seq, item_name, entp_name, chart, drug_shape, color_class1, color_class2, line_front, line_back, item_image, updated_at) ",
    );
    qb.push_values(items, |mut b, item| {
        b.push_bind(item.item_seq)
            .push_bind(item.item_name)
            .push_bind(item.entp_name)
            .push_bind(item.chart)
            .push_bind(item.drug_shape)
            .push_bind(item.color_class1)
            .push_bind(item.color_class2)
            .push_bind(item.line_front)
            .push_bind(item.line_back)
            .push_bind(item.item_image)
            .push("NOW()");
    });
    qb.push(
        " ON CONFLICT (item_seq) DO UPDATE SET \
        item_name = EXCLUDED.item_name, \
        entp_name = EXCLUDED.entp_name, \
        chart = EXCLUDED.chart, \
        drug_shape = EXCLUDED.drug_shape, \
        color_class1 = EXCLUDED.color_class1, \
        color_class2 = EXCLUDED.color_class2, \
        line_front = EXCLUDED.line_front, \
        line_back = EXCLUDED.line_back, \
        item_image = EXCLUDED.item_image, \
        updated_at = NOW()",
    );
    qb.build().execute(pool).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{
        Mock, MockServer, ResponseTemplate,
        matchers::{method, path, query_param},
    };

    #[test]
    fn test_encode_service_key_once_prevents_double_encoding() {
        let already_encoded = "abc%2Bdef%2F123%3D%3D";
        assert_eq!(encode_service_key_once(already_encoded), already_encoded);

        let raw_key = "abc+def/123==";
        assert_eq!(encode_service_key_once(raw_key), "abc%2Bdef%2F123%3D%3D");

        let url = build_page_url("https://example.com/pills", already_encoded, 2);
        assert!(url.contains("serviceKey=abc%2Bdef%2F123%3D%3D"));
        assert!(!url.contains("%25"));
    }

    #[tokio::test]
    async fn test_fetch_pill_page_retries_transient_503_and_succeeds() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/pills"))
            .and(query_param("pageNo", "1"))
            .respond_with(ResponseTemplate::new(503))
            .up_to_n_times(1)
            .mount(&server)
            .await;

        Mock::given(method("GET"))
            .and(path("/pills"))
            .and(query_param("pageNo", "1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "body": {
                    "items": [{
                        "ITEM_SEQ": "200001234",
                        "ITEM_NAME": "타이레놀정500밀리그램"
                    }]
                }
            })))
            .mount(&server)
            .await;

        let cfg = PillSyncConfig {
            endpoint: format!("{}/pills", server.uri()),
            api_key: "test%2Bkey".to_string(),
        };
        let items = fetch_pill_page_with_retry(&build_sync_http_client(), &cfg, 1)
            .await
            .expect("일시 503 후 재시도 성공");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].item_seq, "200001234");
    }

    #[tokio::test]
    async fn test_fetch_pill_page_detects_xml_error_response() {
        let server = MockServer::start().await;

        let xml_err = "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>";
        Mock::given(method("GET"))
            .and(path("/pills"))
            .respond_with(ResponseTemplate::new(200).set_body_string(xml_err))
            .mount(&server)
            .await;

        let cfg = PillSyncConfig {
            endpoint: format!("{}/pills", server.uri()),
            api_key: "invalid-key".to_string(),
        };
        let err = fetch_pill_page_with_retry(&build_sync_http_client(), &cfg, 1)
            .await
            .expect_err("XML 에러 응답은 실패해야 함");

        let msg = err.to_string();
        assert!(msg.contains("XML 오류 응답"));
        assert!(msg.contains("SERVICE_KEY_IS_NOT_REGISTERED_ERROR"));
    }
}
