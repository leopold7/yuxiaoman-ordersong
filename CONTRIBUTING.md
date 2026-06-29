# 贡献指南

感谢你愿意为「鱼小曼点歌助手」出一份力！本文档帮助你快速上手开发与提交。

## 开发环境

- Node.js 20+ / pnpm 9+
- Rust 1.75+（`rustup` 安装，仓库内置 `rust-toolchain.toml`）
- Windows：Visual Studio Build Tools（C++ 桌面开发）+ WebView2 Runtime

```bash
pnpm install
```

## 项目结构速览

```
order_song_yxm/
├── frontend/                     前端 (Vite + SolidJS)
│   └── src/{types,domain,api,infra,services,stores,hooks,components,views}
├── desktop-tauri/src-tauri/      Rust workspace
│   └── crates/{core,bili-open,bili-web,bili-passport,music,server,app}
├── config/                       运行时配置 + 默认模板
└── docs/                         架构与 API 文档
```

分层职责详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。新增功能时请遵循依赖方向：

- 后端：业务 crate 只依赖 `core`，axum 装配只在 `server`，可执行入口只在 `app`。
- 前端：`domain` 为纯函数零副作用；副作用进 `infra`；HTTP 进 `api`；编排进 `services`；UI 不直接调 `api`/`infra`。

## 本地校验

提交前请确保以下命令通过：

```bash
# 前端类型检查
pnpm --filter ordersong-frontend typecheck

# Rust 编译检查（整个 workspace）
cargo check --workspace --manifest-path desktop-tauri/src-tauri/Cargo.toml

# Rust 格式化与 lint（可选但推荐）
cargo fmt --all --manifest-path desktop-tauri/src-tauri/Cargo.toml
cargo clippy --workspace --manifest-path desktop-tauri/src-tauri/Cargo.toml
```

## 提交前格式预检

仓库内置了 `pre-commit` 钩子，`pnpm install` 时会自动执行
`git config core.hooksPath .githooks` 启用（见 `package.json` 的 `prepare`）。
首次使用请确保已 `git init` 后再 `pnpm install`。

钩子在 `git commit` 前会运行：

```bash
cargo fmt --all --check          # Rust 格式
pnpm --filter ordersong-frontend typecheck  # 前端类型
```

也可手动执行：`pnpm precommit`。临时跳过：`git commit --no-verify`。

## 代码风格

- **缩进**：统一 4 空格（YAML 2 空格），见 `.editorconfig`。
- **注释**：
  - 关键业务逻辑需有文档注释（Rust 用 `///`/`//!`，TS 用 TSDoc `/** */`）。
  - **代码注释中不要使用中文标点**（用 ASCII 的 `, . : ; ( )` 等），以保证跨编辑器对齐与 diff 干净。
- **配置项**：不要硬编码接口地址 / UA / 重试参数，集中到 `core::consts` 或前端 `config/env.ts`。

## 提交规范

- 提交信息建议用前缀：`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:`。
- 一个 PR 聚焦一件事，附上动机与验证方式。
- 改动涉及接口 / 配置时，同步更新 `docs/` 与 README。

## 提交 Issue

请使用 [Issue 模板](.github/ISSUE_TEMPLATE)，附上复现步骤、期望行为、实际行为、环境信息与日志（`ordersong.log`）。

请保持友善、互相尊重，共同维护良好的协作氛围。