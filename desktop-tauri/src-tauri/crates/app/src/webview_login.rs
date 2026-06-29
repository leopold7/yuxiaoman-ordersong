//! 网易云 / QQ 音乐登录 Webview

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::logger::write_log;

const NETEASE_LOGIN_LABEL: &str = "netease-login";
const QQ_LOGIN_LABEL: &str = "qq-login";

#[tauri::command]
pub async fn open_netease_login(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(NETEASE_LOGIN_LABEL) {
        let _ = win.set_focus();
        return Ok(());
    }
    let url: tauri::Url = "https://music.163.com/#/login"
        .parse()
        .map_err(|e: <tauri::Url as std::str::FromStr>::Err| e.to_string())?;
    WebviewWindowBuilder::new(&app, NETEASE_LOGIN_LABEL, WebviewUrl::External(url))
        .title("网易云音乐 - 登录")
        .inner_size(1024.0, 720.0)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;
    write_log("[netease-login] webview 已打开");
    Ok(())
}

#[tauri::command]
pub async fn read_netease_cookies(app: AppHandle) -> Result<String, String> {
    let win = app
        .get_webview_window(NETEASE_LOGIN_LABEL)
        .ok_or_else(|| "登录窗口不存在".to_string())?;
    let cookies = win.cookies().map_err(|e| e.to_string())?;
    if cookies.is_empty() {
        return Err("未读取到任何 cookie，请确认已在窗口中登录".to_string());
    }
    let has_music_u = cookies.iter().any(|c| c.name() == "MUSIC_U");
    if !has_music_u {
        return Err(format!(
            "未检测到 MUSIC_U（已读到 {} 条 cookie，请确认在弹出的窗口里完成登录）",
            cookies.len()
        ));
    }
    let cookie_str = cookies
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect::<Vec<_>>()
        .join("; ");
    write_log(&format!("[netease-login] cookie 已读取 ({} 条)", cookies.len()));
    Ok(cookie_str)
}

#[tauri::command]
pub async fn close_netease_login(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(NETEASE_LOGIN_LABEL) {
        let _ = win.close();
        write_log("[netease-login] 窗口已关闭");
    }
    Ok(())
}

#[tauri::command]
pub async fn open_qq_login(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(QQ_LOGIN_LABEL) {
        let _ = win.set_focus();
        return Ok(());
    }
    let url: tauri::Url = "https://y.qq.com/"
        .parse()
        .map_err(|e: <tauri::Url as std::str::FromStr>::Err| e.to_string())?;
    WebviewWindowBuilder::new(&app, QQ_LOGIN_LABEL, WebviewUrl::External(url))
        .title("QQ 音乐 - 登录（点右上角头像 / 登录，扫码或账号登录）")
        .inner_size(1024.0, 720.0)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;
    write_log("[qq-login] webview 已打开");
    Ok(())
}

#[tauri::command]
pub async fn read_qq_cookies(app: AppHandle) -> Result<String, String> {
    let win = app
        .get_webview_window(QQ_LOGIN_LABEL)
        .ok_or_else(|| "登录窗口不存在".to_string())?;
    let cookies = win.cookies().map_err(|e| e.to_string())?;
    if cookies.is_empty() {
        return Err("未读取到任何 cookie，请确认已在窗口中登录".to_string());
    }
    let logged = cookies
        .iter()
        .any(|c| matches!(c.name(), "qm_keyst" | "qqmusic_key" | "uin" | "wxuin"));
    if !logged {
        return Err(format!(
            "未检测到登录态（已读到 {} 条 cookie，请确认在弹出的窗口里完成 QQ 音乐登录）",
            cookies.len()
        ));
    }
    let cookie_str = cookies
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect::<Vec<_>>()
        .join("; ");
    write_log(&format!("[qq-login] cookie 已读取 ({} 条)", cookies.len()));
    Ok(cookie_str)
}

#[tauri::command]
pub async fn close_qq_login(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(QQ_LOGIN_LABEL) {
        let _ = win.close();
        write_log("[qq-login] 窗口已关闭");
    }
    Ok(())
}
