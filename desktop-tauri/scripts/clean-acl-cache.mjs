/**
 * 清理 Tauri ACL / 二进制缓存
 *
 * Tauri 2 + cargo 在 Windows 下有个老问题：
 *   - build.rs 把生成的 ACL JSON 输出到带 hash 的 `target/release/build/ordersong-desktop-<hash>/out/...`
 *   - main.rs 的 `generate_context!()` 宏通过老的 `.d` 文件 still 引用旧 hash 路径
 *   - 改 Cargo.toml feature / permissions / capabilities 后，acl-manifests.json 是新的，
 *     但嵌进 start.exe 的 ACL 副本是缓存里的老版本 → 出现 "Command X not allowed by ACL"
 *
 * 解决：每次 `pnpm installer` 前，强制清理：
 *   1. 残留的 start.exe 进程（避免文件锁）
 *   2. target/release/build/ordersong-desktop-* 全部子目录
 *   3. target/release/.fingerprint/ordersong-desktop-* 全部子目录
 *   4. target/release/start.exe / .pdb（被锁住的话只能等 step 1 杀掉）
 *   5. target/release/deps/start.exe / .pdb / .d
 *
 * 这个脚本只动 ordersong-desktop 的产物，不会清掉 cargo 的全局依赖编译缓存，
 * 所以增量构建依然很快（只重链一遍 main.rs）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_TAURI = path.resolve(__dirname, "..", "src-tauri");
const RELEASE = path.join(SRC_TAURI, "target", "release");
const BUILD_DIR = path.join(RELEASE, "build");
const FP_DIR = path.join(RELEASE, ".fingerprint");
const DEPS_DIR = path.join(RELEASE, "deps");

function rel(p) {
    return path.relative(SRC_TAURI, p).replaceAll("\\", "/");
}
function rmFile(p) {
    if (!fs.existsSync(p)) return false;
    try {
        fs.rmSync(p, { force: true });
        console.log(`[clean-acl]  rm  ${rel(p)}`);
        return true;
    } catch (e) {
        console.warn(`[clean-acl]  ! 无法删除 ${rel(p)} —— ${e.message}`);
        return false;
    }
}
function rmGlobPrefix(dir, prefix) {
    if (!fs.existsSync(dir)) return 0;
    let n = 0;
    for (const name of fs.readdirSync(dir)) {
        if (!name.startsWith(prefix)) continue;
        const abs = path.join(dir, name);
        try {
            fs.rmSync(abs, { recursive: true, force: true });
            console.log(`[clean-acl]  rm  ${rel(abs)}`);
            n++;
        } catch (e) {
            console.warn(`[clean-acl]  ! 无法删除 ${rel(abs)} —— ${e.message}`);
        }
    }
    return n;
}

console.log("[clean-acl] 开始清理 Tauri ACL 缓存...");

// 1) 杀掉残留的 start.exe
if (process.platform === "win32") {
    try {
        execSync("taskkill /F /IM start.exe /T", { stdio: "pipe" });
        console.log("[clean-acl]  kill  start.exe");
    } catch {
        
    }
}

// 2) 清掉 ordersong-desktop 的 build script 输出
const buildRemoved = rmGlobPrefix(BUILD_DIR, "ordersong-app-");
const fpRemoved = rmGlobPrefix(FP_DIR, "ordersong-app-");

// 3) 清掉 deps 里的中间产物
let depsRemoved = 0;
for (const name of [
    path.join(DEPS_DIR, "start.exe"),
    path.join(DEPS_DIR, "start.pdb"),
    path.join(DEPS_DIR, "start.d"),
    path.join(RELEASE, "start.exe"),
    path.join(RELEASE, "start.pdb")
]) {
    if (rmFile(name)) depsRemoved++;
}

console.log(
    `[clean-acl] 完成 —— 删除 build/${buildRemoved}, fingerprint/${fpRemoved}, deps+release/${depsRemoved}`
);
