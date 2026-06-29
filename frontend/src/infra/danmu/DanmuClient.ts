/**
 * 弹幕客户端公共抽象.
 *
 * 两种弹幕协议 (开放平台身份码 / 房间号网页协议) 实现相同接口,
 * 业务层通过工厂按 settings.danmuMode() 选择.
 */

import type { DanmuMessage } from "@/types/danmu";

/** 弹幕消息监听器. */
export type DanmuListener = (msg: DanmuMessage) => void;

/** 弹幕客户端公共接口. */
export interface DanmuClient {
    /** 主播 / 房主 uid -- 用于识别管理员命令. */
    uid: string | number;
    onMessage(listener: DanmuListener): () => void;
    connect(): Promise<boolean>;
    disconnect(): Promise<void>;
    /** 测试用: 直接派发一条消息 (不经 WebSocket, 用于离线点歌验证) . */
    injectMessage(msg: DanmuMessage): void;
}
