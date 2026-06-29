import { createSignal } from "solid-js";

export type ToastLevel = "info" | "success" | "warn" | "error";

export interface ToastItem {
    id: number;
    level: ToastLevel;
    text: string;
    expireAt: number;
}

const [toasts, setToasts] = createSignal<ToastItem[]>([]);
let nextId = 1;

const recentOnce = new Map<string, number>();

export function useToasts() {
    return toasts;
}

export function pushToast(text: string, level: ToastLevel = "info", ttlMs = 5000) {
    const id = nextId++;
    const expireAt = Date.now() + ttlMs;
    setToasts((arr) => [...arr, { id, level, text, expireAt }].slice(-12));
    setTimeout(() => {
        setToasts((arr) => arr.filter((t) => t.id !== id));
    }, ttlMs);
    return id;
}

export function pushToastOnce(key: string, text: string, level: ToastLevel = "info", cooldownMs = 5000) {
    const now = Date.now();
    const last = recentOnce.get(key) ?? 0;
    if (now - last < cooldownMs) return;
    recentOnce.set(key, now);
    pushToast(text, level);
}
