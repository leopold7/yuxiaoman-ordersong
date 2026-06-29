# desktop-tauri

把 `frontend/` 打包为 **鱼小曼点歌助手** 桌面应用（产出 `start.exe`）。

后端服务由 Rust 内嵌 axum 接管，**不再有 Node sidecar**。Rust 代码位于
`src-tauri/`，按 Cargo Workspace 拆分为多个 crate，可执行入口是 `crates/app`
（bin 名 `start`）。

## 运行架构

```
┌─────────────────────────────────────────────┐
│  start.exe (Tauri 2 主进程, Rust)            │
│  ├─ 内嵌 axum 服务监听 127.0.0.1:17777       │
│  ├─ 轮询 /healthz 通过后显示主窗口           │
│  └─ WebView 加载 http://127.0.0.1:17777/order/│
└─────────────────────────────────────────────┘
```

WebView 加载后端 serve 的页面，无 CORS 问题；关闭窗口最小化到系统托盘，弹幕服务后台继续运行。

## 依赖

- Node 20+、pnpm 9+
- Rust 1.75+（`rustup default stable`）
- Visual Studio Build Tools（Desktop development with C++）
- Windows 10 1809+ / 11（一般自带 WebView2 Runtime，缺失时需 [手动安装](https://developer.microsoft.com/microsoft-edge/webview2/)）

## 开发

```powershell
# 1. 准备资源（编译 frontend + 复制 config 到 crates/app/resources）
pnpm --filter ordersong-desktop bundle:res

# 2. 启动 Tauri dev（窗口等后端健康检查通过后再显示）
pnpm --filter ordersong-desktop dev
```

## 生产构建（NSIS 安装包）

```powershell
pnpm --filter ordersong-desktop installer
# 产物: src-tauri/target/release/bundle/
```

> Tauri CLI 会自动发现 `src-tauri/crates/app/tauri.conf.json`。若提示找不到配置，
> 设置环境变量 `TAURI_APP_PATH=desktop-tauri/src-tauri/crates/app` 后重试。

## 自定义图标

`scripts/gen-icon.mjs` 仅用于生成构建期需要的占位 `.ico`。正式上架请用专业工具准备多分辨率图标并替换 `src-tauri/crates/app/icons/icon.ico`。

## 故障排查

| 现象 | 排查 |
|---|---|
| 编译报 `MSVC` 找不到 | 安装 VS Build Tools 并勾选 "Desktop development with C++" |
| 窗口空白 / 一直在启动 | 查看 exe 同目录的 `ordersong.log`；常见原因：`config.yaml` 找不到、端口 17777 被占 |
| 其它机器无法访问 17777 | 默认绑定 `127.0.0.1`；如需局域网访问，设 `WEB_SERVER_HOST=0.0.0.0` 后重新构建 |
