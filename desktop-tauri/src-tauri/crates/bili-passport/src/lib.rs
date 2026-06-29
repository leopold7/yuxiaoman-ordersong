//! B 站扫码登录客户端.
//!
//! 该 crate 只提供"无状态"的客户端函数, cookie 由调用方 (`ordersong-server`) 维护.
//! 用途: 扫码登录拿到 cookie 后, 房间号模式可据此获取完整用户 uid 与主播自己的房间号.
//!

pub mod qrcode;
pub mod whoami;
