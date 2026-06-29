/**
 * B 站直播间网页弹幕协议客户端 (房间号模式) .
 *
 * 重构后只解析 `DANMU_MSG` (普通弹幕) 与 `SUPER_CHAT_MESSAGE` (SC) ;
 * 礼物 / 大航海事件不再派发到业务层.
 */

import pako from "pako";
import { biliWebApi, type DanmuInfoResp, type RoomInitResp } from "@/api/biliWeb";
import { settings } from "@/stores/settings";
import { pushToast, pushToastOnce } from "@/utils/toast";
import type { DanmuMessage } from "@/types/danmu";
import type { DanmuClient, DanmuListener } from "./DanmuClient";
import { setDanmuStatus } from "./status";

export class BiliWebClient implements DanmuClient {
    private ws: WebSocket | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectCount = 0;
    private readonly reconnectMax = 8;
    private manualClose = false;
    private hasConnectedOnce = false;

    public uid: string | number = 0;
    public roomId = 0;

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
            } catch (e) {
                console.warn("[bili-web] 派发失败：", e);
            }
        }
    }

    async connect(): Promise<boolean> {
        this.manualClose = false;
        setDanmuStatus(this.reconnectCount > 0 ? "reconnecting" : "connecting");

        const rawRoom = settings.roomId().trim();
        if (!rawRoom) {
            setDanmuStatus("idle");
            pushToastOnce("noRoomId", "请先在「设置 → 弹幕」里填写直播间房间号", "warn");
            return false;
        }

        let initData: RoomInitResp;
        try {
            initData = await biliWebApi.init(rawRoom);
        } catch (e) {
            console.error("[bili-web] room init 失败：", e);
            this.scheduleReconnect();
            return false;
        }
        if (initData.code !== 0 || !initData.room_id) {
            pushToastOnce("roomInitFail", `房间号无效：${initData.message ?? "未找到直播间"}`, "error");
            setDanmuStatus("failed");
            return false;
        }
        this.roomId = initData.room_id;
        this.uid = initData.owner_uid ?? 0;

        let info: DanmuInfoResp;
        try {
            info = await biliWebApi.danmuInfo(initData.room_id);
        } catch (e) {
            console.error("[bili-web] danmuInfo 失败：", e);
            this.scheduleReconnect();
            return false;
        }
        if (info.code !== 0 || !info.token || !info.host_list?.length) {
            pushToastOnce("danmuInfoFail", `弹幕服务器信息获取失败：${info.message ?? "未知"}`, "error");
            this.scheduleReconnect();
            return false;
        }

        const host = info.host_list[0].host;
        const wsUrl = `wss://${host}/sub`;
        // protover=2 让服务端用 zlib 压缩 (复用 pako, 避免 brotli 依赖) .
        const authBody = JSON.stringify({
            uid: info.uid ?? 0,
            roomid: initData.room_id,
            protover: 2,
            platform: "web",
            type: 2,
            key: info.token,
            buvid: info.buvid ?? "",
        });

        try {
            this.ws = new WebSocket(wsUrl);
            this.ws.binaryType = "arraybuffer";
        } catch (e) {
            console.error("[bili-web] WS 创建失败：", e);
            this.scheduleReconnect();
            return false;
        }
        this.bindSocket(authBody);
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
    }

    private bindSocket(authBody: string): void {
        if (!this.ws) return;
        this.ws.onopen = () => {
            this.ws?.send(this.buildPacket(authBody, 7));
            this.clearHeartbeat();
            this.heartbeatTimer = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(this.buildPacket("", 2));
                }
            }, 30_000);
        };
        this.ws.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
            this.handlePacket(ev.data);
        };
        this.ws.onclose = () => {
            this.clearHeartbeat();
            if (!this.manualClose) this.scheduleReconnect();
        };
        this.ws.onerror = (e) => console.warn("[bili-web] WS 错误：", e);
    }

    private scheduleReconnect(): void {
        if (this.manualClose || this.reconnectTimer) return;
        setDanmuStatus("reconnecting");
        if (this.reconnectCount >= this.reconnectMax) {
            setDanmuStatus("failed");
            pushToastOnce(
                "webReconnectFail",
                "弹幕多次重连失败，请检查房间号 / 网络，或在「弹幕」里手动重连",
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

    private buildPacket(body: string, op: number): ArrayBuffer {
        const enc = new TextEncoder().encode(body);
        const buf = new ArrayBuffer(enc.byteLength + 16);
        const dv = new DataView(buf);
        dv.setUint32(0, enc.byteLength + 16);
        dv.setUint16(4, 16);
        dv.setUint16(6, 1);
        dv.setUint32(8, op);
        dv.setUint32(12, 1);
        new Uint8Array(buf).set(enc, 16);
        return buf;
    }

    private handlePacket(packet: ArrayBuffer): void {
        const dv = new DataView(packet);
        if (packet.byteLength < 16) return;
        const packetLen = dv.getUint32(0);
        const headerLen = dv.getUint16(4);
        const ver = dv.getUint16(6);
        const op = dv.getUint32(8);

        if (op === 8) {
            this.reconnectCount = 0;
            setDanmuStatus("connected");
            if (!this.hasConnectedOnce) {
                this.hasConnectedOnce = true;
                pushToast("弹幕已连接（房间号模式）", "success");
            }
            return;
        }
        if (op === 3) return;

        if (op === 5) {
            const body = packet.slice(headerLen, packetLen);
            if (ver === 2) {
                try {
                    const inflated = pako.inflate(new Uint8Array(body)).buffer;
                    this.handleBatch(inflated);
                } catch (e) {
                    console.warn("[bili-web] zlib 解压失败：", e);
                }
            } else if (ver === 0) {
                this.dispatchJson(this.decodeJson(body));
            } else if (ver === 3) {
                console.warn("[bili-web] 收到 brotli(protover3) 包，本端只支持 zlib，已忽略");
            }
            return;
        }
        if (packetLen < packet.byteLength) {
            this.handlePacket(packet.slice(packetLen));
        }
    }

    private handleBatch(buf: ArrayBuffer): void {
        let offset = 0;
        const total = buf.byteLength;
        while (offset < total) {
            const dv = new DataView(buf, offset);
            const len = dv.getUint32(0);
            if (len <= 0 || offset + len > total) break;
            const headerLen = dv.getUint16(4);
            const op = dv.getUint32(8);
            if (op === 5) {
                const body = buf.slice(offset + headerLen, offset + len);
                this.dispatchJson(this.decodeJson(body));
            }
            offset += len;
        }
    }

    private decodeJson(body: ArrayBuffer): Record<string, unknown> | null {
        try {
            return JSON.parse(new TextDecoder().decode(new Uint8Array(body)));
        } catch {
            return null;
        }
    }

    private dispatchJson(json: Record<string, unknown> | null): void {
        if (!json) return;
        const cmd = String((json as { cmd?: string }).cmd ?? "");
        let msg: DanmuMessage | null = null;

        if (cmd.startsWith("DANMU_MSG")) {
            const info = (json as { info?: unknown[] }).info ?? [];
            const text = (info[1] as string) || "";
            const userArr = (info[2] as unknown[]) || [];
            const medal = (info[3] as unknown[]) || [];
            const uid = (userArr[0] as number) ?? 0;
            const uname = (userArr[1] as string) || "";
            const fansMedalLevel = Number(medal[0]) || 0;
            msg = {
                type: "dm",
                uid,
                uname,
                danmu: text,
                fansMedalLevel,
                fansMedalWearing: fansMedalLevel > 0,
                raw: json,
            };
        } else if (cmd === "SUPER_CHAT_MESSAGE") {
            const d = (json as { data?: Record<string, unknown> }).data ?? {};
            const userInfo = (d.user_info as Record<string, unknown>) || {};
            msg = {
                type: "sc",
                uid: (d.uid as number) ?? 0,
                uname: (userInfo.uname as string) || "",
                danmu: (d.message as string) || "",
                fansMedalLevel: Number((d.medal_info as Record<string, unknown>)?.medal_level) || 0,
                fansMedalWearing: false,
                price: Number(d.price) || 0,
                paid: true,
                raw: json,
            };
        }

        if (msg) this.injectMessage(msg);
    }
}
