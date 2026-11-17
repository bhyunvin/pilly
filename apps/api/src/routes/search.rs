use axum::{
    Json, Router,
    extract::{Query, State},
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::QueryBuilder;

use crate::{
    db::PillCatalog,
    error::AppResult,
    middleware::auth::AuthUser,
    mq::PillyEvent,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub name: Option<String>,
    pub shape: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SitemapItem {
    item_seq: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sitemap", get(get_sitemap))
        .route("/", get(search_pills))
}

/// 사이트맵 생성을 위한 공개 의약품 ID 목록 조회
async fn get_sitemap(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let rows: Vec<(String,)> =
        sqlx::query_as("SELECT item_seq FROM pill_catalog LIMIT 10000")
            .fetch_all(&state.pool)
            .await?;

    let pills: Vec<SitemapItem> = rows
        .into_iter()
        .map(|(item_seq,)| SitemapItem { item_seq })
        .collect();

    Ok(Json(json!({
        "success": true,
        "pills": pills,
    })))
}

/// 의약품 카탈로그 조건 검색 (DashMap 인메모리 캐시 활용)
async fn search_pills(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<Value>> {
    let cache_key = format!(
        "{}:{}:{}",
        query.name.as_deref().unwrap_or(""),
        query.shape.as_deref().unwrap_or(""),
        query.color.as_deref().unwrap_or("")
    );

    // 검색 통계 비동기 발행 (DB 대기 없음)
    if let Some(ref name) = query.name
        && !name.is_empty()
    {
        let producer = state.producer.clone();
        let user_id = auth_user.user_id.clone();
        let q = name.clone();
        tokio::spawn(async move {
            producer
                .publish(PillyEvent::SearchStat { user_id, query: q })
                .await;
        });
    }

    if let Some(cached) = state.pill_cache.get(&cache_key).await {
        return Ok(Json(json!({
            "success": true,
            "pills": cached,
        })));
    }

    let mut qb = QueryBuilder::new(
        "SELECT id, item_seq, item_name, entp_name, chart, drug_shape, color_class1, color_class2, line_front, line_back, item_image, updated_at FROM pill_catalog",
    );

    let mut has_where = false;
    if let Some(name) = &query.name
        && !name.is_empty()
    {
        qb.push(" WHERE item_name ILIKE ");
        qb.push_bind(format!("%{name}%"));
        has_where = true;
    }
    if let Some(shape) = &query.shape
        && !shape.is_empty()
    {
        qb.push(if has_where { " AND " } else { " WHERE " });
        qb.push("drug_shape = ");
        qb.push_bind(shape.clone());
        has_where = true;
    }
    if let Some(color) = &query.color
        && !color.is_empty()
    {
        qb.push(if has_where { " AND " } else { " WHERE " });
        qb.push("color_class1 = ");
        qb.push_bind(color.clone());
    }

    qb.push(" LIMIT 50");

    let pills: Vec<PillCatalog> = qb.build_query_as().fetch_all(&state.pool).await?;

    state.pill_cache.insert(cache_key, pills.clone()).await;

    Ok(Json(json!({
        "success": true,
        "pills": pills,
    })))
}
