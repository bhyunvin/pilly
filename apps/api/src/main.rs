#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

use std::time::Duration;

use axum::http::{
    HeaderName, HeaderValue, Method,
    header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE},
};
use pilly_api::{
    config::Config,
    create_app, db,
    mq::{self, EventProducer},
    scheduler,
    state::AppState,
    sync::PillSyncConfig,
    utils::security::validate_encryption_key,
};
use tokio::{net::TcpListener, sync::watch, task::JoinHandle};
use tower_http::{
    compression::CompressionLayer,
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{EnvFilter, fmt};

const SHUTDOWN_DRAIN_TIMEOUT: Duration = Duration::from_secs(10);

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env();
    validate_encryption_key(&config.encryption_key)
        .map_err(|e| anyhow::anyhow!("암호화 키 검증 실패로 서버 기동을 중단합니다: {e}"))?;

    let pool = db::init_pool(&config.database_url).await?;
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let pill_cache = AppState::build_pill_cache();

    let (producer, reconnect_handle) = EventProducer::connect_with_shutdown(
        &config.iggy_address,
        &config.iggy_username,
        &config.iggy_password,
        pool.clone(),
        shutdown_rx.clone(),
    )
    .await;

    let producer = producer
        .with_pill_sync(PillSyncConfig {
            endpoint: config.data_go_kr_endpoint.clone(),
            api_key: config.data_go_kr_api_key.clone(),
        })
        .with_pill_cache(pill_cache);

    let consumer_handle = mq::spawn_batch_consumer(
        config.iggy_address.clone(),
        config.iggy_username.clone(),
        config.iggy_password.clone(),
        producer.clone(),
        shutdown_rx.clone(),
    );

    let scheduler_handle = scheduler::spawn_cleanup_scheduler(producer.clone(), shutdown_rx);

    let state = AppState::new(pool, config.clone(), producer);

    let cors = build_cors_layer(&config.cors_allowed_origins)?;

    let app = create_app(state)
        .layer(cors)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http());

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("🚀 Pilly Rust API Server listening on http://{}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(shutdown_tx))
        .await?;

    drain_background_workers(scheduler_handle, consumer_handle, reconnect_handle).await;

    Ok(())
}

async fn drain_background_workers(
    scheduler_handle: JoinHandle<()>,
    consumer_handle: JoinHandle<()>,
    reconnect_handle: JoinHandle<()>,
) {
    tracing::info!(
        "HTTP 서버 종료 완료. 백그라운드 워커 드레인 대기 중 (최대 {}초)...",
        SHUTDOWN_DRAIN_TIMEOUT.as_secs()
    );
    let drain_result = tokio::time::timeout(SHUTDOWN_DRAIN_TIMEOUT, async {
        let _ = tokio::join!(scheduler_handle, consumer_handle, reconnect_handle);
    })
    .await;

    if drain_result.is_err() {
        tracing::warn!(
            "백그라운드 워커 드레인 타임아웃({}초) 초과로 프로세스를 종료합니다.",
            SHUTDOWN_DRAIN_TIMEOUT.as_secs()
        );
    } else {
        tracing::info!("모든 백그라운드 워커가 안전하게 종료되었습니다.");
    }
}

async fn shutdown_signal(shutdown_tx: watch::Sender<bool>) {
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

    tracing::info!("종료 신호를 수신했습니다. 서버와 워커를 안전하게 종료합니다...");
    let _ = shutdown_tx.send(true);
}

/// 환경변수(`CORS_ALLOWED_ORIGINS`) 기반 화이트리스트 CORS 레이어를 생성합니다.
fn build_cors_layer(allowed_origins: &[String]) -> anyhow::Result<CorsLayer> {
    let origins: Vec<HeaderValue> = allowed_origins
        .iter()
        .map(|origin| {
            HeaderValue::from_str(origin)
                .map_err(|err| anyhow::anyhow!("유효하지 않은 CORS Origin({origin}): {err}"))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;

    Ok(CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            ACCEPT,
            HeaderName::from_static("x-admin-key"),
        ])
        .allow_credentials(true))
}
