/**
 * 弹幕连接状态信号 -- 供 UI 订阅与跨客户端共享.
 */

import { createSignal } from "solid-js";

/** 弹幕连接状态. */
export type DanmuStatus = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

const [danmuStatus, setDanmuStatus] = createSignal<DanmuStatus>("idle");
export { danmuStatus, setDanmuStatus };

/**
 * 身份码失效标志 (仅开放平台模式) .
 *
 * B 站"互动玩法"身份码每场开播都会变; `gameStart` 拿到响应但 `code !== 0` 时
 * 置 true, UI 据此弹出"重新填身份码"窗口. 连接成功 (onopen) 时清除.
 */
const [danmuNeedCode, setDanmuNeedCode] = createSignal<boolean>(false);
export { danmuNeedCode, setDanmuNeedCode };
