/**
 * ?view=widget — 正在播放挂件（移植自 now-playing-service /widget）
 *
 * 数据源: liveState 跨进程播放快照（独立视图由 App.tsx 启动 startLiveStatePoll）
 * 外观: widgetSettings（管理页 ?view=widget-admin 编辑, 轮询共享配置即时生效）
 * 用途: OBS 浏览器源 / 管理页实时预览（preview 模式）
 */
import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { liveState, smoothCurrentTime } from "@/stores/liveState";
import { widgetSettings } from "@/stores/widgetSettings";
import styles from "./WidgetOverlay.module.css";

function fmtTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/** 从封面图取平均主色（跨域受限时返回 null 回退 tint_color） */
function useDominantColor(coverUrl: () => string | undefined) {
    const [color, setColor] = createSignal<string | null>(null);
    createEffect(() => {
        const url = coverUrl();
        setColor(null);
        if (!url) return;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const c = document.createElement("canvas");
                c.width = 16;
                c.height = 16;
                const g = c.getContext("2d");
                if (!g) return;
                g.drawImage(img, 0, 0, 16, 16);
                const d = g.getImageData(0, 0, 16, 16).data;
                let r = 0, gr = 0, b = 0;
                const n = d.length / 4;
                for (let i = 0; i < d.length; i += 4) {
                    r += d[i];
                    gr += d[i + 1];
                    b += d[i + 2];
                }
                // 提亮, 避免深色封面导致主色过暗看不清
                const boost = (x: number) => Math.min(255, Math.round(56 + (x / n) * 0.86));
                setColor(`rgb(${boost(r)}, ${boost(gr)}, ${boost(b)})`);
            } catch {
                /* canvas 被跨域污染: 回退 tint_color */
            }
        };
        img.onerror = () => setColor(null);
        img.src = url;
    });
    return color;
}

export function WidgetOverlay(props: { preview?: boolean }) {
    const s = widgetSettings;

    const now = createMemo(() => liveState().now);
    const playing = createMemo(() => liveState().playing && !!liveState().now);
    const coverUrl = createMemo(() => now()?.coverUrl || undefined);
    const title = createMemo(() => now()?.sname || "暂无播放");
    const artist = createMemo(() => now()?.sartist || "等待点歌…");
    const songKey = createMemo(() => {
        const n = now();
        return n ? `${n.sname}|${n.sartist}` : "";
    });

    // -- 平滑进度: 每 250ms 触发一次重算 --
    const [tick, setTick] = createSignal(0);
    onMount(() => {
        const t = setInterval(() => setTick((x) => x + 1), 250);
        onCleanup(() => clearInterval(t));
    });
    const current = createMemo(() => {
        tick();
        return smoothCurrentTime();
    });
    const duration = createMemo(() => liveState().duration);
    const percent = createMemo(() => {
        const d = duration();
        return d > 0 ? Math.min(100, (current() / d) * 100) : 0;
    });

    // -- 主色: player_colors 时取封面平均色, 否则 tint_color --
    const dominant = useDominantColor(coverUrl);
    const accent = createMemo(() => (s().player_colors && dominant() ? dominant()! : s().tint_color));

    // -- 显隐逻辑: song_change_only / hide_on_pause / hide_delay / visible_duration --
    const [visible, setVisible] = createSignal(true);
    let hideTimer: number | null = null;
    let cutTimer: number | null = null;
    let prevKey = "";
    const clearHide = () => { if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; } };
    const clearCut = () => { if (cutTimer !== null) { clearTimeout(cutTimer); cutTimer = null; } };

    createEffect(() => {
        const st = s();
        const key = songKey();
        const isPlaying = playing();

        if (st.song_change_only) {
            clearHide();
            if (key && key !== prevKey) {
                prevKey = key;
                setVisible(true);
                clearCut();
                cutTimer = window.setTimeout(() => setVisible(false), Math.max(1, st.visible_duration) * 1000);
            } else if (!key) {
                prevKey = "";
                setVisible(false);
            }
            return;
        }

        prevKey = key;
        clearCut();
        if (st.hide_on_pause) {
            if (!isPlaying) {
                if (hideTimer === null) {
                    hideTimer = window.setTimeout(() => {
                        setVisible(false);
                        hideTimer = null;
                    }, Math.max(0, st.hide_delay) * 1000);
                }
            } else {
                clearHide();
                setVisible(true);
            }
        } else {
            clearHide();
            setVisible(true);
        }
    });
    onCleanup(() => { clearHide(); clearCut(); });

    // -- 自适应字号: 以容器尺寸为基准, em 布局整体缩放 --
    let wrapEl: HTMLDivElement | undefined;
    const [fs, setFs] = createSignal(16);
    onMount(() => {
        const compute = () => {
            if (!wrapEl) return;
            const w = wrapEl.clientWidth;
            const h = wrapEl.clientHeight;
            if (w <= 0 || h <= 0) return;
            setFs(Math.max(8, Math.min(64, Math.min(w / 32, h / 12))));
        };
        compute();
        const ro = new ResizeObserver(compute);
        ro.observe(wrapEl!);
        onCleanup(() => ro.disconnect());
    });

    const themeClass = createMemo(() => {
        const t = s().theme;
        if (t === 1) return styles.themeLight;
        if (t === 2) return styles.themeTransparent;
        return styles.themeDark;
    });

    return (
        <Show when={s().enabled}>
            <div class={`${styles.wrap} ${props.preview ? styles.wrapPreview : ""}`} ref={wrapEl}>
                <div
                    class={[
                        styles.card,
                        themeClass(),
                        s().player === 2 ? styles.cardMini : "",
                        visible() ? "" : styles.hidden
                    ].join(" ")}
                    style={{ "font-size": `${fs()}px`, "--tint": accent() }}
                >
                    <Show when={s().cover_blur && coverUrl()}>
                        <div class={styles.blurBg} style={{ "background-image": `url(${coverUrl()})` }} />
                        <div class={styles.blurMask} />
                    </Show>
                    <div class={styles.inner}>
                        <div class={styles.infoRow}>
                            <Show when={s().cover !== 2}>
                                <div
                                    class={[
                                        styles.coverBox,
                                        s().cover === 1 ? styles.coverCircle : "",
                                        s().cover_glow ? styles.coverGlow : ""
                                    ].join(" ")}
                                >
                                    <Show
                                        when={coverUrl()}
                                        fallback={<div class={styles.coverPlaceholder}>♪</div>}
                                    >
                                        <img src={coverUrl()} alt="" referrerPolicy="no-referrer" />
                                    </Show>
                                </div>
                            </Show>
                            <div class={styles.text}>
                                <div class={styles.title} title={title()}>{title()}</div>
                                <div class={styles.artist} title={artist()}>{artist()}</div>
                            </div>
                            <Show when={!s().hide_equalizer}>
                                <div class={`${styles.eq} ${playing() ? "" : styles.eqPaused}`}>
                                    <span class={styles.eqBar} />
                                    <span class={styles.eqBar} />
                                    <span class={styles.eqBar} />
                                    <span class={styles.eqBar} />
                                    <span class={styles.eqBar} />
                                </div>
                            </Show>
                        </div>
                        <Show when={s().player === 0}>
                            <div class={styles.progressRow}>
                                <span class={styles.timeText}>{fmtTime(current())}</span>
                                <div class={styles.track}>
                                    <div class={styles.fill} style={{ width: `${percent()}%` }} />
                                </div>
                                <span class={styles.timeText}>
                                    {duration() > 0 ? `-${fmtTime(Math.max(0, duration() - current()))}` : "0:00"}
                                </span>
                            </div>
                        </Show>
                    </div>
                </div>
            </div>
        </Show>
    );
}
