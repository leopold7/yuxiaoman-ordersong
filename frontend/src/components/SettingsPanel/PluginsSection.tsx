/**
 * 「插件设置」tab — 插件列表
 *
 * 目前内置一个 widget 插件（正在播放挂件, 移植自 now-playing-service /widget）:
 * - 启用开关（写入 widgetSettings, 与管理页共享）
 * - 「管理页面」按钮: 跳转网页管理页 ?view=widget-admin
 * - 复制 OBS 浏览器源地址 ?view=widget
 */
import { Show, createSignal } from "solid-js";
import { widgetSettings, updateWidgetSettings } from "@/stores/widgetSettings";
import { enabled as logEnabled, setLogPluginEnabled } from "@/stores/logPlugin";
import { pushToast } from "@/utils/toast";
import { invoke, isTauri } from "@/infra/tauri/invoke";
import { LogViewerModal } from "./LogViewerModal";
import styles from "./SettingsPanel.module.css";

const OBS_BASE = "http://127.0.0.1:17777";
const WIDGET_URL = `${OBS_BASE}/order/?view=widget`;
const ADMIN_URL = `${OBS_BASE}/order/?view=widget-admin`;

async function copyWidgetUrl() {
    try {
        await navigator.clipboard.writeText(WIDGET_URL);
        pushToast("已复制：Widget OBS 浏览器源地址", "success");
    } catch {
        pushToast("复制失败，请手动选中复制", "warn");
    }
}

async function openAdminPage() {
    if (isTauri()) {
        try {
            await invoke("open_widget_admin");
        } catch (e) {
            const msg = typeof e === "string" ? e : ((e as Error)?.message ?? JSON.stringify(e));
            pushToast(`打开管理页失败：${msg}`, "error");
        }
        return;
    }
    // 非 Tauri 环境 (纯前端 dev) 直接新标签打开
    window.open(ADMIN_URL, "_blank");
}

export function PluginsSection() {
    const [showLogViewer, setShowLogViewer] = createSignal(false);

    return (
        <div class={styles.section}>
            <h3>插件</h3>

            <div class={styles.subSection}>
                <h4>正在播放 Widget</h4>
                <p class={styles.hint}>
                    直播画面「正在播放」挂件：封面 / 歌名 / 歌手 / 进度条 / 均衡器动画，
                    支持主题、主色、封面模糊等外观定制，可作为 OBS 浏览器源叠加到直播画面。
                </p>
                <div class={styles.row}>
                    <label>启用插件</label>
                    <input
                        type="checkbox"
                        checked={widgetSettings().enabled}
                        onChange={(e) => updateWidgetSettings({ enabled: e.currentTarget.checked })}
                    />
                    <span />
                </div>
                <div class={styles.row}>
                    <label>管理页面</label>
                    <button
                        type="button"
                        class={styles.shortcutBtn}
                        onClick={() => void openAdminPage()}
                        title="在浏览器中打开 Widget 管理页面，编辑外观并实时预览"
                    >
                        打开管理页面
                    </button>
                    <span />
                </div>
                <div class={styles.rowWide}>
                    <label>OBS 地址</label>
                    <textarea
                        class={styles.urlBox}
                        readOnly
                        rows={2}
                        onFocus={(e) => e.currentTarget.select()}
                    >{WIDGET_URL}</textarea>
                    <button type="button" class={styles.linkBtn} onClick={() => void copyWidgetUrl()}>
                        复制
                    </button>
                </div>
                <p class={styles.hint}>
                    在 OBS 中添加「浏览器」源并粘贴上方地址（建议 800 × 300），外观在管理页面中修改后自动生效。
                </p>
            </div>

            <div class={styles.subSection}>
                <h4>日志</h4>
                <p class={styles.hint}>
                    开启后实时采集应用运行日志（拦截全局 console 输出），点击「查看日志」弹出页面在线滚动查看，
                    支持按级别筛选、关键字搜索、复制与清空。便于排查点歌 / 播放 / 弹幕等异常。
                </p>
                <div class={styles.row}>
                    <label>启用插件</label>
                    <input
                        type="checkbox"
                        checked={logEnabled()}
                        onChange={(e) => setLogPluginEnabled(e.currentTarget.checked)}
                    />
                    <span />
                </div>
                <div class={styles.row}>
                    <label>查看日志</label>
                    <button
                        type="button"
                        class={styles.shortcutBtn}
                        disabled={!logEnabled()}
                        onClick={() => setShowLogViewer(true)}
                        title={logEnabled() ? "弹出日志查看页面" : "请先开启日志插件"}
                    >
                        查看日志
                    </button>
                    <span />
                </div>
            </div>

            <Show when={showLogViewer()}>
                <LogViewerModal onClose={() => setShowLogViewer(false)} />
            </Show>
        </div>
    );
}
