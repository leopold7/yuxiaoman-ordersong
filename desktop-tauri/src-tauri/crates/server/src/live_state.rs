//! 跨进程播放状态同步 (OBS 浏览器源用)

use axum::{extract::State, response::IntoResponse, Json};
use serde_json::{json, Value};

use crate::state::AppStateRef;

pub async fn get_state(State(state): State<AppStateRef>) -> impl IntoResponse {
    let v = state.live_state.read().map(|g| g.clone()).unwrap_or(Value::Null);
    Json(v)
}

pub async fn set_state(State(state): State<AppStateRef>, Json(body): Json<Value>) -> impl IntoResponse {
    if let Ok(mut w) = state.live_state.write() {
        *w = body;
    }
    Json(json!({ "ok": true }))
}
