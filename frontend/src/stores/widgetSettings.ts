/**
 * Widget 插件外观设置 store
 *
 * - 主窗口「插件设置」tab 与网页管理页 (?view=widget-admin) 写入: updateWidgetSettings()
 * - 持久化: localStorage + 后端共享配置镜像（key 已加入 SHARED_KEYS 白名单）
 * - OBS 浏览器源 (?view=widget) 读取: startWidgetSettingsPoll() 周期从后端共享配置拉取,
 *   实现管理页修改后 widget 视图即时生效（跨窗口/进程同步）
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

let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * widget 视图专用: 周期从后端共享配置拉取最新设置。
 * 管理页在其他窗口/浏览器修改后, 约 intervalMs 内生效。
 */
export function startWidgetSettingsPoll(intervalMs = 2000): void {
    if (pollTimer) return;
    const tick = async () => {
        try {
            const { data } = await appConfigApi.fetch();
            const raw = data?.[WIDGET_SETTINGS_KEY];
            if (typeof raw !== "string") return;
            const next = normalize(JSON.parse(raw) as Partial<WidgetSettings>);
            if (JSON.stringify(next) !== JSON.stringify(widgetSettings())) {
                setWidgetSettingsSignal(next);
            }
        } catch {
            /* 网络异常静默, 下轮重试 */
        }
    };
    void tick();
    pollTimer = setInterval(() => void tick(), intervalMs);
}
