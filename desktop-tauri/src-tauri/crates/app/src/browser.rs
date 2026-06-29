//! 用系统浏览器打开外链 (比内嵌 WebView2 更稳定, 复用用户已登录的会话)

use tauri::AppHandle;

use crate::logger::write_log;

/// Windows 下不弹 cmd 黑框地启动外部进程.
#[cfg(target_os = "windows")]
fn open_in_default_browser(url: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // `cmd /C start "" "<url>"` -- 空 title 是必需的, 否则 start 会把 url 当 title
    std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("打开浏览器失败：{e}"))?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn open_in_default_browser(url: &str) -> Result<(), String> {
    // 非 Windows 平台目前不打包, 给个简单实现避免编译错误.
    let _ = url;
    Err("当前平台暂不支持自动打开浏览器".into())
}

/// 打开 B 站直播中心 (开播设置页) , 方便主播复制身份码.
#[tauri::command]
pub async fn open_bili_live_settings(_app: AppHandle) -> Result<(), String> {
    let url = "https://link.bilibili.com/p/center/index#/my-room/start-live";
    open_in_default_browser(url)?;
    write_log("[bili-live-settings] 已用系统浏览器打开");
    Ok(())
}

/// 打开 B 站扫码登录页. 登录成功后浏览器会记住 SESSDATA.
#[tauri::command]
pub async fn open_bili_qr_login(_app: AppHandle) -> Result<(), String> {
    let url = "https://passport.bilibili.com/login";
    open_in_default_browser(url)?;
    write_log("[bili-qr-login] 已用系统浏览器打开扫码登录页");
    Ok(())
}

/// 兼容旧前端: 用系统浏览器后不需要"关闭", 做成 no-op.
#[tauri::command]
pub async fn close_bili_live_settings(_app: AppHandle) -> Result<(), String> {
    Ok(())
}
