//! B 站直播间"网页弹幕协议"客户端 (房间号模式)
//!
//! WebSocket 由前端直接发起 (浏览器 WebSocket 不受 CORS 限制) , 该 crate 只负责
//! 需要 cookie / WBI 签名的 HTTP 接口
//!
//! - room_init 短号 → 真实房间号 + 主播 uid + 标题
//! - my_room 用 cookie 查询主播自己的房间号
//! - danmu_info 通过 getDanmInfo (带 WBI) / getConf (不带) 拿弹幕服务器 + token

pub mod danmu_info;
pub mod room;
pub mod wbi;
