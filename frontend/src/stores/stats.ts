import { createSignal } from "solid-js";
import { get, set } from "idb-keyval";
import type { PlayStatRow } from "@/types/order";

const K_STATS = "v3.playStats";

const [stats, setStats] = createSignal<PlayStatRow[]>([]);
let loaded = false;

async function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    try {
        const raw = (await get<PlayStatRow[]>(K_STATS)) ?? [];
        setStats(raw);
    } catch (err) {
        console.warn("[stats] 读取 IndexedDB 失败:", err);
    }
}

void ensureLoaded();

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function persistDebounced(arr: PlayStatRow[]) {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
        writeTimer = null;
        set(K_STATS, arr).catch((err) => console.warn("[stats] 写入失败:", err));
    }, 500);
}

export const statsStore = {
    rows: stats,
    push(row: PlayStatRow) {
        setStats((arr) => {
            const next = [...arr, row].slice(-5000);
            persistDebounced(next);
            return next;
        });
    },
    clear() {
        setStats([]);
        void set(K_STATS, []);
    },
    async reload() {
        loaded = false;
        await ensureLoaded();
    }
};

export function toCsv(rows: PlayStatRow[]): string {
    const header = ["ts", "uid", "uname", "sid", "sname", "sartist", "platform", "duration", "source", "priority"];
    const escape = (v: unknown) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
        lines.push([
            new Date(r.ts).toISOString(),
            r.uid, r.uname, r.sid, r.sname, r.sartist, r.platform, r.duration, r.source, r.priority
        ].map(escape).join(","));
    }
    return lines.join("\n");
}
