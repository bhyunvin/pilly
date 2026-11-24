use std::{collections::HashMap, env};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, postgres::PgPoolOptions};
use uuid::Uuid;

const FALSY_ENV_VALUES: [&str; 3] = ["false", "0", "no"];

fn parse_run_migrations_flag(raw: Option<&str>) -> bool {
    !matches!(
        raw.map(str::trim),
        Some(v) if FALSY_ENV_VALUES.iter().any(|falsy| v.eq_ignore_ascii_case(falsy))
    )
}

/// `RUN_MIGRATIONS` 환경변수를 확인하여 기동 시 마이그레이션 실행 여부를 결정합니다. (기본값: true)
pub fn should_run_migrations() -> bool {
    parse_run_migrations_flag(env::var("RUN_MIGRATIONS").ok().as_deref())
}

/// PostgreSQL 마이그레이션(`apps/api/migrations`)을 실행합니다.
pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

/// PostgreSQL 커넥션 풀을 초기화하고 필요 시 마이그레이션을 실행합니다.
pub async fn init_pool(database_url: &str) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(32)
        .connect(database_url)
        .await?;

    if should_run_migrations() {
        run_migrations(&pool).await?;
        tracing::info!("PostgreSQL 연결 및 마이그레이션 완료");
    } else {
        tracing::info!("PostgreSQL 연결 완료 (RUN_MIGRATIONS 비활성화)");
    }

    Ok(pool)
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserMedication {
    pub id: i32,
    pub user_id: String,
    pub name: String,
    pub dosage: Option<String>,
    pub frequency: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub status: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: i32,
    pub user_id: String,
    pub title: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AiChatLog {
    pub id: i32,
    pub session_id: Option<i32>,
    pub user_id: String,
    pub prompt: String,
    pub response: String,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserActivityLog {
    pub id: i32,
    pub user_id: String,
    pub action: String,
    pub details: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PillCatalog {
    pub id: i32,
    pub item_seq: String,
    pub item_name: String,
    pub entp_name: Option<String>,
    pub chart: Option<String>,
    pub drug_shape: Option<String>,
    pub color_class1: Option<String>,
    pub color_class2: Option<String>,
    pub line_front: Option<String>,
    pub line_back: Option<String>,
    pub item_image: Option<String>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub user_id: String,
    pub nickname: String,
    pub role: String,
    pub status: String,
    pub restricted_reason: Option<String>,
    pub restricted_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub deletion_reason: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserRestrictionHistory {
    pub id: i32,
    pub user_id: String,
    pub admin_id: String,
    pub reason: String,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChatAccessApproval {
    pub id: Uuid,
    pub user_id: String,
    pub chat_session_id: Option<i32>,
    pub granted_at: DateTime<Utc>,
    pub accessed_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserInquiry {
    pub id: i32,
    pub user_id: String,
    pub chat_session_id: Option<i32>,
    pub title: String,
    pub content: String,
    pub allow_chat_access: Option<bool>,
    pub chat_access_id: Option<Uuid>,
    pub status: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InquiryAttachment {
    pub id: i32,
    pub inquiry_id: Option<i32>,
    pub file_url: String,
    pub original_name: String,
    pub created_at: Option<DateTime<Utc>>,
}

/// 문의 ID 목록에 속한 첨부파일을 일괄 조회해 `inquiry_id` 기준으로 그룹화합니다.
pub async fn fetch_inquiry_attachments_map(
    pool: &PgPool,
    inquiry_ids: &[i32],
) -> Result<HashMap<i32, Vec<InquiryAttachment>>, sqlx::Error> {
    if inquiry_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let attachments: Vec<InquiryAttachment> = sqlx::query_as(
        "SELECT id, inquiry_id, file_url, original_name, created_at FROM inquiry_attachments WHERE inquiry_id = ANY($1) ORDER BY id ASC",
    )
    .bind(inquiry_ids)
    .fetch_all(pool)
    .await?;

    let mut attachment_map: HashMap<i32, Vec<InquiryAttachment>> = HashMap::new();
    for att in attachments {
        if let Some(inq_id) = att.inquiry_id {
            attachment_map.entry(inq_id).or_default().push(att);
        }
    }

    Ok(attachment_map)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct SampleDates {
        required: DateTime<Utc>,
        optional: Option<DateTime<Utc>>,
        missing: Option<DateTime<Utc>>,
    }

    #[test]
    fn test_utc_datetime_serializes_with_z_suffix() {
        let dt = NaiveDate::from_ymd_opt(2026, 11, 24)
            .unwrap()
            .and_hms_milli_opt(8, 15, 30, 123)
            .unwrap()
            .and_utc();

        let sample = SampleDates {
            required: dt,
            optional: Some(dt),
            missing: None,
        };

        let json_val = serde_json::to_value(&sample).expect("직렬화 성공");
        assert_eq!(json_val["required"], "2026-11-24T08:15:30.123Z");
        assert_eq!(json_val["optional"], "2026-11-24T08:15:30.123Z");
        assert!(json_val["missing"].is_null());

        let roundtrip: SampleDates = serde_json::from_value(json_val).expect("역직렬화 성공");
        assert_eq!(roundtrip, sample);
    }

    #[test]
    fn test_parse_run_migrations_flag() {
        assert!(parse_run_migrations_flag(None));
        assert!(parse_run_migrations_flag(Some("")));
        assert!(parse_run_migrations_flag(Some("true")));
        assert!(!parse_run_migrations_flag(Some("false")));
        assert!(!parse_run_migrations_flag(Some("FALSE")));
        assert!(!parse_run_migrations_flag(Some("0")));
        assert!(!parse_run_migrations_flag(Some("no")));
    }
}
