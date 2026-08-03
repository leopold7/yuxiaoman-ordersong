import { render } from "solid-js/web";
import { App } from "./App";
import { installLogCapture } from "./utils/logCapture";
import "./styles/global.css";

// 全局 console 拦截 (幂等): 采集运行日志供「日志插件」在线查看
installLogCapture();

{
    const view = new URLSearchParams(window.location.search).get("view")?.toLowerCase();
    if (view === "stream" || view === "lyrics" || view === "list" || view === "audio" || view === "widget") {
        document.documentElement.classList.add("overlay-view");
        document.body.classList.add("overlay-view");
    }
}

const root = document.getElementById("root");
if (!root) throw new Error("Root #root not found");

render(() => <App />, root);
