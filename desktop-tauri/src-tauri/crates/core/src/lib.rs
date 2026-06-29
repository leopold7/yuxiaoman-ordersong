//! 核心层
//!
//! 本 crate 是依赖图最底层的"纯"层:
//! - 不发起任何网络 / 文件 IO (除 [`config::load`] 从 YAML 读取配置外)
//! - 不依赖 Tauri / axum / reqwest
//! - 对外暴露: 应用配置, 统一错误类型, 路径解析, 跨 crate 共享常量
//!
//! 业务 crate (`bili-open` / `bili-web` / `music` 等) 只 `use ordersong_core::{...}` 即可.

pub mod config;
pub mod consts;
pub mod error;
pub mod paths;

pub use config::AppConfig;
pub use error::{CoreError, CoreResult};
