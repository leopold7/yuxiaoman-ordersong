/**
 * 全局 console 拦截器 + 内存环形缓冲.
 *
 * - 模块加载即安装一次 (幂等), 劫持 console.log / info / warn / error / debug
 * - 拦截到的记录写入内存环形缓冲 (上限 MAX_ENTRIES), 供「日志插件」在线查看
 * - 安装后仍会原样转发到原生 console, 不影响原有调试输出
 * - 缺省只缓存最近 N 条, 无论「日志插件」是否开启都采集 (开启仅控制是否展示/落盘)
 *
 * 注意: 本模块刻意不依赖任何 store, 以避免循环依赖; 插件开关在 logPlugin store 中读取.
 */

export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface LogEntry {
    id: number;
    /** epoch ms */
    t: number;
    level: LogLevel;
    /** 已序列化为可读字符串的参数 */
    msg: string;
    /** 来源标签: 来自拦截的原生 console 调用; 插件自身日志统一为 "plugin" */
    source: string;
}

const MAX_ENTRIES = 2000;

let buffer: LogEntry[] = [];
let nextId = 1;
let installed = false;

/** 订阅者 (查看页实时监听用) */
type Listener = () => void;
const listeners = new Set<Listener>();

function serialize(args: unknown[]): string {
    return args
        .map((a) => {
            if (typeof a === "string") return a;
            if (a instanceof Error) return `${a.name}: ${a.message}`;
            try {
                return JSON.stringify(a, replacer());
            } catch {
                return String(a);
            }
        })
        .join(" ");
}

/** 处理循环引用, 避免序列化报错 */
function replacer() {
    const seen = new WeakSet();
    return (_k: string, v: unknown) => {
        if (typeof v === "object" && v !== null) {
            if (seen.has(v)) return "[Circular]";
            seen.add(v);
        }
        if (typeof v === "function") return `[fn ${v.name || "anonymous"}]`;
        return v;
    };
}

function push(level: LogLevel, source: string, args: unknown[]): void {
    const entry: LogEntry = {
        id: nextId++,
        t: Date.now(),
        level,
        msg: serialize(args),
        source,
    };
    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) {
        buffer = buffer.slice(buffer.length - MAX_ENTRIES);
    }
    listeners.forEach((l) => l());
}

/** 供日志插件主动写入一条带 source 标签的记录 (如开启/关闭事件本身) */
export function writeLog(level: LogLevel, source: string, args: unknown[]): void {
    push(level, source, args);
}

function install(): void {
    if (installed) return;
    installed = true;

    const methods: LogLevel[] = ["log", "info", "warn", "error", "debug"];
    for (const level of methods) {
        const original = (console[level] as (...a: unknown[]) => void).bind(console);
        (console as unknown as Record<LogLevel, (...a: unknown[]) => void>)[level] = (
            ...args: unknown[]
        ) => {
            // 转发到原生 console
            original(...args);
            // 写入环形缓冲 (原生实现自身产生的日志不应再被捕获, 否则递归)
            try {
                push(level, "console", args);
            } catch {
                /* 极端情况下忽略 */
            }
        };
    }
}

/** 安装拦截器 (幂等). 在应用入口 main.tsx 调用一次. */
export function installLogCapture(): void {
    install();
}

/** 读取当前缓冲快照 (不可变返回) */
export function getLogBuffer(): LogEntry[] {
    return buffer;
}

/** 清空内存缓冲 */
export function clearLogBuffer(): void {
    buffer = [];
    listeners.forEach((l) => l());
}

/** 订阅缓冲变化, 返回取消订阅函数 */
export function subscribeLogs(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
