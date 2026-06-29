use thiserror::Error;

/// B 站开放平台调用过程中可能的错误
#[derive(Debug, Error)]
pub enum BiliOpenError {
    #[error("HMAC 初始化失败：{0}")]
    Hmac(String),

    #[error("非法的 HTTP 头部值：{0}")]
    InvalidHeader(String),

    #[error("请求 B 站接口失败：{0}")]
    Http(#[from] reqwest::Error),

    #[error("解析 B 站响应失败：{0}")]
    Decode(String),
}

pub type BiliOpenResult<T> = Result<T, BiliOpenError>;
