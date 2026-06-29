//! QQ 音乐 HTTP 客户端 -- 直接调用 c.y.qq.com / u.y.qq.com

use ordersong_core::consts::{QQ_GUID, QQ_REFERER};
use serde_json::{json, Value};

use super::toplist::{extract_albummid, normalize_song};

#[derive(Clone)]
pub struct QqClient {
    http: reqwest::Client,
}

impl QqClient {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }

    /// 热门排行榜 (topid=4 = 热歌榜) . 公开数据, 不需要登录
    pub async fn toplist(&self, topid: i64, num: i64) -> Value {
        let payload = json!({
            "req_1": {
                "module": "musicToplist.ToplistInfoServer",
                "method": "GetDetail",
                "param": { "topId": topid, "offset": 0, "num": num, "period": "" }
            },
            "comm": { "ct": 24, "cv": 0, "format": "json" }
        });
        let data_str = serde_json::to_string(&payload).unwrap_or_default();
        let body: Value = match self
            .http
            .get("https://u.y.qq.com/cgi-bin/musicu.fcg")
            .query(&[("format", "json"), ("data", data_str.as_str())])
            .header("Referer", QQ_REFERER)
            .header("Origin", "https://y.qq.com")
            .send()
            .await
        {
            Ok(r) => r.json().await.unwrap_or(Value::Null),
            Err(_) => Value::Null,
        };
        let raw = body
            .pointer("/req_1/data/songInfoList")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let list: Vec<Value> = raw.iter().filter_map(normalize_song).collect();
        json!({ "data": { "list": list } })
    }

    /// 关键词搜索. cookie 仅用于带登录态调 musicu.fcg; 不需要时传 ""
    pub async fn search(&self, kw: &str, page_size: u32, page_no: u32, cookie: &str) -> Value {
        if kw.trim().is_empty() {
            return json!({ "data": { "list": [] } });
        }
        let n = page_size as i64;
        let p = page_no as i64;

        // 优先 musicu.fcg
        let payload = json!({
            "req_1": {
                "module": "music.search.SearchCgiService",
                "method": "DoSearchForQQMusicDesktop",
                "param": {
                    "remoteplace": "txt.mqq.all",
                    "search_type": 0,
                    "query": kw,
                    "page_num": p,
                    "num_per_page": n,
                    "grp": 1
                }
            },
            "comm": { "ct": 24, "cv": 0, "format": "json" }
        });
        let data_str = serde_json::to_string(&payload).unwrap_or_default();
        let mut req = self
            .http
            .get("https://u.y.qq.com/cgi-bin/musicu.fcg")
            .query(&[("format", "json"), ("data", data_str.as_str())])
            .header("Referer", QQ_REFERER)
            .header("Origin", "https://y.qq.com");
        if !cookie.is_empty() {
            req = req.header("Cookie", cookie);
        }
        let mut list: Vec<Value> = match req.send().await {
            Ok(r) => match r.json::<Value>().await {
                Ok(b) => parse_search_list(&b),
                Err(_) => Vec::new(),
            },
            Err(_) => Vec::new(),
        };

        // 兜底: musicu 返回空再走老 client_search_cp
        if list.is_empty() {
            let n_str = n.to_string();
            let p_str = p.to_string();
            if let Ok(r) = self
                .http
                .get("https://c.y.qq.com/soso/fcgi-bin/client_search_cp")
                .query(&[
                    ("format", "json"),
                    ("p", p_str.as_str()),
                    ("n", n_str.as_str()),
                    ("w", kw),
                    ("aggr", "1"),
                    ("cr", "1"),
                    ("lossless", "0"),
                    ("new_json", "1"),
                ])
                .header("Referer", QQ_REFERER)
                .send()
                .await
            {
                if let Ok(body) = r.json::<Value>().await {
                    list = parse_search_list(&body);
                }
            }
        }
        json!({ "data": { "list": list } })
    }

    /// 取流: 按音质链路尝试, 命中返回 {"result":100,"data":url,"level":<人话>}
    pub async fn song_url(&self, mid: &str, level: &str, cookie: &str) -> Value {
        if mid.is_empty() {
            return json!({ "result": -1, "data": "" });
        }
        let uin = parse_qq_uin(cookie);
        let g_tk = qq_gtk(cookie);

        for (prefix, ext) in filename_chain(level) {
            let filename = format!("{}{}{}.{}", prefix, mid, mid, ext);
            if let Some(url) = self.try_vkey(mid, Some(&filename), &uin, cookie, g_tk).await {
                return json!({
                    "result": 100,
                    "data": url,
                    "level": describe_quality(prefix, ext),
                });
            }
        }
        if let Some(url) = self.try_vkey(mid, None, &uin, cookie, g_tk).await {
            return json!({ "result": 100, "data": url, "level": "默认(由 QQ 决定)" });
        }
        if !cookie.is_empty() {
            if let Some(url) = self.try_vkey(mid, None, "0", "", 5381).await {
                return json!({ "result": 100, "data": url, "level": "匿名 128k" });
            }
        }
        json!({ "result": -1, "data": "" })
    }

    /// LRC 歌词
    pub async fn lyric(&self, mid: &str) -> Value {
        if mid.is_empty() {
            return json!({ "lyric": "" });
        }
        let body: Value = match self
            .http
            .get("https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg")
            .query(&[
                ("songmid", mid),
                ("format", "json"),
                ("nobase64", "1"),
                ("g_tk", "5381"),
            ])
            .header("Referer", QQ_REFERER)
            .send()
            .await
        {
            Ok(r) => r.json().await.unwrap_or(Value::Null),
            Err(_) => Value::Null,
        };
        let lrc = body.get("lyric").and_then(|v| v.as_str()).unwrap_or("");
        json!({ "lyric": lrc })
    }

    /// "我喜欢"歌单. 需要登录 cookie; 拿不到时返回空列表, 由前端回退到热歌榜
    pub async fn user_favorite(&self, cookie: &str) -> Value {
        if cookie.is_empty() {
            return json!({ "data": { "list": [] }, "err": "not_logged_in" });
        }
        let uin = parse_qq_uin(cookie);
        if uin == "0" {
            return json!({ "data": { "list": [] }, "err": "no_uin" });
        }
        let g_tk = qq_gtk(cookie);

        // 1. 取 uin 的歌单列表
        let payload1 = json!({
            "req_1": {
                "module": "music.musicasset.PlaylistBaseRead",
                "method": "GetPlaylistByUin",
                "param": { "uin": uin }
            },
            "comm": { "ct": 24, "cv": 0, "format": "json", "g_tk": g_tk, "uin": uin }
        });
        let data_str1 = serde_json::to_string(&payload1).unwrap_or_default();
        let body1: Value = match self
            .http
            .get("https://u.y.qq.com/cgi-bin/musicu.fcg")
            .query(&[
                ("format", "json"),
                ("g_tk", g_tk.to_string().as_str()),
                ("data", data_str1.as_str()),
            ])
            .header("Referer", QQ_REFERER)
            .header("Origin", "https://y.qq.com")
            .header("Cookie", cookie)
            .send()
            .await
        {
            Ok(r) => r.json().await.unwrap_or(Value::Null),
            Err(_) => return json!({ "data": { "list": [] }, "err": "http" }),
        };
        let playlists = body1
            .pointer("/req_1/data/v_playlist")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if playlists.is_empty() {
            return json!({ "data": { "list": [] }, "err": "empty_playlists" });
        }
        let fav = playlists
            .iter()
            .find(|p| p.get("dirShow").and_then(|v| v.as_i64()).unwrap_or(0) == 1)
            .or_else(|| {
                playlists.iter().find(|p| {
                    p.get("title")
                        .and_then(|v| v.as_str())
                        .map(|t| t.contains("我喜欢"))
                        .unwrap_or(false)
                })
            })
            .or_else(|| playlists.first());
        let tid = match fav.and_then(|p| {
            p.get("tid")
                .and_then(|v| v.as_i64())
                .or_else(|| p.get("dissid").and_then(|v| v.as_i64()))
        }) {
            Some(x) => x,
            None => return json!({ "data": { "list": [] }, "err": "no_tid" }),
        };

        // 2. 取歌单详情
        let payload2 = json!({
            "req_1": {
                "module": "music.srfDissInfo.aiDissInfo",
                "method": "uniform_get_Dissinfo",
                "param": { "disstid": tid, "tag": 0, "userinfo": 0, "song_begin": 0, "song_num": 200 }
            },
            "comm": { "ct": 24, "cv": 0, "format": "json", "g_tk": g_tk, "uin": uin }
        });
        let data_str2 = serde_json::to_string(&payload2).unwrap_or_default();
        let body2: Value = match self
            .http
            .get("https://u.y.qq.com/cgi-bin/musicu.fcg")
            .query(&[
                ("format", "json"),
                ("g_tk", g_tk.to_string().as_str()),
                ("data", data_str2.as_str()),
            ])
            .header("Referer", QQ_REFERER)
            .header("Origin", "https://y.qq.com")
            .header("Cookie", cookie)
            .send()
            .await
        {
            Ok(r) => r.json().await.unwrap_or(Value::Null),
            Err(_) => return json!({ "data": { "list": [] }, "err": "http2" }),
        };
        let raw = body2
            .pointer("/req_1/data/songlist")
            .or_else(|| body2.pointer("/req_1/data/dirinfo/songs"))
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let list: Vec<Value> = raw.iter().filter_map(normalize_song).collect();
        json!({ "data": { "list": list }, "disstid": tid })
    }

    /// 调一次 vkey 接口, 命中返回完整播放 URL, 否则 None
    async fn try_vkey(
        &self,
        mid: &str,
        filename: Option<&str>,
        uin: &str,
        cookie: &str,
        g_tk: u32,
    ) -> Option<String> {
        let mut param = serde_json::Map::new();
        param.insert("guid".into(), json!(QQ_GUID));
        param.insert("songmid".into(), json!([mid]));
        if let Some(fname) = filename {
            param.insert("filename".into(), json!([fname]));
        }
        param.insert("songtype".into(), json!([0]));
        param.insert("uin".into(), json!(uin));
        param.insert("loginflag".into(), json!(1));
        param.insert("platform".into(), json!("20"));

        let data = json!({
            "req_1": {
                "module": "vkey.GetVkeyServer",
                "method": "CgiGetVkey",
                "param": Value::Object(param)
            },
            "comm": { "uin": uin, "format": "json", "ct": 24, "cv": 0, "g_tk": g_tk }
        });
        let data_str = serde_json::to_string(&data).ok()?;

        let mut req = self
            .http
            .get("https://u.y.qq.com/cgi-bin/musicu.fcg")
            .query(&[
                ("format", "json"),
                ("g_tk", g_tk.to_string().as_str()),
                ("data", data_str.as_str()),
            ])
            .header("Referer", QQ_REFERER)
            .header("Origin", "https://y.qq.com");
        if !cookie.is_empty() {
            req = req.header("Cookie", cookie);
        }
        let body: Value = match req.send().await {
            Ok(r) => r.json().await.unwrap_or(Value::Null),
            Err(_) => return None,
        };
        let info = body
            .pointer("/req_1/data/midurlinfo/0/purl")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if info.is_empty() {
            return None;
        }
        let sip = body
            .pointer("/req_1/data/sip/0")
            .and_then(|v| v.as_str())
            .unwrap_or("https://dl.stream.qqmusic.qq.com/");
        Some(format!("{}{}", sip, info))
    }
}

fn parse_search_list(body: &Value) -> Vec<Value> {
    let raw = body
        .pointer("/req_1/data/body/song/list")
        .or_else(|| body.pointer("/data/song/list"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    raw.iter()
        .filter_map(|s| {
            // 这里需要相同 mid 抽取, 但不调 normalize_song, 因为我们要保留与原 search 结构 (无 album.mid 时返回的字段) 一致.
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
                        .map(|n| json!({ "name": n }))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let interval = s.get("interval").and_then(|v| v.as_u64()).unwrap_or(0);
            let albummid = extract_albummid(s).unwrap_or_default();
            Some(json!({
                "songmid": mid,
                "songname": name,
                "singer": singer,
                "interval": interval,
                "albummid": albummid
            }))
        })
        .collect()
}

/// QQ 音质档 → (filename 前缀, 后缀) 链路
fn filename_chain(level: &str) -> Vec<(&'static str, &'static str)> {
    match level {
        "hires" => vec![
            ("AI00", "flac"),
            ("F000", "flac"),
            ("M800", "mp3"),
            ("M500", "mp3"),
        ],
        "lossless" => vec![("F000", "flac"), ("M800", "mp3"), ("M500", "mp3")],
        "exhigh" => vec![("M800", "mp3"), ("M500", "mp3")],
        _ => vec![("M500", "mp3"), ("C400", "m4a")],
    }
}

fn describe_quality(prefix: &str, ext: &str) -> String {
    match (prefix, ext) {
        ("AI00", _) => "Hi-Res ATMOS".to_string(),
        ("F000", _) => "FLAC 无损".to_string(),
        ("M800", _) => "320k mp3".to_string(),
        ("M500", _) => "128k mp3".to_string(),
        ("C400", _) => "128k m4a".to_string(),
        _ => format!("{} {}", prefix, ext),
    }
}

/// 从 cookie 串里抠 uin.
pub fn parse_qq_uin(cookie: &str) -> String {
    let mut candidates: Vec<String> = Vec::new();
    for kv in cookie.split(';') {
        let kv = kv.trim();
        let (k, v) = match kv.split_once('=') {
            Some(x) => x,
            None => continue,
        };
        let k = k.trim().to_ascii_lowercase();
        let v = v.trim().trim_start_matches('o').trim_start_matches('0');
        if v.is_empty() || !v.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        match k.as_str() {
            "uin" | "p_uin" | "q.uin" | "wxuin" => candidates.insert(0, v.to_string()),
            _ => candidates.push(v.to_string()),
        }
    }
    candidates.into_iter().next().unwrap_or_else(|| "0".into())
}

/// 计算 QQ Web g_tk (基于 p_skey / skey 的 hash) , 没 skey 时回 5381 兜底
pub fn qq_gtk(cookie: &str) -> u32 {
    for key in ["p_skey", "skey"] {
        if let Some(skey) = cookie_value(cookie, key) {
            if !skey.is_empty() {
                let mut hash: u32 = 5381;
                for b in skey.bytes() {
                    hash = hash.wrapping_add(hash << 5).wrapping_add(b as u32);
                }
                return hash & 0x7fff_ffff;
            }
        }
    }
    5381
}

fn cookie_value(cookie: &str, name: &str) -> Option<String> {
    cookie.split(';').find_map(|kv| {
        let (k, v) = kv.trim().split_once('=')?;
        if k.eq_ignore_ascii_case(name) {
            Some(v.to_string())
        } else {
            None
        }
    })
}
