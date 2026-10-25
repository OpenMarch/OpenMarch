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
import { WEB_CHANNELS, type FlushResult } from "../protocol";
import { leaveDecision, leaveQuestion } from "./leave";
import { emit, handleInPage, invokeWorker, listenInPage } from "./ipc";
import { storageKey } from "./channel";
import { handOffShow } from "./handoff";
import { useWebLibraryStore } from "../../src/stores/WebLibraryStore";
import { requestOpenSettings } from "../../src/utilities/settingsSheet";
import {
    audioFileProblem,
    isAppleTouchDevice,
    pickerAccept,
    shareFile,
    showFileProblem,
} from "./filePicking";
import {
    browserVideoExportDeps,
    createVideoExportHandlers,
} from "./videoExport";

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
    // And this page, where the settings sheet changed them
    emit("settings:changed", values);
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

const appleTouch = isAppleTouchDevice();

/**
 * Asks the person for one file, like the app's native open dialog. On iOS
 * the picker can't filter by extension (see ./filePicking.ts), so callers
 * check the file.
 */
export function pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = pickerAccept(accept, appleTouch);
        // In the page, hidden: iOS Safari may not report the choice from a
        // detached input.
        input.style.display = "none";
        document.body.append(input);
        const done = (file: File | null) => {
            input.remove();
            resolve(file);
        };
        input.addEventListener("change", () => done(input.files?.[0] ?? null));
        input.addEventListener("cancel", () => done(null));
        input.click();
    });
}

/**
 * Asks for a `.dots` file. Where the picker couldn't filter (iOS), a file
 * that isn't a show is turned down with a message, as if none was picked.
 */
async function pickShowFile(): Promise<File | null> {
    const file = await pickFile(".dots");
    if (!file || !appleTouch) return file;
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const problem = showFileProblem(file.name, head);
    if (problem) {
        window.alert(problem);
        return null;
    }
    return file;
}

/** Whether to save through the share sheet: iPads and Android tablets. */
const shareFirst = appleTouch || /Android/i.test(navigator.userAgent);

/**
 * Saves `bytes` to the person's device: the share sheet on a tablet (Files,
 * Google Drive, email…), a download elsewhere or if sharing isn't possible.
 */
async function saveToDevice(
    bytes: Uint8Array,
    name: string,
): Promise<"shared" | "downloaded" | "cancelled"> {
    if (shareFirst) {
        const shared = await shareFile(
            new File([bytes as BlobPart], name, {
                type: "application/octet-stream",
            }),
        );
        if (shared !== "unavailable") return shared;
    }
    const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/octet-stream" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "downloaded";
}

export type BackupResult = "shared" | "downloaded" | "cancelled" | "nothing";

/**
 * Backs up a show: shares or downloads its `.dots` file and records when.
 * `id` is a show in the library; without one, the open show.
 */
export async function backUpShow(id?: string | null): Promise<BackupResult> {
    const target =
        id ??
        (storedInBrowser
            ? useWebLibraryStore.getState().library?.openId
            : null);
    const show = target
        ? await invokeWorker<{ name: string; bytes: Uint8Array }>(
              WEB_CHANNELS.exportStored,
              target,
          )
        : await invokeWorker<{ name: string; bytes: Uint8Array } | null>(
              WEB_CHANNELS.exportShow,
          );
    if (!show) return "nothing";
    const result = await saveToDevice(show.bytes, show.name);
    if (result === "cancelled") return result;
    if (!target || target === useWebLibraryStore.getState().library?.openId)
        markDownloaded();
    if (target) await invokeWorker(WEB_CHANNELS.recordBackup, target);
    return result;
}

/**
 * Opens `file` as the show and reloads into it, as `setActiveDb` does.
 * `force`: the person chose to replace the open show even though its latest
 * changes couldn't be stored.
 */
export async function openShowFile(file: File, force = false): Promise<number> {
    let status: number;
    try {
        status = await invokeWorker<number>(
            WEB_CHANNELS.openShow,
            new Uint8Array(await file.arrayBuffer()),
            file.name,
            force,
            // A file the person picked: that file is their backup.
            true,
        );
    } catch (error) {
        window.alert(
            `The file wasn't opened, so your show stays open: ${errorText(error)}`,
        );
        return 0;
    }
    if (status !== 200) {
        emit("load-file-response", status);
        return status;
    }
    markDownloaded();
    if (!(await keepAcrossReload(false, true))) return 500;
    reloadPage();
    return status;
}

let storedInBrowser = false;

/** Whether the worker keeps the show in browser storage, from its status. */
export function setStoredInBrowser(stored: boolean) {
    storedInBrowser = stored;
}

/**
 * Storage failed (see `storeNewShow` in the worker): from now on the tab
 * keeps its show in memory only.
 */
export function storageLost() {
    storedInBrowser = false;
}

/**
 * Before reloading into a show just opened or created: a stored show comes
 * back from storage, and a memory-only one is handed off (see ./handoff.ts).
 * False, after telling the person, if it can't be.
 */
async function keepAcrossReload(
    changed: boolean,
    backedUp: boolean,
): Promise<boolean> {
    if (storedInBrowser) return true;
    try {
        const show = await invokeWorker<{
            name: string;
            bytes: Uint8Array;
        } | null>(WEB_CHANNELS.exportShow);
        if (!show) return false;
        await handOffShow({ ...show, changed, backedUp });
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
 * Whether a memory-only tab's show changed since its last download, so its
 * only copy of those changes is this page. A stored show is saved as it
 * changes, so closing or reloading loses nothing.
 */
let changedInPage = false;
export function markChanged() {
    changedInPage = true;
}
function markDownloaded() {
    changedInPage = false;
}
/**
 * Whether leaving the page now could lose changes: a memory-only tab's
 * changes since the last download, or a stored show whose latest save is
 * pending or failed.
 */
export function changedSinceDownload() {
    if (!storedInBrowser) return changedInPage;
    const state = useWebLibraryStore.getState().saveStatus?.state;
    return state === "saving" || state === "error";
}

const errorText = (error: unknown) =>
    (error instanceof Error ? error.message : String(error)).replace(
        /^Error invoking remote method '[^']+': /,
        "",
    );

/**
 * Before the open show is closed or replaced: stores its latest changes,
 * and asks if that isn't possible (or, in a memory-only tab, if it has
 * changes since the last download). `go`: whether to go ahead; `force`:
 * the person chose to go on without the latest changes.
 */
async function confirmLeave(): Promise<{ go: boolean; force: boolean }> {
    let flush: FlushResult | null = null;
    try {
        flush = await invokeWorker<FlushResult>(WEB_CHANNELS.flush);
    } catch (error) {
        console.error("Couldn't store the show's latest changes:", error);
    }
    const question = leaveQuestion(
        leaveDecision({ storedInBrowser, changedInPage, flush }),
    );
    if (!question) return { go: true, force: false };
    const go = window.confirm(question);
    return { go, force: go };
}

async function closeShow() {
    const { go, force } = await confirmLeave();
    if (!go) {
        // "New file" in the editor asks for the new-show dialog after the
        // reload (see src/utilities/openNewShowDialog.ts); there is none.
        sessionStorage.removeItem("openmarch:openNewShowDialog");
        return 0;
    }
    try {
        await invokeWorker(WEB_CHANNELS.closeShow, force);
    } catch (error) {
        sessionStorage.removeItem("openmarch:openNewShowDialog");
        window.alert(`The show stays open: ${errorText(error)}`);
        return 0;
    }
    markDownloaded();
    reloadPage();
    return 200;
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
    // Settings open in a sheet over the app (components/WebSettingsSheet.tsx)
    // rather than in their own tab, as Electron opens a window: a second tab
    // is easy to lose, Safari may block opening it after the menu's await,
    // and a home-screen app on an iPad has no tabs. The settings tab still
    // works when visited at #settings.
    handleInPage("settings:open", () => requestOpenSettings());

    // Electron-only features, answered as when they are unavailable.
    handleInPage("recent-files:get", () => []);
    for (const channel of [
        "recent-files:remove",
        "recent-files:clear",
        "recent-files:clear-missing",
    ])
        handleInPage(channel, () => undefined);
    handleInPage("recent-files:open", () => 404);
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
        // The picker first: Safari opens it only right after the tap.
        const file = await pickShowFile();
        if (!file) return 0;
        const { go, force } = await confirmLeave();
        return go ? openShowFile(file, force) : 0;
    });
    // Saving is a backup: the show is already saved in the browser.
    handleInPage("database:save", async () => {
        const result = await backUpShow();
        return result === "shared" || result === "downloaded" ? 200 : 0;
    });
    handleInPage("web:backUp", (id?: string) => backUpShow(id));
    // Both reload into the show, as opening a file does.
    handleInPage(WEB_CHANNELS.openStored, async (id: string) => {
        const status = await invokeWorker<number>(WEB_CHANNELS.openStored, id);
        if (status === 200) reloadPage();
        return status;
    });
    handleInPage(
        WEB_CHANNELS.restoreVersion,
        async (id: string, versionId: string) => {
            const wasOpen = await invokeWorker<boolean>(
                WEB_CHANNELS.restoreVersion,
                id,
                versionId,
            );
            if (wasOpen) reloadPage();
            return wasOpen;
        },
    );
    handleInPage("closeCurrentFile", () => closeShow());
    handleInPage("newShow:choosePreviousDotsFile", async () => {
        const file = await pickShowFile();
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
            const status = await invokeWorker<number>(
                "newShow:finalizeDraft",
                targetPath,
                projectName,
            );
            if (status !== 200) return status;
            // Never downloaded.
            markChanged();
            // A new show: never backed up.
            if (!(await keepAcrossReload(true, false))) return 500;
            reloadPage();
            return status;
        },
    );
    handleInPage("audio:insert", async () => {
        let file = await pickFile(
            "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm,.flac",
        );
        if (file && appleTouch) {
            const problem = audioFileProblem(file.name, file.type);
            if (problem) {
                window.alert(problem);
                file = null;
            }
        }
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
    // Video export: the renderer encodes, the file goes to browser storage
    // and is saved from a tap (see ./videoExport.ts).
    const video = createVideoExportHandlers(
        browserVideoExportDeps({
            appleTouch,
            share: shareFile,
            showName: () => invokeWorker<string>("get-current-filename"),
        }),
    );
    handleInPage("export:videoStart", (extension: string) =>
        video.start(extension),
    );
    handleInPage(
        "export:videoChunk",
        (sessionId: string, data: Uint8Array, position: number) =>
            video.chunk(sessionId, data, position),
    );
    handleInPage("export:videoEnd", (sessionId: string, success: boolean) =>
        video.end(sessionId, success),
    );
    // "Open the exported file" in Electron; here, save the finished video
    handleInPage("open-export-directory", (path: string) =>
        video.deliver(path),
    );

    handleInPage("database:repair", () => {
        throw new Error("Repairing a file isn't available on the web yet");
    });
}
