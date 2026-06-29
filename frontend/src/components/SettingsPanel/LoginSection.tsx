import { Show, createSignal } from "solid-js";
import { neteaseService, qqService } from "@/services/MusicService";
import { saveWyCookie, saveQqCookie, session } from "@/stores/session";
import { pushToast } from "@/utils/toast";
import { invoke, isTauri } from "@/infra/tauri/invoke";
import styles from "./SettingsPanel.module.css";

/** Tauri 命令 reject 时返回的可能是字符串, Error 或对象, 统一提取可读信息 */
function errMsg(err: unknown): string {
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && "message" in err) {
        return String((err as { message: unknown }).message);
    }
    try { return JSON.stringify(err); } catch { return String(err); }
}

export function LoginSection() {
    // ===== 网易云 =====
    const [wyStatus, setWyStatus] = createSignal("");

    const verifyWy = async (cookie: string) => {
        try {
            const info = (await neteaseService.getUserAccount(cookie)) as {
                profile?: { userId?: number; nickname?: string; avatarUrl?: string; vipType?: number };
            } | null;
            if (info?.profile) {
                session.setLogin({
                    ...session.login(),
                    netease: {
                        logged: true,
                        userId: info.profile.userId,
                        nickname: info.profile.nickname,
                        avatar: info.profile.avatarUrl,
                        vipType: info.profile.vipType
                    }
                });
                pushToast(`网易云登录成功：${info.profile.nickname ?? ""}`, "success");
                return true;
            }
        } catch (err) {
            console.warn(err);
        }
        pushToast("Cookie 已保存，但用户信息验证失败", "warn");
        return false;
    };

    const openWyLogin = async () => {
        try {
            setWyStatus("正在打开登录窗口...");
            await invoke("open_netease_login");
            setWyStatus("登录窗口已打开。在弹出窗口里完成登录（扫码 / 短信 / 邮箱密码均可），完成后回来点「② 抓取 Cookie」");
        } catch (err) {
            setWyStatus(`打开失败：${errMsg(err)}`);
            pushToast(`打开登录窗口失败：${errMsg(err)}`, "error", 12000);
        }
    };

    const captureWyCookie = async () => {
        try {
            setWyStatus("正在从登录窗口读取 cookie...");
            const cookie = await invoke<string>("read_netease_cookies");
            if (!cookie) { setWyStatus("cookie 为空"); return; }
            await saveWyCookie(cookie);
            const ok = await verifyWy(cookie);
            if (ok) {
                try { await invoke("close_netease_login"); } catch (_) { /* ignore */ }
                setWyStatus("");
            } else {
                setWyStatus("Cookie 验证失败，请确认是否真正登录了账号");
            }
        } catch (err) {
            const msg = (err as Error).message || String(err);
            setWyStatus(`读取失败：${msg}`);
            pushToast(msg, "error");
        }
    };

    const logoutWy = async () => {
        await saveWyCookie("");
        session.setLogin({ ...session.login(), netease: { logged: false } });
        pushToast("已退出网易云登录", "info");
        setWyStatus("");
    };

    // ===== QQ 音乐 =====
    const [qqStatus, setQqStatus] = createSignal("");

    const openQqLogin = async () => {
        try {
            setQqStatus("正在打开 QQ 音乐登录窗口...");
            await invoke("open_qq_login");
            setQqStatus("登录窗口已打开。点页面右上角登录（扫码 / QQ / 微信），完成后回来点「② 抓取 Cookie」");
        } catch (err) {
            setQqStatus(`打开失败：${errMsg(err)}`);
            pushToast(`打开 QQ 音乐登录窗口失败：${errMsg(err)}`, "error", 12000);
        }
    };

    const captureQqCookie = async () => {
        try {
            setQqStatus("正在从登录窗口读取 cookie...");
            const cookie = await invoke<string>("read_qq_cookies");
            if (!cookie) { setQqStatus("cookie 为空"); return; }
            await saveQqCookie(cookie);
            await qqService.setCookie(cookie);
            session.setLogin({ ...session.login(), qq: { logged: true } });
            pushToast("QQ 音乐登录成功", "success");
            try { await invoke("close_qq_login"); } catch (_) { /* ignore */ }
            setQqStatus("");
        } catch (err) {
            const msg = (err as Error).message || String(err);
            setQqStatus(`读取失败：${msg}`);
            pushToast(msg, "error");
        }
    };

    const logoutQq = async () => {
        await saveQqCookie("");
        await qqService.setCookie("");
        session.setLogin({ ...session.login(), qq: { logged: false } });
        pushToast("已退出 QQ 音乐登录", "info");
        setQqStatus("");
    };

    const note = (text: string) => (
        <div style={{
            "font-size": "13px",
            color: "var(--text-2)",
            padding: "10px 12px",
            background: "var(--bg-2)",
            "border-radius": "6px",
            "line-height": "1.7"
        }}>{text}</div>
    );

    const restoring = () => session.restoring();
    const restoringNote = (label: string) => (
        <div class={styles.restoring}>
            <span class={styles.spinner} aria-hidden />
            <span>正在恢复{label}登录态，请稍候…</span>
        </div>
    );

    return (
        <>
            <div class={styles.section}>
                <h3>登录网易云</h3>
                <Show
                    when={!restoring()}
                    fallback={restoringNote("网易云")}
                >
                    <Show
                        when={!session.login().netease.logged}
                        fallback={
                            <div class={styles.row}>
                                <label>状态</label>
                                <div>已登录 {session.login().netease.nickname && <b>({session.login().netease.nickname})</b>}</div>
                                <button onClick={logoutWy}>退出</button>
                            </div>
                        }
                    >
                        <Show when={isTauri()} fallback={note("登录功能仅在桌面应用中可用（OBS 浏览器源仅作展示，不需要登录）。")}>
                            <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                                <button class="primary" onClick={openWyLogin}>① 打开网易云登录窗口</button>
                                <button onClick={captureWyCookie}>② 我已登录，抓取 Cookie</button>
                                <Show when={wyStatus()}>
                                    <button onClick={() => { invoke("close_netease_login").catch(() => {}); setWyStatus(""); }} style={{ "font-size": "12px" }}>关闭登录窗口</button>
                                    <div style={{ "font-size": "12px", color: "var(--text-1)", padding: "10px 12px", background: "var(--bg-2)", "border-radius": "6px", "line-height": "1.7" }}>{wyStatus()}</div>
                                </Show>
                            </div>
                        </Show>
                    </Show>
                </Show>
            </div>

            <div class={styles.section}>
                <h3>登录 QQ 音乐</h3>
                <Show
                    when={!restoring()}
                    fallback={restoringNote("QQ 音乐")}
                >
                    <Show
                        when={!session.login().qq.logged}
                        fallback={
                            <div class={styles.row}>
                                <label>状态</label>
                                <div>已登录 <b>(QQ 音乐)</b></div>
                                <button onClick={logoutQq}>退出</button>
                            </div>
                        }
                    >
                        <Show when={isTauri()} fallback={note("登录功能仅在桌面应用中可用。")}>
                            <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
                                <button class="primary" onClick={openQqLogin}>① 打开 QQ 音乐登录窗口</button>
                                <button onClick={captureQqCookie}>② 我已登录，抓取 Cookie</button>
                                <Show when={qqStatus()}>
                                    <button onClick={() => { invoke("close_qq_login").catch(() => {}); setQqStatus(""); }} style={{ "font-size": "12px" }}>关闭登录窗口</button>
                                    <div style={{ "font-size": "12px", color: "var(--text-1)", padding: "10px 12px", background: "var(--bg-2)", "border-radius": "6px", "line-height": "1.7" }}>{qqStatus()}</div>
                                </Show>
                            </div>
                        </Show>
                    </Show>
                </Show>
            </div>

            <div class={styles.section}>
                {note("两个平台可同时登录，互不影响。点歌时在「点歌 → 音乐平台」里选择用哪个平台搜索。登录后 Cookie 本地 AES-GCM 加密保存，下次启动自动恢复；登录窗口加载官方页面，不走第三方接口，可放心扫码。")}
            </div>
        </>
    );
}
