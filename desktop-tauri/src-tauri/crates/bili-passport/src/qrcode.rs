//! 扫码登录二维码生成 + 状态轮询

use ordersong_core::consts::{BILI_REFERER, DEFAULT_UA};
use serde_json::Value;

/// 二维码生成结果 (url 给前端渲染, qrcode_key 用于轮询)
#[derive(Debug, Clone)]
pub struct QrCode {
    pub url: String,
    pub qrcode_key: String,
}

/// 调 B 站 passport 接口生成扫码登录二维码
pub async fn generate(http: &reqwest::Client) -> Result<QrCode, String> {
    let resp = http
        .get("https://passport.bilibili.com/x/passport-login/web/qrcode/generate")
        .header("User-Agent", DEFAULT_UA)
        .header("Referer", BILI_REFERER)
        .send()
        .await
        .map_err(|e| format!("请求失败：{e}"))?;
    let v: Value = resp.json().await.map_err(|e| format!("解析失败：{e}"))?;
    let url = v
        .pointer("/data/url")
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string();
    let key = v
        .pointer("/data/qrcode_key")
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string();
    if url.is_empty() || key.is_empty() {
        return Err("B 站二维码接口返回字段缺失".into());
    }
    Ok(QrCode { url, qrcode_key: key })
}

/// 轮询登录状态返回
pub struct PollResult {
    /// 0=成功 86038=失效 86090=已扫待确认 86101=未扫描 -1=网络错
    pub code: i64,
    pub message: String,
    /// 登录成功时, 从 Set-Cookie 头拼出来的 cookie 串
    pub cookie: Option<String>,
}

/// 轮询一次登录状态
pub async fn poll(http: &reqwest::Client, qrcode_key: &str) -> Result<PollResult, String> {
    let resp = http
        .get("https://passport.bilibili.com/x/passport-login/web/qrcode/poll")
        .query(&[("qrcode_key", qrcode_key)])
        .header("User-Agent", DEFAULT_UA)
        .header("Referer", BILI_REFERER)
        .send()
        .await
        .map_err(|e| format!("请求失败：{e}"))?;

    let set_cookies: Vec<String> = resp
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok().map(String::from))
        .collect();

    let body: Value = resp.json().await.unwrap_or(Value::Null);
    let code = body.pointer("/data/code").and_then(|v| v.as_i64()).unwrap_or(-1);
    let msg = body
        .pointer("/data/message")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let cookie = if code == 0 && !set_cookies.is_empty() {
        let s = set_cookies
            .iter()
            .filter_map(|sc| sc.split(';').next().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty() && s.contains('='))
            .collect::<Vec<_>>()
            .join("; ");
        Some(s)
    } else {
        None
    };

    Ok(PollResult {
        code,
        message: msg,
        cookie,
    })
}
