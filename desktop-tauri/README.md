# desktop-tauri

把 `frontend/` 打包为 **鱼小曼点歌助手** 桌面应用（产出 `start.exe`）。

后端服务由 Rust 内嵌 axum 接管，**不再有 Node sidecar**。Rust 代码位于
`src-tauri/`，按 Cargo Workspace 拆分为多个 crate，可执行入口是 `crates/app`
（bin 名 `start`）。

## 运行架构

```
┌───────────────────────────────────────────────────────────────┐
│  start.exe (Tauri 2 主进程, Rust)                              │
│  ├─ 内嵌 axum 服务监听 127.0.0.1:17777                         │
│  ├─ 轮询 /healthz 通过后显示主窗口                              │
│  └─ WebView:                                                   │
│       · dev 态  → http://127.0.0.1:5173/order/  (Vite, 含 HMR) │
│       · prod 态 → http://127.0.0.1:17777/order/ (axum 静态)    │
└───────────────────────────────────────────────────────────────┘
```

- **dev**：`tauri.conf.json` 的 `beforeDevCommand` 会自动拉起 Vite dev server；WebView
  加载 Vite，前端 HMR 生效，`/order/*-api`、`/healthz` 由 Vite proxy 反代到 axum。
- **prod**：`bundle-backend.mjs` 把 `frontend/dist` 拷进 `crates/app/resources/frontend/dist`，
  axum 用 `ServeDir` 直接对外提供，WebView 加载 axum 页面，无 CORS 问题。
- 关闭窗口最小化到系统托盘，弹幕服务后台继续运行。

## 依赖

- Node 20+、pnpm 9+
- Rust 1.75+（`rustup default stable`）
- Visual Studio Build Tools（Desktop development with C++）
- Windows 10 1809+ / 11（一般自带 WebView2 Runtime，缺失时需 [手动安装](https://developer.microsoft.com/microsoft-edge/webview2/)）

## 开发

```powershell
# 只需一条命令：
#   1) tauri.conf.json 里的 beforeDevCommand 会自动 spawn `pnpm --filter ordersong-frontend dev`
#      在 127.0.0.1:5173 启动 Vite（前端 HMR）
#   2) Tauri 探测到 devUrl 通过后，编译并启动 Rust 主进程
#   3) Rust setup() 里 spawn axum 监听 127.0.0.1:17777
#   4) 健康检查通过后，WebView location.replace 到 Vite dev URL 并 show 窗口
pnpm --filter ordersong-desktop dev
```

> 生产打包才需要 `bundle:res`（复制真实 dist + config 到 `crates/app/resources`）。
> dev 态下的 WebView 直接跑在 Vite 上，不使用打包资源。

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
