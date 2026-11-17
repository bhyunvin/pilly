#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

mod config;
mod db;
mod error;
mod middleware;
mod mq;
mod routes;
mod scheduler;
mod state;
mod utils;

use std::sync::Arc;
use std::time::Duration;

use axum::{Json, Router, routing::get};
use chrono::Utc;
use dashmap::DashMap;
use moka::future::Cache;
use serde_json::json;
use tokio::net::TcpListener;
use tower_http::{compression::CompressionLayer, cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{EnvFilter, fmt};

use crate::{config::Config, mq::EventProducer, state::AppState};

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
    .await;

    mq::spawn_batch_consumer(
        config.iggy_address.clone(),
        config.iggy_username.clone(),
        config.iggy_password.clone(),
        pool.clone(),
    );

    scheduler::spawn_cleanup_scheduler(producer.clone());

    let state = AppState {
        pool,
        config: config.clone(),
        producer,
        http_client: reqwest::Client::new(),
        pill_cache: Cache::builder()
            .max_capacity(10_000)
            .time_to_live(Duration::from_secs(600))
            .build(),
        jwks_cache: Arc::new(DashMap::new()),
    };

    let api_v1 = Router::new()
        .nest("/profile", routes::profile::router())
        .nest("/chat", routes::chat::router())
        .nest("/medications", routes::medications::router())
        .nest("/search", routes::search::router())
        .nest("/activity", routes::activity::router())
        .nest("/inquiry", routes::inquiry::router())
        .nest("/admin", routes::admin::router());

    let app = Router::new()
        .route("/", get(health_check))
        .route("/health", get(health_check))
        .nest("/api/v1", api_v1)
        .layer(CorsLayer::permissive())
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("🚀 Pilly Rust API Server listening on http://{}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn health_check() -> Json<serde_json::Value> {
    Json(json!({
        "success": true,
        "message": "Pilly API Server is running!",
        "timestamp": Utc::now().to_rfc3339(),
    }))
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
