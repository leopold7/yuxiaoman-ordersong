/** 修饰键集合（按 e.key 判断）：裸修饰键不单独记录为主键 */
const MOD_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph"]);
/** 仅修饰键的 e.code，同样需要忽略，否则会拼出 "CONTROLLEFT" 这种非法键名 */
const MOD_CODES = new Set([
    "ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight",
    "AltLeft", "AltRight", "MetaLeft", "MetaRight", "AltGraph",
]);

/**
 * 把 KeyboardEvent.code 映射为 muda（Tauri 全局快捷键底层）接受的物理键名。
 *
 * 注意：muda 的键名与浏览器 e.code 并不完全一致——最典型的是小键盘减号：
 *   e.code="NumpadSubtract"，而 muda 只认 "NUMPADSUBTRACT"（或 "NUMSUBTRACT"）。
 * 这里仅对不一致的小键盘键做显式映射，其余键沿用 e.code 大写（KEY*、DIGIT*、ARROW*、SPACE 等格式均被 muda 接受）。
 */
const CODE_TO_MUDA: Record<string, string> = {
    NumpadSubtract: "NUMPADSUBTRACT",
    NumpadAdd: "NUMPADADD",
    NumpadDecimal: "NUMPADDECIMAL",
    NumpadDivide: "NUMPADDIVIDE",
    NumpadMultiply: "NUMPADMULTIPLY",
    NumpadEnter: "NUMPADENTER",
};

/**
 * 历史遗留旧别名 -> muda 合法键名。
 *
 * 旧版本曾把小键盘减号以简写 "NUMPADSUB" 存进 localStorage（v3.shortcutPausePlay），
 * 而 muda 只接受全称 "NUMPADSUBTRACT"，直接注册会报
 * `Couldn't recognize "NUMPADSUB" as a valid key for hotkey`。
 * 该表仅用于注册前兼容旧数据，与 CODE_TO_MUDA（生成用）方向相反、用途不同。
 */
const LEGACY_TO_MUDA: Record<string, string> = {
    NUMPADSUB: "NUMPADSUBTRACT",
};

/**
 * 把组合串（如 "Ctrl+NUMPADSUB"）中遗留的旧键名归一化为 muda 接受的名称（如 "Ctrl+NUMPADSUBTRACT"）。
 * 未命中映射的 token 原样保留。纯展示以外的注册流程都应先经此函数兼容旧 localStorage 数据。
 */
export function normalizeCombo(combo: string): string {
    if (!combo) return combo;
    return combo
        .split("+")
        .map((t) => LEGACY_TO_MUDA[t.toUpperCase()] ?? t)
        .join("+");
}

/**
 * 键盘事件 -> Tauri 全局快捷键格式字符串，如 "Ctrl+Space" / "Ctrl+Shift+A" / "Ctrl+NUMPADSUBTRACT"。
 * 裸修饰键返回 null（不记录）。
 *
 * 主键名取自 `e.code`（物理键位，与键盘布局无关），再经 CODE_TO_MUDA 转成 muda 接受的名称。
 *
 * 该格式供 @tauri-apps/plugin-global-shortcut 注册使用。
 */
export function formatCombo(e: KeyboardEvent): string | null {
    if (MOD_KEYS.has(e.key) || MOD_CODES.has(e.code)) return null;

    const mods: string[] = [];
    if (e.ctrlKey) mods.push("Ctrl");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Shift");
    if (e.metaKey) mods.push("Meta"); // Windows 上对应 Win 键

    const main = CODE_TO_MUDA[e.code] ?? e.code.toUpperCase();

    return [...mods, main].join("+");
}

/**
 * 内部键名 -> 友好中文/符号显示。
 * 例：NUMPADSUBTRACT -> "小键盘-"，ARROWUP -> "↑"，SPACE -> "空格"。
 * 修饰键 Ctrl/Alt/Shift 保持原样；Meta 在 Windows 上显示为 "Win"。
 */
const DISPLAY_MAP: Record<string, string> = {
    META: "Win",
    SPACE: "空格",
    ENTER: "回车",
    RETURN: "回车",
    ESCAPE: "Esc",
    ESC: "Esc",
    BACKSPACE: "退格",
    TAB: "Tab",
    CAPSLOCK: "大写锁定",
    CONTEXTMENU: "菜单键",
    ARROWUP: "↑",
    ARROWDOWN: "↓",
    ARROWLEFT: "←",
    ARROWRIGHT: "→",
    MINUS: "-",
    EQUAL: "=",
    BACKSLASH: "\\",
    BRACKETLEFT: "[",
    BRACKETRIGHT: "]",
    SEMICOLON: ";",
    QUOTE: "'",
    COMMA: ",",
    PERIOD: ".",
    SLASH: "/",
    BACKQUOTE: "`",
    // 展示用：muda 实际键名（当前生成的格式）
    NUMPADSUBTRACT: "小键盘-",
    NUMPADADD: "小键盘+",
    NUMPADDECIMAL: "小键盘.",
    NUMPADDIVIDE: "小键盘/",
    NUMPADMULTIPLY: "小键盘*",
    NUMPADENTER: "小键盘回车",
    PAGEUP: "PageUp",
    PAGEDOWN: "PageDown",
    HOME: "Home",
    END: "End",
    INSERT: "Insert",
    DELETE: "Delete",
    PRINTSCREEN: "PrintScreen",
    SCROLLLOCK: "ScrollLock",
    PAUSE: "Pause",
};

/**
 * 将内部组合键（如 "Ctrl+Alt+NUMPADSUBTRACT"）转换为友好显示文本（如 "Ctrl+Alt+小键盘-"）。
 * 纯展示用途，禁止再传给 Tauri 注册。
 */
export function formatComboDisplay(combo: string): string {
    if (!combo) return combo;
    return combo
        .split("+")
        .map((token) => {
            const up = token.toUpperCase();
            if (DISPLAY_MAP[up]) return DISPLAY_MAP[up];
            // KEYA -> A，DIGIT1 -> 1，NUMPAD0 -> 小键盘0
            if (up.startsWith("KEY") && up.length === 4) return up.slice(3);
            if (up.startsWith("DIGIT") && up.length === 6) return up.slice(5);
            if (up.startsWith("NUMPAD") && /^[0-9]$/.test(up.slice(6))) {
                return "小键盘" + up.slice(6);
            }
            // 未知键名原样返回，避免丢失信息
            return token;
        })
        .join("+");
}
