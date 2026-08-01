/**
 * 跨客户端共享配置同步 (后端 `/app-config` 持久化) .
 *
 * 启动时 [`hydrateFromSharedConfig`] 拉取后端配置并写回本地 localStorage;
 * 任意变更时 [`mirrorToServer`] 防抖批量上送.
 *
 * 关键设计: hydrate 完成 (或失败兜底) 之前 `mirrorToServer` 直接静默丢弃,
 * 避免 `createEffect` 首发的默认值赶在 hydrate 之前把别的客户端的真实配置覆盖.
 */

import { appConfigApi } from "@/api/appConfig";

let hydrated = false;

/** 需要跨客户端共享的 localStorage key. */
export const SHARED_KEYS: readonly string[] = [
    // 登录态
    "v3.wy.cookie",
    "v3.qq.cookie",
    "v3.bili.cookie",
    "v3.bili.user",
    // 平台 / 身份码 / 设置
    "v3.musicPlatform",
    "v3.danmuPlatform",
    "v3.danmuMode",
    "v3.roomId",
    "v3.anchorCode",
    "v3.biliAppId",
    "v3.audioQuality",
    "v3.songListId",
    "v3.songListHistory",
    "v3.idleSource",
    "v3.userMaxOrder",
    "v3.globalMaxOrder",
    "v3.orderMaxDuration",
    "v3.overLimitSkip",
    "v3.cooldownSec",
    "v3.triggerWords",
    "v3.enableFansMedalBoost",
    "v3.fansMedalThreshold",
    "v3.enableSCBoost",
    "v3.showLyrics",
    "v3.theme",
    "v3.accentColor",
    // 快捷键 / 淡入淡出 / 音量 (纯 localStorage 会因换安装/WebView 用户数据目录变更而丢失, 需镜像到后端)
    "v3.shortcutPausePlay",
    "v3.fadeEnabled",
    "v3.fadeDuration",
    "v3.volume",
    // OBS 浏览器源 - 直播叠加层显示开关
    "v3.obs.showSongCard",
    "v3.obs.showScrollLyrics",
    "v3.obs.showNextPreview",
    "v3.obs.showNotice",
    // 关闭方式 (缓存配置共享)
    "v3.closeMethod",
    // Widget 插件 (正在播放挂件) 外观设置
    "v3.widget.settings",
    // 名单 / 历史
    "v3.userBlackList",
    "v3.songBlackList",
    "v3.userHistory",
    "v3.songHistory",
];
const SHARED_SET = new Set<string>(SHARED_KEYS);

/** 导入配置后写入的一次性标记: 下次启动的 hydrate 应跳过后端覆盖, 以本地导入值为准. */
const HYDRATE_SKIP_KEY = "__ordersong_skip_hydrate_once";

/** 标记下一次启动跳过后端配置回写 (导入配置后调用) . */
export function markSkipHydrateOnce(): void {
    try {
        localStorage.setItem(HYDRATE_SKIP_KEY, "1");
    } catch {
        /* ignore */
    }
}

/** 若存在标记则消费之并返回 true (调用方应跳过本次 hydrate 覆盖) . */
function consumeSkipHydrateOnce(): boolean {
    try {
        const v = localStorage.getItem(HYDRATE_SKIP_KEY);
        if (v) {
            localStorage.removeItem(HYDRATE_SKIP_KEY);
            return true;
        }
    } catch {
        /* ignore */
    }
    return false;
}

/** 应用启动时拉取后端共享配置并写回本地. */
export async function hydrateFromSharedConfig(): Promise<boolean> {
    if (consumeSkipHydrateOnce()) {
        // 刚导入过配置: 信任本地 localStorage 的导入值, 不再被后端存量配置覆盖.
        hydrated = true;
        return true;
    }
    let serverHad: Record<string, string | null> = {};
    let ok = false;
    try {
        const { data } = await appConfigApi.fetch();
        if (data && typeof data === "object") {
            serverHad = data;
            ok = true;
            for (const k of SHARED_KEYS) {
                const v = data[k];
                if (typeof v === "string") {
                    try {
                        localStorage.setItem(k, v);
                    } catch {
                        /* ignore quota errors */
                    }
                }
            }
        }
    } catch {
        ok = false;
    }
    hydrated = true;

    if (ok) {
        try {
            const patch: Record<string, string | null> = {};
            for (const k of SHARED_KEYS) {
                const localVal = localStorage.getItem(k);
                if (typeof localVal === "string" && typeof serverHad[k] !== "string") {
                    patch[k] = localVal;
                }
            }
            if (Object.keys(patch).length > 0) {
                void appConfigApi.patch(patch).catch(() => {
                    /* ignore */
                });
            }
        } catch {
            /* ignore */
        }
    }
    return ok;
}

// -- 变更上送 (防抖批量) --
const pending: Record<string, string | null> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
    timer = null;
    const body: Record<string, string | null> = {};
    for (const k of Object.keys(pending)) {
        body[k] = pending[k];
        delete pending[k];
    }
    if (Object.keys(body).length === 0) return;
    void appConfigApi.patch(body).catch(() => {
        /* 失败静默, 下次变更会再上送 */
    });
}

/**
 * 把单个 key 的变更镜像到后端. 非白名单键直接忽略, hydrate 完成前直接丢弃.
 */
export function mirrorToServer(key: string, rawValue: string | null): void {
    if (!SHARED_SET.has(key)) return;
    if (!hydrated) return;
    pending[key] = rawValue;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 400);
}
