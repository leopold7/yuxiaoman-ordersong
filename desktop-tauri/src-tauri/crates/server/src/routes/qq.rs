//! QQ 音乐代理路由

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{ApiError, ApiResult};
use crate::state::AppStateRef;

pub fn router() -> Router<AppStateRef> {
    Router::new()
        .route(
            "/_status",
            get(|| async { Json(json!({ "ok": true, "impl": "native" })) }),
        )
        .route("/search", get(search))
        .route("/song/url", get(song_url))
        .route("/lyric", get(lyric))
        .route("/user/setCookie", post(set_cookie))
        .route("/user/favorite", get(user_favorite))
        .route("/toplist", get(toplist))
}

#[derive(Deserialize)]
struct ToplistQuery {
    topid: Option<u32>,
    num: Option<u32>,
}

async fn toplist(State(state): State<AppStateRef>, Query(q): Query<ToplistQuery>) -> impl IntoResponse {
    Json(
        state
            .qq
            .toplist(q.topid.unwrap_or(4) as i64, q.num.unwrap_or(100) as i64)
            .await,
    )
}

#[derive(Deserialize)]
struct SearchQuery {
    key: Option<String>,
    #[serde(rename = "pageSize")]
    page_size: Option<u32>,
    #[serde(rename = "pageNo")]
    page_no: Option<u32>,
}

async fn search(State(state): State<AppStateRef>, Query(q): Query<SearchQuery>) -> impl IntoResponse {
    let kw = q.key.unwrap_or_default();
    let cookie = state.qq_cookie_snapshot();
    Json(
        state
            .qq
            .search(&kw, q.page_size.unwrap_or(10), q.page_no.unwrap_or(1), &cookie)
            .await,
    )
}

#[derive(Deserialize)]
struct UrlQuery {
    id: Option<String>,
    level: Option<String>,
}

async fn song_url(State(state): State<AppStateRef>, Query(q): Query<UrlQuery>) -> impl IntoResponse {
    let mid = q.id.unwrap_or_default();
    let level = q.level.as_deref().unwrap_or("exhigh");
    let cookie = state.qq_cookie_snapshot();
    Json(state.qq.song_url(&mid, level, &cookie).await)
}

#[derive(Deserialize)]
struct LyricQuery {
    id: Option<String>,
}

async fn lyric(State(state): State<AppStateRef>, Query(q): Query<LyricQuery>) -> impl IntoResponse {
    Json(state.qq.lyric(&q.id.unwrap_or_default()).await)
}

#[derive(Deserialize)]
struct SetCookieBody {
    data: Option<String>,
}

async fn set_cookie(
    State(state): State<AppStateRef>,
    Json(b): Json<SetCookieBody>,
) -> ApiResult<Json<Value>> {
    let c = b.data.unwrap_or_default();
    let mut w = state
        .qq_cookie
        .write()
        .map_err(|_| ApiError::internal("QQ cookie 写锁中毒"))?;
    *w = c;
    Ok(Json(json!({ "ok": true })))
}

async fn user_favorite(State(state): State<AppStateRef>) -> impl IntoResponse {
    let cookie = state.qq_cookie_snapshot();
    Json(state.qq.user_favorite(&cookie).await)
}
