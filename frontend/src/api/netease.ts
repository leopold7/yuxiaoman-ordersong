/**
 * `/netease_api/*` -- 网易云 weapi 代理客户端.
 *
 * 这里只做"瘦"封装: 把 HTTP 调用与字段类型贴近后端响应; 上层 `services/MusicService`
 * 负责把它适配成统一的 `SongInfo[]` / 播放 URL 等领域形态.
 */

import { ENV } from "@/config/env";
import { api } from "./http";

const url = (path: string) => ENV.BASE_PATH + "/netease_api" + path;

export interface NeteaseSearchResp {
    result?: {
        songs?: Array<{
            id: number;
            name: string;
            ar?: Array<{ name: string }>;
            al?: { id: number; name: string; picUrl: string };
            dt?: number;
            artists?: Array<{ name: string }>;
            album?: { name: string; picUrl?: string };
            duration?: number;
        }>;
    };
}

export interface NeteaseSongUrlResp {
    code: number;
    message?: string;
    data: Array<{ id: number; url: string | null }>;
}

export interface NeteasePlayListResp {
    songs?: Array<{
        id: number;
        name: string;
        ar: Array<{ name: string }>;
        al?: { name?: string; picUrl?: string };
        dt?: number;
    }>;
}

export interface NeteaseLyricResp {
    lrc?: { lyric?: string };
    tlyric?: { lyric?: string };
}

export const neteaseApi = {
    cloudsearch(params: { keywords: string; limit?: number; type?: number; cookie?: string }) {
        return api.get<NeteaseSearchResp>(url("/cloudsearch"), { params });
    },
    songDetail(params: { ids: string | number; cookie?: string }) {
        return api.get<{ songs?: Array<{ id: number; al?: { picUrl: string; name: string } }> }>(
            url("/song/detail"),
            { params }
        );
    },
    songUrl(params: { id: string | number; level: string; cookie?: string }) {
        return api.get<NeteaseSongUrlResp>(url("/song/url/v1"), { params });
    },
    playlistTrackAll(params: { id: string; cookie?: string }) {
        return api.get<NeteasePlayListResp>(url("/playlist/track/all"), { params });
    },
    lyric(id: string | number) {
        return api.get<NeteaseLyricResp>(url("/lyric"), { params: { id } });
    },
    userAccount(cookie?: string) {
        return api.get(url("/user/account"), { params: { cookie } });
    },
    userPlaylist(uid: string | number, cookie?: string) {
        return api.get<{ playlist?: Array<{ id: number; name: string; userId?: number }> }>(
            url("/user/playlist"),
            { params: { uid, cookie } }
        );
    },
    qrKey() {
        return api.get<{ data?: { unikey: string } }>(url("/login/qr/key"), {
            params: { timestamp: Date.now() },
        });
    },
    qrCreate(unikey: string) {
        return api.get<{ data?: { qrimg: string } }>(url("/login/qr/create"), {
            params: { key: unikey, qrimg: true, timestamp: Date.now() },
        });
    },
    qrCheck(unikey: string) {
        return api.get<{ code: number; message?: string; cookie?: string }>(url("/login/qr/check"), {
            params: { key: unikey, timestamp: Date.now() },
        });
    },
};
