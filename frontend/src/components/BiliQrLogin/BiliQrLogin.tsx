import { createSignal, onCleanup, onMount, Show } from "solid-js";
import QRCode from "qrcode";
import { biliPassportService } from "@/services/AuthService";
import { saveBiliCookie, session } from "@/stores/session";
import { pushToast } from "@/utils/toast";
import styles from "./BiliQrLogin.module.css";

interface Props {
    onClose: () => void;
    onSuccess?: () => void;
}

/**
 * B 站扫码登录弹窗
 *
 * 时序:
 * onMount -> 调 /qrcode 拿 url + key -> 用 qrcode 库画到 canvas -> 每 1.5s 轮询 /poll
 * 登录成功 -> 把 cookie 加密保存 -> 调 setCookie 写后端内存 -> 取 whoami 拿用户信息 -> 关闭弹窗
 */
export function BiliQrLogin(props: Props) {
    const [status, setStatus] = createSignal<"loading" | "waiting" | "scanned" | "expired" | "error">("loading");
    const [errMsg, setErrMsg] = createSignal("");
    const [qrcodeKey, setQrcodeKey] = createSignal("");
    let canvasRef: HTMLCanvasElement | undefined;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function loadQrcode() {
        setStatus("loading");
        setErrMsg("");
        const r = await biliPassportService.generateQrcode();
        if (r.code !== 0 || !r.url || !r.qrcode_key) {
            setStatus("error");
            setErrMsg(r.message || "二维码加载失败");
            return;
        }
        setQrcodeKey(r.qrcode_key);
        if (canvasRef) {
            try {
                await QRCode.toCanvas(canvasRef, r.url, {
                    width: 220,
                    margin: 1,
                    color: { dark: "#1d1d1f", light: "#ffffff" }
                });
            } catch (e) {
                setStatus("error");
                setErrMsg("二维码渲染失败：" + (e as Error).message);
                return;
            }
        }
        setStatus("waiting");
        startPolling();
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(() => void pollOnce(), 1500);
        void pollOnce();
    }
    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    async function pollOnce() {
        const key = qrcodeKey();
        if (!key) return;
        const r = await biliPassportService.poll(key);
        if (r.code === 0 && r.cookie) {
            stopPolling();
            await saveBiliCookie(r.cookie);
            
            const me = await biliPassportService.whoami();
            if (me.logged) {
                session.setBiliUser({ mid: me.mid, uname: me.uname, avatar: me.avatar });
                pushToast(`B 站登录成功：${me.uname ?? ""}`, "success");
            } else {
                pushToast("B 站 cookie 已保存（用户信息读取异常）", "warn");
            }
            props.onSuccess?.();
            props.onClose();
            return;
        }
        if (r.code === 86038) {
            setStatus("expired");
            stopPolling();
            return;
        }
        if (r.code === 86090) {
            setStatus("scanned");
            return;
        }
        if (r.code === 86101) {
            setStatus("waiting");
            return;
        }
        if (r.code === -1) {
            console.warn("[bili-qr] poll 网络错:", r.message);
        }
    }

    onMount(() => { void loadQrcode(); });
    onCleanup(() => stopPolling());

    return (
        <div class={styles.backdrop} onClick={props.onClose}>
            <div class={styles.modal} onClick={(e) => e.stopPropagation()}>
                <h2 class={styles.h1}>B 站扫码登录</h2>
                <p class={styles.subtitle}>用「B 站手机客户端」扫描下方二维码即可完成登录</p>

                <div class={styles.qrWrap}>
                    <canvas ref={canvasRef} class={styles.qr} />
                    <Show when={status() === "loading"}>
                        <div class={styles.mask}>加载二维码中…</div>
                    </Show>
                    <Show when={status() === "scanned"}>
                        <div class={`${styles.mask} ${styles.maskOk}`}>已扫描，请在手机上确认</div>
                    </Show>
                    <Show when={status() === "expired"}>
                        <div class={`${styles.mask} ${styles.maskWarn}`}>
                            <div>二维码已失效</div>
                            <button class="primary" style={{ "margin-top": "8px" }} onClick={() => void loadQrcode()}>刷新</button>
                        </div>
                    </Show>
                    <Show when={status() === "error"}>
                        <div class={`${styles.mask} ${styles.maskErr}`}>
                            <div>{errMsg() || "二维码加载失败"}</div>
                            <button class="primary" style={{ "margin-top": "8px" }} onClick={() => void loadQrcode()}>重试</button>
                        </div>
                    </Show>
                </div>

                <div class={styles.tip}>
                    
                    Cookie 仅保存在本地（AES 加密）
                </div>

                <div class={styles.actions}>
                    <button onClick={props.onClose}>取消</button>
                </div>
            </div>
        </div>
    );
}
