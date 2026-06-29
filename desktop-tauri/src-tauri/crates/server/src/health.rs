//! 健康检查 + 指标 endpoint

use axum::{extract::State, response::IntoResponse, routing::get, Json, Router};
use serde_json::json;

use crate::state::AppStateRef;

pub fn router() -> Router<AppStateRef> {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/api/metrics", get(metrics))
}

async fn healthz(State(_s): State<AppStateRef>) -> impl IntoResponse {
    Json(json!({ "ok": true, "backend": "rust-axum" }))
}

async fn metrics(State(s): State<AppStateRef>) -> impl IntoResponse {
    Json(s.metrics.snapshot())
}
