//! B 站扫码登录路由

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use ordersong_bili_passport::{qrcode, whoami};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::{ApiError, ApiResult};
use crate::state::AppStateRef;

pub fn router() -> Router<AppStateRef> {
    Router::new()
        .route("/qrcode", get(qrcode_generate))
        .route("/poll", get(qrcode_poll))
        .route("/setCookie", post(set_cookie_manual))
        .route("/whoami", get(whoami_handler))
        .route("/logout", post(logout))
}

async fn qrcode_generate(State(state): State<AppStateRef>) -> impl IntoResponse {
    match qrcode::generate(&state.http).await {
        Ok(qr) => Json(json!({ "code": 0, "url": qr.url, "qrcode_key": qr.qrcode_key })),
        Err(msg) => Json(json!({ "code": -1, "message": msg })),
    }
}

#[derive(Deserialize)]
struct PollQuery {
    qrcode_key: String,
}

async fn qrcode_poll(State(state): State<AppStateRef>, Query(q): Query<PollQuery>) -> impl IntoResponse {
    match qrcode::poll(&state.http, &q.qrcode_key).await {
        Ok(r) => {
            if let Some(cookie) = r.cookie {
                if let Ok(mut w) = state.bili_cookie.write() {
                    *w = cookie.clone();
                }
                Json(json!({ "code": 0, "message": "登录成功", "cookie": cookie }))
            } else {
                Json(json!({ "code": r.code, "message": r.message }))
            }
        }
        Err(msg) => Json(json!({ "code": -1, "message": msg })),
    }
}

#[derive(Deserialize)]
struct SetCookieBody {
    cookie: Option<String>,
}

async fn set_cookie_manual(
    State(state): State<AppStateRef>,
    Json(b): Json<SetCookieBody>,
) -> ApiResult<Json<Value>> {
    let c = b.cookie.unwrap_or_default();
    let mut w = state
        .bili_cookie
        .write()
        .map_err(|_| ApiError::internal("B 站 cookie 写锁中毒"))?;
    *w = c;
    Ok(Json(json!({ "code": 0 })))
}

async fn logout(State(state): State<AppStateRef>) -> impl IntoResponse {
    if let Ok(mut w) = state.bili_cookie.write() {
        w.clear();
    }
    Json(json!({ "code": 0 }))
}

async fn whoami_handler(State(state): State<AppStateRef>) -> impl IntoResponse {
    let cookie = state.bili_cookie_snapshot();
    let info = whoami::whoami(&state.http, &cookie).await;
    Json(json!({
        "logged": info.logged,
        "mid": info.mid,
        "uname": info.uname,
        "avatar": info.avatar,
    }))
}
