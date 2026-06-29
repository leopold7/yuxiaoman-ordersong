import { createSignal } from "solid-js";
import type { OrderItem } from "@/types/order";

const [orderList, setOrderList] = createSignal<OrderItem[]>([]);
const [currentIdx, setCurrentIdx] = createSignal<number>(-1);

export const queue = {
    orderList,
    setOrderList,
    currentIdx,
    setCurrentIdx,

    current(): OrderItem | null {
        const arr = orderList();
        const idx = currentIdx();
        if (idx < 0 || idx >= arr.length) return null;
        return arr[idx];
    },

    /** 追加到队尾 */
    push(item: OrderItem) {
        setOrderList((arr) => [...arr, item]);
    },

    /** 插入到指定 index */
    insertAt(item: OrderItem, idx: number) {
        setOrderList((arr) => {
            const next = arr.slice();
            const at = Math.max(0, Math.min(idx, next.length));
            next.splice(at, 0, item);
            return next;
        });
    },

    removeById(id: string) {
        setOrderList((arr) => arr.filter((x) => x.id !== id));
    },

    moveTo(id: string, newIdx: number) {
        setOrderList((arr) => {
            const idx = arr.findIndex((x) => x.id === id);
            if (idx < 0) return arr;
            if (idx === 0) return arr;
            const next = arr.slice();
            const [it] = next.splice(idx, 1);
            const insertAt = Math.max(1, Math.min(newIdx, next.length));
            next.splice(insertAt, 0, it);
            return next;
        });
    },
    pinToTop(id: string) {
        queue.moveTo(id, 1);
    },

    clearAll() {
        setOrderList([]);
        setCurrentIdx(-1);
    },

    countByUid(uid: string | number): number {
        return orderList().filter((x) => String(x.uid) === String(uid)).length;
    },

    hasSong(sid: string | number): boolean {
        return orderList().some((x) => String(x.song.sid) === String(sid));
    }
};
