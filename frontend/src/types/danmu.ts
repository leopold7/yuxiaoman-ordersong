/**
 * 弹幕领域类型
 *
 * - `dm`: 普通弹幕
 * - `sc`: SuperChat (带文字内容)
 *
 */

import type { Platform } from "./song";

/** 支持的弹幕直播平台 */
export type DanmuPlatform = "bilibili" | "douyin" | "douyu";

/** 已派发到业务层的弹幕事件类型 */
export type DanmuMessageType = "dm" | "sc";

/** 一条统一化后的弹幕消息 (业务层只看见这种结构) */
export interface DanmuMessage {
    type: DanmuMessageType;
    uid: string | number;
    uname: string;
    /** 文本内容 (弹幕原文 / SC 文本) */
    danmu: string;
    fansMedalLevel: number;
    fansMedalWearing: boolean;
    /** SC 价格 (元) ; 普通弹幕为 undefined */
    price?: number;
    paid?: boolean;
    /** 原始 JSON 透传 (调试用, 业务侧不应依赖具体字段) */
    raw?: unknown;
}

/** 已登录到各平台的状态 (不含 cookie 等敏感字段) */
export interface LoginState {
    netease: { logged: boolean; nickname?: string; avatar?: string; vipType?: number; userId?: number | string };
    qq: { logged: boolean; nickname?: string; uin?: string };
}

/** 仅在前端持久化的弹幕平台引用 (保留以兼容现有 settings 持久化) */
export type AnyPlatformKey = Platform | DanmuPlatform;
