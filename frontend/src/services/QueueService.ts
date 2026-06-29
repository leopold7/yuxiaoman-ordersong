/**
 * 点歌入队编排
 */

import { computePriority } from "@/domain/order/priority";
import { checkCooldown, markOrderSuccess } from "@/domain/order/cooldown";
import { computeInsertIndex, tryAccept } from "@/domain/order/queue";
import { queue } from "@/stores/queue";
import { session } from "@/stores/session";
import { settings } from "@/stores/settings";
import { pushLiveNotice } from "@/stores/notice";
import { pushToast } from "@/utils/toast";
import { safeId } from "@/utils/sanitize";
import type { DanmuMessage } from "@/types/danmu";
import type { OrderItem, OrderSource } from "@/types/order";
import type { SongInfo } from "@/types/song";

/** 主播手动加歌与空闲补歌不计冷却 */
const COOLDOWN_EXEMPT: OrderSource[] = ["admin", "idle"];

/** 入队请求 */
interface AddOrderInput {
    uid: string | number;
    uname: string;
    song: SongInfo;
    source: OrderSource;
    fansMedalLevel?: number;
    price?: number;
    isAdmin?: boolean;
}

/** 入队结果 */
export interface AddOrderResult {
    ok: boolean;
    item?: OrderItem;
    reason?: string;
    cooldownRemain?: number;
}

export function tryAddOrder(input: AddOrderInput): AddOrderResult {
    const { uid, uname, song } = input;
    const source: OrderSource = input.isAdmin ? "admin" : input.source;

    if (!input.isAdmin) {
        const userBlocked = session.userBlackList().some((x) => String(x.uid) === String(uid));
        const songBlocked = session.songBlackList().some((x) => String(x.sid) === String(song.sid));
        const accept = tryAccept({
            uid,
            songId: song.sid,
            songDurationSec: song.duration,
            userBlocked,
            songBlocked,
            queue: {
                length: queue.orderList().length,
                countByUid: (u) => queue.countByUid(u),
                hasSong: (s) => queue.hasSong(s),
            },
            cfg: {
                userMaxOrder: settings.userMaxOrder(),
                globalMaxOrder: settings.globalMaxOrder(),
                orderMaxDurationSec: settings.orderMaxDuration(),
            },
        });
        if (!accept.ok) return { ok: false, reason: accept.reason };

        if (!COOLDOWN_EXEMPT.includes(source)) {
            const cd = checkCooldown(uid, settings.cooldownSec());
            if (cd.onCooldown) return { ok: false, reason: "冷却中", cooldownRemain: cd.remainSec };
        }
    }

    const priority = computePriority(
        { source, fansMedalLevel: input.fansMedalLevel, price: input.price },
        {
            enableSCBoost: settings.enableSCBoost(),
            enableFansMedalBoost: settings.enableFansMedalBoost(),
            fansMedalThreshold: settings.fansMedalThreshold(),
        }
    );

    const item: OrderItem = {
        id: safeId("ord"),
        uid,
        uname,
        song,
        source,
        priority,
        fansMedalLevel: input.fansMedalLevel,
        addedAt: Date.now(),
    };

    const insertIdx = computeInsertIndex(queue.orderList(), priority);
    queue.insertAt(item, insertIdx);

    if (source !== "idle") {
        markOrderSuccess(uid);
        session.addUserHistory({ uid, uname });
        session.addSongHistory({ sid: song.sid, sname: song.sname });
    }

    return { ok: true, item };
}

/**
 * 弹幕入口
 *
 */
export function handleDanmuOrder(msg: DanmuMessage, song: SongInfo, isAdmin: boolean): AddOrderResult {
    const source: OrderSource = msg.type === "sc" ? "sc" : "danmu";
    const r = tryAddOrder({
        uid: msg.uid,
        uname: msg.uname,
        song,
        source,
        fansMedalLevel: msg.fansMedalLevel,
        price: msg.price,
        isAdmin,
    });

    const uname = msg.uname || "观众";
    if (r.ok && r.item) {
        const tail = song.sartist ? `${song.sname} - ${song.sartist}` : song.sname;
        pushLiveNotice(`@${uname} 点歌成功: ${tail}`, "success", 5000);
    } else if (!r.ok && r.reason) {
        pushToast(`点歌失败: ${r.reason}`, "warn");
        let notice = "";
        switch (r.reason) {
            case "冷却中":
                notice = `@${uname} 点歌太频繁啦, ${r.cooldownRemain ?? settings.cooldownSec()}s 后再点~`;
                break;
            case "你点的歌太多啦":
                notice = `@${uname} 你已点 ${settings.userMaxOrder()} 首, 等放完再点哦~`;
                break;
            case "队列已满":
                notice = `点歌队列已满 (${settings.globalMaxOrder()} 首), 稍后再点~`;
                break;
            case "歌曲已点上":
                notice = "这首歌已经在队列里啦~";
                break;
            case "歌曲时长超限":
                notice = "这首歌太长啦, 换一首吧~";
                break;
            // 黑名单类原因不向观众公开提示
        }
        if (notice) pushLiveNotice(notice, "warn");
    }
    return r;
}
