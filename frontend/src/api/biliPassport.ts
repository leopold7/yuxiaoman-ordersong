/**
 * `/bili-passport/*` -- B 站扫码登录 + 身份码自动获取.
 */

import { ENV } from "@/config/env";
import { api, toApiError } from "./http";

const url = (path: string) => ENV.BASE_PATH + "/bili-passport" + path;

export interface QrcodeResp {
    code: number;
    url?: string;
    qrcode_key?: string;
    message?: string;
}

export interface PollResp {
    /** 0=登录成功 / 86038=失效 / 86090=已扫待确认 / 86101=未扫 / -1=网络错. */
    code: number;
    message?: string;
    /** 登录成功时返回的 cookie 串; 前端应当持久化到 sharedConfig. */
    cookie?: string;
}

export interface WhoamiResp {
    logged: boolean;
    mid?: number;
    uname?: string;
    avatar?: string;
}

export const biliPassportApi = {
    async generateQrcode(): Promise<QrcodeResp> {
        try {
            const { data } = await api.get<QrcodeResp>(url("/qrcode"), { timeout: 8000 });
            return data;
        } catch (err) {
            return { code: -1, message: toApiError(err).message };
        }
    },

    async poll(qrcodeKey: string): Promise<PollResp> {
        try {
            const { data } = await api.get<PollResp>(url("/poll"), {
                params: { qrcode_key: qrcodeKey },
                timeout: 6000,
            });
            return data;
        } catch (err) {
            return { code: -1, message: toApiError(err).message };
        }
    },

    /** 应用启动 hydrate 完 cookie 后调一次, 把 cookie 写回后端内存. */
    async setCookie(cookie: string): Promise<boolean> {
        try {
            await api.post(url("/setCookie"), { cookie }, { timeout: 4000 });
            return true;
        } catch (err) {
            console.warn("[bili-passport] setCookie 失败：", err);
            return false;
        }
    },

    async whoami(): Promise<WhoamiResp> {
        try {
            const { data } = await api.get<WhoamiResp>(url("/whoami"), { timeout: 6000 });
            return data;
        } catch {
            return { logged: false };
        }
    },

    async logout(): Promise<void> {
        try {
            await api.post(url("/logout"), {}, { timeout: 4000 });
        } catch {
            /* ignore */
        }
    },
};
