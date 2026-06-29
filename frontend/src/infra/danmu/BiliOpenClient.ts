/**
 * B 站"互动玩法"开放平台 WebSocket 客户端.
 *
 * 重构后只解析 `LIVE_OPEN_PLATFORM_DM` (普通弹幕) 与 `LIVE_OPEN_PLATFORM_SUPER_CHAT` (SC) .
 * 礼物 / 大航海事件不再向业务层派发.
 */

import pako from "pako";
import { biliOpenApi, type GameStartData } from "@/api/biliOpen";
import { ENV } from "@/config/env";
import { settings } from "@/stores/settings";
import { pushToast, pushToastOnce } from "@/utils/toast";
import type { DanmuMessage } from "@/types/danmu";
import type { DanmuClient, DanmuListener } from "./DanmuClient";
import { setDanmuNeedCode, setDanmuStatus, danmuNeedCode } from "./status";

export class BiliOpenClient implements DanmuClient {
    private ws: WebSocket | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    private socketUrl = "";
    private authPacket: ArrayBuffer | null = null;
    private heartPacket = this.createPacket("[object Object]", 1, 2, 1);

    private reconnectCount = 0;
    private readonly reconnectMax = 8;
    private manualClose = false;
    private hasConnectedOnce = false;
    private gameId = "";
    private appId = 0;
    private liveCode = "";

    public uid: string | number = 0;
    public roomId = 0;

    /** 互动玩法心跳: 20s/次, 超 60s 自动关闭场次. */
    public readonly HEARTBEAT_MS = 20_000;

    private listeners: Set<DanmuListener> = new Set();

    onMessage(listener: DanmuListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    injectMessage(msg: DanmuMessage): void {
        for (const l of this.listeners) {
            try {
                l(msg);
            } catch (err) {
                console.warn("[bili-open] 注入消息派发失败：", err);
            }
        }
    }

    async connect(): Promise<boolean> {
        this.manualClose = false;
        setDanmuStatus(this.reconnectCount > 0 ? "reconnecting" : "connecting");

        const code = (ENV.ANCHOR_CODE || settings.anchorCode() || "").trim();
        if (!code) {
            setDanmuStatus("idle");
            pushToastOnce("noAnchorCode", "请在「设置 → 弹幕」中填写主播身份码后保存并连接", "warn");
            return false;
        }
        this.liveCode = code;
        this.appId = ENV.APP_ID > 0 ? ENV.APP_ID : settings.biliAppId() || 0;

        const info = await this.getGameInfo();
        if (!info) {
            if (danmuNeedCode()) {
                setDanmuStatus("failed");
                this.clearReconnect();
                pushToastOnce(
                    "codeExpired",
                    "身份码已失效（每场开播都会变），请在弹出的窗口里重新填写",
                    "error",
                    30000
                );
                return false;
            }
            this.scheduleReconnect();
            return false;
        }

        this.uid = info.game_info.open_id;
        this.gameId = info.game_info.game_id;
        this.roomId = info.anchor_info.room_id;
        this.socketUrl = info.websocket_info.wss_link[2] || info.websocket_info.wss_link[0];
        this.authPacket = this.createPacket(info.websocket_info.auth_body, 1, 7, 1);

        try {
            this.ws = new WebSocket(this.socketUrl);
        } catch (err) {
            console.error(err);
            pushToastOnce("wsCreateFail", "弹幕链接创建失败！", "error");
            this.scheduleReconnect();
            return false;
        }
        this.bindSocket();
        return true;
    }

    async disconnect(): Promise<void> {
        this.manualClose = true;
        this.hasConnectedOnce = false;
        setDanmuStatus("idle");
        this.clearHeartbeat();
        this.clearReconnect();
        if (this.ws) {
            try {
                this.ws.close();
            } catch {
                /* ignore */
            }
            this.ws = null;
        }
        if (this.gameId) {
            try {
                await biliOpenApi.gameEnd({ app_id: this.appId, game_id: this.gameId });
            } catch (err) {
                console.warn("[bili-open] /gameEnd 失败（忽略）：", err);
            }
            this.gameId = "";
        }
    }

    private async getGameInfo(): Promise<GameStartData | null> {
        const code = this.liveCode || ENV.ANCHOR_CODE || settings.anchorCode();
        try {
            const data = await biliOpenApi.gameStart({ code, app_id: this.appId });
            if (data?.code === 0 && data.data) return data.data;
            console.error("[bili-open] /gameStart 错误：", data);
            setDanmuNeedCode(true);
            pushToastOnce("gameStartFail", `弹幕信息获取失败：${data?.message ?? "未知"}`, "error");
        } catch (err) {
            console.error("[bili-open] /gameStart 异常：", err);
            pushToastOnce("gameStartFail", "弹幕信息获取失败", "error");
        }
        return null;
    }

    private async gameHeartbeat(): Promise<void> {
        if (!this.gameId) return;
        try {
            await biliOpenApi.gameHeartbeat(this.gameId);
        } catch (err) {
            console.warn("[bili-open] 项目心跳失败：", err);
        }
    }

    private bindSocket(): void {
        if (!this.ws) return;
        this.ws.onopen = () => {
            if (this.authPacket) this.ws?.send(this.authPacket);
            this.ws?.send(this.heartPacket);

            this.clearHeartbeat();
            this.heartbeatTimer = setInterval(() => {
                void this.gameHeartbeat();
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(this.heartPacket);
                }
            }, this.HEARTBEAT_MS);

            this.reconnectCount = 0;
            setDanmuNeedCode(false);
            setDanmuStatus("connected");
            if (!this.hasConnectedOnce) {
                this.hasConnectedOnce = true;
                pushToast("弹幕已连接", "success");
            }
        };
        this.ws.onmessage = (msg: MessageEvent<Blob>) => {
            const reader = new FileReader();
            reader.readAsArrayBuffer(msg.data);
            reader.onload = () => this.handlePacket(reader.result as ArrayBuffer);
        };
        this.ws.onclose = () => {
            this.clearHeartbeat();
            if (!this.manualClose) this.scheduleReconnect();
        };
        this.ws.onerror = (err) => {
            console.warn("[bili-open] WS 错误：", err);
        };
    }

    private scheduleReconnect(): void {
        if (this.manualClose || this.reconnectTimer) return;
        setDanmuStatus("reconnecting");
        if (this.reconnectCount >= this.reconnectMax) {
            setDanmuStatus("failed");
            pushToastOnce(
                "reconnectFail",
                "弹幕多次重连失败，请检查网络或在「弹幕」里手动重连",
                "error",
                30000
            );
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.reconnectCount = 0;
                void this.connect();
            }, 30_000);
            return;
        }
        const delay = Math.min(1500 * Math.pow(1.7, this.reconnectCount), 20_000);
        this.reconnectCount++;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connect();
        }, delay);
    }

    private clearHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private clearReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectCount = 0;
    }

    private handlePacket(packet: ArrayBuffer): number {
        const dv = new DataView(packet);
        const packetLen = dv.getUint32(0);
        const headerLen = dv.getUint16(4);
        const version = dv.getUint16(6);
        const operation = dv.getUint32(8);
        if (operation !== 5) return packetLen;

        const body = packet.slice(headerLen, packetLen);
        if (version === 0) {
            try {
                const json = JSON.parse(new TextDecoder().decode(new Uint8Array(body)));
                this.dispatch(json);
            } catch (err) {
                console.warn("[bili-open] 弹幕解析失败：", err);
            }
        } else if (version === 2) {
            try {
                const inflated = pako.inflate(new Uint8Array(body)).buffer;
                this.handleUnzipPacket(inflated);
            } catch (err) {
                console.warn("[bili-open] zlib 解压失败：", err);
            }
        }
        return packetLen;
    }

    private handleUnzipPacket(buf: ArrayBuffer): void {
        let offset = 0;
        const total = buf.byteLength;
        while (offset < total) {
            const slice = buf.slice(offset);
            const len = new DataView(slice).getUint32(0);
            if (len <= 0) break;
            this.handlePacket(slice.slice(0, len));
            offset += len;
        }
    }

    private dispatch(json: { cmd?: string; data?: Record<string, unknown> }): void {
        const cmd = json.cmd;
        const data = json.data ?? {};
        let msg: DanmuMessage | null = null;
        if (cmd === "LIVE_OPEN_PLATFORM_DM") {
            msg = {
                type: "dm",
                uid: data.open_id as string,
                uname: (data.uname as string) || "",
                danmu: (data.msg as string) || "",
                fansMedalLevel: Number(data.fans_medal_level) || 0,
                fansMedalWearing: !!data.fans_medal_wearing_status,
                raw: data,
            };
        } else if (cmd === "LIVE_OPEN_PLATFORM_SUPER_CHAT") {
            msg = {
                type: "sc",
                uid: data.open_id as string,
                uname: (data.uname as string) || "",
                danmu: (data.message as string) || "",
                fansMedalLevel: Number(data.fans_medal_level) || 0,
                fansMedalWearing: !!data.fans_medal_wearing_status,
                price: Number(data.rmb) || 0,
                paid: true,
                raw: data,
            };
        }
        // 礼物 / 大航海事件不再派发, 由业务层显式弃用
        if (!msg) return;
        for (const l of this.listeners) {
            try {
                l(msg);
            } catch (err) {
                console.warn(err);
            }
        }
    }

    private createPacket(packet: string, version: number, operation: number, sequenceId: number): ArrayBuffer {
        const encoded = new TextEncoder().encode(packet);
        const buf = new ArrayBuffer(encoded.byteLength + 16);
        const dv = new DataView(buf);
        dv.setUint32(0, encoded.byteLength + 16);
        dv.setUint16(4, 16);
        dv.setUint16(6, version);
        dv.setUint32(8, operation);
        dv.setUint32(12, sequenceId);
        new Uint8Array(buf).set(encoded, 16);
        return buf;
    }
}
