/**
 * 准备桌面打包所需的资源（frontend dist + config）
 *
 * 注：旧版本会构建 Node sidecar 并打包 backend 代码。本版本已完全切换到 Rust 内嵌服务，
 *     这里只需要复制前端静态资源 + 配置文件即可。
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DESKTOP_DIR = path.resolve(__dirname, "..");
const APP_CRATE = path.join(DESKTOP_DIR, "src-tauri", "crates", "app");
const RESOURCES_DIR = path.join(APP_CRATE, "resources");
const FRONTEND_DIST = path.join(ROOT, "frontend", "dist");

function rimraf(p) {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}
function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}
function copyDir(src, dst) {
    fs.cpSync(src, dst, { recursive: true, dereference: true });
}

console.log("[bundle] 清理旧产物");
rimraf(RESOURCES_DIR);
ensureDir(RESOURCES_DIR);

console.log("[bundle] 构建 frontend (vite)");
execFileSync("pnpm", ["--filter", "ordersong-frontend", "build"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true
});

console.log("[bundle] 复制 frontend/dist → resources/frontend/dist");
copyDir(FRONTEND_DIST, path.join(RESOURCES_DIR, "frontend", "dist"));

console.log("[bundle] 复制 config → resources/config");
copyDir(path.join(ROOT, "config"), path.join(RESOURCES_DIR, "config"));

console.log("[bundle] 完成");
