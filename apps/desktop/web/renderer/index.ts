/**
 * The web build's entry, in place of Electron starting the app: start the
 * worker that stands in for the main process, which reopens the show from
 * before a reload, then load the app's own preload and renderer, in that
 * order, as Electron loads them.
 *
 * The settings window (`#settings`, as in Electron) needs no show,
 * so it runs without a worker. Nor does the 3D View window (`?view=3d`),
 * which reads the show through the editor tab that opened it (./view3d.ts).
 */
import {
    registerPageHandlers,
    changedSinceDownload,
    isReloadingOnPurpose,
    markChanged,
    setStoredInBrowser,
    storageLost,
} from "./handlers";
import {
    forgetHandedOffShow,
    openShowArgs,
    takeHandedOffShow,
} from "./handoff";
import { useWebLibraryStore } from "../../src/stores/WebLibraryStore";
import {
    HOME_SCREEN_PROMPT_KEY,
    isStandalone,
    shouldOfferHomeScreen,
} from "../../src/utilities/homeScreen";
import { isAppleTouchDevice } from "./filePicking";
import { startTouchGestureGuard } from "./touchGestures";
import tolgee from "../../src/global/singletons/Tolgee";
import { useWebWelcomeStore } from "../../src/stores/WebWelcomeStore";
import { storageKey } from "./channel";
import { invokeWorker, ipcRenderer, startWorker } from "./ipc";
import { installView3dApi, registerView3dHost } from "./view3d";
import { initVariants, mountVariantSwitch } from "../variants";
import { isLabBuild, keepLabWidgetOut, startLabBuild } from "./lab";
import {
    WEB_CHANNELS,
    WEB_EVENTS,
    type LibraryState,
    type SaveStatus,
    type WorkerStatus,
} from "../protocol";

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

/**
 * Electron shows no context menu of its own; a browser does, so right-drag
 * panning on the canvas would end on "Save image as". Listening on the window
 * in the bubble phase runs after the app's handlers, so its own context menus
 * (which bail out on an already-prevented event) still open. Text fields keep
 * the browser's menu for copy and paste.
 */
function suppressBrowserContextMenu() {
    window.addEventListener("contextmenu", (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.("input, textarea, [contenteditable='true']"))
            return;
        event.preventDefault();
    });
}

/**
 * A bar along the bottom of the page, for problems the person should know about. Call it once the
 * translations have started (`showTranslatedNotice`).
 */
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
    close.setAttribute("aria-label", tolgee.t("web.noticeDismiss"));
    close.style.cssText =
        "position:absolute;right:8px;top:4px;background:none;border:0;color:inherit;font-size:18px;cursor:pointer";
    close.onclick = () => bar.remove();
    bar.append(close);
    document.body.append(bar);
}

/**
 * A notice in the current language. These can come before the app (which
 * starts the translations) has loaded, so the translations are started here.
 */
function showTranslatedNotice(key: string) {
    void tolgee
        .run()
        .catch((error) =>
            console.error("Couldn't load the translations:", error),
        )
        .then(() => showNotice(tolgee.t(key)));
}

/**
 * What the page says when the app can't start: in the app's language, once the translations
 * load, or in English when they can't.
 */
async function startFailedText(error: string): Promise<string> {
    try {
        await tolgee.run();
        return tolgee.t("web.startFailed", { error });
    } catch (translationError) {
        console.error("Couldn't load the translations:", translationError);
        // i18n-ignore: the translations failed to load, so English is the only text there is
        return `OpenMarch couldn't start in this browser: ${error}`;
    }
}

/**
 * Keeps the page's view of the library and the save status current (the
 * show list and title bar read it), and asks the browser to keep the shows.
 */
function followLibrary(status: WorkerStatus) {
    const store = useWebLibraryStore.getState();
    store.set({
        storage:
            status.storage === "opfs"
                ? { kind: "opfs" }
                : {
                      kind: "memory",
                      problem: status.storageProblem ?? "unsupported",
                  },
    });
    ipcRenderer.on(WEB_EVENTS.library, (_event, library: LibraryState) =>
        useWebLibraryStore.getState().set({ library }),
    );
    ipcRenderer.on(WEB_EVENTS.saveStatus, (_event, saveStatus: SaveStatus) =>
        useWebLibraryStore.getState().set({ saveStatus }),
    );
    if (status.storage !== "opfs") return;
    void invokeWorker<LibraryState>(WEB_CHANNELS.library)
        .then((library) => useWebLibraryStore.getState().set({ library }))
        .catch((error) => console.error("Couldn't list the shows:", error));
    // Ask the browser not to clear the shows when space runs low. Safari
    // agrees for a Home Screen app.
    void (async () => {
        try {
            const persisted =
                (await navigator.storage?.persisted?.()) ||
                (await navigator.storage?.persist?.()) ||
                false;
            useWebLibraryStore.getState().set({ persisted });
        } catch {
            useWebLibraryStore.getState().set({ persisted: false });
        }
    })();
}

/**
 * Says once per browser session what the web editor is (or, the first time
 * in Safari on an iPad, how to add it to the Home Screen), and warns when
 * shows can't be kept. A memory-only tab asks before closing with changes
 * that haven't been downloaded.
 */
function warnAboutStorage(status: WorkerStatus) {
    window.addEventListener("beforeunload", (event) => {
        if (changedSinceDownload() && !isReloadingOnPurpose())
            event.preventDefault();
    });
    if (status.storage === "opfs") {
        const remindedKey = storageKey("reminded");
        const welcomeSeenKey = storageKey("welcomeSeen");
        try {
            // A lab test build opens straight into its show (./lab.ts).
            const offerHomeScreen =
                !isLabBuild &&
                shouldOfferHomeScreen({
                    appleTouch: isAppleTouchDevice(),
                    standalone: isStandalone(),
                    alreadyShown: !!localStorage.getItem(
                        HOME_SCREEN_PROMPT_KEY,
                    ),
                });
            if (offerHomeScreen) {
                localStorage.setItem(HOME_SCREEN_PROMPT_KEY, "1");
                sessionStorage.setItem(remindedKey, "1");
                useWebLibraryStore
                    .getState()
                    .set({ homeScreenPromptOpen: true });
            } else if (!isLabBuild && !localStorage.getItem(welcomeSeenKey)) {
                // Once per device: a Home Screen app starts a new session
                // on every launch. The "Web" badge reopens it any time.
                localStorage.setItem(welcomeSeenKey, "1");
                useWebWelcomeStore.getState().setOpen(true);
            }
        } catch {
            // Storage blocked: the browser keeps nothing anyway (see below).
        }
        // Copy the latest edits now, in case the tab is about to close.
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden")
                void invokeWorker(WEB_CHANNELS.flush).catch(() => {});
        });
        return;
    }
    showTranslatedNotice(
        status.storageProblem === "other-tab"
            ? "web.storageNotice.otherTab"
            : status.storageProblem === "newer-format"
              ? "web.storageNotice.newerFormat"
              : "web.storageNotice.notKept",
    );
}

/**
 * A memory-only tab, or one whose storage failed, hands its show off before
 * reloading into it (see ./handoff.ts); opens it again before the app asks
 * for it.
 */
async function reopenHandedOffShow() {
    let show;
    try {
        show = await takeHandedOffShow();
    } catch (error) {
        console.error(
            "Couldn't take back the show from before the reload:",
            error,
        );
        return;
    }
    if (!show) return;
    const status = await invokeWorker<number>(
        WEB_CHANNELS.openShow,
        ...openShowArgs(show),
    );
    if (status !== 200) {
        // Still kept in the browser: the next reload tries again
        console.error(`Couldn't reopen the show after the reload (${status})`);
        showTranslatedNotice("web.reopenFailed");
        return;
    }
    if (show.changed) markChanged();
    await forgetHandedOffShow().catch((error) =>
        console.error("Couldn't clear the reopened show:", error),
    );
}

async function start() {
    window.__openmarchPlatform = detectPlatform();
    suppressBrowserContextMenu();
    startTouchGestureGuard();
    if (new URLSearchParams(window.location.search).get("view") === "3d") {
        // Like Electron's 3D View window: its own API and no preload. A lab
        // build's feedback stays in the editor tab.
        keepLabWidgetOut();
        installView3dApi();
        await import("@/main");
        return;
    }
    const isSettingsTab = window.location.hash === "#settings";
    registerPageHandlers({ isSettingsTab });

    if (!isSettingsTab) {
        // A lab test comparing versions (../LAB.md); nothing otherwise
        initVariants();
        mountVariantSwitch();
        ipcRenderer.on(WEB_EVENTS.changed, markChanged);
        ipcRenderer.on(WEB_EVENTS.storageLost, () => {
            storageLost();
            showTranslatedNotice("web.storageNotice.lost");
        });
        try {
            const status = await startWorker();
            setStoredInBrowser(status.storage === "opfs");
            followLibrary(status);
            // Also with storage: one that failed hands its show off too.
            await reopenHandedOffShow();
            if (isLabBuild) await startLabBuild();
            warnAboutStorage(status);
            registerView3dHost();
        } catch (error) {
            document.body.textContent = await startFailedText(
                error instanceof Error ? error.message : String(error),
            );
            throw error;
        }
    }

    await import("@om-electron/preload/index");
    await import("@/main");
}

void start();
