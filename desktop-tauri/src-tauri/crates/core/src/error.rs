//! 核心层错误类型
//!
//! `CoreError` 主要用于配置加载, 路径解析的失败场景; 业务 crate 可在自己的
//! `Error` 枚举里加一条 `#[from] CoreError` 桥接过来.

use thiserror::Error;

/// 核心层错误
#[derive(Debug, Error)]
pub enum CoreError {
    /// 配置文件读取失败
    #[error("读取配置文件失败：{0}")]
    ConfigRead(#[from] std::io::Error),

    /// 配置文件 YAML 解析失败
    #[error("解析配置文件失败：{0}")]
    ConfigParse(#[from] serde_yaml::Error),

    /// 通用配置错误
    #[error("配置错误：{0}")]
    InvalidConfig(String),
}

/// 核心层结果类型别名
pub type CoreResult<T> = Result<T, CoreError>;
