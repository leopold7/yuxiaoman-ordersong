/** 支持的音乐平台 -- 当前仅网易云 wy 与 QQ 音乐 qq */
export type Platform = "wy" | "qq";

/**
 * 一首歌的标准化描述
 *
 * `sid` 既可能是数字 (网易云) 也可能是字符串 (QQ songmid) , 统一允许两种类型;
 * 持久化 / 序列化时建议转成 `string` 后再比较, 避免 `1 === "1"` 这种问题
 */
export interface SongInfo {
    platform: Platform;
    sid: string | number;
    sname: string;
    sartist: string;
    duration?: number;
    coverUrl?: string;
    albumName?: string;
}
