//! 服务层统一错误
//!
//! 所有 handler 想吐错误时统一构造一个 ApiError, IntoResponse 会把它转成
//! {"code": <非0>, "message": <中文>} 的 JSON
//!

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

/// 服务层统一错误. 所有变体的 Display 都是中文, 前端可直接展示
#[derive(Debug, Error)]
pub enum ApiError {
    /// 请求体校验失败 (缺字段, 类型不对, 空等)
    #[error("{0}")]
    BadRequest(String),

    #[error("内部状态异常：{0}")]
    Internal(String),

    /// 上游接口 (B 站 / 网易云 / QQ 等) 返回的业务错误
    #[error("{0}")]
    Upstream(String),
}

impl ApiError {
    /// 便捷构造: 请求体非法
    pub fn bad<S: Into<String>>(msg: S) -> Self {
        Self::BadRequest(msg.into())
    }

    /// 便捷构造: 上游接口返回业务错误
    pub fn upstream<S: Into<String>>(msg: S) -> Self {
        Self::Upstream(msg.into())
    }

    /// 便捷构造: 服务内部异常
    pub fn internal<S: Into<String>>(msg: S) -> Self {
        Self::Internal(msg.into())
    }

    /// HTTP 状态码 -- 业务一律 200 (前端按 body.code 判断) , 仅服务严重内部错误返回 5xx
    fn status(&self) -> StatusCode {
        match self {
            ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            _ => StatusCode::OK,
        }
    }

    /// JSON 体里的业务 code
    fn code(&self) -> i32 {
        match self {
            ApiError::BadRequest(_) => -1,
            ApiError::Upstream(_) => -1,
            ApiError::Internal(_) => -500,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(json!({
            "code": self.code(),
            "message": self.to_string(),
        }));
        (self.status(), body).into_response()
    }
}

/// ApiError 的便捷 Result 别名
pub type ApiResult<T> = Result<T, ApiError>;
