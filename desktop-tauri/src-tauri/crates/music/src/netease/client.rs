//! 网易云音乐 HTTP 客户端
//!
//! 仅暴露与原 server/netease.rs 行为一致的
//! 异步函数; 缓存与路由由上层 ordersong-server 负责

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use ordersong_core::consts::NETEASE_REFERER;
use serde_json::{json, Value};

use super::weapi;

const WEB_BASE: &str = "https://music.163.com";

/// 网易云客户端 -- 持有 reqwest::Client 的共享句柄
#[derive(Clone)]
pub struct NeteaseClient {
    http: reqwest::Client,
}

impl NeteaseClient {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }

    /// 解析 cookie 串, 补全 weapi 所需的默认字段
    fn parse_and_fill_cookie(cookie: Option<&str>) -> HashMap<String, String> {
        let mut map: HashMap<String, String> = HashMap::new();
        if let Some(c) = cookie {
            for kv in c.split(';').map(str::trim).filter(|s| !s.is_empty()) {
                if let Some((k, v)) = kv.split_once('=') {
                    map.insert(k.trim().to_string(), v.trim().to_string());
                }
            }
        }
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let buildver = (now_ms / 1000).to_string();
        map.entry("appver".into()).or_insert_with(|| "8.10.10".into());
        map.entry("versioncode".into()).or_insert_with(|| "140".into());
        map.entry("buildver".into()).or_insert(buildver);
        map.entry("resolution".into())
            .or_insert_with(|| "1920x1080".into());
        map.entry("os".into()).or_insert_with(|| "pc".into());
        map.entry("channel".into()).or_default();
        map.entry("__csrf".into()).or_default();
        map
    }

    fn cookie_to_string(map: &HashMap<String, String>) -> String {
        map.iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("; ")
    }

    /// 通用 weapi POST
    pub async fn weapi_post(
        &self,
        web_path: &str,
        mut params: Value,
        cookie: Option<&str>,
    ) -> Result<Value, String> {
        let cookie_map = Self::parse_and_fill_cookie(cookie);
        let csrf_token = cookie_map.get("__csrf").cloned().unwrap_or_default();

        if let Some(obj) = params.as_object_mut() {
            obj.insert("csrf_token".to_string(), json!(csrf_token));
        }
        let params_str = serde_json::to_string(&params).map_err(|e| e.to_string())?;
        let (params_enc, enc_sec_key) = weapi::encrypt(&params_str);
        let form = [
            ("params", params_enc.as_str()),
            ("encSecKey", enc_sec_key.as_str()),
        ];

        let cookie_str = Self::cookie_to_string(&cookie_map);
        let url = format!("{}/weapi/{}", WEB_BASE, web_path.trim_start_matches('/'));

        let resp = self
            .http
            .post(&url)
            .header("Referer", NETEASE_REFERER)
            .header("Origin", NETEASE_REFERER)
            .header("Cookie", &cookie_str)
            .form(&form)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        let v: Value = serde_json::from_str(&text).unwrap_or_else(|e| {
            eprintln!(
                "[netease] {} 响应解析失败：{}（status={}，body 前 200 字：{}）",
                web_path,
                e,
                status,
                text.chars().take(200).collect::<String>()
            );
            json!({ "code": -1, "message": format!("解析失败：{e}"), "raw": text })
        });
        let code = v.get("code").and_then(|c| c.as_i64()).unwrap_or(200);
        if code != 200 {
            eprintln!(
                "[netease] {} code={} body 前 200 字：{}",
                web_path,
                code,
                text.chars().take(200).collect::<String>()
            );
        }
        Ok(v)
    }

    /// 云搜索 (cloudsearch)
    pub async fn cloudsearch(&self, keyword: &str, limit: u32, type_: u32, cookie: Option<&str>) -> Value {
        let params = json!({
            "s": keyword,
            "type": type_,
            "limit": limit,
            "offset": 0,
            "total": true,
        });
        match self.weapi_post("cloudsearch/get/web", params, cookie).await {
            Ok(v) => v,
            Err(e) => json!({ "code": -1, "message": e }),
        }
    }

    /// 取歌曲播放 URL (自动按音质链路降级)
    pub async fn song_url_v1(&self, id: &str, requested: &str, cookie: Option<&str>) -> Value {
        let ids_arr = match id.parse::<i64>() {
            Ok(n) => format!("[{}]", n),
            Err(_) => format!("[\"{}\"]", id),
        };
        let mut last_response: Option<Value> = None;
        for lvl in level_chain(requested) {
            let params = json!({
                "ids": ids_arr,
                "level": lvl,
                "encodeType": "flac"
            });
            let resp = match self
                .weapi_post("song/enhance/player/url/v1", params, cookie)
                .await
            {
                Ok(v) => v,
                Err(e) => return json!({ "code": -1, "message": e }),
            };
            let entry = resp.get("data").and_then(|d| d.get(0));
            let url = entry
                .and_then(|d| d.get("url"))
                .and_then(|u| u.as_str())
                .unwrap_or("");
            let is_preview = entry
                .and_then(|d| d.get("freeTrialInfo"))
                .map(|v| !v.is_null())
                .unwrap_or(false);
            if !url.is_empty() && !is_preview {
                return resp;
            }
            last_response = Some(resp);
        }
        last_response.unwrap_or_else(|| json!({ "code": -1, "data": [] }))
    }

    /// 取歌曲详情 (含封面)
    pub async fn song_detail(&self, ids: &str, cookie: Option<&str>) -> Value {
        let id_list: Vec<String> = ids
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let c_json: Vec<Value> = id_list.iter().map(|s| json!({ "id": s })).collect();
        let c_str = serde_json::to_string(&c_json).unwrap_or_else(|_| "[]".into());
        let ids_str = serde_json::to_string(&id_list).unwrap_or_else(|_| "[]".into());
        let params = json!({ "c": c_str, "ids": ids_str });
        self.weapi_post("v3/song/detail", params, cookie)
            .await
            .unwrap_or_else(|e| json!({ "code": -1, "message": e }))
    }

    /// 取歌单全部歌曲
    pub async fn playlist_track_all(&self, id: &str, cookie: Option<&str>) -> Value {
        let params = json!({ "id": id, "n": 100000, "s": 8 });
        match self.weapi_post("v6/playlist/detail", params, cookie).await {
            Ok(v) => {
                let songs = v
                    .get("playlist")
                    .and_then(|p| p.get("tracks"))
                    .cloned()
                    .unwrap_or(Value::Null);
                let priv_ = v.get("privileges").cloned().unwrap_or(Value::Null);
                json!({ "code": 200, "songs": songs, "privileges": priv_ })
            }
            Err(e) => json!({ "code": -1, "message": e }),
        }
    }

    /// 取歌词
    pub async fn lyric(&self, id: &str, cookie: Option<&str>) -> Value {
        let params = json!({ "id": id, "lv": -1, "kv": -1, "tv": -1 });
        self.weapi_post("song/lyric", params, cookie)
            .await
            .unwrap_or_else(|e| json!({ "code": -1, "message": e }))
    }

    /// 二维码登录: 生成 unikey
    pub async fn qr_key(&self) -> Value {
        let params = json!({ "type": 1 });
        match self.weapi_post("login/qrcode/unikey", params, None).await {
            Ok(v) => {
                let unikey = v.get("unikey").cloned().unwrap_or(Value::Null);
                json!({ "code": 200, "data": { "unikey": unikey } })
            }
            Err(e) => json!({ "code": -1, "message": e }),
        }
    }

    /// 拼出二维码图片 URL
    pub fn qr_create(&self, key: &str, want_img: bool) -> Value {
        let qrurl = format!("https://music.163.com/login?codekey={}", key);
        if want_img {
            json!({ "code": 200, "data": { "qrurl": qrurl, "qrimg": qrurl } })
        } else {
            json!({ "code": 200, "data": { "qrurl": qrurl } })
        }
    }

    /// 轮询二维码登录状态. 成功后会从 Set-Cookie 头提取 cookie 串拼回响应.
    pub async fn qr_check(&self, key: &str) -> Value {
        let params = json!({ "key": key, "type": 1 });
        let params_str = serde_json::to_string(&params).unwrap_or_default();
        let (params_enc, enc_sec_key) = weapi::encrypt(&params_str);
        let form = [
            ("params", params_enc.as_str()),
            ("encSecKey", enc_sec_key.as_str()),
        ];
        let url = format!("{}/weapi/login/qrcode/client/login", WEB_BASE);
        let resp = self
            .http
            .post(&url)
            .header("Referer", NETEASE_REFERER)
            .form(&form)
            .send()
            .await;
        match resp {
            Ok(r) => {
                let cookies: Vec<String> = r
                    .headers()
                    .get_all("set-cookie")
                    .iter()
                    .filter_map(|v| v.to_str().ok().map(String::from))
                    .collect();
                let cookie_str = cookies
                    .iter()
                    .filter_map(|c| c.split(';').next())
                    .collect::<Vec<_>>()
                    .join("; ");
                let body: Value = r.json().await.unwrap_or_else(|_| json!({}));
                let mut out = body;
                if !cookie_str.is_empty() {
                    out["cookie"] = json!(cookie_str);
                }
                out
            }
            Err(e) => json!({ "code": -1, "message": e.to_string() }),
        }
    }

    /// 取用户歌单 (含我喜欢首条)
    pub async fn user_playlist(&self, uid: &str, cookie: Option<&str>) -> Value {
        let params = json!({ "uid": uid, "limit": 30, "offset": 0, "includeVideo": false });
        self.weapi_post("user/playlist", params, cookie)
            .await
            .unwrap_or_else(|e| json!({ "code": -1, "message": e }))
    }

    /// 用户账号信息 (注意: 该接口不走 weapi, 而是直接 GET api)
    pub async fn user_account(&self, cookie: Option<&str>) -> Value {
        let url = format!("{}/api/nuser/account/get", WEB_BASE);
        let mut req = self.http.get(&url).header("Referer", NETEASE_REFERER);
        if let Some(c) = cookie.filter(|s| !s.is_empty()) {
            req = req.header("Cookie", c);
        }
        match req.send().await {
            Ok(r) => r
                .json::<Value>()
                .await
                .unwrap_or_else(|e| json!({ "code": -1, "message": e.to_string() })),
            Err(e) => json!({ "code": -1, "message": e.to_string() }),
        }
    }
}

/// 音质档降级链. 请求 hires 但账号无 VIP 时自动降到 320k 而非 30 s 试听
fn level_chain(requested: &str) -> &'static [&'static str] {
    match requested {
        "hires" => &[
            "hires", "jyeffect", "sky", "jymaster", "lossless", "exhigh", "higher", "standard",
        ],
        "jymaster" => &["jymaster", "lossless", "exhigh", "higher", "standard"],
        "sky" => &["sky", "lossless", "exhigh", "higher", "standard"],
        "jyeffect" => &["jyeffect", "lossless", "exhigh", "higher", "standard"],
        "lossless" => &["lossless", "exhigh", "higher", "standard"],
        "exhigh" => &["exhigh", "higher", "standard"],
        "higher" => &["higher", "standard"],
        _ => &["standard"],
    }
}
