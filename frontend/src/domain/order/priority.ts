/**
 * 点歌优先级计算 (纯函数) .
 *
 * 优先级越大越靠前. 规则 (重构后已删除 gift / guard 加权) :
 * - `admin`: 1000, 强制置顶
 * - `sc` (SuperChat 文字命令) : 500 + 价格 / 30
 * - 普通弹幕: 0
 * - 粉丝牌等级 ≥ 阈值时 +50
 * - `idle`: -100 (空闲歌单永远最低)
 */

import type { OrderSource } from "@/types/order";

/** 计算优先级所需的可配项 -- 由调用方从 settings 中映射进来 */
export interface PriorityConfig {
    enableSCBoost: boolean;
    enableFansMedalBoost: boolean;
    fansMedalThreshold: number;
}

/** 计算优先级时的上下文 */
export interface PriorityInput {
    source: OrderSource;
    fansMedalLevel?: number;
    /** SC 单条消息的 RMB 价格 */
    price?: number;
}

/** 计算单条点歌请求的最终优先级数值 */
export function computePriority(input: PriorityInput, cfg: PriorityConfig): number {
    if (input.source === "admin") return 1000;
    if (input.source === "idle") return -100;

    let p = 0;
    if (input.source === "sc" && cfg.enableSCBoost) {
        p = Math.max(p, 500 + Math.floor((input.price ?? 0) / 30));
    }
    if (cfg.enableFansMedalBoost && (input.fansMedalLevel ?? 0) >= cfg.fansMedalThreshold) {
        p += 50;
    }
    return p;
}
