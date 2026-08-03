/**
 * 日志插件 store.
 *
 * - 仅一个开关 `enabled`: 是否开启「日志插件」
 * - 开启后「查看日志」按钮可用, 弹出页面在线查看当前控制台日志
 * - 持久化到 localStorage (与设置一致), 不镜像到后端共享配置 (纯本地调试用途)
 *
 * 全局 console 拦截由 logCapture 模块在 main.tsx 统一安装, 与 enabled 解耦:
 * 无论开关是否打开, 都持续采集最近日志; enabled 只控制展示入口.
 */

import { createSignal } from "solid-js";
import { loadJSON, saveJSON } from "@/infra/storage/kv";
import { writeLog } from "@/utils/logCapture";

const KEY = "v3.plugin.log.enabled";

const [enabled, setEnabledSignal] = createSignal<boolean>(loadJSON(KEY, false));

export { enabled };

export function setLogPluginEnabled(v: boolean): void {
    setEnabledSignal(v);
    saveJSON(KEY, v);
    writeLog("info", "plugin", [`日志插件已${v ? "开启" : "关闭"}`]);
}

export function toggleLogPlugin(): void {
    setLogPluginEnabled(!enabled());
}
