import { createSignal } from "solid-js";

/**
 * 面向观众的直播提示
 *
 */
/** 直播提示级别: success 点歌成功 / warn 冷却/超限/已点上 / info 系统消息 */
export type LiveNoticeLevel = "success" | "warn" | "info";

export interface LiveNotice {
    id: number;
    text: string;
    level: LiveNoticeLevel;
}

const [liveNotice, setLiveNotice] = createSignal<LiveNotice | null>(null);
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

export function pushLiveNotice(text: string, level: LiveNoticeLevel = "warn", ttlMs = 6000) {
    const id = nextId++;
    setLiveNotice({ id, text, level });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        setLiveNotice((cur) => (cur && cur.id === id ? null : cur));
    }, ttlMs);
}

export { liveNotice };
