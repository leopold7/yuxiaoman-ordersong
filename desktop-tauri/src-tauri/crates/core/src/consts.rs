//! 跨 crate 共享的常量.
//!
//! 把过去散落在 [bili.rs](../../src/server/bili.rs) / [bili_room.rs](../../src/server/bili_room.rs)
//! / [netease.rs](../../src/server/netease.rs) / [qq.rs](../../src/server/qq.rs) 里硬编码的
//! User-Agent, Referer, QQ_GUID 等字符串集中到这里, 避免重复且方便统一调整.

/// 桌面端在请求 B 站 / 网易云 / QQ 时统一使用的浏览器 User-Agent
pub const DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
                              AppleWebKit/537.36 (KHTML, like Gecko) \
                              Chrome/124.0.0.0 Safari/537.36";

/// B 站通用 Referer
pub const BILI_REFERER: &str = "https://www.bilibili.com/";

/// B 站直播中心 (开播设置页) Referer, 调身份码相关接口时使用
pub const BILI_LIVE_CENTER_REFERER: &str = "https://link.bilibili.com/p/center/index";

/// B 站开放平台"互动玩法"基础地址
pub const BILI_OPEN_BASE: &str = "https://live-open.biliapi.com";

/// QQ 音乐统一 Referer
pub const QQ_REFERER: &str = "https://y.qq.com/";

/// QQ 客户端 GUID
/// 见 [server/qq.rs](../../src/server/qq.rs)
/// 这里使用 QQMusicApi 长期使用的稳定值
pub const QQ_GUID: &str = "8348972662";

/// 网易云 web 端 Referer / Origin
pub const NETEASE_REFERER: &str = "https://music.163.com";

/// 内嵌 HTTP 服务默认监听端口, 桌面壳启动时会强制使用此端口 (避免与用户的
/// `config.yaml` 中端口配置冲突) .
pub const DEFAULT_PORT: u16 = 17777;

/// 内嵌 HTTP 服务默认监听地址
pub const DEFAULT_HOST: &str = "127.0.0.1";

/// 前端静态资源默认挂载路径
pub const DEFAULT_BASE_PATH: &str = "/order";

/// HTTP 客户端请求超时 (秒)
pub const HTTP_TIMEOUT_SECS: u64 = 10;

/// 请求体大小上限
pub const REQUEST_BODY_LIMIT: usize = 2 * 1024 * 1024;
