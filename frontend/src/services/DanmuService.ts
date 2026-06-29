/**
 * 弹幕编排
 */

import { BiliOpenClient } from "@/infra/danmu/BiliOpenClient";
import { BiliWebClient } from "@/infra/danmu/BiliWebClient";
import type { DanmuClient } from "@/infra/danmu/DanmuClient";
import { parseControlCommand, parseOrderCommand } from "@/domain/danmu/command";
import { getMusic, PLATFORMS } from "@/services/MusicService";
import { handleDanmuOrder } from "@/services/QueueService";
import { playFirstIfNeeded, playNext } from "@/services/PlayerService";
import { queue } from "@/stores/queue";
import { settings } from "@/stores/settings";
import { session } from "@/stores/session";
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
}

window.addEventListener("beforeunload", () => {
    try {
        getDanmuClient().disconnect();
    } catch {
        /* ignore */
    }
});
