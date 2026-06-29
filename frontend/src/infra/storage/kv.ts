/**
 * `localStorage` 读写工具 (带 try/catch + 写入防抖 + 后端镜像同步) .
 *
 * 白名单内的 key 在写入 / 删除时会同步到后端共享配置 ([`mirrorToServer`]) ,
 * 实现"桌面主窗口"与"浏览器打开的同 URL"共用一份登录态与设置.
 */

import { debounce } from "@/utils/throttle";
import { mirrorToServer } from "./shared";

/** 安全读取 JSON 值; 解析失败时回退 fallback. */
export function loadJSON<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

const debouncedWriters = new Map<string, (v: unknown) => void>();

/** 防抖写入 + 镜像到后端共享配置. */
export function saveJSON<T>(key: string, value: T): void {
    let writer = debouncedWriters.get(key);
    if (!writer) {
        writer = debounce<(v: unknown) => void>((v) => {
            try {
                localStorage.setItem(key, JSON.stringify(v));
            } catch (err) {
                console.warn(`[storage] 写入 ${key} 失败：`, err);
            }
        }, 300);
        debouncedWriters.set(key, writer);
    }
    writer(value);
    mirrorToServer(key, JSON.stringify(value));
}

/** 删除 key 并通知后端清空 (用于退出登录) . */
export function removeKey(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
    mirrorToServer(key, null);
}
