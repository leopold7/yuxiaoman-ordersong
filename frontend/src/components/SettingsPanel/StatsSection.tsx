import { For, createMemo } from "solid-js";
import { statsStore } from "@/stores/stats";
import styles from "./SettingsPanel.module.css";

export function StatsSection() {
    const rows = () => statsStore.rows();

    const total = () => rows().length;
    const orderRows = createMemo(() => rows().filter((r) => r.source !== "idle"));
    const avgDuration = () => {
        const a = orderRows();
        if (!a.length) return 0;
        return Math.round(a.reduce((s, r) => s + r.duration, 0) / a.length);
    };
    const topSongs = createMemo(() => {
        const cnt = new Map<string, { sname: string; sartist: string; n: number }>();
        for (const r of rows()) {
            const k = String(r.sid);
            const cur = cnt.get(k) ?? { sname: r.sname, sartist: r.sartist, n: 0 };
            cur.n += 1;
            cnt.set(k, cur);
        }
        return [...cnt.values()].sort((a, b) => b.n - a.n).slice(0, 10);
    });
    const topUsers = createMemo(() => {
        const cnt = new Map<string, { uname: string; n: number }>();
        for (const r of orderRows()) {
            const k = String(r.uid);
            const cur = cnt.get(k) ?? { uname: r.uname, n: 0 };
            cur.n += 1;
            cnt.set(k, cur);
        }
        return [...cnt.values()].sort((a, b) => b.n - a.n).slice(0, 10);
    });

    return (
        <>
            <div class={styles.section}>
                <h3>本场概览</h3>
                <div class={styles.statRow}><span>总播放数</span><span>{total()}</span></div>
                <div class={styles.statRow}><span>用户点歌数</span><span>{orderRows().length}</span></div>
                <div class={styles.statRow}><span>平均时长(秒)</span><span>{avgDuration()}</span></div>
            </div>

            <div class={styles.section}>
                <h3>歌曲 TOP10</h3>
                <For each={topSongs()}>{(s, i) => (
                    <div class={styles.statRow}>
                        <span>{i() + 1}. {s.sname} - {s.sartist}</span>
                        <span>{s.n}</span>
                    </div>
                )}</For>
            </div>

            <div class={styles.section}>
                <h3>点歌人 TOP10</h3>
                <For each={topUsers()}>{(u, i) => (
                    <div class={styles.statRow}>
                        <span>{i() + 1}. {u.uname}</span>
                        <span>{u.n}</span>
                    </div>
                )}</For>
            </div>
        </>
    );
}
