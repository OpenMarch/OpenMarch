/**
 * The web build's entry, in place of Electron starting the app: start the
 * worker that stands in for the main process, which reopens the show from
 * before a reload, then load the app's own preload and renderer, in that
 * order, as Electron loads them.
 *
 * The settings tab (`#settings`, Electron's settings window) needs no show,
 * so it runs without a worker.
 */
import {
    registerPageHandlers,
    changedSinceDownload,
    markChanged,
} from "./handlers";
import { invokeWorker, ipcRenderer, startWorker } from "./ipc";
import { WEB_CHANNELS, WEB_EVENTS, type WorkerStatus } from "../protocol";

declare global {
    interface Window {
        /** Read by the preload as `process.platform`, for the shortcut keys. */
        __openmarchPlatform: string;
    }
}

function detectPlatform(): string {
    const nav = navigator as Navigator & {
        userAgentData?: { platform?: string };
    };
    const platform = (
        nav.userAgentData?.platform ||
        navigator.platform ||
        navigator.userAgent
    ).toLowerCase();
    if (platform.includes("mac")) return "darwin";
    if (platform.includes("win")) return "win32";
    return "linux";
}

/** A bar along the bottom of the page, for problems the person should know about. */
function showNotice(text: string) {
    const bar = document.createElement("div");
    bar.setAttribute("role", "status");
    bar.style.cssText =
        "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:2147483000;" +
        "max-width:min(640px,calc(100vw - 32px));padding:8px 36px 8px 14px;border-radius:6px;" +
        "background:#3b2a00;color:#ffe7a3;font:13px/1.4 system-ui,sans-serif;box-shadow:0 2px 8px #0005";
    bar.textContent = text;
    const close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute("aria-label", "Dismiss");
    close.style.cssText =
        "position:absolute;right:8px;top:4px;background:none;border:0;color:inherit;font-size:18px;cursor:pointer";
    close.onclick = () => bar.remove();
    bar.append(close);
    document.body.append(bar);
}

function warnAboutStorage(status: WorkerStatus) {
    if (status.storage === "opfs") {
        // Ask the browser not to clear the show when space runs low.
        void navigator.storage?.persist?.().catch(() => {});
        // Copy the latest edits now, in case the tab is about to close.
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden")
                void invokeWorker(WEB_CHANNELS.flush).catch(() => {});
        });
        return;
    }
    showNotice(
        status.storageProblem === "other-tab"
            ? "OpenMarch is open in another tab. In this tab, your show is only kept until you close or reload it. Download it to keep your changes."
            : "This browser can't keep your show between visits (for example, in a private window). Download it to keep your changes.",
    );
    // Shows in memory are lost with the page.
    window.addEventListener("beforeunload", (event) => {
        if (changedSinceDownload()) event.preventDefault();
    });
}

async function start() {
    window.__openmarchPlatform = detectPlatform();
    const isSettingsTab = window.location.hash === "#settings";
    registerPageHandlers({ isSettingsTab });

    if (!isSettingsTab) {
        ipcRenderer.on(WEB_EVENTS.changed, markChanged);
        try {
            warnAboutStorage(await startWorker());
        } catch (error) {
            document.body.textContent = `OpenMarch couldn't start in this browser: ${
                error instanceof Error ? error.message : String(error)
            }`;
            throw error;
        }
    }

    await import("@om-electron/preload/index");
    await import("@/main");
}

void start();
