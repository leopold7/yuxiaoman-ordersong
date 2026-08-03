; NSIS 安装/卸载钩子
;
; 注意: 主程序 exe 名由 crates/app/Cargo.toml 的 [[bin]] name 决定, 是 start.exe,
; 而不是 tauri.conf.json 里的 productName「鱼小曼点歌助手」(那个只用于窗口标题、
; 快捷方式和安装包文件名). 改这里之前先确认 [[bin]] name 没变.

!macro NSIS_HOOK_PREINSTALL
  ; 主窗口点关闭只会隐藏到托盘 (main.rs 的 CloseRequested 调了 prevent_close),
  ; 用户常以为已经退出就直接覆盖安装, 旧进程会锁住 resources/ 导致新文件写不进去,
  ; 装完仍在跑旧代码. 这里强制结束整棵进程树.
  ; /T 一并清理 WebView2 与 browser.rs spawn 出来的子进程;
  ; 不单独 kill msedgewebview2.exe —— 那是系统共享运行时, 会误伤其他应用.
  ; 用 nsExec::Exec 避免闪黑框, 进程不存在时的非零返回码直接丢弃, 不能打断安装.
  nsExec::Exec 'taskkill /F /IM start.exe /T'
  Pop $0
  ; 等系统真正释放文件句柄再开始覆盖写入
  Sleep 500
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; 用户数据 (登录 cookie / 各项设置 / 黑名单 / 点歌历史) 都在 %APPDATA%\ordersong,
  ; 默认保留, 这样卸载重装不会丢登录态; 询问后用户确认才清理.
  ; 静默卸载 (/S, CI 与自动化场景) 时不弹窗也不删除.
  IfSilent uninstall_keep_data 0
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除个人配置与登录数据？$\r$\n$\r$\n选择「否」将保留设置与登录状态，重新安装后可直接使用。" /SD IDNO IDYES uninstall_purge_data IDNO uninstall_keep_data

  uninstall_purge_data:
    RMDir /r "$APPDATA\ordersong"

  uninstall_keep_data:
!macroend
