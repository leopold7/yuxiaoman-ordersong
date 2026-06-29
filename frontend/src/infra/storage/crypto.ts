/**
 * 轻量对称加密 -- 用于本地存储 cookie / token.
 *
 * 安全说明: 这是"防止 OBS 浏览器源被截屏后直接复用 cookie"级别的保护,
 * 并非密码学强度方案. 密钥派生自 `location.origin` + 固定 salt,
 * 同一 origin 不同设备能互解 (设计意图: 跨 WebView2 / 浏览器场景下都能读) .
 */

const SALT = "ordersong-v3-stable-key";

async function deriveKey(): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const material = enc.encode(`${location.origin}|${SALT}`);
    const hash = await crypto.subtle.digest("SHA-256", material);
    return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** AES-GCM 加密为 base64 字符串; 失败时静默回退明文. */
export async function encryptText(plain: string): Promise<string> {
    try {
        const key = await deriveKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            new TextEncoder().encode(plain)
        );
        const combined = new Uint8Array(iv.byteLength + ct.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ct), iv.byteLength);
        return btoa(String.fromCharCode(...combined));
    } catch (err) {
        console.warn("[crypto] encrypt 失败，回退明文：", err);
        return plain;
    }
}

/** AES-GCM 解密; 失败时按明文返回 (兼容老版本的明文存量) . */
export async function decryptText(cipher: string): Promise<string> {
    try {
        const bin = Uint8Array.from(atob(cipher), (c) => c.charCodeAt(0));
        const iv = bin.slice(0, 12);
        const ct = bin.slice(12);
        const key = await deriveKey();
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
        return new TextDecoder().decode(pt);
    } catch (err) {
        console.warn("[crypto] decrypt 失败，按明文处理：", err);
        return cipher;
    }
}
