/**
 * 从 icons/icon.ico 生成 NSIS 安装向导需要的 BMP 图片：
 *   - icons/header.bmp   (150×57，安装向导页面右上角 banner)
 *   - icons/sidebar.bmp  (164×314，欢迎 / 完成页左侧大图)
 *
 * ICO 文件内含多个尺寸的 PNG 帧，取最大帧缩放到目标尺寸，居中裁切/白底填充，
 * 然后转为 24-bit BMP（NSIS MUI 只接受未压缩 BMP）。
 *
 * 依赖：pngjs（已在 devDependencies）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, "..", "src-tauri", "icons");
const ICO_PATH = path.join(ICONS_DIR, "icon.ico");

if (!fs.existsSync(ICO_PATH)) {
    console.error(`[nsis-img] 找不到 ${ICO_PATH}`);
    process.exit(1);
}

/* ── 解析 ICO，取最大帧（PNG 格式） ──────────────────────── */
function parseLargestPngFromIco(buf) {
    const count = buf.readUInt16LE(4);
    let best = null;
    for (let i = 0; i < count; i++) {
        const off = 6 + i * 16;
        const w = buf[off] || 256;
        const h = buf[off + 1] || 256;
        const size = buf.readUInt32LE(off + 8);
        const dataOff = buf.readUInt32LE(off + 12);
        if (!best || w * h > best.w * best.h) {
            best = { w, h, size, dataOff };
        }
    }
    if (!best) throw new Error("ICO 内无有效帧");
    const frame = buf.subarray(best.dataOff, best.dataOff + best.size);
    // 检查是不是 PNG 签名 (89 50 4E 47)
    if (frame[0] === 0x89 && frame[1] === 0x50) {
        return PNG.sync.read(frame);
    }
    // 否则是 BMP DIB — 简化处理：用 pngjs 解析不了，回退报错
    throw new Error("ICO 帧不是 PNG 格式，请提供包含 PNG 帧的 ICO");
}

const icoBuf = fs.readFileSync(ICO_PATH);
const src = parseLargestPngFromIco(icoBuf);
console.log(`[nsis-img] ICO 最大帧: ${src.width}×${src.height}`);

/* ── 缩放 + 居中填充到目标尺寸 ─────────────────────────── */
function resizeAndFit(src, tw, th, bgR = 255, bgG = 255, bgB = 255) {
    const out = new PNG({ width: tw, height: th });
    // 填充白底
    for (let i = 0; i < tw * th * 4; i += 4) {
        out.data[i] = bgR;
        out.data[i + 1] = bgG;
        out.data[i + 2] = bgB;
        out.data[i + 3] = 255;
    }
    // 等比缩放使 icon 居中（contain 模式）
    const scale = Math.min(tw / src.width, th / src.height) * 0.7;
    const sw = Math.round(src.width * scale);
    const sh = Math.round(src.height * scale);
    const ox = Math.round((tw - sw) / 2);
    const oy = Math.round((th - sh) / 2);
    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            const srcX = Math.min(Math.round(x / scale), src.width - 1);
            const srcY = Math.min(Math.round(y / scale), src.height - 1);
            const si = (srcY * src.width + srcX) * 4;
            const di = ((oy + y) * tw + (ox + x)) * 4;
            const alpha = src.data[si + 3] / 255;
            out.data[di] = Math.round(src.data[si] * alpha + bgR * (1 - alpha));
            out.data[di + 1] = Math.round(src.data[si + 1] * alpha + bgG * (1 - alpha));
            out.data[di + 2] = Math.round(src.data[si + 2] * alpha + bgB * (1 - alpha));
            out.data[di + 3] = 255;
        }
    }
    return out;
}

/* ── PNG → 24-bit BMP（无压缩，NSIS 需要） ─────────────── */
function pngToBmp24(png) {
    const w = png.width;
    const h = png.height;
    const rowBytes = w * 3;
    const padded = (rowBytes + 3) & ~3;
    const pixelSize = padded * h;
    const fileSize = 14 + 40 + pixelSize;
    const buf = Buffer.alloc(fileSize);

    // BMP File Header (14 bytes)
    buf.write("BM", 0);
    buf.writeUInt32LE(fileSize, 2);
    buf.writeUInt32LE(0, 6);
    buf.writeUInt32LE(54, 10);

    // DIB Header (BITMAPINFOHEADER, 40 bytes)
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(w, 18);
    buf.writeInt32LE(h, 22); // positive = bottom-up
    buf.writeUInt16LE(1, 26);  // planes
    buf.writeUInt16LE(24, 28); // bpp
    buf.writeUInt32LE(0, 30);  // compression (none)
    buf.writeUInt32LE(pixelSize, 34);
    buf.writeInt32LE(2835, 38); // h-res (72 dpi)
    buf.writeInt32LE(2835, 42); // v-res
    buf.writeUInt32LE(0, 46);
    buf.writeUInt32LE(0, 50);

    // Pixel data (bottom-up, BGR)
    for (let y = 0; y < h; y++) {
        const srcRow = y;
        const dstRow = h - 1 - y; // flip
        for (let x = 0; x < w; x++) {
            const si = (srcRow * w + x) * 4;
            const di = 54 + dstRow * padded + x * 3;
            buf[di] = png.data[si + 2];     // B
            buf[di + 1] = png.data[si + 1]; // G
            buf[di + 2] = png.data[si];     // R
        }
    }
    return buf;
}

// header: 150×57
const header = resizeAndFit(src, 150, 57);
const headerBmp = pngToBmp24(header);
fs.writeFileSync(path.join(ICONS_DIR, "header.bmp"), headerBmp);
console.log(`[nsis-img] header.bmp (150×57) → ${headerBmp.length} bytes`);

// sidebar: 164×314
const sidebar = resizeAndFit(src, 164, 314);
const sidebarBmp = pngToBmp24(sidebar);
fs.writeFileSync(path.join(ICONS_DIR, "sidebar.bmp"), sidebarBmp);
console.log(`[nsis-img] sidebar.bmp (164×314) → ${sidebarBmp.length} bytes`);

console.log("[nsis-img] 完成");
