use pilly_api::{
    config::Config,
    sync::{PillSyncConfig, sync_pill_catalog},
};
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let config = Config::from_env();
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await?;

    println!("💊 의약품 데이터베이스 동기화를 시작합니다...");
    let total = sync_pill_catalog(
        &pool,
        &reqwest::Client::new(),
        &PillSyncConfig {
            endpoint: config.data_go_kr_endpoint,
            api_key: config.data_go_kr_api_key,
        },
    )
    .await?;
    println!("✅ 의약품 데이터베이스 동기화 완료! ({total}건)");
    Ok(())
}
