import { render } from "solid-js/web";
import { App } from "./App";
import "./styles/global.css";

{
    const view = new URLSearchParams(window.location.search).get("view")?.toLowerCase();
    if (view === "stream" || view === "lyrics" || view === "list" || view === "audio") {
        document.documentElement.classList.add("overlay-view");
        document.body.classList.add("overlay-view");
    }
}

const root = document.getElementById("root");
if (!root) throw new Error("Root #root not found");

render(() => <App />, root);
