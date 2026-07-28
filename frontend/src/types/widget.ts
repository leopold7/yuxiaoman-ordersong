/**
 * Widget 插件（正在播放挂件）外观设置类型
 *
 * 字段完整对齐 now-playing-service 的 entity/Settings.java（忽略 first_login / is_demo 内部字段），
 * 额外增加 enabled（插件启用开关）。
 */

export interface WidgetSettings {
    /** 插件启用开关（关闭后 ?view=widget 不渲染任何内容） */
    enabled: boolean;
    /** 封面模糊背景 */
    cover_blur: boolean;
    /** 封面光晕 */
    cover_glow: boolean;
    /** 暂停时隐藏 */
    hide_on_pause: boolean;
    /** 仅切歌时显示 */
    song_change_only: boolean;
    /** 切歌显示持续秒数（song_change_only 生效时） */
    visible_duration: number;
    /** 取封面主色做主题色 */
    player_colors: boolean;
    /** 隐藏均衡器动画 */
    hide_equalizer: boolean;
    /** 封面样式: 0=圆角方形 1=圆形 2=隐藏 */
    cover: number;
    /** 暂停后隐藏延迟秒数（hide_on_pause 生效时） */
    hide_delay: number;
    /** 播放器样式: 0=完整(含进度条) 1=紧凑(无进度条) 2=迷你 */
    player: number;
    /** 主题: 0=深色 1=浅色 2=透明 */
    theme: number;
    /** 主色 */
    tint_color: string;
    /** 宽度占比: 卡片宽度占 OBS 浏览器源宽度的百分比 (30-100) */
    width_ratio: number;
}

/** 默认值与 now-playing-service Settings.java 保持一致 */
export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
    enabled: true,
    cover_blur: false,
    cover_glow: false,
    hide_on_pause: false,
    song_change_only: false,
    visible_duration: 5,
    player_colors: true,
    hide_equalizer: false,
    cover: 0,
    hide_delay: 10,
    player: 0,
    theme: 0,
    tint_color: "#40a4d8",
    width_ratio: 90
};

/** 封面样式选项（管理页下拉） */
export const WIDGET_COVER_OPTIONS: { value: number; label: string }[] = [
    { value: 0, label: "圆角方形" },
    { value: 1, label: "圆形" },
    { value: 2, label: "隐藏封面" }
];

/** 播放器样式选项 */
export const WIDGET_PLAYER_OPTIONS: { value: number; label: string }[] = [
    { value: 0, label: "完整（含进度条）" },
    { value: 1, label: "紧凑（无进度条）" },
    { value: 2, label: "迷你" }
];

/** 主题选项 */
export const WIDGET_THEME_OPTIONS: { value: number; label: string }[] = [
    { value: 0, label: "深色" },
    { value: 1, label: "浅色" },
    { value: 2, label: "透明" }
];
