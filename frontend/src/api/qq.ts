/**
 * `/qq-api/*` -- QQ 音乐代理客户端.
 */

import { ENV, qqApiUrl } from "@/config/env";
import { api } from "./http";

const url = (path: string) => qqApiUrl(path);

// `ENV` 仅在自定义 baseURL 的极少数场景里使用; 这里 import 一下避免 `noUnusedLocals` 误报.
void ENV;

export interface QqSongResp {
    songmid: string;
    songname: string;
    singer: Array<{ name: string }>;
    interval: number;
    albummid?: string;
}

export interface QqSearchResp {
    data?: { list?: QqSongResp[] };
}

export interface QqSongUrlResp {
    result: number;
    data: string | Record<string, string>;
    level?: string;
}

export const qqApi = {
    search(params: { key: string; pageSize?: number; pageNo?: number }) {
        return api.get<QqSearchResp>(url("/search"), { params });
    },
    songUrl(params: { id: string | number; level: string }) {
        return api.get<QqSongUrlResp>(url("/song/url"), { params });
    },
    toplist(params: { topid: number; num?: number }) {
        return api.get<{ data?: { list?: QqSongResp[] } }>(url("/toplist"), { params });
    },
    lyric(id: string | number) {
        return api.get<{ lyric?: string }>(url("/lyric"), { params: { id } });
    },
    setCookie(cookie: string) {
        return api.post(url("/user/setCookie"), { data: cookie }, {
            headers: { "Content-Type": "application/json" },
        });
    },
    favorite() {
        return api.get<{ data?: { list?: QqSongResp[] } }>(url("/user/favorite"), { timeout: 8000 });
    },
};
