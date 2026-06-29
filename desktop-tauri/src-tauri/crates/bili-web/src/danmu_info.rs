//! 弹幕服务器地址 + token 查询
//!
//! 依次尝试两个 endpoint, 任意一个拿到 `token + host` 列表即返回:
//! 1. 新接口 `getDanmInfo` (需要 WBI 签名)
//! 2. 老接口 getConf (无需 WBI, 最稳)

use ordersong_core::consts::DEFAULT_UA;
use serde_json::Value;

use crate::room::cookie_value;
use crate::wbi;

/// 查询结果
#[derive(Debug, Clone)]
pub struct DanmuInfo {
    pub token: String,
    pub host_list: Vec<Value>,
    pub uid: i64,
    pub buvid: String,
    pub room_id: i64,
}

/// 拉一次弹幕服务器信息, 失败返回 Err(diagnostics) 给上层做提示
pub async fn fetch(http: &reqwest::Client, cookie: &str, real_id: &str) -> Result<DanmuInfo, String> {
    let id = real_id.trim();
    if id.is_empty() {
        return Err("房间号为空".into());
    }

    let uid: i64 = cookie_value(cookie, "DedeUserID").parse().unwrap_or(0);
    let mut buvid = cookie_value(cookie, "buvid3");

    // 缺 buvid3 时申请一个, 避免某些情况下被踢连接
    if buvid.is_empty() {
        if let Ok(r) = http
            .get("https://api.bilibili.com/x/frontend/finger/spi")
            .header("User-Agent", DEFAULT_UA)
            .send()
            .await
        {
            if let Ok(v) = r.json::<Value>().await {
                buvid = v
                    .pointer("/data/b_3")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
            }
        }
    }

    let referer = format!("https://live.bilibili.com/{}", id);
    let mut diags: Vec<String> = Vec::new();

    // 尝试 1: getDanmInfo + WBI 签名
    let wbi_ok;
    let signed_query = match wbi::fetch_wbi_keys(http, cookie).await {
        Some((img, sub)) => {
            wbi_ok = true;
            let mixin = wbi::get_mixin_key(&img, &sub);
            wbi::sign(
                vec![
                    ("id".into(), id.to_string()),
                    ("type".into(), "0".into()),
                    ("web_location".into(), "444.8".into()),
                ],
                &mixin,
            )
        }
        None => {
            wbi_ok = false;
            format!("id={}&type=0", id)
        }
    };
    let url_a = format!(
        "https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmInfo?{}",
        signed_query
    );
    if let Some((token, hosts)) = try_endpoint(http, &url_a, cookie, &referer).await {
        return Ok(DanmuInfo {
            token,
            host_list: hosts,
            uid,
            buvid,
            room_id: id.parse::<i64>().unwrap_or(0),
        });
    }
    diags.push(format!("getDanmInfo(wbi={}) 失败", wbi_ok));

    // 尝试 2: 老接口 getConf (不需要 WBI)
    let url_b = format!(
        "https://api.live.bilibili.com/room/v1/Danmu/getConf?room_id={}&platform=pc&player=web",
        id
    );
    if let Some((token, hosts)) = try_endpoint(http, &url_b, cookie, &referer).await {
        return Ok(DanmuInfo {
            token,
            host_list: hosts,
            uid,
            buvid,
            room_id: id.parse::<i64>().unwrap_or(0),
        });
    }
    diags.push("getConf 失败".into());

    Err(format!("弹幕服务器信息获取失败（{}）", diags.join(" / ")))
}

async fn try_endpoint(
    http: &reqwest::Client,
    url: &str,
    cookie: &str,
    referer: &str,
) -> Option<(String, Vec<Value>)> {
    let mut req = http
        .get(url)
        .header("User-Agent", DEFAULT_UA)
        .header("Referer", referer.to_string());
    if !cookie.is_empty() {
        req = req.header("Cookie", cookie);
    }
    let text = match req.send().await {
        Ok(r) => r.text().await.unwrap_or_default(),
        Err(e) => {
            eprintln!("[bili-web] {} 请求失败：{}", url, e);
            return None;
        }
    };
    let body: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    if body.is_null() {
        let snip: String = text.chars().take(80).collect();
        eprintln!("[bili-web] {} 解析失败：{}", url, snip);
        return None;
    }
    if body.get("code").and_then(|v| v.as_i64()).unwrap_or(-1) != 0 {
        eprintln!(
            "[bili-web] {} code={:?} msg={:?}",
            url,
            body.get("code"),
            body.get("message").and_then(|v| v.as_str())
        );
        return None;
    }
    let token = body
        .pointer("/data/token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let hosts: Vec<Value> = body
        .pointer("/data/host_list")
        .or_else(|| body.pointer("/data/host_server_list"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if token.is_empty() || hosts.is_empty() {
        eprintln!("[bili-web] {} 缺 token / host", url);
        return None;
    }
    Some((token, hosts))
}
