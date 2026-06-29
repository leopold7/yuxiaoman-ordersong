/**
 * `/app-config` -- 跨客户端共享配置.
 *
 * 桌面主窗口与浏览器打开的同 URL 有各自独立的 localStorage 分区;
 * 这里把关键配置集中托管到后端, 让两端共用一份登录态与设置.
 */

import { ENV } from "@/config/env";
import { api } from "./http";

const URL = ENV.BASE_PATH + "/app-config";

export const appConfigApi = {
    /** 拉取整个共享配置 (key-value 对, value 是 localStorage 里的原始字符串) . */
    fetch() {
        return api.get<Record<string, string | null>>(URL, { timeout: 4000 });
    },
    /** 浅合并上送: value 为 null 时删除该 key. */
    patch(body: Record<string, string | null>) {
        return api.post(URL, body, { timeout: 4000 });
    },
};
