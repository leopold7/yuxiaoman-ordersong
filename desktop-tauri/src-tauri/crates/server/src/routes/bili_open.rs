//! B站开放平台HTTP 代理

use std::time::Instant;

use axum::{
    extract::State,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::Value;

use crate::error::{ApiError, ApiResult};
use crate::state::AppStateRef;

pub fn router() -> Router<AppStateRef> {
    Router::new()
        .route("/", get(|| async { "B 站开放平台 API 服务运行中" }))
        .route("/gameStart", post(game_start))
        .route("/gameEnd", post(game_end))
        .route("/gameHeartBeat", post(game_heartbeat))
        .route("/gameBatchHeartBeat", post(game_batch_heartbeat))
}

async fn proxy(state: &AppStateRef, path: &str, body: Value) -> Value {
    let start = Instant::now();
    let v = state.bili_open.call(path, body).await;
    state.metrics.observe(
        &format!("bili{}.ms", path.replace('/', ".")),
        start.elapsed().as_millis() as f64,
    );
    if v.get("code").and_then(|c| c.as_i64()).unwrap_or(-1) == 0 {
        state.metrics.inc("bili.ok");
    } else {
        state.metrics.inc("bili.err");
    }
    v
}

async fn game_start(State(state): State<AppStateRef>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let body = state
        .bili_open
        .ensure_app_id(body)
        .map_err(|m| ApiError::bad(m.to_string()))?;
    Ok(Json(proxy(&state, "/v2/app/start", body).await))
}

async fn game_end(State(state): State<AppStateRef>, Json(body): Json<Value>) -> impl IntoResponse {
    let body = state.bili_open.ensure_app_id(body.clone()).unwrap_or(body);
    Json(proxy(&state, "/v2/app/end", body).await)
}

async fn game_heartbeat(State(state): State<AppStateRef>, Json(body): Json<Value>) -> impl IntoResponse {
    Json(proxy(&state, "/v2/app/heartbeat", body).await)
}

async fn game_batch_heartbeat(
    State(state): State<AppStateRef>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    Json(proxy(&state, "/v2/app/batchHeartbeat", body).await)
}
