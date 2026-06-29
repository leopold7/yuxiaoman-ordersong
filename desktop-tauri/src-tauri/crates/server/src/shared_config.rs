//! 跨客户端共享配置 (登录 cookie / 身份码 / 各项设置 / 黑名单历史)
//!

use std::path::PathBuf;

use axum::{extract::State, response::IntoResponse, Json};
use serde_json::{json, Map, Value};

use crate::error::{ApiError, ApiResult};
use crate::state::AppStateRef;

/// 持久化文件路径
pub fn shared_config_path() -> PathBuf {
    ordersong_core::paths::data_path("shared-config.json")
}

/// 启动时从磁盘加载 (不存在 / 解析失败都回退成空对象)
pub fn load_from_disk() -> Value {
    let p = shared_config_path();
    match std::fs::read_to_string(&p) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| json!({})),
        Err(_) => json!({}),
    }
}

fn persist(v: &Value) {
    let p = shared_config_path();
    if let Ok(s) = serde_json::to_string(v) {
        if let Err(e) = std::fs::write(&p, s) {
            eprintln!("[shared-config] 落盘失败 {}：{e}", p.display());
        }
    }
}

/// GET `/app-config` - 返回完整共享配置
pub async fn get_config(State(state): State<AppStateRef>) -> impl IntoResponse {
    let v = state
        .shared_config
        .read()
        .map(|g| g.clone())
        .unwrap_or_else(|_| json!({}));
    Json(v)
}

/// POST `/app-config` - 浅合并 body (value 为 null 表示删除该 key)
pub async fn set_config(State(state): State<AppStateRef>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let patch = body
        .as_object()
        .cloned()
        .ok_or_else(|| ApiError::bad("请求体必须是对象"))?;

    let snapshot = {
        let mut w = state
            .shared_config
            .write()
            .map_err(|_| ApiError::internal("共享配置写锁中毒"))?;
        if !w.is_object() {
            *w = Value::Object(Map::new());
        }
        if let Some(map) = w.as_object_mut() {
            for (k, val) in patch {
                if val.is_null() {
                    map.remove(&k);
                } else {
                    map.insert(k, val);
                }
            }
        }
        w.clone()
    };
    persist(&snapshot);
    Ok(Json(json!({ "ok": true })))
}
