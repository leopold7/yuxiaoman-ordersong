/**
 * 弹幕编排
 */

import { BiliOpenClient } from "@/infra/danmu/BiliOpenClient";
import { BiliWebClient } from "@/infra/danmu/BiliWebClient";
import type { DanmuClient } from "@/infra/danmu/DanmuClient";
import { parseControlCommand, parseDeleteCommand, parseOrderCommand } from "@/domain/danmu/command";
import { getMusic, PLATFORMS } from "@/services/MusicService";
import { handleDanmuOrder } from "@/services/QueueService";
import { playFirstIfNeeded, playNext } from "@/services/PlayerService";
import { queue } from "@/stores/queue";
import { settings } from "@/stores/settings";
import { session } from "@/stores/session";
import { pushLiveNotice } from "@/stores/notice";
import { audioPlayer } from "@/infra/audio/AudioPlayer";
import { pushToast } from "@/utils/toast";
import type { DanmuMessage } from "@/types/danmu";
import type { Platform } from "@/types/song";

let client: DanmuClient | null = null;
let clientMode: "open" | "room" | null = null;

function createForMode(mode: "open" | "room"): DanmuClient {
    return mode === "room" ? new BiliWebClient() : new BiliOpenClient();
}

export function getDanmuClient(): DanmuClient {
    const mode = settings.danmuMode();
    if (!client || clientMode !== mode) {
        client = createForMode(mode);
        clientMode = mode;
    }
    return client;
}

export async function recreateDanmuClient(): Promise<DanmuClient> {
    if (client) {
        try {
            await client.disconnect();
        } catch {
            /* ignore */
        }
    }
    const mode = settings.danmuMode();
    client = createForMode(mode);
    clientMode = mode;
    return client;
}

let danmuListenerDispose: (() => void) | null = null;

export async function startDanmu(): Promise<void> {
    const c = getDanmuClient();
    danmuListenerDispose?.();
    danmuListenerDispose = c.onMessage(onDanmuMessage);
    await c.connect();
    session.setAdminUid(c.uid);
}

export async function restartDanmu(): Promise<void> {
    await recreateDanmuClient();
    await startDanmu();
}

async function onDanmuMessage(msg: DanmuMessage): Promise<void> {
    if (msg.type !== "dm" && msg.type !== "sc") return;
    const text = msg.danmu.trim();
    if (!text) return;

    const isAdmin = String(msg.uid) === String(session.adminUid());

    const cmd = parseOrderCommand(text, settings.triggerWords());
    if (cmd.matched && cmd.keyword) {
        const platform: Platform = cmd.platform ?? (settings.musicPlatform() as Platform);
        void PLATFORMS; // 平台前缀解析已在 domain 层完成
        const song = await getMusic(platform).search(cmd.keyword);
        if (!song) {
            pushToast(`没找到 [${cmd.keyword}]`, "warn");
            return;
        }
        const r = handleDanmuOrder(msg, song, isAdmin);
        if (r.ok) {
            pushToast(`已点: ${song.sname} - ${song.sartist}`, "success");
            playFirstIfNeeded();
            const head0 = queue.orderList()[0];
            if (head0 && head0.source === "idle" && r.item && r.item.id !== head0.id) {
                void playNext();
            }
        }
        return;
    }

    const control = parseControlCommand(text);
    if (control === "skip") {
        const head0 = queue.orderList()[0];
        if (!head0) return;
        const isOwner = String(head0.uid) === String(msg.uid);
        const isIdle = head0.source === "idle";
        if (isOwner || isAdmin || isIdle) {
            void playNext();
        } else {
            pushToast("不能切别人点的歌哦 (^o^)", "warn");
        }
        return;
    }
    if (control === "pause" || control === "play") {
        if (!isAdmin) {
            pushToast("您没有该权限", "warn");
            return;
        }
        if (control === "pause") audioPlayer.pause();
        else audioPlayer.play();
    }

    const del = parseDeleteCommand(text);
    if (del) {
        handleDanmuDelete(msg, del.index, isAdmin);
        return;
    }
}

/**
 * 弹幕删除点播: 普通观众只能删自己点播的等待队列第 N 首, 主播可删等待队列中任意第 N 首.
 *
 * 下标语义: orderList()[0] 为当前正在播放, 永远不可被"删除"删除 (只有"切歌"才会切掉) .
 * 因此 `删除 N` 一律针对等待队列 (orderList().slice(1)), 即第 N 首等待中的歌.
 *
 * - `index < 1` 或目标不存在 → 不做任何处理, 不提示 (无事发生) .
 * - 删除的歌不会是当前播放项, 故仅调用 `queue.removeById` 移除, 不触发切歌.
 * - 删除成功时推送一条主播端 toast (与点歌成功一致, 带出用户名) .
 */
function handleDanmuDelete(msg: DanmuMessage, index: number, isAdmin: boolean): void {
    if (index < 1) return;
    const waiting = queue.orderList().slice(1); // 排除当前正在播放 (index 0)
    const candidates = isAdmin
        ? waiting
        : waiting.filter((x) => String(x.uid) === String(msg.uid));
    const target = candidates[index - 1];
    if (!target) return; // 下标不存在, 无事发生

    queue.removeById(target.id);

    const uname = msg.uname || "观众";
    const tail = target.song.sartist
        ? `${target.song.sname} - ${target.song.sartist}`
        : target.song.sname;
    pushToast(`@${uname} 删除歌曲成功: ${tail}`, "success");
    pushLiveNotice(`@${uname} 删除歌曲成功: ${tail}`, "success", 5000);
}

window.addEventListener("beforeunload", () => {
    try {
        getDanmuClient().disconnect();
    } catch {
        /* ignore */
    }
});
