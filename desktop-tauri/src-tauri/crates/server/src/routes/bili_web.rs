//! B 站房间号网页协议路由

use axum::{
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use ordersong_bili_web::{danmu_info, room};
use serde::Deserialize;
use serde_json::json;

use crate::state::AppStateRef;

pub fn router() -> Router<AppStateRef> {
    Router::new()
        .route("/init", get(room_init))
        .route("/danmuInfo", get(danmu_info_handler))
        .route("/myroom", get(my_room))
}

#[derive(Deserialize)]
struct RoomQuery {
    room: String,
}

async fn room_init(State(state): State<AppStateRef>, Query(q): Query<RoomQuery>) -> impl IntoResponse {
    match room::room_init(&state.http, &q.room).await {
        Ok(init) => Json(room::room_init_to_json(&init)),
        Err(msg) => Json(json!({ "code": -1, "message": msg })),
    }
}

async fn my_room(State(state): State<AppStateRef>) -> impl IntoResponse {
    let cookie = state.bili_cookie_snapshot();
    match room::my_room(&state.http, &cookie).await {
        Ok(room_id) => Json(json!({ "code": 0, "room_id": room_id })),
        Err(msg) => Json(json!({ "code": -1, "message": msg })),
    }
}

async fn danmu_info_handler(
    State(state): State<AppStateRef>,
    Query(q): Query<RoomQuery>,
) -> impl IntoResponse {
    let cookie = state.bili_cookie_snapshot();
    match danmu_info::fetch(&state.http, &cookie, &q.room).await {
        Ok(info) => Json(json!({
            "code": 0,
            "token": info.token,
            "host_list": info.host_list,
            "uid": info.uid,
            "buvid": info.buvid,
            "room_id": info.room_id,
        })),
        Err(msg) => Json(json!({ "code": -1, "message": msg })),
    }
}
