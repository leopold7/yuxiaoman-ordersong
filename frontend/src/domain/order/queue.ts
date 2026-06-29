/**
 * 队列规则纯函数.
 *
 * 把"队列里能否插一首新歌 / 在哪个位置插"这套规则从 Solid 信号中剥离出来,
 * 让它可以脱离 store 单测.
 */

import type { OrderItem } from "@/types/order";

/** 已存在条目的简化视图 (隐去 store 细节, 便于纯函数 reasoning) . */
export interface QueueProbe {
    /** 当前队列长度. */
    length: number;
    /** 当前 uid 已点歌数. */
    countByUid(uid: string | number): number;
    /** 当前 sid 是否已在队列里. */
    hasSong(sid: string | number): boolean;
}

/** 队列容量 / 时长校验配置. */
export interface QueueGuardConfig {
    userMaxOrder: number;
    globalMaxOrder: number;
    /** 0 表示不限. */
    orderMaxDurationSec: number;
}

/** `tryAccept` 返回的失败原因. */
export type RejectReason =
    | "已在黑名单"
    | "歌曲在黑名单"
    | "歌曲已点上"
    | "你点的歌太多啦"
    | "队列已满"
    | "歌曲时长超限";

/** 把一条新点歌按队列规则做"接 / 不接"的判定. */
export function tryAccept(opts: {
    uid: string | number;
    songId: string | number;
    songDurationSec?: number;
    userBlocked: boolean;
    songBlocked: boolean;
    queue: QueueProbe;
    cfg: QueueGuardConfig;
}): { ok: true } | { ok: false; reason: RejectReason } {
    if (opts.userBlocked) return { ok: false, reason: "已在黑名单" };
    if (opts.songBlocked) return { ok: false, reason: "歌曲在黑名单" };
    if (opts.queue.hasSong(opts.songId)) return { ok: false, reason: "歌曲已点上" };
    if (opts.queue.countByUid(opts.uid) >= opts.cfg.userMaxOrder) {
        return { ok: false, reason: "你点的歌太多啦" };
    }
    if (opts.queue.length >= opts.cfg.globalMaxOrder) {
        return { ok: false, reason: "队列已满" };
    }
    if (opts.cfg.orderMaxDurationSec > 0 && opts.songDurationSec && opts.songDurationSec > opts.cfg.orderMaxDurationSec) {
        return { ok: false, reason: "歌曲时长超限" };
    }
    return { ok: true };
}

/**
 * 根据优先级算出新条目的插入索引. 索引 `0` (正在播放) 不动; 其余按优先级降序排列,
 * 同优先级追加到该组尾部.
 */
export function computeInsertIndex(list: OrderItem[], priority: number): number {
    let insertIdx = list.length;
    const skipPlaying = list.length > 0 ? 1 : 0;
    for (let i = skipPlaying; i < list.length; i++) {
        if (list[i].priority < priority) {
            insertIdx = i;
            break;
        }
    }
    return insertIdx;
}
