import { createSignal } from "solid-js";
import { settings } from "@/stores/settings";
import { restartDanmu } from "@/services/DanmuService";
import { pushToast } from "@/utils/toast";
import { invoke, isTauri } from "@/infra/tauri/invoke";
import styles from "./OnboardingModal.module.css";

interface Props {
    onClose: () => void;
}

export function OnboardingModal(props: Props) {
    const [code, setCode] = createSignal("");

    const save = async () => {
        const c = code().trim();
        if (!c) {
            pushToast("请填写身份码", "warn");
            return;
        }
        settings.setAnchorCode(c);
        pushToast("身份码已保存，正在连接弹幕服务...", "info");
        if (isTauri()) {
            try { await invoke("close_bili_live_settings"); } catch (_) { /* ignore */ }
        }
        props.onClose();
        void restartDanmu();
    };

    const openBili = async () => {
        if (!isTauri()) {
            window.open("https://link.bilibili.com/p/center/index#/my-room/start-live", "_blank");
            return;
        }
        try {
            await invoke("open_bili_live_settings");
            pushToast("已打开 B 站直播中心，请扫码登录后复制身份码", "info");
        } catch (e) {
            const msg = typeof e === "string" ? e : ((e as Error)?.message ?? JSON.stringify(e));
            pushToast(`打开失败：${msg}`, "error");
        }
    };

    const pasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) {
                pushToast("剪贴板为空", "warn");
                return;
            }
            setCode(text.trim());
            pushToast(`已粘贴（${text.trim().length} 字符）`, "success");
        } catch (e) {
            pushToast(`读取剪贴板失败：${(e as Error).message}`, "error");
        }
    };

    const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") props.onClose();
    };

    return (
        <div class={styles.backdrop} onClick={props.onClose}>
            <div class={styles.modal} onClick={(e) => e.stopPropagation()}>
                <h2 class={styles.h1}>
                    <span>欢迎使用 鱼小曼点歌助手</span>
                </h2>
                <p class={styles.subtitle}>
                    首次使用需要配置主播身份码，应用才能连接 B 站弹幕服务、识别观众点歌指令。
                </p>

                <div class={styles.steps}>
                    <b>3 步获取身份码：</b><br />
                    1. 点下方 <b>「① 打开 B 站直播中心」</b>，浏览器里扫码登录 B 站<br />
                    2. 找到「开播设置 → 身份码」一栏，点复制<br />
                    3. 回主窗口点 <b>「② 从剪贴板粘贴」</b>，再点保存
                </div>

                <div style={{ display: "flex", gap: "8px", "margin-top": "12px" }}>
                    <button onClick={openBili} style={{ flex: 1 }}>① 打开 B 站直播中心</button>
                    <button onClick={pasteFromClipboard} style={{ flex: 1 }}>② 从剪贴板粘贴</button>
                </div>

                <div class={styles.row}>
                    <input
                        type="text"
                        placeholder="或手动粘贴主播身份码"
                        value={code()}
                        onInput={(e) => setCode(e.currentTarget.value)}
                        onKeyDown={handleKey}
                        autofocus
                    />
                    <button class="primary" onClick={save}>保存并连接</button>
                </div>

                <div class={styles.actions}>
                    <span style={{ "font-size": "11px", color: "var(--text-2)" }}>
                        身份码每次开播会变化，需要更新一次
                    </span>
                    <button class={styles.skipBtn} onClick={props.onClose}>稍后再说</button>
                </div>
            </div>
        </div>
    );
}
