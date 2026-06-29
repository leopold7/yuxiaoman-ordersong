/**
 * LRC 歌词解析 (纯函数) .
 *
 * 解析后会过滤掉"纯音乐 / 暂无歌词"等模板, 避免在 UI 上当作正常歌词显示.
 */

/** 一条歌词: 时间戳 (秒) + 文本. */
export interface LyricLine {
    ts: number;
    text: string;
}

const INSTRUMENTAL_PATTERNS = [
    /纯音乐[,，]?\s*请欣赏/,
    /^\s*纯音乐\s*$/,
    /^\s*Instrumental\s*$/i,
    /暂无歌词/,
];

function isInstrumentalLrc(lines: LyricLine[]): boolean {
    if (lines.length === 0) return false;
    if (lines.length <= 3) {
        const joined = lines.map((l) => l.text).join("\n");
        return INSTRUMENTAL_PATTERNS.some((p) => p.test(joined));
    }
    return false;
}

/** 解析 LRC 字符串为有序 `LyricLine[]`. 空 / 解析失败均返回 `[]`. */
export function parseLrc(lrc: string | null | undefined): LyricLine[] {
    if (!lrc) return [];
    const out: LyricLine[] = [];
    const lines = lrc.split(/\r?\n/);
    const re = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
    for (const line of lines) {
        const text = line.replace(re, "").trim();
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(line)) !== null) {
            const minute = parseInt(m[1], 10);
            const second = parseInt(m[2], 10);
            const ms = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
            const ts = minute * 60 + second + ms / 1000;
            if (text) out.push({ ts, text });
        }
    }
    out.sort((a, b) => a.ts - b.ts);
    if (isInstrumentalLrc(out)) return [];
    return out;
}

/** 二分查找当前时间对应的歌词索引; 找不到返回 -1. */
export function findActiveLyricIdx(lines: LyricLine[], currentSec: number): number {
    if (!lines.length) return -1;
    let lo = 0;
    let hi = lines.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lines[mid].ts <= currentSec) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans;
}
