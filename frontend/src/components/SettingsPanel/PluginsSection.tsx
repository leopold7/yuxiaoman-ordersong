/**
 * 「插件设置」tab — 插件列表
 *
 * 目前内置一个 widget 插件（正在播放挂件, 移植自 now-playing-service /widget）:
 * - 启用开关（写入 widgetSettings, 与管理页共享）
 * - 「管理页面」按钮: 跳转网页管理页 ?view=widget-admin
 * - 复制 OBS 浏览器源地址 ?view=widget
 */
import { widgetSettings, updateWidgetSettings } from "@/stores/widgetSettings";
import { pushToast } from "@/utils/toast";
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

export function PluginsSection() {
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
                        onClick={() => window.open(ADMIN_URL, "_blank")}
                        title="在浏览器中打开 Widget 管理页面，编辑外观并实时预览"
                    >
                        打开管理页面
                    </button>
                    <span />
                </div>
                <div class={styles.row}>
                    <label>OBS 地址</label>
                    <input type="text" readOnly value={WIDGET_URL} onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" class={styles.linkBtn} onClick={() => void copyWidgetUrl()}>
                        复制
                    </button>
                </div>
                <p class={styles.hint}>
                    在 OBS 中添加「浏览器」源并粘贴上方地址（建议 800 × 300），外观在管理页面中修改后自动生效。
                </p>
            </div>
        </div>
    );
}
