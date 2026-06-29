/**
 * B 站登录与房间号服务
 *
 * 桌面端用户在应用内扫码登录 B 站一次, cookie 会持久化 (共享配置)
 * 房间号模式据此拿到完整用户 uid, 并可一键获取主播自己的房间号
 *
 */

import { biliPassportApi } from "@/api/biliPassport";
import { biliWebApi } from "@/api/biliWeb";

export const biliPassportService = {
    generateQrcode: biliPassportApi.generateQrcode,
    poll: biliPassportApi.poll,
    setCookie: biliPassportApi.setCookie,
    whoami: biliPassportApi.whoami,
    logout: biliPassportApi.logout,

    /** 用已登录 cookie 拿主播自己的直播间房间号 */
    async fetchMyRoomId(): Promise<{ code: number; room_id?: number; message?: string }> {
        return biliWebApi.myRoom();
    },
};
