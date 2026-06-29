/**
 * `/bili-room/*` -- B 站直播间网页弹幕协议代理客户端.
 */

import { ENV } from "@/config/env";
import { api } from "./http";

const url = (path: string) => ENV.BASE_PATH + "/bili-room" + path;

export interface RoomInitResp {
    code: number;
    message?: string;
    room_id?: number;
    owner_uid?: number;
    live_status?: number;
    title?: string;
}

export interface DanmuInfoResp {
    code: number;
    message?: string;
    token?: string;
    host_list?: Array<{ host: string; wss_port?: number; ws_port?: number; port?: number }>;
    uid?: number;
    buvid?: string;
    room_id?: number;
}

export const biliWebApi = {
    /** 短号 → 真实房间号 + 主播 uid + 直播状态. */
    async init(room: string): Promise<RoomInitResp> {
        const { data } = await api.get<RoomInitResp>(url("/init"), { params: { room }, timeout: 8000 });
        return data;
    },

    /** 拉取 WebSocket 服务器列表 + 鉴权 token. */
    async danmuInfo(roomId: number | string): Promise<DanmuInfoResp> {
        const { data } = await api.get<DanmuInfoResp>(url("/danmuInfo"), {
            params: { room: roomId },
            timeout: 8000,
        });
        return data;
    },

    /** 用已登录 cookie 反查主播自己的房间号. */
    async myRoom(): Promise<{ code: number; room_id?: number; message?: string }> {
        const { data } = await api.get<{ code: number; room_id?: number; message?: string }>(
            url("/myroom"),
            { timeout: 8000 }
        );
        return data;
    },
};
