/**
 * ?view=widget-admin — Widget 插件网页管理页
 *
 * 左侧: 原版 now-playing-service 全部外观设置项编辑表单
 * 右侧: WidgetOverlay 实时预览（所见即所得, 数据来自 liveState 轮询）
 * 修改即持久化并镜像到后端共享配置, widget 视图轮询后即时生效
 */
import { Show } from "solid-js";
import { WidgetOverlay } from "@/components/WidgetOverlay/WidgetOverlay";
import { widgetSettings, updateWidgetSettings, resetWidgetSettings } from "@/stores/widgetSettings";
import {
    WIDGET_COVER_OPTIONS,
    WIDGET_PLAYER_OPTIONS,
    WIDGET_THEME_OPTIONS
} from "@/types/widget";
import { pushToast } from "@/utils/toast";
import styles from "./WidgetAdminPage.module.css";

const OBS_BASE = "http://127.0.0.1:17777";
const WIDGET_URL = `${OBS_BASE}/order/?view=widget`;

async function copyObsUrl() {
    try {
        await navigator.clipboard.writeText(WIDGET_URL);
        pushToast("已复制 OBS 浏览器源地址", "success");
    } catch {
        pushToast("复制失败，请手动选中复制", "warn");
    }
}

function SwitchRow(props: {
    label: string;
    desc?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <label class={styles.row}>
            <span class={styles.rowText}>
                <span class={styles.rowLabel}>{props.label}</span>
                <Show when={props.desc}>
                    <span class={styles.rowDesc}>{props.desc}</span>
                </Show>
            </span>
            <input
                class={styles.switch}
                type="checkbox"
                checked={props.checked}
                onChange={(e) => props.onChange(e.currentTarget.checked)}
            />
        </label>
    );
}

function SelectRow(props: {
    label: string;
    value: number;
    options: { value: number; label: string }[];
    onChange: (v: number) => void;
}) {
    return (
        <label class={styles.row}>
            <span class={styles.rowText}>
                <span class={styles.rowLabel}>{props.label}</span>
            </span>
            <select
                class={styles.select}
                value={props.value}
                onChange={(e) => props.onChange(+e.currentTarget.value)}
            >
                {props.options.map((o) => (
                    <option value={o.value}>{o.label}</option>
                ))}
            </select>
        </label>
    );
}

function NumberRow(props: {
    label: string;
    value: number;
    unit: string;
    min: number;
    onChange: (v: number) => void;
}) {
    return (
        <label class={styles.row}>
            <span class={styles.rowText}>
                <span class={styles.rowLabel}>{props.label}</span>
            </span>
            <span class={styles.numberWrap}>
                <input
                    class={styles.number}
                    type="number"
                    min={props.min}
                    value={props.value}
                    onInput={(e) => props.onChange(Math.max(props.min, +e.currentTarget.value || props.min))}
                />
                <span class={styles.unit}>{props.unit}</span>
            </span>
        </label>
    );
}

function SliderRow(props: {
    label: string;
    desc?: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    onChange: (v: number) => void;
}) {
    return (
        <label class={styles.row}>
            <span class={styles.rowText}>
                <span class={styles.rowLabel}>{props.label}</span>
                <Show when={props.desc}>
                    <span class={styles.rowDesc}>{props.desc}</span>
                </Show>
                <span class={styles.rowDesc}>{props.value}{props.unit ?? ""}</span>
            </span>
            <input
                class={styles.slider}
                type="range"
                min={props.min}
                max={props.max}
                step={props.step ?? 1}
                value={props.value}
                onInput={(e) => props.onChange(+e.currentTarget.value)}
            />
        </label>
    );
}

export function WidgetAdminPage() {
    const s = widgetSettings;

    return (
        <div class={styles.page}>
            {/* 顶栏 */}
            <header class={styles.header}>
                <div class={styles.headerTitle}>
                    <span class={styles.logoDot} />
                    <div>
                        <h1>Widget 插件管理</h1>
                        <p>正在播放挂件 · 外观与行为设置（修改自动保存并即时生效）</p>
                    </div>
                </div>
                <div class={styles.headerActions}>
                    <button class={styles.ghostBtn} onClick={() => { resetWidgetSettings(); pushToast("已恢复默认设置", "success"); }}>
                        恢复默认
                    </button>
                    <button class={styles.primaryBtn} onClick={() => void copyObsUrl()}>
                        复制 OBS 链接
                    </button>
                </div>
            </header>

            <main class={styles.main}>
                {/* 左列: 设置表单 */}
                <section class={styles.formCol}>
                    <div class={styles.group}>
                        <h2>基础</h2>
                        <SwitchRow
                            label="启用插件"
                            desc="关闭后 widget 页面不显示任何内容"
                            checked={s().enabled}
                            onChange={(v) => updateWidgetSettings({ enabled: v })}
                        />
                        <SliderRow
                            label="宽度占比"
                            desc="卡片宽度占 OBS 浏览器源宽度的百分比"
                            value={s().width_ratio}
                            min={30}
                            max={100}
                            unit="%"
                            onChange={(v) => updateWidgetSettings({ width_ratio: v })}
                        />
                        <SelectRow
                            label="主题"
                            value={s().theme}
                            options={WIDGET_THEME_OPTIONS}
                            onChange={(v) => updateWidgetSettings({ theme: v })}
                        />
                        <label class={styles.row}>
                            <span class={styles.rowText}>
                                <span class={styles.rowLabel}>主色调</span>
                                <span class={styles.rowDesc}>进度条 / 均衡器 / 光晕颜色</span>
                            </span>
                            <span class={styles.colorWrap}>
                                <input
                                    class={styles.color}
                                    type="color"
                                    value={s().tint_color}
                                    onInput={(e) => updateWidgetSettings({ tint_color: e.currentTarget.value })}
                                />
                                <code class={styles.colorCode}>{s().tint_color}</code>
                            </span>
                        </label>
                        <SwitchRow
                            label="封面取色"
                            desc="自动提取封面主色作为主色调（优先于上方主色）"
                            checked={s().player_colors}
                            onChange={(v) => updateWidgetSettings({ player_colors: v })}
                        />
                    </div>

                    <div class={styles.group}>
                        <h2>封面</h2>
                        <SelectRow
                            label="封面样式"
                            value={s().cover}
                            options={WIDGET_COVER_OPTIONS}
                            onChange={(v) => updateWidgetSettings({ cover: v })}
                        />
                        <SwitchRow
                            label="封面模糊背景"
                            desc="把封面放大模糊后铺满卡片背景"
                            checked={s().cover_blur}
                            onChange={(v) => updateWidgetSettings({ cover_blur: v })}
                        />
                        <SwitchRow
                            label="封面光晕"
                            desc="封面四周渲染主色光晕"
                            checked={s().cover_glow}
                            onChange={(v) => updateWidgetSettings({ cover_glow: v })}
                        />
                    </div>

                    <div class={styles.group}>
                        <h2>播放器</h2>
                        <SelectRow
                            label="播放器样式"
                            value={s().player}
                            options={WIDGET_PLAYER_OPTIONS}
                            onChange={(v) => updateWidgetSettings({ player: v })}
                        />
                        <SwitchRow
                            label="隐藏均衡器动画"
                            checked={s().hide_equalizer}
                            onChange={(v) => updateWidgetSettings({ hide_equalizer: v })}
                        />
                    </div>

                    <div class={styles.group}>
                        <h2>显示行为</h2>
                        <SwitchRow
                            label="暂停时隐藏"
                            desc="暂停 / 无播放时延迟淡出隐藏"
                            checked={s().hide_on_pause}
                            onChange={(v) => updateWidgetSettings({ hide_on_pause: v })}
                        />
                        <Show when={s().hide_on_pause}>
                            <NumberRow
                                label="隐藏延迟"
                                value={s().hide_delay}
                                unit="秒"
                                min={0}
                                onChange={(v) => updateWidgetSettings({ hide_delay: v })}
                            />
                        </Show>
                        <SwitchRow
                            label="仅切歌时显示"
                            desc="只在切换歌曲的几秒内短暂展示"
                            checked={s().song_change_only}
                            onChange={(v) => updateWidgetSettings({ song_change_only: v })}
                        />
                        <Show when={s().song_change_only}>
                            <NumberRow
                                label="显示时长"
                                value={s().visible_duration}
                                unit="秒"
                                min={1}
                                onChange={(v) => updateWidgetSettings({ visible_duration: v })}
                            />
                        </Show>
                        <SwitchRow
                            label="开启切歌弹出动画"
                            desc="首次进入或切换歌曲时，整个组件缓慢弹出"
                            checked={s().cut_popup}
                            onChange={(v) => updateWidgetSettings({ cut_popup: v })}
                        />
                    </div>
                </section>

                {/* 右列: 实时预览 */}
                <section class={styles.previewCol}>
                    <div class={styles.previewHead}>
                        <h2>实时预览</h2>
                        <span class={styles.previewHint}>与 OBS 中显示效果一致</span>
                    </div>
                    <div class={styles.previewBox}>
                        <WidgetOverlay preview />
                    </div>
                    <div class={styles.urlBar}>
                        <span class={styles.urlLabel}>OBS 浏览器源</span>
                        <code class={styles.urlText}>{WIDGET_URL}</code>
                        <button class={styles.copyBtn} onClick={() => void copyObsUrl()}>复制</button>
                    </div>
                    <p class={styles.tip}>
                        在 OBS 中添加「浏览器」源并粘贴上方地址，建议尺寸 800 × 300，勾选透明背景即可叠加到直播画面。
                    </p>
                </section>
            </main>
        </div>
    );
}
