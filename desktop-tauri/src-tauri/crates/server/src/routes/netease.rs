//! 网易云 weapi 代理路由.
//!
//! 端点列表:
//! - GET /cloudsearch 云搜索
//! - GET /search 老搜索 (转 cloudsearch)
//! - GET /song/url/v1 取流 (带音质降级链路)
//! - GET /song/detail
//! - GET /playlist/track/all
//! - GET /lyric
//! - GET /login/qr/key
//! - GET /login/qr/create
//! - GET /login/qr/check
//! - GET /user/account
//! - GET /user/playlist

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::Value;

use crate::error::{ApiError, ApiResult};
use crate::state::AppStateRef;

pub fn router() -> Router<AppStateRef> {
    Router::new()
        .route("/cloudsearch", get(cloudsearch))
        .route("/search", get(cloudsearch))
        .route("/song/url/v1", get(song_url_v1))
        .route("/song/detail", get(song_detail))
        .route("/playlist/track/all", get(playlist_track_all))
        .route("/lyric", get(lyric))
        .route("/login/qr/key", get(qr_key))
        .route("/login/qr/create", get(qr_create))
        .route("/login/qr/check", get(qr_check))
        .route("/user/account", get(user_account))
        .route("/user/playlist", get(user_playlist))
}

#[derive(Debug, Deserialize)]
struct CommonQuery {
    keywords: Option<String>,
    keyword: Option<String>,
    id: Option<String>,
    ids: Option<String>,
    level: Option<String>,
    limit: Option<u32>,
    cookie: Option<String>,
    key: Option<String>,
    qrimg: Option<String>,
    uid: Option<String>,
    #[serde(rename = "type")]
    type_: Option<u32>,
    #[allow(dead_code)]
    timestamp: Option<u64>,
}

async fn cloudsearch(
    State(state): State<AppStateRef>,
    Query(q): Query<CommonQuery>,
) -> ApiResult<Json<Value>> {
    let keyword = q
        .keywords
        .or(q.keyword)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::bad("缺少 keywords 参数"))?;
    let cache_key = format!("wy:cs:{}", keyword);
    if let Some(v) = state.cache.search.get(&cache_key).await {
        state.metrics.inc("netease.cloudsearch.cache_hit");
        return Ok(Json(v));
    }
    let v = state
        .netease
        .cloudsearch(
            &keyword,
            q.limit.unwrap_or(10),
            q.type_.unwrap_or(1),
            q.cookie.as_deref(),
        )
        .await;
    if v.get("code").and_then(|x| x.as_i64()) == Some(200) {
        state.cache.search.insert(cache_key, v.clone()).await;
    }
    Ok(Json(v))
}

async fn song_url_v1(
    State(state): State<AppStateRef>,
    Query(q): Query<CommonQuery>,
) -> ApiResult<Json<Value>> {
    let id = q.id.clone().ok_or_else(|| ApiError::bad("缺少 id 参数"))?;
    if id.is_empty() {
        return Err(ApiError::bad("缺少 id 参数"));
    }
    let requested = q.level.clone().unwrap_or_else(|| "exhigh".into());
    let v = state
        .netease
        .song_url_v1(&id, &requested, q.cookie.as_deref())
        .await;
    if v.get("code").and_then(|x| x.as_i64()) == Some(200) {
        state.metrics.inc("netease.song_url.ok");
    } else {
        state.metrics.inc("netease.song_url.miss");
    }
    Ok(Json(v))
}

async fn song_detail(
    State(state): State<AppStateRef>,
    Query(q): Query<CommonQuery>,
) -> ApiResult<Json<Value>> {
    let ids = q.ids.or(q.id).ok_or_else(|| ApiError::bad("缺少 ids 参数"))?;
    if ids.is_empty() {
        return Err(ApiError::bad("缺少 ids 参数"));
    }
    Ok(Json(state.netease.song_detail(&ids, q.cookie.as_deref()).await))
}

async fn playlist_track_all(
    State(state): State<AppStateRef>,
    Query(q): Query<CommonQuery>,
) -> ApiResult<Json<Value>> {
    let id = q.id.clone().ok_or_else(|| ApiError::bad("缺少 id 参数"))?;
    if id.is_empty() {
        return Err(ApiError::bad("缺少 id 参数"));
    }
    let cache_key = format!("wy:pl:{}", id);
    if let Some(v) = state.cache.playlist.get(&cache_key).await {
        state.metrics.inc("netease.playlist.cache_hit");
        return Ok(Json(v));
    }
    let v = state.netease.playlist_track_all(&id, q.cookie.as_deref()).await;
    state.cache.playlist.insert(cache_key, v.clone()).await;
    Ok(Json(v))
}

async fn lyric(State(state): State<AppStateRef>, Query(q): Query<CommonQuery>) -> ApiResult<Json<Value>> {
    let id = q.id.clone().ok_or_else(|| ApiError::bad("缺少 id 参数"))?;
    if id.is_empty() {
        return Err(ApiError::bad("缺少 id 参数"));
    }
    let cache_key = format!("wy:lyric:{}", id);
    if let Some(v) = state.cache.lyric.get(&cache_key).await {
        state.metrics.inc("netease.lyric.cache_hit");
        return Ok(Json(v));
    }
    let v = state.netease.lyric(&id, q.cookie.as_deref()).await;
    state.cache.lyric.insert(cache_key, v.clone()).await;
    Ok(Json(v))
}

async fn qr_key(State(state): State<AppStateRef>, Query(_q): Query<CommonQuery>) -> impl IntoResponse {
    Json(state.netease.qr_key().await)
}

async fn qr_create(State(state): State<AppStateRef>, Query(q): Query<CommonQuery>) -> ApiResult<Json<Value>> {
    let key = q.key.unwrap_or_default();
    if key.is_empty() {
        return Err(ApiError::bad("缺少 key 参数"));
    }
    Ok(Json(
        state.netease.qr_create(&key, q.qrimg.as_deref() == Some("true")),
    ))
}

async fn qr_check(State(state): State<AppStateRef>, Query(q): Query<CommonQuery>) -> ApiResult<Json<Value>> {
    let key = q.key.unwrap_or_default();
    if key.is_empty() {
        return Err(ApiError::bad("缺少 key 参数"));
    }
    Ok(Json(state.netease.qr_check(&key).await))
}

async fn user_account(State(state): State<AppStateRef>, Query(q): Query<CommonQuery>) -> impl IntoResponse {
    Json(state.netease.user_account(q.cookie.as_deref()).await)
}

async fn user_playlist(
    State(state): State<AppStateRef>,
    Query(q): Query<CommonQuery>,
) -> ApiResult<Json<Value>> {
    let uid = q.uid.unwrap_or_default();
    if uid.is_empty() {
        return Err(ApiError::bad("缺少 uid 参数"));
    }
    Ok(Json(state.netease.user_playlist(&uid, q.cookie.as_deref()).await))
}
