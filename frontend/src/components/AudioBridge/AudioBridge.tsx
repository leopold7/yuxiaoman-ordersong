import { createEffect, onCleanup, onMount, Show } from "solid-js";
import { liveState, smoothCurrentTime } from "@/stores/liveState";

export function AudioBridge() {
    let audio!: HTMLAudioElement;
    let lastSrc = "";
    let lastPlaying = false;
    let userInteracted = false;

    // 淡入淡出状态
    let rafId = 0;
    let pausing = false; // 淡出暂停进行中 (音量渐降但尚未 pause)

    // 仅向前追的容差 (秒): 本地进度落后期望超过该值才向前 seek。
    // 设大一些(5s), 减少无谓 seek; 且绝对禁止往回 seek, 从根上杜绝"重复上一秒"。
    const FORWARD_TOLERANCE_SEC = 5;
    // 卡顿感知: 本地 audio.currentTime 停滞超过该时长(ms)判定为系统卡顿,
    // 此时降级为暂停/静音滞后, 而非基于过期快照回跳。
    const STALL_MS = 5000;
    // 本地 currentTime 实际推进的最后时刻 (ms), 用于卡顿停滞判定
    let lastProgressAt = 0;

    function cancelRamp(): void {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }

    /** 音量线性淡入到 1 (durationMs<=0 时直接置 1) */
    function fadeInVolume(durationMs: number): void {
        cancelRamp();
        if (durationMs <= 0) {
            audio.volume = 1;
            return;
        }
        audio.volume = 0;
        const start = performance.now();
        const step = (n: number) => {
            const t = Math.max(0, Math.min(1, (n - start) / durationMs));
            audio.volume = t;
            if (t < 1) rafId = requestAnimationFrame(step);
            else rafId = 0;
        };
        rafId = requestAnimationFrame(step);
    }

    /** 带淡出的暂停: 音量线性降到 0 后再 pause (durationMs<=0 时直接 pause) */
    function fadeOutPause(durationMs: number): void {
        if (audio.paused) return;
        cancelRamp();
        if (durationMs <= 0) {
            audio.pause();
            audio.volume = 1;
            return;
        }
        pausing = true;
        const from = Math.max(0, Math.min(1, audio.volume || 1));
        const start = performance.now();
        const step = (n: number) => {
            const t = Math.max(0, Math.min(1, (n - start) / durationMs));
            audio.volume = from * (1 - t);
            if (t < 1) {
                rafId = requestAnimationFrame(step);
            } else {
                rafId = 0;
                audio.volume = 0; // 保持 0 再暂停, 避免收尾瞬间被重置回 1 产生满音量爆音
                audio.pause();
                pausing = false;
            }
        };
        rafId = requestAnimationFrame(step);
    }

    /** 播放 (带淡入). play() 可能因自动播放限制被拒, 解锁后由稳态纠偏补触发 */
    function startPlay(fadeMs: number): void {
        cancelRamp();
        pausing = false;
        void audio
            .play()
            .then(() => fadeInVolume(fadeMs))
            .catch(() => { /* 需要用户交互, unlock 后重试 */ });
    }

    onMount(() => {
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";
        audio.volume = 1;

        // 记录本地真实播放进度推进时刻, 用于卡顿停滞判定 (比依赖快照 t 更可靠,
        // 能覆盖 OBS 音频进程自身卡顿的场景)
        const onTimeUpdate = () => {
            lastProgressAt = performance.now();
        };
        audio.addEventListener("timeupdate", onTimeUpdate);

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
            audio.removeEventListener("timeupdate", onTimeUpdate);
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
            cancelRamp();
        });
    });

    // 主 sync 循环: 跟随 liveState 换源 / 播停 / 追进度 (播停带淡入淡出)
    createEffect(() => {
        const s = liveState();
        const target = s.nowUrl || "";
        const fadeMs = s.fadeEnabled ? Math.max(0, s.fadeDuration ?? 0) : 0;

        // 1. 换源
        if (target !== lastSrc) {
            lastSrc = target;
            cancelRamp();
            pausing = false;
            if (target) {
                audio.src = target;
                audio.currentTime = Math.max(0, smoothCurrentTime());
                lastProgressAt = performance.now();
                lastPlaying = s.playing;
                if (s.playing) startPlay(fadeMs);
            } else {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
                lastPlaying = false;
            }
            return;
        }

        if (!target) return;

        // 2. 播放/暂停跳变 -> 走淡入淡出
        if (s.playing !== lastPlaying) {
            lastPlaying = s.playing;
            if (s.playing) startPlay(fadeMs);
            else fadeOutPause(fadeMs);
        } else if (s.playing && audio.paused && !pausing && userInteracted) {
            // 3. 稳态纠偏: 自动播放被拦/意外暂停时补救
            startPlay(fadeMs);
        }

        // 4. 追帧 + 卡顿感知 (仅在正常播放、且未在淡出暂停过程中)
        if (s.playing && !pausing) {
            const expect = smoothCurrentTime();
            const local = audio.currentTime;

            // 卡顿感知: 本地进度长时间无推进 (系统卡顿导致解码停滞), 但主程序仍
            // 报告 playing -> 降级为暂停/静音滞后, 绝不基于过期快照回跳 (回跳会
            // 重复上一秒, 体验最差)。卡顿解除后由单向向前追自然对齐。
            const stalled = lastProgressAt > 0 && performance.now() - lastProgressAt > STALL_MS;
            if (stalled) {
                fadeOutPause(fadeMs); // 静音滞后, 避免重复; 恢复后 startPlay 重新接上
                return;
            }

            if (!isFinite(expect)) return;

            // 单向向前追: 仅当期望进度明显领先本地时才向前 seek;
            // 期望落后于本地 (快照过期/回退) 时一律不回跳, 保留本地已播放位置,
            // 从根上杜绝"重复上一秒内容"。
            const diff = expect - local;
            if (diff > FORWARD_TOLERANCE_SEC) {
                audio.currentTime = expect;
                lastProgressAt = performance.now(); // 主动 seek 后刷新停滞基准, 避免误判
            }
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
