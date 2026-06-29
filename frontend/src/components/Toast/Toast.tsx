import { For } from "solid-js";
import { useToasts } from "@/utils/toast";
import styles from "./Toast.module.css";

export function Toast() {
    const toasts = useToasts();
    return (
        <div class={styles.toastBox}>
            <For each={toasts()}>{(t) => (
                <div class={`${styles.item} ${styles[t.level]}`}>{t.text}</div>
            )}</For>
        </div>
    );
}
