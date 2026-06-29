/**
 * 防抖: N ms 内连续调用只保留最后一次
 */
export function debounce<F extends (...args: never[]) => unknown>(
    fn: F,
    wait: number
): (...args: Parameters<F>) => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<F>) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn(...args);
        }, wait);
    };
}

/**
 * 节流: N ms 内最多一次调用
 */
export function throttle<F extends (...args: never[]) => unknown>(
    fn: F,
    wait: number
): (...args: Parameters<F>) => void {
    let last = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<F>) => {
        const now = Date.now();
        const remain = wait - (now - last);
        if (remain <= 0) {
            last = now;
            fn(...args);
        } else if (!pending) {
            pending = setTimeout(() => {
                pending = null;
                last = Date.now();
                fn(...args);
            }, remain);
        }
    };
}
