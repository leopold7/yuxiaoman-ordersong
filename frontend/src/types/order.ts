import type { Platform, SongInfo } from "./song";

/**
 * 一条点歌记录的来源 -- 决定优先级, 是否计入统计
 *
 * - `danmu`: 普通弹幕命令
 * - `sc`: B 站 SuperChat 文字命令 (保留: SC 自带文字, 可作为高优先级点歌渠道)
 * - `admin`: 主播本人在主控面板手动加歌 (永远最高优先级)
 * - `idle`: 队列空时自动从空闲歌单补歌 (永远最低优先级)
 *
 */
export type OrderSource = "danmu" | "sc" | "admin" | "idle";

/** 队列里一条点歌记录的完整快照 */
export interface OrderItem {
    id: string;
    uid: string | number;
    uname: string;  
    song: SongInfo;
    source: OrderSource;
    priority: number;
    fansMedalLevel?: number;
    addedAt: number;
}

/** 简化的用户引用 (用于黑名单 / 历史列表) */
export interface UserBrief {
    uid: string | number;
    uname: string;
}

/** 一条已播放歌曲的统计行 */
export interface PlayStatRow {
    ts: number;
    uid: string | number;
    uname: string;
    sid: string | number;
    sname: string;
    sartist: string;
    platform: Platform;
    duration: number;
    source: OrderSource;
    priority: number;
}
