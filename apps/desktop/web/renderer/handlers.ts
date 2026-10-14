/* eslint-disable no-console */
/**
 * Main-process channels the web build answers in the page, because they need
 * the page: settings (kept in `localStorage`), file pickers in place of
 * native open dialogs, downloads in place of "Save As", and links.
 *
 * Electron features with no web equivalent answer the way the app expects
 * when they are unavailable (no recent files, no plugins, signed out), and
 * window controls do nothing. Everything else goes to the worker.
 */
import { WEB_CHANNELS } from "../protocol";
import { emit, handleInPage, invokeWorker, listenInPage } from "./ipc";
import { storageKey } from "./channel";
import { handOffShow } from "./handoff";
import { webExampleShows } from "../../src/utilities/webBuild";

const SETTINGS_KEY = storageKey("settings");
/** Tells this build's other tabs (e.g. the settings tab) about a change. */
const settingsBroadcast =
    typeof BroadcastChannel === "function"
        ? new BroadcastChannel(SETTINGS_KEY)
        : null;

function loadSettings(): Map<string, unknown> {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) return new Map(Object.entries(JSON.parse(saved)));
    } catch {
        // Private windows and blocked storage: settings last for the page only.
    }
    return new Map();
}

const settings = loadSettings();

function setSettings(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) settings.set(key, value);
    try {
        localStorage.setItem(
            SETTINGS_KEY,
            JSON.stringify(Object.fromEntries(settings)),
        );
    } catch {
        // See loadSettings.
    }
    settingsBroadcast?.postMessage(values);
}

settingsBroadcast?.addEventListener(
    "message",
    (event: MessageEvent<Record<string, unknown>>) => {
        for (const [key, value] of Object.entries(event.data))
            settings.set(key, value);
        emit("settings:changed", event.data);
    },
);

let reloading = false;

/** Reloads into the show just opened or closed, as Electron reloads the window. */
export function reloadPage() {
    reloading = true;
    window.location.reload();
}

/** Whether the page is reloading itself, so leaving loses nothing. */
export const isReloadingOnPurpose = () => reloading;

/** Asks the person for one file, like the app's native open dialog. */
export function pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.addEventListener("change", () =>
            resolve(input.files?.[0] ?? null),
        );
        input.addEventListener("cancel", () => resolve(null));
        input.click();
    });
}

/** Saves `bytes` to the person's computer. */
function download(bytes: Uint8Array, name: string) {
    const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/octet-stream" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Saves the open show as a `.dots` file. Returns 200, or 0 with nothing open. */
export async function downloadShow(): Promise<number> {
    const show = await invokeWorker<{ name: string; bytes: Uint8Array } | null>(
        WEB_CHANNELS.exportShow,
    );
    if (!show) return 0;
    download(show.bytes, show.name);
    markDownloaded();
    return 200;
}

/** Opens `file` as the show and reloads into it, as `setActiveDb` does. */
export async function openShowFile(file: File): Promise<number> {
    const status = await invokeWorker<number>(
        WEB_CHANNELS.openShow,
        new Uint8Array(await file.arrayBuffer()),
        file.name,
    );
    if (status !== 200) {
        emit("load-file-response", status);
        return status;
    }
    markDownloaded();
    if (!(await keepAcrossReload(false))) return 500;
    reloadPage();
    return status;
}

let storedInBrowser = false;

/** Whether the worker keeps the show in browser storage, from its status. */
export function setStoredInBrowser(stored: boolean) {
    storedInBrowser = stored;
}

/**
 * Storage failed and the worker removed the stored show (see
 * `storeNewShow` in the worker): from now on the tab is memory-only, and
 * the shared flag describes a show that is gone.
 */
export function storageLost() {
    try {
        localStorage.removeItem(UNSAVED_KEY);
    } catch {
        // See markChanged.
    }
    storedInBrowser = false;
}

/**
 * Asks before creating or opening a show replaces one this browser kept
 * from an earlier visit but couldn't reopen.
 */
async function confirmReplaceKept(action: string): Promise<boolean> {
    const kept = await invokeWorker<string | null>(WEB_CHANNELS.keptShow);
    return (
        !kept ||
        window.confirm(
            `This browser still keeps "${kept}" from an earlier visit, but this version of OpenMarch couldn't reopen it. ${action} replaces it.\n\nContinue?`,
        )
    );
}

/**
 * Before reloading into a show just opened or created: a stored show comes
 * back from storage, and a memory-only one is handed off (see ./handoff.ts).
 * False, after telling the person, if it can't be.
 */
async function keepAcrossReload(changed: boolean): Promise<boolean> {
    if (storedInBrowser) return true;
    try {
        const show = await invokeWorker<{
            name: string;
            bytes: Uint8Array;
        } | null>(WEB_CHANNELS.exportShow);
        if (!show) return false;
        await handOffShow({ ...show, changed });
        return true;
    } catch (error) {
        console.error("Couldn't keep the show across the reload:", error);
        window.alert(
            "This browser window can't open a show, because it won't let OpenMarch keep anything even for a moment. Try a normal (not private) window.",
        );
        return false;
    }
}

/**
 * Whether the show changed since its last download, so its only copy of
 * those changes is in this browser. Kept across visits, like the show.
 */
const UNSAVED_KEY = storageKey("changedSinceDownload");
/**
 * In a memory-only tab the flag is the page's own: the shared key describes
 * the stored show, which belongs to the tab holding storage, and another tab
 * clearing it would drop that tab's warning.
 */
let changedInPage = false;
export function markChanged() {
    changedInPage = true;
    if (!storedInBrowser) return;
    try {
        localStorage.setItem(UNSAVED_KEY, "1");
    } catch {
        // Nothing to warn with; leaving still keeps the show in this browser.
    }
}
function markDownloaded() {
    changedInPage = false;
    if (!storedInBrowser) return;
    try {
        localStorage.removeItem(UNSAVED_KEY);
    } catch {
        // See markChanged.
    }
}
export function changedSinceDownload() {
    if (!storedInBrowser) return changedInPage;
    try {
        return localStorage.getItem(UNSAVED_KEY) === "1";
    } catch {
        return changedInPage;
    }
}

/**
 * Closing or replacing the show deletes the browser's copy, so asks first
 * when there are changes the person hasn't downloaded.
 */
function confirmDiscard(): boolean {
    return (
        !changedSinceDownload() ||
        window.confirm(
            "Your changes since the last download will be lost. Download the show first to keep them.\n\nContinue without downloading?",
        )
    );
}

async function closeShow() {
    if (!confirmDiscard()) {
        // "New file" in the editor asks for the new-show dialog after the
        // reload (see src/utilities/openNewShowDialog.ts); there is none.
        sessionStorage.removeItem("openmarch:openNewShowDialog");
        return 0;
    }
    await invokeWorker(WEB_CHANNELS.closeShow);
    markDownloaded();
    reloadPage();
    return 200;
}

/** Opens one of a preview build's example shows. 404 if `path` isn't one. */
async function openExampleShow(path: string): Promise<number> {
    const example = webExampleShows.find((show) => show.file === path);
    if (!example) return 404;
    if (!confirmDiscard()) return 0;
    if (!(await confirmReplaceKept("Opening a show"))) return 0;
    const response = await fetch(example.file);
    if (!response.ok) return response.status;
    const name = example.file.split("/").pop() ?? `${example.id}.dots`;
    return openShowFile(new File([await response.blob()], name));
}

// eslint-disable-next-line max-lines-per-function
export function registerPageHandlers({ isSettingsTab = false } = {}) {
    // Settings, theme and language, from electron/main/index.ts.
    handleInPage("settings:get", (key: string) =>
        // No analytics on the web, so there's nothing to ask about.
        key === "optOutAnalytics" ? true : settings.get(key),
    );
    listenInPage("settings:set", (values: Record<string, unknown>) =>
        setSettings(values),
    );
    handleInPage("get-theme", () => settings.get("theme") ?? "light");
    handleInPage("set-theme", (theme: string) => setSettings({ theme }));
    handleInPage("get-language", () => settings.get("language") ?? "en");
    handleInPage("set-language", (language: string) =>
        setSettings({ language }),
    );
    handleInPage("env:get", () => ({
        isCodegen: false,
        isCI: false,
        isPlaywrightSession: false,
    }));
    handleInPage("log:print", (level: string, ...rest: unknown[]) => {
        if (level === "error" || level === "warn")
            console[level]("[Renderer]", ...rest);
    });
    handleInPage("shell:openExternal", (url: string) => {
        const { protocol } = new URL(url);
        if (protocol !== "http:" && protocol !== "https:")
            throw new Error(`Unsafe URL protocol: ${protocol}`);
        window.open(url, "_blank", "noopener,noreferrer");
    });

    // Windows: the browser owns them. Settings open in their own tab, as
    // they open in their own window in Electron.
    for (const channel of ["window:minimize", "window:maximize", "menu:open"])
        listenInPage(channel, () => {});
    listenInPage("window:close", () => window.close());
    listenInPage("main-window:reload", () => reloadPage());
    handleInPage("settings:open", () => {
        const url = new URL(window.location.href);
        url.hash = "settings";
        window.open(url, "openmarch-settings");
    });

    // Electron-only features, answered as when they are unavailable.
    handleInPage("recent-files:get", () => []);
    for (const channel of [
        "recent-files:remove",
        "recent-files:clear",
        "recent-files:clear-missing",
    ])
        handleInPage(channel, () => undefined);
    // A preview build's start page opens its example shows by path, the
    // way a recent file opens (see ExampleShows.tsx).
    handleInPage("recent-files:open", (path: string) =>
        isSettingsTab ? 404 : openExampleShow(path),
    );
    handleInPage("plugins:list", () => []);
    handleInPage("newShow:getPending", () => false);
    handleInPage("newShow:clearPending", () => undefined);
    handleInPage("auth:get-state", () => ({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
    }));
    handleInPage("auth:get-access-token", () => ({ token: null }));

    if (isSettingsTab) return;

    // Files: there is one show, kept in this browser. Opening one is a file
    // picker, saving is a download, and the new-show wizard's file location
    // is just the show's name.
    handleInPage("database:load", async () => {
        if (!confirmDiscard()) return 0;
        if (!(await confirmReplaceKept("Opening a show"))) return 0;
        const file = await pickFile(".dots");
        return file ? openShowFile(file) : 0;
    });
    handleInPage("database:save", () => downloadShow());
    handleInPage("closeCurrentFile", () => closeShow());
    handleInPage("newShow:choosePreviousDotsFile", async () => {
        const file = await pickFile(".dots");
        if (!file) return null;
        return invokeWorker(
            WEB_CHANNELS.readPreviousDots,
            new Uint8Array(await file.arrayBuffer()),
        );
    });
    // The wizard needs a location to be valid; the worker names the show
    // from its title, so any will do, and the wizard doesn't show it.
    handleInPage("getDefaultDocumentsPath", () => "/");
    handleInPage("file:exists", () => false);
    handleInPage(
        "dialog:showSaveDialog",
        (options: { defaultPath?: string }) => ({
            canceled: false,
            filePath: options.defaultPath ?? "",
        }),
    );
    handleInPage(
        "newShow:finalizeDraft",
        async (targetPath: string, projectName: string) => {
            if (!(await confirmReplaceKept("Creating this show"))) return -1;
            const status = await invokeWorker<number>(
                "newShow:finalizeDraft",
                targetPath,
                projectName,
            );
            if (status !== 200) return status;
            // Never downloaded.
            markChanged();
            if (!(await keepAcrossReload(true))) return 500;
            reloadPage();
            return status;
        },
    );
    handleInPage("audio:insert", async () => {
        const file = await pickFile(
            "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm,.flac",
        );
        if (!file)
            return {
                success: false,
                error: {
                    message:
                        "insertAudioFile: Operation was cancelled or no audio file was provided",
                },
            };
        return invokeWorker(
            WEB_CHANNELS.insertAudio,
            await file.arrayBuffer(),
            file.name,
        );
    });
    handleInPage("database:repair", () => {
        throw new Error("Repairing a file isn't available on the web yet");
    });
}
