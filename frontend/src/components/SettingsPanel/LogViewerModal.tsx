import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import {
    clearLogBuffer,
    getLogBuffer,
    subscribeLogs,
    type LogEntry,
    type LogLevel,
} from "@/utils/logCapture";
import { pushToast } from "@/utils/toast";
import styles from "./LogViewerModal.module.css";

const LEVELS: LogLevel[] = ["log", "info", "warn", "error", "debug"];

const LEVEL_LABEL: Record<LogLevel, string> = {
    log: "LOG",
    info: "INFO",
    warn: "WARN",
    error: "ERROR",
    debug: "DEBUG",
};

function formatTime(t: number): string {
    const d = new Date(t);
    const p = (n: number, l = 2) => String(n).padStart(l, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        /* 回退 */
    }
    try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

export function LogViewerModal(props: { onClose: () => void }) {
    const [entries, setEntries] = createSignal<LogEntry[]>(getLogBuffer());
    const [activeLevels, setActiveLevels] = createSignal<Set<LogLevel>>(new Set(LEVELS));
    const [autoScroll, setAutoScroll] = createSignal(true);
    const [keyword, setKeyword] = createSignal("");

    let scrollRef: HTMLDivElement | undefined;

    // 订阅缓冲变化, 实时刷新
    const unsub = subscribeLogs(() => setEntries(getLogBuffer()));
    onCleanup(unsub);

    // 新日志到达时保持滚动到底部 (仅当开启自动滚动且用户已在底部附近)
    const scrollToBottom = () => {
        if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight;
    };
    const onUpdate = () => {
        if (!autoScroll()) return;
        const el = scrollRef;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (atBottom) requestAnimationFrame(scrollToBottom);
    };
    // 监听缓冲长度变化 (entries 是 signal, 在 JSX 中已读取触发依赖)
    createEffect(() => {
        entries();
        onUpdate();
    });
    onMount(() => {
        // 首次挂载滚到底部
        requestAnimationFrame(scrollToBottom);
    });

    function toggleLevel(lv: LogLevel) {
        setActiveLevels((s) => {
            const next = new Set(s);
            if (next.has(lv)) next.delete(lv);
            else next.add(lv);
            return next;
        });
    }

    const filtered = () => {
        const levels = activeLevels();
        const kw = keyword().trim().toLowerCase();
        const list = entries();
        return list.filter((e) => {
            if (!levels.has(e.level)) return false;
            if (kw && !e.msg.toLowerCase().includes(kw) && !e.source.toLowerCase().includes(kw))
                return false;
            return true;
        });
    };

    async function onCopyAll() {
        const text = filtered()
            .map((e) => `[${formatTime(e.t)}] ${LEVEL_LABEL[e.level]} ${e.source} ${e.msg}`)
            .join("\n");
        if (!text) {
            pushToast("当前没有可导出的日志", "warn");
            return;
        }
        const ok = await copyText(text);
        pushToast(ok ? "已复制全部当前日志" : "复制失败", ok ? "success" : "error");
    }

    return (
        <div class={styles.overlay} onClick={() => props.onClose()}>
            <div class={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div class={styles.header}>
                    <div class={styles.titleRow}>
                        <span class={styles.title}>运行日志</span>
                        <span class={styles.count}>{filtered().length} 条</span>
                        <button class={styles.close} onClick={() => props.onClose()} title="关闭">
                            ✕
                        </button>
                    </div>
                    <div class={styles.toolbar}>
                        <div class={styles.levels}>
                            <For each={LEVELS}>{(lv) => (
                                <button
                                    class={`${styles.levelChip} ${styles[lv]} ${
                                        activeLevels().has(lv) ? styles.levelOn : styles.levelOff
                                    }`}
                                    onClick={() => toggleLevel(lv)}
                                >{LEVEL_LABEL[lv]}</button>
                            )}</For>
                        </div>
                        <input
                            class={styles.search}
                            type="text"
                            placeholder="搜索关键字…"
                            value={keyword()}
                            onInput={(e) => setKeyword(e.currentTarget.value)}
                        />
                        <label class={styles.autoScroll}>
                            <input
                                type="checkbox"
                                checked={autoScroll()}
                                onChange={(e) => setAutoScroll(e.currentTarget.checked)}
                            />
                            自动滚动
                        </label>
                        <button class={styles.action} onClick={() => void onCopyAll()}>复制</button>
                        <button
                            class={`${styles.action} ${styles.danger}`}
                            onClick={() => {
                                clearLogBuffer();
                                pushToast("已清空日志缓冲", "info");
                            }}
                        >清空</button>
                    </div>
                </div>

                <div class={`${styles.body} scroll-y`} ref={scrollRef}>
                    <Show
                        when={filtered().length > 0}
                        fallback={<div class={styles.empty}>暂无日志（开启后应用运行的输出会显示在这里）</div>}
                    >
                        <For each={filtered()}>{(e) => (
                            <div class={`${styles.line} ${styles[e.level]}`}>
                                <span class={styles.time}>{formatTime(e.t)}</span>
                                <span class={`${styles.badge} ${styles[e.level]}`}>
                                    {LEVEL_LABEL[e.level]}
                                </span>
                                <span class={styles.source}>{e.source}</span>
                                <span class={styles.msg}>{e.msg}</span>
                            </div>
                        )}</For>
                    </Show>
                </div>
            </div>
        </div>
    );
}
