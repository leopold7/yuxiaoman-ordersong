//! 房间号相关接口: 短号转真实号, 主播自己的房间号查询

use ordersong_core::consts::{BILI_LIVE_CENTER_REFERER, DEFAULT_UA};
use serde_json::{json, Value};

/// `/init` 的响应载荷
#[derive(Debug, Clone)]
pub struct RoomInit {
    pub real_id: i64,
    pub owner_uid: i64,
    pub live_status: i64,
    pub title: String,
}

/// 把任意房间号 (短号 / 真实号) 转换为 RoomInit
///
/// 内部会调两个 B 站接口: room_init 拿 real_id / uid, get_info 拿标题 (best-effort)
pub async fn room_init(http: &reqwest::Client, raw_id: &str) -> Result<RoomInit, String> {
    let id = raw_id.trim();
    if id.is_empty() {
        return Err("房间号为空".into());
    }

    let init: Value = match http
        .get("https://api.live.bilibili.com/room/v1/Room/room_init")
        .query(&[("id", id)])
        .header("User-Agent", DEFAULT_UA)
        .header("Referer", "https://live.bilibili.com/")
        .send()
        .await
    {
        Ok(r) => r.json().await.unwrap_or(Value::Null),
        Err(e) => return Err(format!("请求失败：{e}")),
    };
    if init.get("code").and_then(|v| v.as_i64()).unwrap_or(-1) != 0 {
        let msg = init
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("房间不存在");
        return Err(msg.to_string());
    }
    let real_id = init
        .pointer("/data/room_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let owner_uid = init.pointer("/data/uid").and_then(|v| v.as_i64()).unwrap_or(0);
    let live_status = init
        .pointer("/data/live_status")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let title = match http
        .get("https://api.live.bilibili.com/room/v1/Room/get_info")
        .query(&[("room_id", real_id.to_string().as_str())])
        .header("User-Agent", DEFAULT_UA)
        .send()
        .await
    {
        Ok(r) => r
            .json::<Value>()
            .await
            .ok()
            .and_then(|v| {
                v.pointer("/data/title")
                    .and_then(|t| t.as_str())
                    .map(String::from)
            })
            .unwrap_or_default(),
        Err(_) => String::new(),
    };

    Ok(RoomInit {
        real_id,
        owner_uid,
        live_status,
        title,
    })
}

/// 用已登录 cookie 查询主播自己的直播间房间号
pub async fn my_room(http: &reqwest::Client, cookie: &str) -> Result<i64, String> {
    if cookie.is_empty() {
        return Err("未登录 B 站，请先扫码登录".into());
    }
    let body: Value = match http
        .get("https://api.live.bilibili.com/xlive/web-ucenter/user/live_info")
        .header("User-Agent", DEFAULT_UA)
        .header("Referer", BILI_LIVE_CENTER_REFERER)
        .header("Cookie", cookie)
        .send()
        .await
    {
        Ok(r) => r.json().await.unwrap_or(Value::Null),
        Err(e) => return Err(format!("请求失败：{e}")),
    };
    if body.get("code").and_then(|v| v.as_i64()).unwrap_or(-1) != 0 {
        let msg = body.get("message").and_then(|v| v.as_str()).unwrap_or("获取失败");
        return Err(msg.to_string());
    }
    let room_id = body
        .pointer("/data/room_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    if room_id <= 0 {
        return Err("你的账号还没有直播间（room_id=0）".into());
    }
    Ok(room_id)
}

/// 工具: 把 cookie 串里指定字段的值取出来
pub fn cookie_value(cookie: &str, name: &str) -> String {
    for kv in cookie.split(';') {
        if let Some((k, v)) = kv.trim().split_once('=') {
            if k.eq_ignore_ascii_case(name) {
                return v.trim().to_string();
            }
        }
    }
    String::new()
}

/// 用 cookie_value 等便利函数把房间初始化结果序列化成前端约定的 JSON
pub fn room_init_to_json(init: &RoomInit) -> Value {
    json!({
        "code": 0,
        "room_id": init.real_id,
        "owner_uid": init.owner_uid,
        "live_status": init.live_status,
        "title": init.title,
    })
}
