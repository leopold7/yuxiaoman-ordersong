/**
 * `/live-state` -- OBS 浏览器源跨进程播放快照同步.
 */

import { ENV } from "@/config/env";
import { api } from "./http";
import type { LiveStateSnapshot } from "@/types/live";

const URL = () => ENV.BASE_PATH + "/live-state";

export const liveStateApi = {
    /** 主程序: POST 快照. */
    async push(s: LiveStateSnapshot): Promise<void> {
        try {
            await api.post(URL(), s, { timeout: 4000 });
        } catch {
            /* ignore - overlay 丢一两帧无所谓 */
        }
    },

    /** OBS 浏览器源: GET 快照. */
    async pull(): Promise<LiveStateSnapshot | null> {
        try {
            const { data } = await api.get<LiveStateSnapshot | null>(URL(), { timeout: 4000 });
            return data ?? null;
        } catch {
            return null;
        }
    },
};
