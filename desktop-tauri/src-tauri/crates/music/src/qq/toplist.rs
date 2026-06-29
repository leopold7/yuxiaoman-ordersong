//! 通用响应工具: QQ 接口返回的歌曲对象有多种字段名 (albummid / album.mid / albumMid 等) ,
//! 提取封面所需的 albummid 时统一走这里

use serde_json::Value;

/// 从 QQ 歌曲对象中尽量抠出 albummid, 找不到则返回 None
pub fn extract_albummid(s: &Value) -> Option<String> {
    if let Some(m) = s.pointer("/album/mid").and_then(|v| v.as_str()) {
        if !m.is_empty() {
            return Some(m.to_string());
        }
    }
    for key in ["albummid", "albumMid", "album_mid"] {
        if let Some(m) = s.get(key).and_then(|v| v.as_str()) {
            if !m.is_empty() {
                return Some(m.to_string());
            }
        }
    }
    None
}

/// 把一条 QQ 原始歌曲对象转成前端约定的精简 JSON
pub fn normalize_song(s: &Value) -> Option<Value> {
    let mid = s
        .get("mid")
        .or_else(|| s.get("songmid"))
        .and_then(|v| v.as_str())?;
    let name = s
        .get("name")
        .or_else(|| s.get("songname"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let singer = s
        .get("singer")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.get("name").and_then(|v| v.as_str()))
                .map(|n| serde_json::json!({ "name": n }))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let interval = s.get("interval").and_then(|v| v.as_u64()).unwrap_or(0);
    let albummid = extract_albummid(s).unwrap_or_default();
    Some(serde_json::json!({
        "songmid": mid,
        "songname": name,
        "singer": singer,
        "interval": interval,
        "albummid": albummid
    }))
}
