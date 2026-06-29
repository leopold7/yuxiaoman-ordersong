//! 多组 LRU 缓存, 节流网易云 / QQ 的重复查询

use std::time::Duration;

use moka::future::Cache;
use ordersong_core::AppConfig;

pub struct Caches {
    /// 歌曲 URL. 注意: 实际取流不再使用此 cache 以避免 cookie / level 污染 (见
    /// [`ordersong_music::NeteaseClient`]) , 保留接口仅作占位
    pub song_url: Cache<String, String>,
    /// 搜索结果 (key = wy:cs:<keyword> / wy:cloudsearch:<keyword>)
    pub search: Cache<String, serde_json::Value>,
    /// 歌词
    pub lyric: Cache<String, serde_json::Value>,
    /// 歌单
    pub playlist: Cache<String, serde_json::Value>,
}

impl Caches {
    pub fn new(cfg: &AppConfig) -> Self {
        let url_ttl = Duration::from_secs(cfg.song_cache_ttl_sec.max(60));
        Self {
            song_url: Cache::builder().max_capacity(2000).time_to_live(url_ttl).build(),
            search: Cache::builder()
                .max_capacity(1000)
                .time_to_live(Duration::from_secs(60))
                .build(),
            lyric: Cache::builder()
                .max_capacity(1000)
                .time_to_live(Duration::from_secs(30 * 60))
                .build(),
            playlist: Cache::builder()
                .max_capacity(50)
                .time_to_live(Duration::from_secs(15 * 60))
                .build(),
        }
    }
}
