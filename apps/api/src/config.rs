use std::env;

const DEFAULT_CORS_ALLOWED_ORIGINS: [&str; 2] = ["http://localhost:3000", "http://localhost:4001"];

/// 애플리케이션 전역 설정 구조체
#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub run_migrations: bool,
    pub cors_allowed_origins: Vec<String>,
    pub iggy_address: String,
    pub iggy_username: String,
    pub iggy_password: String,
    pub neon_auth_jwks_url: String,
    pub encryption_key: String,
    pub admin_api_key: String,
    pub gemini_api_key: String,
    pub gemini_base_url: String,
    pub gemini_model: String,
    pub data_go_kr_api_key: String,
    pub data_go_kr_endpoint: String,
    pub cloudinary_cloud_name: String,
    pub cloudinary_api_key: String,
    pub cloudinary_api_secret: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_username: String,
    pub smtp_password: String,
    pub smtp_from: String,
}

impl Config {
    /// 환경 변수에서 설정을 로드합니다.
    pub fn from_env() -> Self {
        let port = env::var("PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3001);

        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
            let host = env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string());
            let port = env::var("DB_PORT").unwrap_or_else(|_| "5432".to_string());
            let user = env::var("DB_USER").unwrap_or_else(|_| "pilly".to_string());
            let password = env::var("DB_PASSWORD").unwrap_or_else(|_| "pilly".to_string());
            let name = env::var("DB_NAME").unwrap_or_else(|_| "pilly".to_string());
            format!("postgresql://{user}:{password}@{host}:{port}/{name}")
        });

        let run_migrations = crate::db::should_run_migrations();
        let cors_allowed_origins =
            parse_cors_allowed_origins(env::var("CORS_ALLOWED_ORIGINS").ok().as_deref());

        Self {
            port,
            database_url,
            run_migrations,
            cors_allowed_origins,
            iggy_address: env::var("IGGY_ADDRESS").unwrap_or_else(|_| "127.0.0.1:8090".to_string()),
            iggy_username: env::var("IGGY_USERNAME").unwrap_or_else(|_| "iggy".to_string()),
            iggy_password: env::var("IGGY_PASSWORD").unwrap_or_else(|_| "iggy".to_string()),
            neon_auth_jwks_url: env::var("NEON_AUTH_JWKS_URL").unwrap_or_default(),
            encryption_key: env::var("ENCRYPTION_KEY").unwrap_or_default(),
            admin_api_key: env::var("ADMIN_API_KEY").unwrap_or_default(),
            gemini_api_key: env::var("GOOGLE_GENERATIVE_AI_API_KEY").unwrap_or_default(),
            gemini_base_url: env::var("GEMINI_BASE_URL")
                .unwrap_or_else(|_| "https://generativelanguage.googleapis.com".to_string()),
            gemini_model: env::var("GEMINI_MODEL")
                .unwrap_or_else(|_| "gemini-3.8-flash".to_string()),
            data_go_kr_api_key: env::var("DATA_GO_KR_API_KEY").unwrap_or_default(),
            data_go_kr_endpoint: env::var("DATA_GO_KR_ENDPOINT").unwrap_or_else(|_| {
                "https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03".to_string()
            }),
            cloudinary_cloud_name: env::var("CLOUDINARY_CLOUD_NAME").unwrap_or_default(),
            cloudinary_api_key: env::var("CLOUDINARY_API_KEY").unwrap_or_default(),
            cloudinary_api_secret: env::var("CLOUDINARY_API_SECRET").unwrap_or_default(),
            smtp_host: env::var("SMTP_HOST").unwrap_or_default(),
            smtp_port: env::var("SMTP_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(587),
            smtp_username: env::var("SMTP_USERNAME").unwrap_or_default(),
            smtp_password: env::var("SMTP_PASSWORD").unwrap_or_default(),
            smtp_from: env::var("SMTP_FROM").unwrap_or_else(|_| "noreply@pilly.app".to_string()),
        }
    }
}

fn parse_cors_allowed_origins(raw: Option<&str>) -> Vec<String> {
    let origins: Vec<String> = raw
        .into_iter()
        .flat_map(|value| value.split(','))
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string)
        .collect();

    if origins.is_empty() {
        DEFAULT_CORS_ALLOWED_ORIGINS
            .iter()
            .map(|origin| (*origin).to_string())
            .collect()
    } else {
        origins
    }
}
