/**
 * Tauri 桌面环境检测与 invoke 封装.
 *
 * 同一份前端代码会被三种入口加载:
 * 1. Tauri 桌面主窗口: 可用 `invoke`.
 * 2. OBS 浏览器源 / 普通浏览器: 非 Tauri, 调用 `invoke` 会抛错 (UI 层应判 `isTauri()` 后再调) .
 * 3. Vite dev server (`pnpm dev`): 非 Tauri.
 */

type TauriGlobals = {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
};

/** 当前页面是否在 Tauri 桌面壳里运行. */
export function isTauri(): boolean {
    const g = window as unknown as TauriGlobals;
    return !!(g.__TAURI_INTERNALS__ || g.__TAURI__);
}

/** 调用 Tauri 命令; 非 Tauri 环境抛错. */
export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!isTauri()) {
        throw new Error(`非 Tauri 环境，无法调用命令 ${cmd}`);
    }
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
}
