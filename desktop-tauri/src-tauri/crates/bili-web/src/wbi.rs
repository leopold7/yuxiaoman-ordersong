//! WBI 签名实现 (B 站 web 端的请求参数签名)
//!
//! 流程:
//! 1. 调 `/x/web-interface/nav` 拿 img_url / sub_url, 从文件名提出 img_key / sub_key
//! 2. 把两 key 拼接后按固定置换表 (MIXIN_KEY_ENC_TAB) 抽取出 32 字节 mixin_key
//! 3. 把请求参数加上 wts 时间戳后按 key 排序, 过滤值里的 !'()* 字符
//! 4. 拼成 query 串后追加 mixin_key 做 MD5 得到 w_rid, 返回 query&w_rid=...

use md5::{Digest, Md5};
use ordersong_core::consts::{BILI_REFERER, DEFAULT_UA};
use serde_json::Value;

const MIXIN_KEY_ENC_TAB: [usize; 64] = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14,
    39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59,
    6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

fn md5_hex(s: &str) -> String {
    let mut h = Md5::new();
    h.update(s.as_bytes());
    hex::encode(h.finalize())
}

/// 调 nav 接口拿 (img_key, sub_key)
pub async fn fetch_wbi_keys(http: &reqwest::Client, cookie: &str) -> Option<(String, String)> {
    let body: Value = http
        .get("https://api.bilibili.com/x/web-interface/nav")
        .header("User-Agent", DEFAULT_UA)
        .header("Referer", BILI_REFERER)
        .header("Cookie", cookie)
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    let img = body.pointer("/data/wbi_img/img_url").and_then(|v| v.as_str())?;
    let sub = body.pointer("/data/wbi_img/sub_url").and_then(|v| v.as_str())?;
    let key_of = |u: &str| -> String {
        u.rsplit('/')
            .next()
            .and_then(|f| f.split('.').next())
            .unwrap_or("")
            .to_string()
    };
    Some((key_of(img), key_of(sub)))
}

/// 由 img_key + sub_key 推出 32 字节 mixin_key
pub fn get_mixin_key(img_key: &str, sub_key: &str) -> String {
    let orig: Vec<char> = format!("{}{}", img_key, sub_key).chars().collect();
    let mut s = String::with_capacity(32);
    for &i in MIXIN_KEY_ENC_TAB.iter() {
        if let Some(&c) = orig.get(i) {
            s.push(c);
        }
    }
    s.chars().take(32).collect()
}

/// 简化版 percent-encoding -- 仅保留 unreserved 字符, 其余字节走 %XX
fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// 给一组参数添加 wts 与 w_rid 签名, 返回拼好的 query 串 (不含前导 ?)
pub fn sign(mut params: Vec<(String, String)>, mixin_key: &str) -> String {
    let wts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    params.push(("wts".into(), wts.to_string()));
    params.sort_by(|a, b| a.0.cmp(&b.0));

    let filtered: Vec<(String, String)> = params
        .into_iter()
        .map(|(k, v)| {
            let v: String = v.chars().filter(|c| !"!'()*".contains(*c)).collect();
            (k, v)
        })
        .collect();

    let query = filtered
        .iter()
        .map(|(k, v)| format!("{}={}", url_encode(k), url_encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    let w_rid = md5_hex(&format!("{}{}", query, mixin_key));
    format!("{}&w_rid={}", query, w_rid)
}
