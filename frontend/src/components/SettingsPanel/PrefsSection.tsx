import { Show, createSignal, createEffect, onCleanup } from "solid-js";
import { settings } from "@/stores/settings";
import { formatCombo, formatComboDisplay } from "@/utils/hotkey";
import styles from "./SettingsPanel.module.css";

export function PrefsSection() {
    const [capturing, setCapturing] = createSignal(false);

    // 捕获态期间挂一个 window keydown（捕获阶段），写入组合键并退出；Esc 取消
    createEffect(() => {
        if (!capturing()) return;
        settings.setCapturingShortcut(true);
        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Escape") {
                setCapturing(false);
                return;
            }
            const combo = formatCombo(e);
            if (combo) {
                settings.setShortcutPausePlay(combo);
                setCapturing(false);
            }
            // 纯修饰键 (Ctrl/Alt/Shift/Win) 不退出捕获, 继续等待主键,
            // 否则先按 Ctrl 就会直接结束捕获, 导致 Ctrl+9 这类组合永远录不进去
        };
        window.addEventListener("keydown", handler, true);
        onCleanup(() => {
            window.removeEventListener("keydown", handler, true);
            settings.setCapturingShortcut(false);
        });
    });

    return (
        <>
            <div class={styles.section}>
                <h3>快捷键设置</h3>
                <div class={styles.row}>
                    <label>暂停 / 播放</label>
                    <button
                        type="button"
                        class={`${styles.shortcutBtn} ${capturing() ? styles.capturing : ""}`}
                        onClick={() => setCapturing((v) => !v)}
                    >
                        {capturing()
                            ? "按下按键…（Esc 取消）"
                            : (settings.shortcutPausePlay()
                                ? formatComboDisplay(settings.shortcutPausePlay()!)
                                : "点击设置快捷键")}
                    </button>
                    <Show when={settings.shortcutPausePlay() && !capturing()}>
                        <button type="button" class={styles.linkBtn} onClick={() => settings.setShortcutPausePlay("")}>
                            清除
                        </button>
                    </Show>
                </div>
            </div>

            <div class={styles.section}>
                <h3>播放设置</h3>
                <div class={styles.row}>
                    <label>淡入淡出</label>
                    <input
                        type="checkbox"
                        checked={settings.fadeEnabled()}
                        onChange={(e) => settings.setFadeEnabled(e.currentTarget.checked)}
                    />
                    <span />
                </div>
                <Show when={settings.fadeEnabled()}>
                    <div class={styles.row}>
                        <label>淡入淡出时长</label>
                        <input
                            type="number"
                            min="100"
                            step="100"
                            value={settings.fadeDuration()}
                            onInput={(e) => settings.setFadeDuration(Math.max(0, +e.currentTarget.value || 0))}
                        />
                        <span>ms</span>
                    </div>
                </Show>
            </div>
        </>
    );
}
