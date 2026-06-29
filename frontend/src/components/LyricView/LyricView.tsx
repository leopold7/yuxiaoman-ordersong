import { For, Show, createMemo } from "solid-js";
import { activeLyricIdx as ctrlActiveIdx, lyrics as ctrlLyrics, lyricLoading as ctrlLyricLoading } from "@/services/PlayerService";
import { queue } from "@/stores/queue";
import { liveState } from "@/stores/liveState";
import type { LyricLine } from "@/domain/lyrics/parser";
import styles from "./LyricView.module.css";

interface Props {
    /** OBS 独立歌词视图模式 (?view=lyrics)*/
    obs?: boolean;
}

const LINE_HEIGHT_PANEL = 28;
const LINE_HEIGHT_OBS = 64;

export function LyricView(props: Props) {
    const lyrics = (): LyricLine[] => (props.obs ? liveState().lyrics : ctrlLyrics());
    const activeIdx = (): number => (props.obs ? liveState().activeIdx : ctrlActiveIdx());
    const hasNow = () => (props.obs ? !!liveState().now : !!queue.orderList()[0]);
    const loading = () => (props.obs ? liveState().lyricsLoading : ctrlLyricLoading());

    const lineH = props.obs ? LINE_HEIGHT_OBS : LINE_HEIGHT_PANEL;
    const offset = createMemo(() => {
        const idx = activeIdx();
        if (idx < 0) return 0;
        return -idx * lineH;
    });
    const emptyText = () => {
        if (loading()) return "歌词加载中…";
        return hasNow() ? "纯音乐" : "暂无播放";
    };

    return (
        <div class={`${styles.box} ${props.obs ? styles.obsFull : ""}`}>
            <div class={styles.scroll}>
                <Show when={lyrics().length > 0} fallback={<div class={styles.empty}>{emptyText()}</div>}>
                    <div class={styles.list} style={{ transform: `translateY(${offset()}px)` }}>
                        <For each={lyrics()}>{(line, idx) => (
                            <div class={`${styles.line} ${idx() === activeIdx() ? styles.active : ""}`}>
                                {line.text}
                            </div>
                        )}</For>
                    </div>
                </Show>
            </div>
        </div>
    );
}
