import { createEffect, onCleanup, onMount, Show } from "solid-js";
import { liveState, smoothCurrentTime } from "@/stores/liveState";

export function AudioBridge() {
    let audio!: HTMLAudioElement;
    let lastSrc = "";
    let userInteracted = false;

    const SEEK_TOLERANCE_SEC = 0.8;

    onMount(() => {
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";
        audio.volume = 1;

        // OBS 浏览器源默认允许自动播放, 但用户在普通浏览器打开预览时需要
        // 一次点击才能解锁. 记录一下并在下次 sync 里补触发 play().
        const unlock = () => {
            userInteracted = true;
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };
        window.addEventListener("pointerdown", unlock);
        window.addEventListener("keydown", unlock);
        onCleanup(() => {
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        });
    });

    // 主 sync 循环: 跟随 liveState 换源 / 播停 / 追进度
    createEffect(() => {
        const s = liveState();
        const target = s.nowUrl || "";

        if (target !== lastSrc) {
            lastSrc = target;
            if (target) {
                audio.src = target;
                audio.currentTime = Math.max(0, smoothCurrentTime());
                if (s.playing) void audio.play().catch(() => { /* 需要用户交互, unlock 后会重试 */ });
            } else {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
            }
            return;
        }

        if (!target) return;

        if (s.playing && audio.paused) {
            void audio.play().catch(() => { /* 等 unlock */ });
        } else if (!s.playing && !audio.paused) {
            audio.pause();
        }

        const expect = smoothCurrentTime();
        if (isFinite(expect) && Math.abs(audio.currentTime - expect) > SEEK_TOLERANCE_SEC) {
            audio.currentTime = expect;
        }

        if (userInteracted && s.playing && audio.paused) {
            void audio.play().catch(() => { /* ignore */ });
        }
    });

    return (
        <div style={{
            position: "fixed",
            inset: "0",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "flex-direction": "column",
            gap: "12px",
            color: "rgba(255, 255, 255, 0.55)",
            "font-family": "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
            "font-size": "13px",
            "pointer-events": "none",
            "user-select": "none",
        }}>
            <audio ref={audio} />
            <div style={{ "font-size": "14px", "font-weight": "600" }}>OBS 音频桥</div>
            <Show
                when={liveState().nowUrl}
                fallback={<div>等待主程序开始播放…</div>}
            >
                <div>{liveState().now?.sname ?? ""} · {liveState().now?.sartist ?? ""}</div>
                <div style={{ opacity: "0.7" }}>{liveState().playing ? "正在播放" : "已暂停"}</div>
            </Show>
        </div>
    );
}
