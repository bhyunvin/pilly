use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, postgres::PgPoolOptions};
use uuid::Uuid;

/// PostgreSQL 커넥션 풀을 초기화합니다.
pub async fn init_pool(database_url: &str) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(32)
        .connect(database_url)
        .await?;

    tracing::info!("PostgreSQL 연결 완료");
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
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: i32,
    pub user_id: String,
    pub title: Option<String>,
    pub created_at: Option<NaiveDateTime>,
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
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserActivityLog {
    pub id: i32,
    pub user_id: String,
    pub action: String,
    pub details: Option<String>,
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
    pub restricted_at: Option<NaiveDateTime>,
    pub deleted_at: Option<NaiveDateTime>,
    pub deletion_reason: Option<String>,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserRestrictionHistory {
    pub id: i32,
    pub user_id: String,
    pub admin_id: String,
    pub reason: String,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChatAccessApproval {
    pub id: Uuid,
    pub user_id: String,
    pub chat_session_id: Option<i32>,
    pub granted_at: NaiveDateTime,
    pub accessed_at: Option<NaiveDateTime>,
    pub expires_at: Option<NaiveDateTime>,
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
    pub created_at: Option<NaiveDateTime>,
}
