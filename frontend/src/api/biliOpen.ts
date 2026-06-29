/**
 * `/bili-api/*` -- B 站开放平台"互动玩法"HTTP 代理客户端.
 */

import { ENV } from "@/config/env";
import { api } from "./http";

const url = (path: string) => ENV.BASE_PATH + "/bili-api" + path;

export interface GameStartData {
    game_info: { game_id: string; open_id: string };
    anchor_info: { room_id: number };
    websocket_info: { wss_link: string[]; auth_body: string };
}

export interface GameStartResp {
    code: number;
    data?: GameStartData;
    message?: string;
}

export const biliOpenApi = {
    /** 开始一场互动玩法连接. */
    async gameStart(body: { code: string; app_id: number }): Promise<GameStartResp> {
        const { data } = await api.post<GameStartResp>(url("/gameStart"), body);
        return data;
    },

    /** 优雅退场. */
    async gameEnd(body: { app_id: number; game_id: string }): Promise<{ code: number; message?: string }> {
        const { data } = await api.post<{ code: number; message?: string }>(url("/gameEnd"), body, { timeout: 5000 });
        return data;
    },

    /** 单场次心跳. */
    async gameHeartbeat(gameId: string): Promise<void> {
        await api.post(url("/gameHeartBeat"), { game_id: gameId }, { timeout: 5000 });
    },
};
