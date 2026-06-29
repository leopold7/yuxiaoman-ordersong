//! 开放平台 HTTP 客户端

use ordersong_core::consts::BILI_OPEN_BASE;
use serde_json::{json, Value};

use crate::error::BiliOpenError;
use crate::sign::build_headers;

/// 一个轻量客户端, 持有共享的 reqwest::Client 与开放平台凭据
#[derive(Clone)]
pub struct BiliOpenClient {
    http: reqwest::Client,
    access_key_id: String,
    access_key_secret: String,
    app_id: u64,
}

impl BiliOpenClient {
    /// 构造客户端, app_id 为 0 表示调用方在 body 里自行传入 app_id
    pub fn new(http: reqwest::Client, access_key_id: String, access_key_secret: String, app_id: u64) -> Self {
        Self {
            http,
            access_key_id,
            access_key_secret,
            app_id,
        }
    }

    /// 当前配置的 app_id (业务侧需要校验时可读)
    pub fn app_id(&self) -> u64 {
        self.app_id
    }

    /// 给请求体补全 app_id 字段 (若缺失或为 0)
    ///
    /// 返回 `Err` 表示 body 里没传且后端也没配 app_id, 调用方应当向客户端反馈未配置 app_id
    pub fn ensure_app_id(&self, mut body: Value) -> Result<Value, &'static str> {
        let need_inject = match body.get("app_id") {
            None => true,
            Some(Value::Number(n)) => n.as_u64().unwrap_or(0) == 0,
            Some(Value::String(s)) => s.is_empty() || s == "0",
            _ => false,
        };
        if need_inject {
            if self.app_id == 0 {
                return Err("后端未配置 BILI_APP_ID");
            }
            body["app_id"] = json!(self.app_id);
        }
        Ok(body)
    }

    /// 调用任意开放平台路径, 返回原始 JSON (含 code / message / data)
    ///
    /// 错误 (签名 / 网络 / 解码) 会归一成 {"code": -1, "message": "..."},
    /// 让 ordersong-server 直接转发给前端
    pub async fn call(&self, path: &str, body: Value) -> Value {
        let body_json = serde_json::to_string(&body).unwrap_or_default();

        let headers = match build_headers(&body_json, &self.access_key_id, &self.access_key_secret) {
            Ok(h) => h,
            Err(BiliOpenError::Hmac(e) | BiliOpenError::InvalidHeader(e)) => {
                return json!({ "code": -1, "message": format!("签名失败：{e}") });
            }
            Err(BiliOpenError::Http(e)) => {
                return json!({ "code": -1, "message": format!("请求失败：{e}") });
            }
            Err(BiliOpenError::Decode(e)) => {
                return json!({ "code": -1, "message": format!("响应解析失败：{e}") });
            }
        };

        let url = format!("{}{}", BILI_OPEN_BASE, path);
        let resp = self.http.post(&url).headers(headers).body(body_json).send().await;
        match resp {
            Ok(r) => {
                let status = r.status();
                match r.json::<Value>().await {
                    Ok(v) => v,
                    Err(e) => {
                        json!({ "code": -1, "message": format!("解析响应失败：{e}（status={status}）") })
                    }
                }
            }
            Err(e) => json!({ "code": -1, "message": format!("请求失败：{e}") }),
        }
    }

    /// 开始
    pub async fn game_start(&self, body: Value) -> Value {
        self.call("/v2/app/start", body).await
    }

    /// 结束
    pub async fn game_end(&self, body: Value) -> Value {
        self.call("/v2/app/end", body).await
    }

    /// 单场次心跳
    pub async fn game_heartbeat(&self, body: Value) -> Value {
        self.call("/v2/app/heartbeat", body).await
    }

    /// 批量心跳 (心跳 20s/次, 超 60s 自动关闭)
    pub async fn game_batch_heartbeat(&self, body: Value) -> Value {
        self.call("/v2/app/batchHeartbeat", body).await
    }
}
