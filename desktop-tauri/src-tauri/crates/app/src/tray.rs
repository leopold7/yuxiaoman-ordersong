//! 系统托盘: 关闭主窗口不退出应用, 左键单击恢复窗口

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Manager,
};

use crate::logger::write_log;

pub fn build(app: &mut App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "tray_show", "显示窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "tray_quit", "退出", true, None::<&str>)?;
    let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;
    let tray_icon = app.default_window_icon().cloned().expect("default window icon");

    TrayIconBuilder::with_id("main-tray")
        .tooltip("鱼小曼点歌助手")
        .icon(tray_icon)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app: &tauri::AppHandle, event| match event.id.as_ref() {
            "tray_show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
            "tray_quit" => {
                write_log("[tray] 用户从托盘退出");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}
