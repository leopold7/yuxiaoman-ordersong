//! 运行时路径解析
//!
//! 桌面端打包后, 可执行文件, 配置文件, 前端 dist 都在 NSIS 安装目录里;
//! 开发态下又位于 cargo target 子目录里,
//! 在 dev / 安装包 / Docker 三种形态下都能用

use std::path::{Path, PathBuf};

/// 候选配置目录解析顺序 (从高到低)
/// 1. 环境变量 `CONFIG_DIR`
/// 2. exe 同目录的 `config/`
/// 3. exe 同目录的 `resources/config/`
/// 4. 进程 cwd 下的 `config/`
/// 5. exe 向上四级再找 `config/`
/// 6. 都没有就回退到 exe 同目录的 `config/`
pub fn pick_config_dir() -> PathBuf {
    if let Ok(v) = std::env::var("CONFIG_DIR") {
        let p = PathBuf::from(v);
        if p.exists() {
            return p;
        }
    }
    let exe = std::env::current_exe().ok();
    let exe_dir = exe.as_ref().and_then(|p| p.parent()).map(Path::to_path_buf);

    if let Some(d) = exe_dir.as_ref() {
        let c = d.join("config");
        if c.exists() {
            return c;
        }
        let c2 = d.join("resources").join("config");
        if c2.exists() {
            return c2;
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        let c = cwd.join("config");
        if c.exists() {
            return c;
        }
    }
    if let Some(d) = exe_dir.as_ref() {
        let c = d.join("..").join("..").join("..").join("..").join("config");
        if c.exists() {
            return std::fs::canonicalize(&c).unwrap_or(c);
        }
    }
    exe_dir
        .map(|p| p.join("config"))
        .unwrap_or_else(|| PathBuf::from("config"))
}

/// 解析前端 dist 目录, 优先 `FRONTEND_DIST` 环境变量, 其次 exe 同目录的资源路径,
/// 最后回退到 dev 模式下的相对路径
pub fn pick_frontend_dist() -> PathBuf {
    if let Ok(v) = std::env::var("FRONTEND_DIST") {
        let p = PathBuf::from(v);
        if p.exists() {
            return p;
        }
    }
    let exe = std::env::current_exe().ok();
    let exe_dir = exe.as_ref().and_then(|p| p.parent()).map(Path::to_path_buf);

    if let Some(d) = exe_dir.as_ref() {
        for c in [
            d.join("resources").join("frontend").join("dist"),
            d.join("frontend").join("dist"),
        ] {
            if c.exists() {
                return c;
            }
        }
    }
    if let Some(d) = exe_dir.as_ref() {
        let c = d
            .join("..")
            .join("..")
            .join("..")
            .join("..")
            .join("frontend")
            .join("dist");
        if c.exists() {
            return std::fs::canonicalize(&c).unwrap_or(c);
        }
    }
    exe_dir
        .map(|p| p.join("frontend").join("dist"))
        .unwrap_or_else(|| PathBuf::from("frontend/dist"))
}

/// 持久化数据目录 (Windows 优先 `%APPDATA%/ordersong`, 否则回退到配置目录)
///
/// 用于存放跨客户端共享配置 `shared-config.json` 等可写文件
pub fn data_dir() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let dir = PathBuf::from(appdata).join("ordersong");
        let _ = std::fs::create_dir_all(&dir);
        return dir;
    }
    pick_config_dir()
}

/// 把 `name` 拼到 [`data_dir`] 下
pub fn data_path(name: &str) -> PathBuf {
    data_dir().join(name)
}
