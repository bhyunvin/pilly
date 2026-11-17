use std::time::Duration;

use serde::Deserialize;
use sqlx::{QueryBuilder, postgres::PgPoolOptions};

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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let api_key = std::env::var("DATA_GO_KR_API_KEY")?;
    let endpoint = std::env::var("DATA_GO_KR_ENDPOINT").unwrap_or_else(|_| {
        "https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03"
            .to_string()
    });
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        let host = std::env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string());
        let port = std::env::var("DB_PORT").unwrap_or_else(|_| "5432".to_string());
        let user = std::env::var("DB_USER").unwrap_or_else(|_| "pilly".to_string());
        let password = std::env::var("DB_PASSWORD").unwrap_or_else(|_| "pilly".to_string());
        let name = std::env::var("DB_NAME").unwrap_or_else(|_| "pilly".to_string());
        format!("postgresql://{user}:{password}@{host}:{port}/{name}")
    });

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    let client = reqwest::Client::new();
    let mut page_no = 1;
    let num_of_rows = 100;

    println!("💊 의약품 데이터베이스 동기화를 시작합니다...");

    loop {
        println!("📡 Fetching page {page_no}...");
        let res = client
            .get(&endpoint)
            .query(&[
                ("serviceKey", api_key.as_str()),
                ("type", "json"),
                ("numOfRows", &num_of_rows.to_string()),
                ("pageNo", &page_no.to_string()),
                ("stdt", "2000"),
            ])
            .send()
            .await?;

        if !res.status().is_success() {
            break;
        }

        let data: PillApiResponse = res.json().await?;
        let items = data.body.and_then(|b| b.items).unwrap_or_default();

        if items.is_empty() {
            break;
        }

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

        qb.build().execute(&pool).await?;

        page_no += 1;
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    println!("✅ 의약품 데이터베이스 동기화 완료!");
    Ok(())
}
