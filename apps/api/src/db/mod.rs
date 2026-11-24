use std::env;

use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, postgres::PgPoolOptions};
use uuid::Uuid;

/// 기존 PostgreSQL `TIMESTAMP WITHOUT TIME ZONE` 컬럼(`NaiveDateTime`)을
/// JSON 직렬화 시 UTC RFC3339(`Z` 접미사) 형식으로 변환하는 Serde 모듈입니다.
pub mod utc_naive_datetime {
    use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
    use serde::{Deserialize, Deserializer, Serializer, de};

    const LEGACY_NAIVE_FORMATS: [&str; 4] = [
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
    ];

    /// `NaiveDateTime` 값을 UTC 기준 RFC3339 문자열(`Z` 포함)로 직렬화합니다.
    pub fn serialize<S>(dt: &NaiveDateTime, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let utc_dt = DateTime::<Utc>::from_naive_utc_and_offset(*dt, Utc);
        serializer.serialize_str(&utc_dt.to_rfc3339_opts(SecondsFormat::AutoSi, true))
    }

    /// RFC3339 문자열 또는 기존 `NaiveDateTime` 문자열을 `NaiveDateTime`(UTC 기준)으로 역직렬화합니다.
    pub fn deserialize<'de, D>(deserializer: D) -> Result<NaiveDateTime, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        deserialize_str(&s)
    }

    pub(super) fn deserialize_str<E: de::Error>(s: &str) -> Result<NaiveDateTime, E> {
        parse_utc_or_naive(s)
            .ok_or_else(|| E::custom(format!("유효하지 않은 UTC/Naive 날짜 형식입니다: {s}")))
    }

    fn parse_utc_or_naive(s: &str) -> Option<NaiveDateTime> {
        if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
            return Some(dt.naive_utc());
        }
        LEGACY_NAIVE_FORMATS
            .iter()
            .find_map(|fmt| NaiveDateTime::parse_from_str(s, fmt).ok())
    }
}

/// 선택적(`Option<NaiveDateTime>`) 날짜 필드를 UTC RFC3339(`Z` 접미사) 형식으로 변환하는 Serde 모듈입니다.
pub mod opt_utc_naive_datetime {
    use chrono::NaiveDateTime;
    use serde::{Deserialize, Deserializer, Serializer};

    use super::utc_naive_datetime;

    /// `Option<NaiveDateTime>` 값을 UTC 기준 RFC3339 문자열 또는 `null`로 직렬화합니다.
    pub fn serialize<S>(dt: &Option<NaiveDateTime>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match dt {
            Some(value) => utc_naive_datetime::serialize(value, serializer),
            None => serializer.serialize_none(),
        }
    }

    /// 선택적 날짜 문자열 또는 `null`을 `Option<NaiveDateTime>`으로 역직렬화합니다.
    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<NaiveDateTime>, D::Error>
    where
        D: Deserializer<'de>,
    {
        Option::<String>::deserialize(deserializer)?
            .as_deref()
            .map(utc_naive_datetime::deserialize_str)
            .transpose()
    }
}

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
    #[serde(with = "opt_utc_naive_datetime")]
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: i32,
    pub user_id: String,
    pub title: Option<String>,
    #[serde(with = "opt_utc_naive_datetime")]
    pub created_at: Option<NaiveDateTime>,
    #[serde(with = "opt_utc_naive_datetime")]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AiChatLog {
    pub id: i32,
    pub session_id: Option<i32>,
    pub user_id: String,
    pub prompt: String,
    pub response: String,
    #[serde(with = "opt_utc_naive_datetime")]
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserActivityLog {
    pub id: i32,
    pub user_id: String,
    pub action: String,
    pub details: Option<String>,
    #[serde(with = "opt_utc_naive_datetime")]
    pub created_at: Option<NaiveDateTime>,
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
    #[serde(with = "opt_utc_naive_datetime")]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub user_id: String,
    pub nickname: String,
    pub role: String,
    pub status: String,
    pub restricted_reason: Option<String>,
    #[serde(with = "opt_utc_naive_datetime")]
    pub restricted_at: Option<NaiveDateTime>,
    #[serde(with = "opt_utc_naive_datetime")]
    pub deleted_at: Option<NaiveDateTime>,
    pub deletion_reason: Option<String>,
    #[serde(with = "opt_utc_naive_datetime")]
    pub created_at: Option<NaiveDateTime>,
    #[serde(with = "opt_utc_naive_datetime")]
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserRestrictionHistory {
    pub id: i32,
    pub user_id: String,
    pub admin_id: String,
    pub reason: String,
    #[serde(with = "opt_utc_naive_datetime")]
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChatAccessApproval {
    pub id: Uuid,
    pub user_id: String,
    pub chat_session_id: Option<i32>,
    #[serde(with = "utc_naive_datetime")]
    pub granted_at: NaiveDateTime,
    #[serde(with = "opt_utc_naive_datetime")]
    pub accessed_at: Option<NaiveDateTime>,
    #[serde(with = "opt_utc_naive_datetime")]
    pub expires_at: Option<NaiveDateTime>,
    #[serde(with = "opt_utc_naive_datetime")]
    pub created_at: Option<NaiveDateTime>,
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
    #[serde(with = "opt_utc_naive_datetime")]
    pub created_at: Option<NaiveDateTime>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct SampleDates {
        #[serde(with = "utc_naive_datetime")]
        required: NaiveDateTime,
        #[serde(with = "opt_utc_naive_datetime")]
        optional: Option<NaiveDateTime>,
        #[serde(with = "opt_utc_naive_datetime")]
        missing: Option<NaiveDateTime>,
    }

    #[test]
    fn test_utc_naive_datetime_serializes_with_z_suffix() {
        let dt = NaiveDate::from_ymd_opt(2026, 11, 24)
            .unwrap()
            .and_hms_milli_opt(8, 15, 30, 123)
            .unwrap();

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
    fn test_utc_naive_datetime_deserializes_legacy_naive_format() {
        let legacy_json = serde_json::json!({
            "required": "2026-11-24T08:15:30",
            "optional": "2026-11-24 08:15:30",
            "missing": null
        });

        let parsed: SampleDates = serde_json::from_value(legacy_json).expect("레거시 포맷 호환");
        let expected = NaiveDate::from_ymd_opt(2026, 11, 24)
            .unwrap()
            .and_hms_opt(8, 15, 30)
            .unwrap();
        assert_eq!(parsed.required, expected);
        assert_eq!(parsed.optional, Some(expected));
        assert_eq!(parsed.missing, None);
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
