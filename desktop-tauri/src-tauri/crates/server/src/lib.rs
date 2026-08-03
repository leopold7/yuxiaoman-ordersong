//! axum 后端装配层
//!
//! 把 bili-open / bili-web / bili-passport / music 四个业务 crate 装配成
//! 一组 HTTP 路由:
//! - `/healthz` `/api/metrics` - 健康检查与指标
//! - `<base>/bili-api/*` - B 站开放平台代理
//! - `<base>/bili-passport/*` - B 站扫码登录 + 身份码
//! - `<base>/bili-room/*` - B 站房间号网页协议
//! - `<base>/netease_api/*` - 网易云 weapi 代理
//! - `<base>/qq-api/*` - QQ 音乐代理
//! - `<base>/bili-music/*` - B 站 BV 号点歌音频代理
//! - `<base>/app-config` - 跨客户端共享配置
//! - `<base>/live-state` - OBS 浏览器源播放快照同步
//! - `<base>/*` - 前端静态资源

pub mod cache;
pub mod error;
pub mod health;
pub mod live_state;
pub mod metrics;
pub mod routes;
pub mod shared_config;
pub mod state;

use std::sync::Arc;

use axum::http::{header, HeaderValue, Request};
use axum::Router;
use ordersong_core::consts::REQUEST_BODY_LIMIT;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

pub use state::{AppState, AppStateRef};

/// 带内容指纹的构建产物: 文件名变了才会被请求, 可以放心长期缓存
const IMMUTABLE_CACHE: &str = "public, max-age=31536000, immutable";
/// 入口文档: 允许协商缓存, 但每次都必须回源校验
const NO_CACHE: &str = "no-cache, must-revalidate";

/// 判断该路径是否是 Vite 产出的带 hash 指纹的静态资源
///
/// Vite 默认把带 hash 的产物放在 `assets/` 下 (形如 `index-a1b2c3d4.js`),
/// 只有这类文件才适用 immutable 长缓存; 其余 (尤其是 `index.html` 与目录索引)
/// 必须回源校验, 否则覆盖安装升级后 WebView2 会拿旧 `index.html` 去引用
/// 已经不存在的旧 hash chunk, 界面表现为「还是旧版本」甚至白屏
fn is_fingerprinted(path: &str) -> bool {
    path.contains("/assets/")
}

/// 构造完整的 axum Router
pub fn build_router(state: AppStateRef) -> Router {
    let base = state.cfg.base_path.trim_end_matches('/').to_string();
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_router = Router::new()
        .nest("/bili-api", routes::bili_open::router())
        .nest("/bili-passport", routes::bili_passport::router())
        .nest("/bili-room", routes::bili_web::router())
        .nest("/netease_api", routes::netease::router())
        .nest("/qq-api", routes::qq::router())
        .nest("/bili-music", routes::bili_music::router())
        .route(
            "/live-state",
            axum::routing::get(live_state::get_state).post(live_state::set_state),
        )
        .route(
            "/app-config",
            axum::routing::get(shared_config::get_config).post(shared_config::set_config),
        )
        .with_state(state.clone());

    let dist = ordersong_core::paths::pick_frontend_dist();
    eprintln!("[server] 静态资源目录：{}", dist.display());
    // 只给静态资源加缓存头, 不经过 api_router / health_router, 避免影响接口响应
    let static_service = tower::ServiceBuilder::new()
        .layer(axum::middleware::from_fn(
            |req: Request<axum::body::Body>, next: axum::middleware::Next| async move {
                let immutable = is_fingerprinted(req.uri().path());
                let mut res = next.run(req).await;
                let v = if immutable { IMMUTABLE_CACHE } else { NO_CACHE };
                res.headers_mut()
                    .insert(header::CACHE_CONTROL, HeaderValue::from_static(v));
                res
            },
        ))
        .service(ServeDir::new(&dist).append_index_html_on_directories(true));

    let health_router = health::router().with_state(state.clone());

    Router::new()
        .merge(health_router)
        .nest(&base, api_router)
        .nest_service(&base, static_service)
        .layer(cors)
        .layer(RequestBodyLimitLayer::new(REQUEST_BODY_LIMIT))
        .layer(TraceLayer::new_for_http())
}

/// 启动 axum 服务, 监听 host:port
pub async fn serve(state: AppStateRef) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let addr = format!("{}:{}", state.cfg.web_server_host, state.cfg.web_server_port);
    let listener = TcpListener::bind(&addr).await?;
    eprintln!("[server] 监听 http://{}{}", addr, state.cfg.base_path);
    let app = build_router(state);
    axum::serve(listener, app).await?;
    Ok(())
}

pub fn new_state(cfg: ordersong_core::AppConfig) -> Arc<AppState> {
    AppState::new(cfg)
}
