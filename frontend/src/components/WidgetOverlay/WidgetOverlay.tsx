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
import { DEFAULT_WIDGET_SETTINGS } from "@/types/widget";
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

/**
 * 长文本滚动（跑马灯）
 * - 圆形封面(active)且文本溢出时, 双份内容无缝循环滚动; 否则退化为 CSS 省略号
 */
function ScrollText(props: { text: string; class?: string; title?: string; active: boolean }) {
    let outer: HTMLDivElement | undefined;
    let firstItem: HTMLSpanElement | undefined;
    const [scrolling, setScrolling] = createSignal(false);
    // 滚动时长: 与内容宽度成正比 => 任意长度都保持匀速 (~22px/s)
    const [duration, setDuration] = createSignal(20);

    createEffect(() => {
        props.text; // 跟踪文本变化
        const active = props.active;
        // 等 DOM 重绘后再测宽度
        requestAnimationFrame(() => {
            if (!outer || !firstItem) return;
            const delta = firstItem.scrollWidth - outer.clientWidth;
            const overflow = active && delta > 1;
            setScrolling(overflow);
            if (overflow) {
                // 一份内容的宽度 / 速度 = 滚动一整轮所需秒数
                setDuration(Math.max(8, firstItem.scrollWidth / 22));
            }
        });
    });

    return (
        <div
            class={`${props.class} ${scrolling() ? styles.marquee : ""}`}
            title={props.title}
            ref={outer}
        >
            <div
                class={styles.marqueeTrack}
                style={scrolling() ? { "animation-duration": `${duration()}s` } : undefined}
            >
                <span class={styles.marqueeItem} ref={firstItem}>{props.text}</span>
                <span class={styles.marqueeItem} aria-hidden="true">{props.text}</span>
            </div>
        </div>
    );
}

export function WidgetOverlay(props: { preview?: boolean }) {
    const s = widgetSettings;

    const now = createMemo(() => liveState().now);
    const playing = createMemo(() => liveState().playing && !!liveState().now);
    const coverUrl = createMemo(() => now()?.coverUrl || undefined);
    const title = createMemo(() => now()?.sname || "暂无播放");
    const artist = createMemo(() => now()?.sartist || "等待点歌…");
    const uname = createMemo(() => {
        const u = now()?.uname || "";
        // 空闲歌单补歌时不显示点播人
        return u === "空闲歌单" ? "" : u;
    });
    // 歌手行: 有则点播人, 形如 "歌手 · 点播人"
    const artistText = createMemo(() => {
        const u = uname();
        return u ? `${artist()} · ${u}` : artist();
    });
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

    // -- 切歌弹出动画: cut_popup 开启时, 首次出现 / 切换歌曲对整卡触发缓慢弹出 --
    const [popupOn, setPopupOn] = createSignal(false);
    let prevPopupKey = "";
    createEffect(() => {
        const key = songKey();
        if (key && key !== prevPopupKey) {
            prevPopupKey = key;
            if (s().cut_popup) {
                // 先移除再下一帧添加, 借助 Solid 重算 class 重放动画
                setPopupOn(false);
                requestAnimationFrame(() => setPopupOn(true));
            }
        }
    });

    // -- 自适应字号: 以"默认宽度占比"对应的参考宽度为基准, 与实时 width_ratio 解耦 --
    // 这样 width_ratio 只控制卡片的横向宽度, 不会让整个组件(封面/文字/均衡器)随之缩放。
    const refRatio = DEFAULT_WIDGET_SETTINGS.width_ratio;
    let wrapEl: HTMLDivElement | undefined;
    let cardEl: HTMLDivElement | undefined;
    const [fs, setFs] = createSignal(16);
    onMount(() => {
        const compute = () => {
            if (!wrapEl) return;
            // 参考宽度 = 外层舞台宽度 × 默认占比, 不随用户调节的 width_ratio 变化
            const w = wrapEl.clientWidth * (refRatio / 100);
            const h = wrapEl.clientHeight;
            if (w <= 0 || h <= 0) return;
            setFs(Math.max(8, Math.min(64, Math.min(w / 30, h / 12))));
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
                        visible() ? "" : styles.hidden,
                        popupOn() ? styles.cardPopup : ""
                    ].join(" ")}
                    ref={cardEl}
                    style={{ "font-size": `${fs()}px`, "--tint": accent(), width: `${s().width_ratio}%` }}
                >
                    <Show when={s().cover_blur && coverUrl()}>
                        <img
                            class={styles.blurBg}
                            src={coverUrl()}
                            alt=""
                            referrerPolicy="no-referrer"
                        />
                        <div class={styles.blurMask} />
                    </Show>
                    <div class={styles.inner}>
                        <div class={styles.infoRow}>
                            <Show when={s().cover !== 2}>
                                <div
                                    class={[
                                        styles.coverBox,
                                        s().cover === 1 ? styles.coverCircle : "",
                                        s().cover_glow ? styles.coverGlow : "",
                                        playing() ? "" : styles.coverPaused
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
                                <ScrollText class={styles.title} text={title()} title={title()} active={s().cover === 1} />
                                <ScrollText class={styles.artist} text={artistText()} title={artistText()} active={false} />
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
                                    {duration() > 0 ? fmtTime(duration()) : "0:00"}
                                </span>
                            </div>
                        </Show>
                    </div>
                </div>
            </div>
        </Show>
    );
}
