#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

use pilly_api::{
    config::Config,
    create_app, db,
    mq::{self, EventProducer},
    scheduler,
    state::AppState,
    sync::PillSyncConfig,
};
use tokio::net::TcpListener;
use tower_http::{compression::CompressionLayer, cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{EnvFilter, fmt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env();
    let pool = db::init_pool(&config.database_url).await?;

    let producer = EventProducer::connect(
        &config.iggy_address,
        &config.iggy_username,
        &config.iggy_password,
        pool.clone(),
    )
    .await
    .with_pill_sync(PillSyncConfig {
        endpoint: config.data_go_kr_endpoint.clone(),
        api_key: config.data_go_kr_api_key.clone(),
    });

    mq::spawn_batch_consumer(
        config.iggy_address.clone(),
        config.iggy_username.clone(),
        config.iggy_password.clone(),
        producer.clone(),
    );

    scheduler::spawn_cleanup_scheduler(producer.clone());

    let state = AppState::new(pool, config.clone(), producer);

    let app = create_app(state)
        .layer(CorsLayer::permissive())
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("🚀 Pilly Rust API Server listening on http://{}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sig) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            sig.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("종료 신호를 수신했습니다. 서버를 안전하게 종료합니다...");
}
