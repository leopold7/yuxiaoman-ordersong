/**
 * Widget 插件外观设置 store
 *
 * - 主窗口「插件设置」tab 与网页管理页 (?view=widget-admin) 写入: updateWidgetSettings()
 * - 持久化: localStorage + 后端共享配置镜像（key 已加入 SHARED_KEYS 白名单）
 * - OBS 浏览器源 (?view=widget) 读取: loadWidgetSettingsFromServer() 页面加载时从后端共享配置拉取一次,
 *   实现管理页修改后刷新 OBS 源即生效（跨窗口/进程同步）
 */

import { createSignal } from "solid-js";
import { loadJSON, saveJSON } from "@/infra/storage/kv";
import { appConfigApi } from "@/api/appConfig";
import { DEFAULT_WIDGET_SETTINGS, type WidgetSettings } from "@/types/widget";

export const WIDGET_SETTINGS_KEY = "v3.widget.settings";

/** 合并默认值, 兼容旧版本缺字段的持久化数据 */
function normalize(v: Partial<WidgetSettings> | null | undefined): WidgetSettings {
    return { ...DEFAULT_WIDGET_SETTINGS, ...(v ?? {}) };
}

const [widgetSettings, setWidgetSettingsSignal] = createSignal<WidgetSettings>(
    normalize(loadJSON<Partial<WidgetSettings>>(WIDGET_SETTINGS_KEY, DEFAULT_WIDGET_SETTINGS))
);
export { widgetSettings };

/** 局部更新并持久化（含后端镜像） */
export function updateWidgetSettings(patch: Partial<WidgetSettings>): void {
    const next = normalize({ ...widgetSettings(), ...patch });
    setWidgetSettingsSignal(next);
    saveJSON(WIDGET_SETTINGS_KEY, next);
}

/** 恢复默认设置 */
export function resetWidgetSettings(): void {
    setWidgetSettingsSignal({ ...DEFAULT_WIDGET_SETTINGS });
    saveJSON(WIDGET_SETTINGS_KEY, { ...DEFAULT_WIDGET_SETTINGS });
}

/** hydrateFromSharedConfig 写回 localStorage 后重载信号（管理页/主窗口启动时用） */
export function reloadWidgetSettingsFromStorage(): void {
    setWidgetSettingsSignal(
        normalize(loadJSON<Partial<WidgetSettings>>(WIDGET_SETTINGS_KEY, DEFAULT_WIDGET_SETTINGS))
    );
}

let serverLoaded = false;

/**
 * widget 视图（OBS 浏览器源，独立进程）加载时调用一次：从后端共享配置拉取最新 widget 设置。
 * 仅在页面加载时拉取一次；管理页改动会镜像到后端，需刷新 OBS 浏览器源生效，避免频繁轮询 /app-config。
 */
export async function loadWidgetSettingsFromServer(): Promise<void> {
    if (serverLoaded) return;
    serverLoaded = true;
    try {
        const { data } = await appConfigApi.fetch();
        const raw = data?.[WIDGET_SETTINGS_KEY];
        if (typeof raw !== "string") return;
        const next = normalize(JSON.parse(raw) as Partial<WidgetSettings>);
        if (JSON.stringify(next) !== JSON.stringify(widgetSettings())) {
            setWidgetSettingsSignal(next);
        }
    } catch {
        /* 网络异常静默, 保留本地值 */
    }
}
