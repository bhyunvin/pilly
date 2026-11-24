use pilly_api::{
    config::Config,
    sync::{PillSyncConfig, SyncOutcome, build_sync_http_client, sync_pill_catalog},
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
    let outcome = sync_pill_catalog(
        &pool,
        &build_sync_http_client(),
        &PillSyncConfig {
            endpoint: config.data_go_kr_endpoint,
            api_key: config.data_go_kr_api_key,
        },
    )
    .await?;

    match outcome {
        SyncOutcome::Synced(total) => {
            println!("✅ 의약품 데이터베이스 동기화 완료! ({total}건)");
        }
        SyncOutcome::SkippedAlreadyRunning => {
            println!(
                "ℹ️ 이미 다른 프로세스 또는 워커가 의약품 동기화를 진행 중이어서 건너뛰었습니다."
            );
        }
    }

    Ok(())
}
