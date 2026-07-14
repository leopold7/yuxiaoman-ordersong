import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import path from "node:path";

export default defineConfig({
    plugins: [solid()],
    base: "/order/",
    resolve: {
        alias: { "@": path.resolve(__dirname, "src") }
    },
    css: {
        modules: {
            localsConvention: "camelCase",
            generateScopedName: "[name]_[local]_[hash:base64:4]"
        }
    },
    server: {
        host: "127.0.0.1",
        port: 5173,
        strictPort: true,
        proxy: {
            "/order/bili-api": "http://127.0.0.1:17777",
            "/order/netease_api": "http://127.0.0.1:17777",
            "/order/qq-api": "http://127.0.0.1:17777",
            "/healthz": "http://127.0.0.1:17777",
            "/api": "http://127.0.0.1:17777"
        }
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        target: "es2020",
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes("node_modules/solid-js")) return "solid";
                    if (id.includes("node_modules/axios")) return "axios";
                    if (id.includes("node_modules/pako")) return "pako";
                    return undefined;
                }
            }
        }
    }
});
