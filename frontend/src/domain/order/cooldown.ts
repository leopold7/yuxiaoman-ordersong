/**
 * 用户点歌冷却
 *
 * 冷却以"最近一次成功点歌"时间为基准, 由 [`markOrderSuccess`] 维护. 管理员 / 空闲补歌
 * 不受冷却约束 (由调用方先过滤掉)
 */

const lastOrderAtByUid = new Map<string, number>();

/**
 * 把指定 uid 的"最近一次成功点歌时间"标记为现在
 *
 * @returns 当前时间戳 (ms)
 */
export function markOrderSuccess(uid: string | number, now = Date.now()): number {
    lastOrderAtByUid.set(String(uid), now);
    return now;
}

/** 强制清空所有冷却记录 (统计页 "清空" 按钮 / 单元测试用) . */
export function clearCooldown(): void {
    lastOrderAtByUid.clear();
}

/** 冷却检查结果. */
export interface CooldownStatus {
    /** 是否仍在冷却中. */
    onCooldown: boolean;
    /** 剩余秒数 (已四舍五入向上取整) , 未冷却时为 0. */
    remainSec: number;
}

/** 当前 uid 是否还在冷却中. `cooldownSec <= 0` 表示完全关闭冷却. */
export function checkCooldown(
    uid: string | number,
    cooldownSec: number,
    now = Date.now()
): CooldownStatus {
    if (cooldownSec <= 0) return { onCooldown: false, remainSec: 0 };
    const last = lastOrderAtByUid.get(String(uid)) ?? 0;
    const elapsed = now - last;
    const cooldownMs = cooldownSec * 1000;
    if (elapsed >= cooldownMs) return { onCooldown: false, remainSec: 0 };
    return { onCooldown: true, remainSec: Math.ceil((cooldownMs - elapsed) / 1000) };
}
