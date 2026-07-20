import { createSignal } from "solid-js";
import { liveStateApi } from "@/api/liveState";
import type { LiveStateSnapshot, LiveNowPlaying } from "@/types/live";

/**
 * 跨进程播放状态同步 store
 *
 * - 主程序 (?view=full): startLiveStatePush() 周期把当前播放快照 POST 给后端
 * - OBS 浏览器源 (?view=lyrics / stream / list): startLiveStatePoll() 周期 GET, 渲染读 liveState()
 */

export type { LiveStateSnapshot, LiveNowPlaying };

const EMPTY: LiveStateSnapshot = {
    now: null,
    lyrics: [],
    lyricsLoading: false,
    activeIdx: -1,
    currentTime: 0,
    duration: 0,
    playing: false,
    queue: [],
    notice: null,
    fadeEnabled: false,
    fadeDuration: 1000,
    t: 0,
};

const [liveState, setLiveState] = createSignal<LiveStateSnapshot>(EMPTY);
export { liveState };

let pushTimer: ReturnType<typeof setInterval> | null = null;

export function startLiveStatePush(getSnapshot: () => LiveStateSnapshot, intervalMs = 500): void {
    if (pushTimer) return;
    pushTimer = setInterval(() => {
        void liveStateApi.push(getSnapshot());
    }, intervalMs);
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startLiveStatePoll(intervalMs = 500): void {
    if (pollTimer) return;
    const tick = async () => {
        const data = await liveStateApi.pull();
        if (data && typeof data === "object") {
            setLiveState({ ...EMPTY, ...data });
        }
    };
    void tick();
    pollTimer = setInterval(() => void tick(), intervalMs);
}

export function smoothCurrentTime(): number {
    const s = liveState();
    if (!s.playing || s.t === 0) return s.currentTime;
    const elapsed = (Date.now() - s.t) / 1000;
    const t = s.currentTime + elapsed;
    return s.duration > 0 ? Math.min(t, s.duration) : t;
}
