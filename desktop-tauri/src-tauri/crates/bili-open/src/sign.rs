//! B 站开放平台请求头 HMAC-SHA256 签名
//!
//! 协议要求: 把固定 7 条头部 (`x-bili-*` + content-md5) 按 ASCII 顺序拼成
//! `key:value\nkey:value...`, HMAC-SHA256 (key = access_key_secret) 后
//! hex 编码塞进 `Authorization` 头

use hmac::{Hmac, Mac};
use md5::{Digest, Md5};
use rand::Rng;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{BiliOpenError, BiliOpenResult};

type HmacSha256 = Hmac<Sha256>;

fn md5_hex(s: &str) -> String {
    let mut h = Md5::new();
    h.update(s.as_bytes());
    hex::encode(h.finalize())
}

fn ts_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn nonce(ts: u64) -> u64 {
    let r = rand::thread_rng().gen_range(0..100_000_000u64);
    r + ts
}

/// 给一份 JSON body 构造完整请求头
pub fn build_headers(
    body_json: &str,
    access_key_id: &str,
    access_key_secret: &str,
) -> BiliOpenResult<HeaderMap> {
    let ts = ts_secs();
    let nonce_v = nonce(ts);
    let body_md5 = md5_hex(body_json);

    let header_pairs: Vec<(&'static str, String)> = vec![
        ("x-bili-accesskeyid", access_key_id.to_string()),
        ("x-bili-content-md5", body_md5),
        ("x-bili-signature-method", "HMAC-SHA256".into()),
        ("x-bili-signature-nonce", nonce_v.to_string()),
        ("x-bili-signature-version", "1.0".into()),
        ("x-bili-timestamp", ts.to_string()),
    ];

    let to_sign = header_pairs
        .iter()
        .map(|(k, v)| format!("{}:{}", k, v))
        .collect::<Vec<_>>()
        .join("\n");

    let mut mac = HmacSha256::new_from_slice(access_key_secret.as_bytes())
        .map_err(|e| BiliOpenError::Hmac(e.to_string()))?;
    mac.update(to_sign.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());

    let mut hm = HeaderMap::new();
    hm.insert("Accept", HeaderValue::from_static("application/json"));
    hm.insert("Content-Type", HeaderValue::from_static("application/json"));
    for (k, v) in &header_pairs {
        let name = HeaderName::from_static(k);
        let value = HeaderValue::from_str(v).map_err(|e| BiliOpenError::InvalidHeader(e.to_string()))?;
        hm.insert(name, value);
    }
    hm.insert(
        "Authorization",
        HeaderValue::from_str(&sig).map_err(|e| BiliOpenError::InvalidHeader(e.to_string()))?,
    );
    Ok(hm)
}
