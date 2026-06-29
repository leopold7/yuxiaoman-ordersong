//! 应用配置: 从 `config/config.yaml` 加载 + 环境变量覆盖
//!
//! 字段优先级 (从高到低)
//! 1. 环境变量 (`ACCESS_KEY_ID` / `ACCESS_KEY_SECRET` / `BILI_APP_ID` ...)
//! 2. `config.yaml` 中的字段
//! 3. 内置默认值 (见 [`consts`](crate::consts)) )

use std::fs;
use std::path::PathBuf;

use serde::Deserialize;

use crate::consts;
use crate::paths;

/// 运行时配置 (已合并 yaml + env, 所有字段都有默认值)
#[derive(Debug, Clone)]
pub struct AppConfig {
    /// B 站开放平台 access_key_id
    pub access_key_id: String,
    /// B 站开放平台 access_key_secret
    pub access_key_secret: String,
    /// 互动玩法 app_id
    pub bili_app_id: u64,
    /// HTTP 服务监听地址 (桌面端默认 127.0.0.1)
    pub web_server_host: String,
    /// HTTP 服务监听端口 (桌面端默认 17777)
    pub web_server_port: u16,
    /// 静态资源与 API 挂载的基础路径
    pub base_path: String,
    /// 歌曲 URL 缓存时间 (秒)
    pub song_cache_ttl_sec: u64,
    /// 每 IP 每分钟请求上限 (暂未启用)
    pub rate_limit_per_min: u32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            access_key_id: String::new(),
            access_key_secret: String::new(),
            bili_app_id: 0,
            web_server_host: consts::DEFAULT_HOST.to_string(),
            web_server_port: consts::DEFAULT_PORT,
            base_path: consts::DEFAULT_BASE_PATH.to_string(),
            song_cache_ttl_sec: 300,
            rate_limit_per_min: 120,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct RawConfig {
    #[serde(default)]
    access_key_id: Option<String>,
    #[serde(default)]
    access_key_secret: Option<String>,
    /// 兼容历史拼写错误的字段名 access_key_secred
    #[serde(default)]
    access_key_secred: Option<String>,
    #[serde(default)]
    bili_app_id: Option<serde_yaml::Value>,
    #[serde(default)]
    web_server_host: Option<String>,
    #[serde(default)]
    web_server_port: Option<u16>,
    #[serde(default)]
    base_path: Option<String>,
    #[serde(default)]
    song_cache_ttl: Option<u64>,
    #[serde(default)]
    rate_limit_per_min: Option<u32>,
}

fn as_u64(v: &Option<serde_yaml::Value>) -> Option<u64> {
    v.as_ref().and_then(|x| match x {
        serde_yaml::Value::Number(n) => n.as_u64(),
        serde_yaml::Value::String(s) => s.parse().ok(),
        _ => None,
    })
}

/// 从磁盘 + 环境变量加载配置, 读取失败时回退默认值, 不会 panic
///
/// 副作用: 若 config.yaml 缺失而 config/default/config.yaml 存在,
/// 会把默认配置复制为 config.yaml
pub fn load() -> AppConfig {
    let cfg_dir = paths::pick_config_dir();
    let yaml_path: PathBuf = cfg_dir.join("config.yaml");
    let default_yaml = cfg_dir.join("default").join("config.yaml");

    if !yaml_path.exists() && default_yaml.exists() {
        let _ = fs::create_dir_all(&cfg_dir);
        if fs::copy(&default_yaml, &yaml_path).is_ok() {
            eprintln!("[core::config] 已从默认配置生成 {}", yaml_path.display());
        }
    }

    let raw: RawConfig = if yaml_path.exists() {
        match fs::read_to_string(&yaml_path) {
            Ok(s) => serde_yaml::from_str(&s).unwrap_or_default(),
            Err(_) => RawConfig::default(),
        }
    } else {
        RawConfig::default()
    };

    AppConfig {
        access_key_id: env_or("ACCESS_KEY_ID").or(raw.access_key_id).unwrap_or_default(),
        access_key_secret: env_or("ACCESS_KEY_SECRET")
            .or(raw.access_key_secret)
            .or(raw.access_key_secred)
            .unwrap_or_default(),
        bili_app_id: std::env::var("BILI_APP_ID")
            .ok()
            .and_then(|s| s.parse().ok())
            .or(as_u64(&raw.bili_app_id))
            .unwrap_or(0),
        web_server_host: env_or("WEB_SERVER_HOST")
            .or(raw.web_server_host)
            .unwrap_or_else(|| consts::DEFAULT_HOST.to_string()),
        web_server_port: std::env::var("WEB_SERVER_PORT")
            .ok()
            .and_then(|s| s.parse().ok())
            .or(raw.web_server_port)
            .unwrap_or(consts::DEFAULT_PORT),
        base_path: env_or("BASE_PATH")
            .or(raw.base_path)
            .unwrap_or_else(|| consts::DEFAULT_BASE_PATH.to_string()),
        song_cache_ttl_sec: std::env::var("SONG_CACHE_TTL")
            .ok()
            .and_then(|s| s.parse().ok())
            .or(raw.song_cache_ttl)
            .unwrap_or(300),
        rate_limit_per_min: std::env::var("RATE_LIMIT_PER_MIN")
            .ok()
            .and_then(|s| s.parse().ok())
            .or(raw.rate_limit_per_min)
            .unwrap_or(120),
    }
}

/// 取环境变量并过滤空字符串
fn env_or(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|s| !s.is_empty())
}
