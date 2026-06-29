//! 用 cookie 反查登录用户基本信息

use ordersong_core::consts::{BILI_REFERER, DEFAULT_UA};
use serde::Serialize;
use serde_json::Value;

/// `/nav` 接口返回的登录用户信息
#[derive(Debug, Default, Clone, Serialize)]
pub struct WhoAmI {
    pub logged: bool,
    pub mid: i64,
    pub uname: String,
    pub avatar: String,
}

/// 调 `/nav` 接口查询登录态
pub async fn whoami(http: &reqwest::Client, cookie: &str) -> WhoAmI {
    if cookie.is_empty() {
        return WhoAmI::default();
    }
    let body: Value = match http
        .get("https://api.bilibili.com/x/web-interface/nav")
        .header("User-Agent", DEFAULT_UA)
        .header("Referer", BILI_REFERER)
        .header("Cookie", cookie)
        .send()
        .await
    {
        Ok(r) => r.json().await.unwrap_or(Value::Null),
        Err(_) => return WhoAmI::default(),
    };
    WhoAmI {
        logged: body
            .pointer("/data/isLogin")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        mid: body.pointer("/data/mid").and_then(|v| v.as_i64()).unwrap_or(0),
        uname: body
            .pointer("/data/uname")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        avatar: body
            .pointer("/data/face")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    }
}
