//! B 站 BV 号点歌音频客户端
//!
//! 复用 `ordersong-bili-web::wbi` 的 WBI 签名:
//! - `x/web-interface/view` 取标题 / UP 主 / 时长 / 封面 / 首 P cid
//! - `x/player/wbi/playurl` (WBI 签名) 取 DASH 音频直链
//!
//! 仅支持公开视频; 登录态 / 付费 / 地区限制视频不在范围内。

use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

use ordersong_bili_web::wbi::{fetch_wbi_keys, get_mixin_key, sign};
use ordersong_core::consts::{BILI_REFERER, DEFAULT_UA};
use serde_json::Value;

/// WBI 密钥缓存有效期 (秒)
const WBI_TTL_SECS: u64 = 300;

/// 视频元数据 + 首 P cid
pub struct BiliResolve {
    pub sname: String,
    pub sartist: String,
    pub duration: u64,
    pub cover_url: String,
    pub cid: u64,
}

pub struct BiliMusicClient {
    http: reqwest::Client,
    /// (img_key, sub_key, 获取时刻 epoch 秒)
    wbi: RwLock<Option<(String, String, u64)>>,
}

impl BiliMusicClient {
    pub fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            wbi: RwLock::new(None),
        }
    }

    /// 取 mixin_key, 命中缓存则跳过 nav 请求
    async fn mixin_key(&self) -> Result<String, String> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let cached = self.wbi.read().ok().and_then(|g| g.clone());
        if let Some((img, sub, ts)) = cached {
            if now.saturating_sub(ts) < WBI_TTL_SECS {
                return Ok(get_mixin_key(&img, &sub));
            }
        }
        let (img, sub) = fetch_wbi_keys(&self.http, "")
            .await
            .ok_or_else(|| "获取 B 站 WBI 密钥失败".to_string())?;
        let _ = self
            .wbi
            .write()
            .map(|mut g| *g = Some((img.clone(), sub.clone(), now)));
        Ok(get_mixin_key(&img, &sub))
    }

    /// 解析 BV 号 -> 元数据 + cid
    pub async fn resolve(&self, bvid: &str) -> Result<BiliResolve, String> {
        let url = format!("https://api.bilibili.com/x/web-interface/view?bvid={}", bvid);
        let body: Value = self
            .http
            .get(&url)
            .header("User-Agent", DEFAULT_UA)
            .header("Referer", BILI_REFERER)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        if body.get("code").and_then(|c| c.as_i64()) != Some(0) {
            let msg = body
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("视频不存在或受限");
            return Err(msg.to_string());
        }

        let data = body.get("data").ok_or("响应缺少 data 字段")?;
        let sname = data
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let sartist = data
            .pointer("/owner/name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let duration = data.get("duration").and_then(|v| v.as_u64()).unwrap_or(0);
        let cover_url = data
            .get("pic")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .replace("http://", "https://");
        let cid = data
            .pointer("/pages/0/cid")
            .and_then(|v| v.as_u64())
            .ok_or("响应缺少 cid (无分 P)")?;

        Ok(BiliResolve {
            sname,
            sartist,
            duration,
            cover_url,
            cid,
        })
    }

    /// 取 DASH 音频直链 (带宽最高者, 失败回退 flac)
    pub async fn audio_url(&self, bvid: &str, cid: u64) -> Result<String, String> {
        let mixin = self.mixin_key().await?;
        let params = vec![
            ("bvid".to_string(), bvid.to_string()),
            ("cid".to_string(), cid.to_string()),
            ("qn".to_string(), "64".to_string()),
            ("fnval".to_string(), "16".to_string()),
            ("fourk".to_string(), "0".to_string()),
            ("platform".to_string(), "web".to_string()),
        ];
        let query = sign(params, &mixin);
        let url = format!("https://api.bilibili.com/x/player/wbi/playurl?{}", query);

        let body: Value = self
            .http
            .get(&url)
            .header("User-Agent", DEFAULT_UA)
            .header("Referer", BILI_REFERER)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        if body.get("code").and_then(|c| c.as_i64()) != Some(0) {
            let msg = body
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("获取音频流失败");
            return Err(msg.to_string());
        }

        let dash = body.pointer("/data/dash").ok_or("响应缺少 dash 字段")?;

        // 优先取带宽最高的 DASH 音频流
        if let Some(audio) = dash.get("audio").and_then(|a| a.as_array()) {
            if let Some(best) = audio
                .iter()
                .max_by_key(|v| v.get("bandwidth").and_then(|b| b.as_u64()).unwrap_or(0))
            {
                if let Some(u) = best.get("baseUrl").and_then(|v| v.as_str()) {
                    return Ok(u.to_string());
                }
            }
        }

        // 回退: 无损 flac 音频
        if let Some(flac) = dash
            .get("flac")
            .and_then(|f| f.get("audio"))
            .and_then(|a| a.get("baseUrl"))
            .and_then(|v| v.as_str())
        {
            return Ok(flac.to_string());
        }

        Err("未找到可用音频流".to_string())
    }
}
