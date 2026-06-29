//! 客户端
//!
//! 该 crate 负责 gameStart / gameEnd / gameHeartBeat / gameBatchHeartBeat
//! 四条 HTTP 接口的请求构造与签名计算, 不负责路由暴露与 axum 装配, 后者交给
//! ordersong-server

pub mod client;
pub mod error;
pub mod sign;

pub use client::BiliOpenClient;
pub use error::{BiliOpenError, BiliOpenResult};
