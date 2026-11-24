use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::QueryBuilder;

use crate::{
    db::PillCatalog,
    error::{AppError, AppResult},
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
        .route("/pills/{itemSeq}", get(get_pill_detail))
        .route("/", get(search_pills))
}

fn escape_ilike_pattern(raw: &str) -> String {
    let mut escaped = String::with_capacity(raw.len());
    for ch in raw.chars() {
        match ch {
            '\\' | '%' | '_' => {
                escaped.push('\\');
                escaped.push(ch);
            }
            _ => escaped.push(ch),
        }
    }
    escaped
}

/// 사이트맵 생성을 위한 공개 의약품 ID 목록 조회
async fn get_sitemap(State(state): State<AppState>) -> AppResult<Json<Value>> {
    let rows: Vec<(String,)> = sqlx::query_as("SELECT item_seq FROM pill_catalog LIMIT 10000")
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

/// 의약품 단건 상세 조회 (공개 엔드포인트 — SSR 및 SEO 상세 페이지용)
async fn get_pill_detail(
    State(state): State<AppState>,
    Path(item_seq): Path<String>,
) -> AppResult<Json<Value>> {
    let pill: Option<PillCatalog> = sqlx::query_as(
        "SELECT id, item_seq, item_name, entp_name, chart, drug_shape, color_class1, color_class2, line_front, line_back, item_image, updated_at FROM pill_catalog WHERE item_seq = $1 LIMIT 1",
    )
    .bind(item_seq.trim())
    .fetch_optional(&state.pool)
    .await?;

    let Some(pill) = pill else {
        return Err(AppError::NotFound(
            "요청하신 의약품 정보를 찾을 수 없습니다.".to_string(),
        ));
    };

    Ok(Json(json!({
        "success": true,
        "pill": pill,
    })))
}

/// 의약품 카탈로그 조건 검색 (인메모리 캐시 + ILIKE 이스케이프 + color_class1/2 매칭)
async fn search_pills(
    State(state): State<AppState>,
    auth_user: AuthUser,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<Value>> {
    let name = query.name.as_deref().map(str::trim).unwrap_or("");
    let shape = query.shape.as_deref().map(str::trim).unwrap_or("");
    let color = query.color.as_deref().map(str::trim).unwrap_or("");

    let cache_key = format!("{name}:{shape}:{color}");

    // 검색 통계 비동기 발행 (DB 대기 없음)
    if !name.is_empty() {
        let producer = state.producer.clone();
        let user_id = auth_user.user_id.clone();
        let q = name.to_string();
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
    if !name.is_empty() {
        qb.push(" WHERE item_name ILIKE ");
        qb.push_bind(format!("%{}%", escape_ilike_pattern(name)));
        qb.push(" ESCAPE '\\'");
        has_where = true;
    }
    if !shape.is_empty() {
        qb.push(if has_where { " AND " } else { " WHERE " });
        qb.push("drug_shape = ");
        qb.push_bind(shape.to_string());
        has_where = true;
    }
    if !color.is_empty() {
        qb.push(if has_where { " AND (" } else { " WHERE (" });
        qb.push("color_class1 = ");
        qb.push_bind(color.to_string());
        qb.push(" OR color_class2 = ");
        qb.push_bind(color.to_string());
        qb.push(")");
    }

    qb.push(" LIMIT 50");

    let pills: Vec<PillCatalog> = qb.build_query_as().fetch_all(&state.pool).await?;

    state.pill_cache.insert(cache_key, pills.clone()).await;

    Ok(Json(json!({
        "success": true,
        "pills": pills,
    })))
}
