use std::time::Duration;

use serde::Deserialize;
use sqlx::{PgPool, QueryBuilder};

/// 공공데이터포털 의약품 동기화 설정
#[derive(Debug, Clone)]
pub struct PillSyncConfig {
    pub endpoint: String,
    pub api_key: String,
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

/// 공공데이터포털에서 의약품 카탈로그를 페이지 단위로 가져와 `pill_catalog`에 upsert 합니다.
/// 동기화(upsert)한 의약품 건수를 반환합니다.
pub async fn sync_pill_catalog(
    pool: &PgPool,
    client: &reqwest::Client,
    cfg: &PillSyncConfig,
) -> anyhow::Result<usize> {
    if cfg.api_key.is_empty() {
        anyhow::bail!("DATA_GO_KR_API_KEY가 설정되지 않았습니다.");
    }

    let mut total = 0usize;
    for page_no in 1..=MAX_PAGES {
        let res = client
            .get(&cfg.endpoint)
            .query(&[
                ("serviceKey", cfg.api_key.as_str()),
                ("type", "json"),
                ("numOfRows", &NUM_OF_ROWS.to_string()),
                ("pageNo", &page_no.to_string()),
            ])
            .send()
            .await?;

        if !res.status().is_success() {
            anyhow::bail!(
                "공공데이터 API 오류 응답 (page {page_no}): {}",
                res.status()
            );
        }

        let data: PillApiResponse = res.json().await?;
        let items = data.body.and_then(|b| b.items).unwrap_or_default();
        if items.is_empty() {
            break;
        }

        total += items.len();
        upsert_items(pool, items).await?;
        tokio::time::sleep(Duration::from_millis(50)).await;
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
