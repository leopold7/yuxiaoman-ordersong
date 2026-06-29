/**
 * 统一 HTTP 客户端 + 错误归一化.
 *
 * 所有 backend 调用都该走这里 -- 它会:
 * 1. 自动加上 `Content-Type: application/json`
 * 2. 网络错误 (超时 / 离线) 按指数退避自动重试, 避免 UI 一次掉线就报红
 * 3. 把 axios 错误归一成 `{ code, message }` 中文化, 给 UI 直接显示
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";

export interface ApiClientOptions {
    baseURL?: string;
    timeout?: number;
    retry?: number;
}

/** 构造一个带重试逻辑的 axios 实例. */
export function createClient(opts: ApiClientOptions = {}): AxiosInstance {
    const ins = axios.create({
        baseURL: opts.baseURL,
        timeout: opts.timeout ?? 10000,
    });

    const retry = opts.retry ?? 2;
    ins.interceptors.response.use(undefined, async (err) => {
        const cfg = err?.config as (AxiosRequestConfig & { __retryCount?: number }) | undefined;
        if (!cfg) throw err;
        const isNetwork = !err.response || err.code === "ECONNABORTED";
        if (!isNetwork) throw err;
        cfg.__retryCount = (cfg.__retryCount ?? 0) + 1;
        if (cfg.__retryCount > retry) throw err;
        const delay = Math.min(2000 * 2 ** (cfg.__retryCount - 1), 8000);
        await new Promise((r) => setTimeout(r, delay));
        return ins.request(cfg);
    });

    return ins;
}

/** 默认共用客户端. */
export const api = createClient();

/** 业务错误的统一结构. */
export interface ApiError {
    code: number;
    message: string;
}

/** 把任意错误归一成 `ApiError` (消息中文化) . */
export function toApiError(err: unknown, fallback = "请求失败"): ApiError {
    if (err && typeof err === "object") {
        const anyErr = err as { response?: { data?: { message?: string; code?: number } }; message?: string };
        const msg = anyErr.response?.data?.message ?? anyErr.message;
        const code = anyErr.response?.data?.code;
        return { code: code ?? -1, message: msg || fallback };
    }
    return { code: -1, message: String(err ?? fallback) };
}
