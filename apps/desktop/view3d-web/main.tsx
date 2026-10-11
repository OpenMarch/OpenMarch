/**
 * TEMPORARY (see host.ts). Entry for the web preview of the 3D View: opens a
 * demo show (`?demo=<id>`, else the first), installs the stand-in
 * `window.view3d`, then mounts the 3D View window's own root.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "@fontsource/dm-mono";
import "@fontsource/dm-sans";
import { DEMOS } from "./demos";
import { host } from "./host";
import { openDemo } from "./open";

const rootElement = document.getElementById("root") as HTMLElement;

async function start() {
    window.view3d = host.api;
    const requested = new URLSearchParams(window.location.search).get("demo");
    const demo = DEMOS.find((d) => d.id === requested) ?? DEMOS[0];
    await openDemo(demo);

    // View3dRoot reads its theme and language from the query string.
    const url = new URL(window.location.href);
    url.searchParams.set("view", "3d");
    url.searchParams.set("theme", "dark");
    window.history.replaceState(null, "", url);

    const { default: View3dRoot } = await import("@/view3d/window/View3dRoot");
    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <View3dRoot />
        </React.StrictMode>,
    );
}

start().catch((error: unknown) => {
    console.error(error);
    rootElement.textContent = `The 3D View preview couldn't start: ${String(error)}`;
});
