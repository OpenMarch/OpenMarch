/* eslint-disable no-console */
import { MENU_ACTION_CHANNEL } from "../../src/global/menuActions";
import {
    app,
    autoUpdater as nativeAutoUpdater,
    BrowserWindow,
    shell,
    ipcMain,
    Menu,
    dialog,
} from "electron";
import Store from "electron-store";
import * as fs from "fs";
import { release } from "node:os";
import {
    GPU_CRASHED_CHANNEL,
    GPU_PROCESS_GONE_CHANNEL,
    isGpuCrash,
    isWindows7,
} from "./gpu";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve, sep } from "node:path";
import * as DatabaseServices from "../database/database.services";
import { VIEW3D_AUTO_OPEN_SETTING } from "../../src/view3d/sync/protocol";
import { buildApplicationMenu } from "./application-menu";
import { onMainLanguageChange, setMainLanguage, t } from "./i18n";
import { textContextMenuTemplate } from "./textContextMenu";
import { openSettingsWindow } from "./settings-window";
import { TRAFFIC_LIGHT_POSITION } from "./traffic-lights";
import { handleWindowOpen } from "./window-open-policy";
import { PDFExportService } from "./services/export-service";
import { VideoExportService } from "./services/video-export-service";
import {
    addRecentFile,
    getRecentFiles,
    removeRecentFile,
    clearRecentFiles,
    updateRecentFileSvgPreview,
    clearMissingRecentFiles,
} from "./services/recent-files-service";
import type AudioFile from "../../src/global/classes/AudioFile";
import { init, captureException } from "@sentry/electron/main";

import {
    automaticUpdatesAreEnabled,
    createUpdateController,
    getAutoUpdater,
    type InstallAttempt,
    type UpdateController,
    updateUnsupportedReason,
} from "./update";
import {
    UPDATE_IPC_CHANNELS,
    type UpdateState,
} from "../../src/global/updates";
import { repairDatabase } from "../database/repair";
import {
    NEEDS_CONVERSION_STATUS,
    OPEN_STOPPED_STATUS,
} from "../database/convertOnOpenGate";
import {
    createConversionQuestion,
    PENDING_CONVERSION_CHANNEL,
    pendingConversionFor,
} from "./conversionQuestion";
import { electronConvertOnOpenDialogs } from "./convertOnOpenDialogs";
import {
    conversionWorkersStopped,
    defaultConvertWorkerPath,
    stopConversionWorkersOnQuit,
} from "./convertWorkerHost";
import {
    openOnce,
    openShowDatabase,
    openShowFile,
    resumeSqlProxyAfterReload,
    withOpenLock,
    type OpenShowDeps,
    type OpenShowOptions,
} from "./openShow";
import { choosePreviousDotsFile } from "./services/previous-dots-import-service";
import { closeView3dWindow, initView3dWindow } from "./view3dWindow";
import {
    initAuthBeforeReady,
    initAuthAfterReady,
    handleAuthSecondInstance,
} from "./auth";

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.js    > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//

let isQuitting = false;
const store = new Store();
// Native dialogs follow the saved app language from the start: on macOS a file can arrive
// (`open-file`) before the app is ready, and its dialogs would otherwise be in English
setMainLanguage(store.get("language"));

/** Active new-show draft file in userData/new-show-drafts (not in recent files until finalized). */
let currentNewShowDraftPath: string | null = null;

function getNewShowDraftsDirectory(): string {
    return join(app.getPath("userData"), "new-show-drafts");
}

function isNewShowDraftPath(filePath: string): boolean {
    if (!filePath) return false;
    const draftsDir = getNewShowDraftsDirectory();
    return resolve(filePath).startsWith(resolve(draftsDir) + sep);
}

// Check if running in Playwright codegen mode
export const isCodegen = !!process.env.PLAYWRIGHT_CODEGEN;
const isMacOS = process.platform === "darwin";

const enableSentry =
    process.env.NODE_ENV !== "development" && !store.get("optOutAnalytics");
console.log("Sentry error reporting enabled:", enableSentry);
init({
    dsn: "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712",
    enabled: enableSentry,
});

ipcMain.on("settings:set", (event, settings) => {
    for (const [key, value] of Object.entries(settings)) {
        store.set(key, value);
    }
    broadcastSettingsChanged(event.sender, settings);

    if (Object.prototype.hasOwnProperty.call(settings, "language")) {
        setMainLanguage(settings.language);
    }

    // Basic leaves Play On and Loop out of the Playback menu
    if (Object.prototype.hasOwnProperty.call(settings, "editorMode"))
        showApplicationMenu();

    if (Object.prototype.hasOwnProperty.call(settings, "automaticUpdates"))
        updates?.setAutomaticDownload(
            automaticUpdatesAreEnabled(settings.automaticUpdates),
        );
});

ipcMain.handle("settings:get", (_, key) => {
    return store.get(key);
});

ipcMain.handle("env:get", () => {
    return {
        isCodegen: isCodegen,
        isCI: !!process.env.CI,
        isPlaywrightSession: !!process.env.PLAYWRIGHT_SESSION,
    };
});

ipcMain.handle("shell:openExternal", async (_, url: string) => {
    try {
        const parsedUrl = new URL(url);
        // Only allow http and https protocols
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            throw new Error(`Unsafe URL protocol: ${parsedUrl.protocol}`);
        }
        await shell.openExternal(url);
    } catch (error) {
        console.error("Error opening external URL:", error);
        throw error;
    }
});

process.env.DIST_ELECTRON = join(__dirname, "../");
process.env.DIST = join(process.env.DIST_ELECTRON, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
    ? join(process.env.DIST_ELECTRON, "../public")
    : process.env.DIST;

// Disable GPU Acceleration for Windows 7
if (isWindows7(process.platform, release())) app.disableHardwareAcceleration();

// The field draws with WebGL (ADR 0005 D-3): use the GPU even where Chromium's
// blocklist turns it off. If the GPU then crashes, the field drops to its
// low-quality mode for the rest of the session.
app.commandLine.appendSwitch("ignore-gpu-blocklist");
let gpuCrashed = false;
app.on("child-process-gone", (_event, details) => {
    if (!isGpuCrash(details)) return;
    console.warn("GPU process gone:", details.reason, details.exitCode);
    gpuCrashed = true;
    for (const window of BrowserWindow.getAllWindows())
        window.webContents.send(GPU_PROCESS_GONE_CHANNEL);
});
ipcMain.handle(GPU_CRASHED_CHANNEL, () => gpuCrashed);

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName());

// Initialize auth protocol handler before app is ready
initAuthBeforeReady();

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let win: BrowserWindow | null = null;
// Here, you can also use other preload
const preload = join(__dirname, "../preload/index.js");
const view3dPreload = join(__dirname, "../preload/view3d.js");
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = join(process.env.DIST, "index.html");
// eslint-disable-next-line max-lines-per-function
async function createWindow(title?: string) {
    win = new BrowserWindow({
        title: title || "OpenMarch", // i18n-ignore: product name
        icon: join(process.env.VITE_PUBLIC, "favicon.ico"),
        // Fits a portrait tablet (iPad mini is 744 wide; Windows tablets in
        // portrait or split screen are ~768), where the Inspector folds away
        // (src/utilities/inspectorLayout.ts).
        minWidth: 768,
        minHeight: 600,
        autoHideMenuBar: true,
        // Show frame in codegen mode for easier interaction
        frame: isCodegen,
        trafficLightPosition: TRAFFIC_LIGHT_POSITION,
        titleBarStyle: "hidden",
        webPreferences: {
            preload,
            // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
            // Consider using contextBridge.exposeInMainWorld
            // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
            nodeIntegration: false, // is default value after Electron v5
            contextIsolation: true, // protect against prototype pollution
            spellcheck: true,
        },
    });
    app.commandLine.appendSwitch("enable-features", "AudioServiceOutOfProcess");
    // Touch screens (Windows tablets) need nothing here: Chromium's touch
    // events are on whenever a touch screen is present ("touch-events" is
    // "automatic" by default), and Electron keeps pinch-to-zoom of the page
    // off (visual zoom limits 1–1, see webContents.setVisualZoomLevelLimits),
    // so a pinch reaches the field and the timeline instead of zooming the
    // window. Leave both as they are.

    // Initialize auth IPC handlers before renderer navigation to avoid startup
    // races where the renderer invokes auth channels before handlers exist.
    initAuthAfterReady(() => win);

    win.webContents.session.webRequest.onHeadersReceived(
        (details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    "Content-Security-Policy": [
                        "script-src 'self' 'unsafe-inline' https://app.glitchtip.com https://us-assets.i.posthog.com; worker-src 'self' data: blob:;",
                    ],
                },
            });
        },
    );

    if (url) {
        // electron-vite-vue#298
        void win.loadURL(url);
        win.on("ready-to-show", () => {
            // Always open DevTools in codegen mode for debugging
            if (win && (isCodegen || process.env.NODE_ENV === "development")) {
                win.webContents.openDevTools();
            }
        });
    } else {
        void win.loadFile(indexHtml);
    }

    // Test actively push message to the Electron-Renderer
    win.webContents.on("did-finish-load", () => {
        win?.maximize();
        win?.webContents.send(
            "main-process-message",
            new Date().toLocaleString(),
        );
    });

    win.webContents.on(
        "did-start-navigation",
        (_event, _url, _isInPlace, isMainFrame) => {
            if (!isMainFrame || !currentNewShowDraftPath) return;
            void withOpenLock(discardNewShowDraft).catch((error) => {
                console.error(
                    "Error discarding new show draft on navigation:",
                    error,
                );
            });
        },
    );

    win.on("close", async (event: Electron.Event) => {
        if (isQuitting) return;

        event.preventDefault();
        win!.hide(); // use non-null assertion now that we're inside the if-block
        closeView3dWindow();

        try {
            await closeCurrentFile(true);
        } catch (e) {
            console.error("Error closing file:", e);
        }

        isQuitting = true;
        win!.destroy();
        win = null;
        app.quit();
    });

    // Make all links open with the browser, not with the application
    win.webContents.setWindowOpenHandler(({ url }) =>
        handleWindowOpen(url, (u) => void shell.openExternal(u)),
    );

    // Context menu with spellcheck suggestions and basic edit actions, built per popup so its
    // labels follow the app language
    win.webContents.on("context-menu", (_event, params) => {
        const template = textContextMenuTemplate(params, (suggestion) =>
            win?.webContents.replaceMisspelling(suggestion),
        );
        if (!template.length) return;

        const menu = Menu.buildFromTemplate(template);
        menu.popup({ window: win! });
    });
}

function resolveStartupDatabasePath(): string {
    let pathToOpen = store.get("databasePath") as string;
    const pathFromArgs = process.argv.find((arg) => arg.endsWith(".dots"));
    if (pathFromArgs) pathToOpen = pathFromArgs;
    console.log("Path to Open:", pathToOpen);
    if (pathToOpen && isNewShowDraftPath(pathToOpen)) {
        if (fs.existsSync(pathToOpen)) fs.unlinkSync(pathToOpen);
        store.delete("databasePath");
        return "";
    }
    return pathToOpen || "";
}

function getPlaywrightDefaultDocumentsPath(): string | undefined {
    if (
        process.env.PLAYWRIGHT_SESSION &&
        process.env.PLAYWRIGHT_NEW_FILE_PATH
    ) {
        return dirname(process.env.PLAYWRIGHT_NEW_FILE_PATH);
    }
    return undefined;
}

async function showSaveDialogHandler(options: Electron.SaveDialogOptions) {
    if (!win) return { canceled: true, filePath: "" };
    const playwrightPath = getPlaywrightDefaultDocumentsPath();
    if (playwrightPath && process.env.PLAYWRIGHT_NEW_FILE_PATH) {
        return {
            canceled: false,
            filePath: process.env.PLAYWRIGHT_NEW_FILE_PATH,
        };
    }
    return await dialog.showSaveDialog(win, options);
}

/**
 * Lets the renderer explain a refused file (for example one from a newer release). Skips an open
 * that a main-process dialog already explained (convert on open), and a page-era file waiting for
 * the person to agree to convert it (the renderer asks), so no second dialog shows.
 */
/**
 * A refused open that closed the show that was open. The window reloads to the launch page,
 * which takes this with `load-file:takeRefusal` and explains it there.
 */
let refusalAfterReload: number | null = null;

function sendLoadFileResponse(resCode: number) {
    if (resCode === OPEN_STOPPED_STATUS || resCode === NEEDS_CONVERSION_STATUS)
        return;
    // The reloaded launch page explains it (`load-file:takeRefusal`).
    if (resCode === refusalAfterReload) return;
    win?.webContents.send("load-file-response", resCode);
}

/**
 * The page-era file waiting for the person to agree to convert it. Asked when an open returns
 * `NEEDS_CONVERSION_STATUS`; the renderer's `ConvertShowDialog` reads it when the window loads
 * and hears of each change, shows it over the show that is open (or the launch page), and
 * answers with `conversion:confirm` or `conversion:cancel`. Any other open, a new show or a
 * close forgets it.
 */
const conversionQuestion = createConversionQuestion((pending) => {
    if (win && !win.isDestroyed())
        win.webContents.send(PENDING_CONVERSION_CHANNEL, pending);
});

/** Closes the show that is open, then converts and opens the pending file: the person agreed. */
async function confirmPendingConversion(): Promise<number> {
    const pending = conversionQuestion.take();
    if (!pending) return -1;
    const resCode = await setActiveDb(pending.filePath, false, {
        conversionConfirmed: true,
        conversionBackupPath: pending.backupPath,
    });
    if (resCode === 200) addRecentFile(pending.filePath);
    sendLoadFileResponse(resCode);
    return resCode;
}

async function openRecentFile(filePath: string) {
    // setActiveDb saves the path once the file opens; a page-era file only asks first, and the
    // show that is open stays the one to reopen.
    addRecentFile(filePath);

    const resCode = await setActiveDb(filePath);

    sendLoadFileResponse(resCode);

    return resCode;
}

function initDatabaseIpcHandlers() {
    ipcMain.handle("database:isReady", DatabaseServices.databaseIsReady);
    ipcMain.handle("database:getPath", () => DatabaseServices.getDbPath());
    ipcMain.handle("database:save", async () => saveFile());
    ipcMain.handle("database:load", async () => loadDatabaseFile());
    ipcMain.handle("database:create", async () => newFile());
    ipcMain.handle("database:createAtPath", async (_, filePath: string) =>
        createFileAtPath(filePath),
    );
    ipcMain.handle("dialog:showSaveDialog", async (_, options) =>
        showSaveDialogHandler(options),
    );
    ipcMain.handle("getDefaultDocumentsPath", () => {
        return getPlaywrightDefaultDocumentsPath() ?? app.getPath("documents");
    });
    ipcMain.handle("file:exists", (_, filePath: string) => {
        if (!filePath) return false;
        const pathToCheck = filePath.endsWith(".dots")
            ? filePath
            : `${filePath}.dots`;
        return fs.existsSync(pathToCheck);
    });
    ipcMain.handle("newShow:getPending", () => {
        return store.get("pendingNewShowDialog") === true;
    });
    ipcMain.handle("newShow:clearPending", () => {
        store.set("pendingNewShowDialog", false);
    });
    ipcMain.handle("newShow:createDraft", async () => createNewShowDraft());
    ipcMain.handle(
        "newShow:finalizeDraft",
        async (_, targetPath: string, projectName: string) =>
            finalizeNewShowDraft(targetPath, projectName),
    );
    // Changes the active file, so it waits for any open (P9.8: a conversion no longer blocks).
    ipcMain.handle("newShow:discardDraft", async () =>
        withOpenLock(discardNewShowDraft),
    );
    ipcMain.handle("newShow:getDraftPath", () => currentNewShowDraftPath);
    ipcMain.handle("newShow:choosePreviousDotsFile", async () =>
        choosePreviousDotsFile(win, showFileDialogFilters()),
    );
    ipcMain.handle("database:repair", async (_, dbPath: string) => {
        try {
            DatabaseServices.closePersistentConnection();
            const newPath = await repairDatabase(dbPath);
            const resCode = await setActiveDb(newPath);
            if (resCode === 200) return newPath;
            // A main-process dialog already explained why it didn't open, or the renderer asks
            // the person before converting the repaired copy.
            if (
                resCode === OPEN_STOPPED_STATUS ||
                resCode === NEEDS_CONVERSION_STATUS
            )
                return null;
            throw new Error(
                t("settings.repairDotsFile.reopenFailed", {
                    path: newPath,
                    status: resCode,
                }),
            );
        } catch (error) {
            console.error("Error repairing database:", error);
            throw error;
        }
    });
    ipcMain.handle("audio:insert", async () => insertAudioFile());
    ipcMain.handle("conversion:getPending", () => conversionQuestion.current());
    ipcMain.handle("load-file:takeRefusal", () => {
        const resCode = refusalAfterReload;
        refusalAfterReload = null;
        return resCode;
    });
    ipcMain.handle("conversion:confirm", async () =>
        confirmPendingConversion(),
    );
    // The show that is open (if any) was never touched, so the person is back where they were.
    ipcMain.handle("conversion:cancel", () => conversionQuestion.forget());
}

function initRecentFilesIpcHandlers() {
    ipcMain.handle("recent-files:get", getRecentFiles);
    ipcMain.handle("recent-files:remove", (_, filePath) =>
        removeRecentFile(filePath),
    );
    ipcMain.handle("recent-files:clear", clearRecentFiles);
    ipcMain.handle("recent-files:clear-missing", clearMissingRecentFiles);
    ipcMain.handle("recent-files:open", async (_, filePath) =>
        openRecentFile(filePath),
    );
}

function initIpcHandlers() {
    initDatabaseIpcHandlers();
    initRecentFilesIpcHandlers();
}

void app.whenReady().then(async () => {
    app.setName("OpenMarch");
    console.log("NODE:", process.versions.node);

    if (isCodegen) {
        console.log("🎭 Running in Playwright Codegen mode");
    } else {
        console.log("Not running in codegen mode");
    }

    // The menu and native dialogs follow the app language the renderer saves
    setMainLanguage(store.get("language"));
    showApplicationMenu();
    onMainLanguageChange(showApplicationMenu);

    const pathToOpen = resolveStartupDatabasePath();
    if (pathToOpen.length > 0) await setActiveDb(pathToOpen);
    DatabaseServices.initHandlers();

    console.log("db_path: " + DatabaseServices.getDbPath());

    initIpcHandlers();
    initGetters();
    initView3dWindow({
        preload: view3dPreload,
        devServerUrl: url,
        indexHtml,
        icon: join(process.env.VITE_PUBLIC, "favicon.ico"),
        frame: isCodegen,
        getTheme: () => store.get("theme", "light") as string,
        getLanguage: () => store.get("language", "en") as string,
        getEditorWindow: () => win,
        // A Playwright session never asks, so the question doesn't sit over every test
        getAutoOpen: () =>
            process.env.PLAYWRIGHT_SESSION
                ? null
                : store.get(VIEW3D_AUTO_OPEN_SETTING),
        // Every other window hears it, so an open Settings window follows the answer
        setAutoOpen: (autoOpen, sender) => {
            store.set(VIEW3D_AUTO_OPEN_SETTING, autoOpen);
            broadcastSettingsChanged(sender, {
                [VIEW3D_AUTO_OPEN_SETTING]: autoOpen,
            });
        },
    });

    // i18n-ignore: the product name and a file path, the same in every language
    await createWindow("OpenMarch - " + store.get("databasePath"));

    updates = startUpdates();
});

/** Set once the app is ready (fork #404): the updater the title bar and Settings drive */
let updates: UpdateController | null = null;
const INSTALL_ATTEMPT_KEY = "updateInstallAttempt";

/** Set once the app starts quitting, for whatever reason */
let appIsQuitting = false;
app.on("before-quit", () => {
    appIsQuitting = true;
});
/** Linux: where the update put the new AppImage, if it named it differently */
let installedAppImage: string | undefined;

function startUpdates(): UpdateController {
    getAutoUpdater().on("appimage-filename-updated", (path: string) => {
        installedAppImage = path;
    });
    const broadcast = (state: UpdateState) => {
        for (const window of BrowserWindow.getAllWindows())
            window.webContents.send(UPDATE_IPC_CHANNELS.state, state);
    };
    const controller = createUpdateController({
        updater: getAutoUpdater(),
        currentVersion: app.getVersion(),
        unsupportedReason: updateUnsupportedReason({
            isPackaged: app.isPackaged,
            platform: process.platform,
            env: process.env,
            hasFeed:
                app.isPackaged &&
                fs.existsSync(join(process.resourcesPath, "app-update.yml")),
        }),
        needsMoveToApplications: () => isMacOS && !app.isInApplicationsFolder(),
        automaticDownload: automaticUpdatesAreEnabled(
            store.get("automaticUpdates"),
        ),
        onChange: broadcast,
        takeInstallAttempt: () => {
            const attempt = store.get(INSTALL_ATTEMPT_KEY) as
                | InstallAttempt
                | undefined;
            store.delete(INSTALL_ATTEMPT_KEY);
            return attempt ?? null;
        },
        saveInstallAttempt: (attempt) =>
            store.set(INSTALL_ATTEMPT_KEY, attempt),
        prepareToQuit: closeShowForRestart,
        nativeStaging: isMacOS ? nativeAutoUpdater : undefined,
        relaunchAfterInstall:
            process.platform === "linux"
                ? () =>
                      app.relaunch({
                          execPath: installedAppImage ?? process.env.APPIMAGE,
                          args: [],
                      })
                : undefined,
        relaunch: () => {
            // Quitting already, just slowly (a conversion worker stopping): the installer
            // reopens the app, so don't open a second one
            if (appIsQuitting) return;
            app.relaunch();
            app.exit(0);
        },
    });
    // The window asked before the updater existed: tell it now
    broadcast(controller.getState());
    controller.start();
    return controller;
}

/**
 * Before a restart for an update or a move to Applications: close the show the way quitting
 * does, but keep it as the file to open on the next launch. A new show that was never saved is
 * discarded, as on quit.
 */
async function closeShowForRestart() {
    // Out of sight first, as quitting does: nothing typed now could be saved
    win?.hide();
    const reopen = currentNewShowDraftPath ? "" : DatabaseServices.getDbPath();
    try {
        await closeCurrentFile(true);
    } catch (error) {
        console.error("Error closing file before restarting:", error);
    }
    if (reopen) store.set("databasePath", reopen);
    // The windows close without asking again
    isQuitting = true;
}

ipcMain.handle(UPDATE_IPC_CHANNELS.getState, () => updates?.getState() ?? null);
// The renderer asks only when the person does (Check for updates)
ipcMain.handle(
    UPDATE_IPC_CHANNELS.check,
    () => updates?.check({ manual: true }) ?? null,
);
ipcMain.handle(UPDATE_IPC_CHANNELS.download, () => updates?.download());
ipcMain.handle(UPDATE_IPC_CHANNELS.install, () => updates?.install());
ipcMain.handle(UPDATE_IPC_CHANNELS.moveToApplications, async () => {
    if (!isMacOS || app.isInApplicationsFolder()) return false;
    await closeShowForRestart();
    let moved = false;
    try {
        // Quits and opens the moved copy when it works
        moved = app.moveToApplicationsFolder();
    } catch (error) {
        console.error("Unable to move OpenMarch to Applications:", error);
    }
    // The show is closed: open this copy again with it
    if (!moved) {
        app.relaunch();
        app.exit(0);
    }
    return moved;
});

function initGetters() {
    // Exports
    ipcMain.handle("export:pdf", async (_, params) => {
        return await PDFExportService.export(
            params.sheets,
            params.organizeBySection,
            params.quarterPages,
        );
    });

    // Create Export Directory
    ipcMain.handle(
        "export:createExportDirectory",
        async (_, defaultName: string) => {
            return await PDFExportService.createExportDirectory(defaultName);
        },
    );

    // Export SVG pages to PDF
    ipcMain.handle("export:generateDocForMarcher", async (_, args) => {
        return await PDFExportService.generateDocForMarcher(args);
    });

    // Video export (streamed file writing)
    ipcMain.handle("export:videoStart", async (_, fileExtension: string) => {
        return await VideoExportService.start(fileExtension);
    });
    ipcMain.handle(
        "export:videoChunk",
        async (_, sessionId: string, data: Uint8Array, position: number) => {
            return await VideoExportService.writeChunk(
                sessionId,
                data,
                position,
            );
        },
    );
    ipcMain.handle(
        "export:videoEnd",
        async (_, sessionId: string, success: boolean) => {
            return await VideoExportService.end(sessionId, success);
        },
    );

    // Get current filename
    ipcMain.handle("get-current-filename", async () => {
        return PDFExportService.getCurrentFilename();
    });

    // Opens the export directory
    ipcMain.handle("open-export-directory", async (_, exportDir: string) => {
        return PDFExportService.openExportDirectory(exportDir);
    });

    // Export Full Charts
    // ipcMain.handle(

    //    "send:exportCanvas",
    //   async (_, dataUrl: string) =>
    //       await exportCanvas(dataUrl)
    //);
}

// A conversion running in its worker (P9.8) is stopped, and so rolled back, before the app quits.
stopConversionWorkersOnQuit(app);

app.on("window-all-closed", async () => {
    win = null;
    if (process.platform !== "darwin") app.quit();
});

app.on("open-file", async (event, path) => {
    event.preventDefault();
    const resCode = await setActiveDb(path);
    sendLoadFileResponse(resCode);
});

// Handle instances where the app is already running and a file is opened
// const gotTheLock = app.requestSingleInstanceLock();
// if (!gotTheLock) {
//   app.quit();
// } else {
//   app.on('second-instance', (event, argv) => {
//     // Handle the file path passed when a second instance is opened
//     const filePath = argv.find(arg => !arg.startsWith('--') && path.extname(arg));
//     if (mainWindow && filePath) {
//       mainWindow.webContents.send('open-file', filePath);
//     }
//   });
// }

app.on("second-instance", (_event, commandLine) => {
    // First check if this is an auth callback (Windows/Linux)
    const isAuthCallback = handleAuthSecondInstance(commandLine, () => win);

    // If not an auth callback, just focus the window
    if (!isAuthCallback && win) {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});

// Custom title bar buttons

ipcMain.on("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on("window:maximize", (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (sender?.isMaximized()) {
        sender.unmaximize();
    } else {
        sender?.maximize();
    }
});

ipcMain.on("window:close", (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (sender && sender === win) void closeCurrentFile();
    sender?.close();
});

ipcMain.handle("settings:open", () => {
    openSettingsWindow({
        store,
        parent: win,
        preload,
        frame: isCodegen,
        load: (settings) =>
            url
                ? void settings.loadURL(`${url}#settings`)
                : void settings.loadFile(indexHtml, { hash: "settings" }),
    });
});

ipcMain.on("main-window:reload", () => win?.reload());

/** Tells every window except the one that made the change. */
function broadcastSettingsChanged(
    sender: Electron.WebContents,
    change: Record<string, unknown>,
) {
    for (const other of BrowserWindow.getAllWindows()) {
        if (other.webContents !== sender)
            other.webContents.send("settings:changed", change);
    }
}

/** The application menu, in the current app language. */
let applicationMenu: Menu | null = null;

function showApplicationMenu() {
    applicationMenu = buildApplicationMenu({
        basic: store.get("editorMode") === "basic",
    });
    Menu.setApplicationMenu(applicationMenu);
}

ipcMain.on(`menu:open`, () => {
    if (!isMacOS) {
        applicationMenu?.popup();
    }
});

// Theme stores

ipcMain.handle("get-theme", () => {
    return store.get("theme", "light");
});

ipcMain.handle("set-theme", (event, theme) => {
    store.set("theme", theme);
    broadcastSettingsChanged(event.sender, { theme });
});

// Language stores

ipcMain.handle("get-language", () => {
    return store.get("language", "en");
});

ipcMain.handle("set-language", (event, language) => {
    store.set("language", language);
    broadcastSettingsChanged(event.sender, { language });
    setMainLanguage(language);
});

// file management

ipcMain.handle("closeCurrentFile", () => {
    void closeCurrentFile();
});

// Log handler - allows renderer to send logs to main process
ipcMain.handle(
    "log:print",
    (
        _,
        level: "log" | "info" | "warn" | "error",
        message: string,
        ...args: any[]
    ) => {
        const timestamp = new Date().toISOString();
        const prefix = `[Renderer ${timestamp}]`;

        switch (level) {
            case "log":
                console.log(prefix, message, ...args);
                break;
            case "info":
                console.info(prefix, message, ...args);
                break;
            case "warn":
                console.warn(prefix, message, ...args);
                break;
            case "error":
                console.error(prefix, message, ...args);
                break;
            default:
                console.log(prefix, message, ...args);
        }
    },
);

// Note: second-instance is already handled above with auth callback support

app.on("activate", () => {
    const allWindows = BrowserWindow.getAllWindows();
    if (win && !win.isDestroyed()) {
        win.focus();
    } else if (allWindows.length) {
        allWindows[0].focus();
    } else {
        void createWindow();
    }
});

/************************************** FILE SYSTEM INTERACTIONS **************************************/
/**
 * Creates a new database file at the specified path.
 *
 * @param filePath The path where the file should be created
 * @returns 200 for success, -1 for failure
 */
async function createFileAtPath(filePath: string) {
    console.log("createFileAtPath:", filePath);

    if (!filePath) return -1;

    if (!filePath.endsWith(".dots")) {
        filePath = `${filePath}.dots`;
    }

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    await setActiveDb(filePath, true);

    addRecentFile(filePath);

    return 200;
}

/**
 * Opens a new .dots file at path without reloading the window (for new-show wizard draft).
 */
async function openDatabaseAtPathWithoutReload(
    filePath: string,
    isNewFile: boolean,
): Promise<number> {
    if (!filePath || !win) return -1;

    if (!filePath.endsWith(".dots")) {
        filePath = `${filePath}.dots`;
    }

    if (isNewFile && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    try {
        // Shares the open path (and its lock) with setActiveDb, so both ways of
        // making a new file give the same result.
        const result = await openShowFile(filePath, isNewFile, openShowDeps());
        result.db?.close();
        // A draft is a new file: it never suspends the renderer's SQL.
        if (result.sqlSuspension !== undefined)
            DatabaseServices.resumeSqlProxy(result.sqlSuspension);
        if (result.status !== 200) {
            return result.status === OPEN_STOPPED_STATUS ||
                result.status === NEEDS_CONVERSION_STATUS
                ? result.status
                : -1;
        }

        store.set("databasePath", filePath);
        win?.setTitle("OpenMarch - " + filePath); // i18n-ignore: product name and path
        conversionQuestion.forget();
        return 200;
    } catch (error) {
        captureException(error);
        store.delete("databasePath");
        DatabaseServices.setDbPath("", false);
        console.error("Error opening database without reload:", error);
        return -1;
    }
}

/**
 * Creates a draft .dots under userData/new-show-drafts for the new-show wizard.
 */
export async function createNewShowDraft(): Promise<{ path: string } | number> {
    const draftsDir = getNewShowDraftsDirectory();
    if (!fs.existsSync(draftsDir)) {
        fs.mkdirSync(draftsDir, { recursive: true });
    }

    const draftPath = join(draftsDir, `${randomUUID()}.dots`);
    const result = await openDatabaseAtPathWithoutReload(draftPath, true);
    if (result !== 200) {
        return -1;
    }

    currentNewShowDraftPath = draftPath;
    return { path: draftPath };
}

const sanitizeNewShowFilename = (name: string): string =>
    name.trim().replace(/[<>:"/\\|?*]/g, "_");

function resolveFinalizeTargetPath(
    projectName: string,
    targetPath: string,
): string {
    const trimmed = targetPath.trim();
    const normalizedPath = trimmed.replace(/\\/g, "/");
    const pathParts = normalizedPath.split("/");
    const sanitized = sanitizeNewShowFilename(projectName) || "Untitled";
    const lastPart = pathParts[pathParts.length - 1] || "";

    if (!lastPart.endsWith(".dots")) {
        pathParts[pathParts.length - 1] = `${sanitized}.dots`;
        return pathParts.join("/");
    }

    if (!lastPart.startsWith(sanitizeNewShowFilename(projectName))) {
        pathParts[pathParts.length - 1] = `${sanitized}.dots`;
        return pathParts.join("/");
    }

    return trimmed;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function moveFileWithRetry(source: string, dest: string): Promise<void> {
    const resolvedSource = resolve(source);
    const resolvedDest = resolve(dest);
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            fs.renameSync(resolvedSource, resolvedDest);
            return;
        } catch (err: unknown) {
            const code =
                err && typeof err === "object" && "code" in err
                    ? (err as NodeJS.ErrnoException).code
                    : undefined;

            if (code === "EXDEV") {
                fs.copyFileSync(resolvedSource, resolvedDest);
                fs.unlinkSync(resolvedSource);
                return;
            }

            if (code === "EBUSY" && attempt < maxAttempts - 1) {
                await sleep(25 * (attempt + 1));
                continue;
            }

            throw err;
        }
    }
}

async function unlinkFileWithRetry(filePath: string): Promise<void> {
    const resolvedPath = resolve(filePath);
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            fs.unlinkSync(resolvedPath);
            return;
        } catch (err: unknown) {
            const code =
                err && typeof err === "object" && "code" in err
                    ? (err as NodeJS.ErrnoException).code
                    : undefined;

            if (code === "EBUSY" && attempt < maxAttempts - 1) {
                await sleep(25 * (attempt + 1));
                continue;
            }

            throw err;
        }
    }
}

/**
 * Moves the draft file to the user's chosen path and reloads into the editor.
 */
export async function finalizeNewShowDraft(
    targetPath: string,
    projectName?: string,
): Promise<number> {
    if (!currentNewShowDraftPath || !win) return -1;

    const draftPath = resolve(currentNewShowDraftPath);
    const finalPath = resolve(
        projectName
            ? resolveFinalizeTargetPath(projectName, targetPath)
            : targetPath.endsWith(".dots")
              ? targetPath
              : `${targetPath}.dots`,
    );

    const finalDir = dirname(finalPath);
    if (!fs.existsSync(finalDir)) {
        fs.mkdirSync(finalDir, { recursive: true });
    }

    DatabaseServices.closePersistentConnection();

    let backupPath: string | null = null;
    if (fs.existsSync(finalPath)) {
        backupPath = join(
            finalDir,
            `.${basename(finalPath)}.bak-${randomUUID()}`,
        );
        try {
            await moveFileWithRetry(finalPath, backupPath);
        } catch (error) {
            console.error(
                "Failed to backup existing show before finalize:",
                error,
            );
            captureException(error);
            return -1;
        }
    }

    try {
        await moveFileWithRetry(draftPath, finalPath);
    } catch (error) {
        console.error("Failed to finalize new show draft:", error);
        if (backupPath && fs.existsSync(backupPath)) {
            try {
                await moveFileWithRetry(backupPath, finalPath);
            } catch (restoreError) {
                console.error(
                    "Failed to restore show backup after finalize failure:",
                    restoreError,
                );
                captureException(restoreError);
            }
        }
        captureException(error);
        return -1;
    }

    if (backupPath) {
        try {
            await unlinkFileWithRetry(backupPath);
        } catch {
            // best-effort cleanup
        }
    }

    currentNewShowDraftPath = null;

    const resCode = await setActiveDb(finalPath, false);
    if (resCode !== 200) return resCode;
    addRecentFile(finalPath);

    return 200;
}

/**
 * Deletes the draft file and clears the DB connection without reloading.
 */
export async function discardNewShowDraft(): Promise<number> {
    const draftPath = currentNewShowDraftPath
        ? resolve(currentNewShowDraftPath)
        : null;
    currentNewShowDraftPath = null;

    if (!draftPath) {
        return 200;
    }

    DatabaseServices.closePersistentConnection();
    DatabaseServices.setDbPath("", false);

    const storedPath = store.get("databasePath") as string | undefined;
    if (storedPath === draftPath) {
        store.delete("databasePath");
    }

    if (fs.existsSync(draftPath)) {
        await unlinkFileWithRetry(draftPath);
    }

    return 200;
}

/**
 * Deletes the new-show draft after another show opened in its place. The DB connection already
 * points at `openedPath`, so unlike `discardNewShowDraft` this leaves it alone.
 */
async function forgetReplacedNewShowDraft(openedPath: string): Promise<void> {
    if (!currentNewShowDraftPath) return;
    const draftPath = resolve(currentNewShowDraftPath);
    if (draftPath === resolve(openedPath)) return;
    currentNewShowDraftPath = null;
    try {
        if (fs.existsSync(draftPath)) await unlinkFileWithRetry(draftPath);
    } catch (error) {
        // An orphan draft is harmless; the drafts folder only holds throwaway files.
        console.error("Error deleting replaced new show draft:", error);
    }
}

/** Runs a renderer action chosen in the app menu (docs/adr/0003-menu-actions-ipc.md) */
export function sendMenuAction(action: string) {
    win?.webContents.send(MENU_ACTION_CHANNEL, action);
}

/**
 * Creates a new database file path to connect to.
 *
 * @returns 200 for success, -1 for failure
 */
/**
 * Opens the new-show dialog in the renderer (LaunchPage modal).
 * If a file is open, closes it and sets a flag so the dialog opens after reload.
 */
export async function requestNewShowFromMenu() {
    if (!win) return -1;

    const dbPath = DatabaseServices.getDbPath();
    if (dbPath && dbPath.length > 0) {
        store.set("pendingNewShowDialog", true);
        return closeCurrentFile();
    }

    win.webContents.send("new-show:open");
    return 200;
}

export async function newFile() {
    console.log("newFile");

    if (!win) return -1;

    let filePath: string | undefined;

    // In Playwright test mode, use the provided test file path instead of showing dialog
    if (
        process.env.PLAYWRIGHT_SESSION &&
        process.env.PLAYWRIGHT_NEW_FILE_PATH
    ) {
        console.log(
            "Using test file path:",
            process.env.PLAYWRIGHT_NEW_FILE_PATH,
        );
        filePath = process.env.PLAYWRIGHT_NEW_FILE_PATH;
    } else {
        const dialogResult = await dialog.showSaveDialog(win, {
            buttonLabel: t("fileDialog.newShow.button"),
            filters: [
                {
                    name: t("fileDialog.filters.openMarchFile"),
                    extensions: ["dots"],
                },
            ],
        });
        if (dialogResult.canceled || !dialogResult.filePath) return;
        filePath = dialogResult.filePath;
    }

    return createFileAtPath(filePath);
}

// Database (main file)

/**
 * Opens a dialog to create a new database file path to connect to with the data of the current database.
 * I.e. Save As..
 * OpenMarch automatically saves changes to the database, so this is not a save function.
 *
 * @returns 200 for success, -1 for failure
 */
export async function saveFile() {
    console.log("saveFile");

    if (!win) return -1;

    const db = DatabaseServices.connect();

    // Save
    const response = await dialog
        .showSaveDialog(win, {
            buttonLabel: t("fileDialog.saveCopy.button"),
            filters: [
                {
                    name: t("fileDialog.filters.openMarchFile"),
                    extensions: ["dots"],
                },
            ],
        })
        .then(async (path) => {
            if (path.canceled || !path.filePath) return 0;

            // Make a copy into a temp file
            const tempPath = path.filePath + ".tmp";
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }

            const stmt = await db.prepare("VACUUM INTO ?");
            await stmt.run(tempPath);

            // If there is an existing file, only delete it after successful copy
            if (fs.existsSync(path.filePath)) {
                fs.unlinkSync(path.filePath);
            }

            fs.renameSync(tempPath, path.filePath);

            addRecentFile(path.filePath);

            return 200;
        })
        .catch((err) => {
            console.log(err);
            return -1;
        });

    return response;
}

/** Open-dialog filters for a show file, in the app language. */
const showFileDialogFilters = (): Electron.FileFilter[] => [
    { name: t("fileDialog.filters.openMarchFile"), extensions: ["dots"] },
    { name: t("fileDialog.filters.allFiles"), extensions: ["*"] },
];

/**
 * Opens a dialog to load a database file path to connect to.
 *
 * @returns 200 for success, -1 for failure
 */
export async function loadDatabaseFile() {
    console.log("loadDatabaseFile");

    if (!win) return -1;

    // If there is no previous path, open a dialog
    dialog
        .showOpenDialog(win, {
            filters: showFileDialogFilters(),
        })
        .then(async (path) => {
            if (path.canceled) return -1;

            // setActiveDb saves the path once the file opens; a page-era file only asks first.
            // Add to recent files
            addRecentFile(path.filePaths[0]);

            const resCode = await setActiveDb(path.filePaths[0]);

            // Handle alert dialogs in frontend
            sendLoadFileResponse(resCode);

            return resCode;
        })
        .catch((err) => {
            console.log(err);
            return -1;
        });
}

// Custom function to send request and wait for response
function requestSvgBeforeClose(win: BrowserWindow): Promise<string> {
    return new Promise((resolve, reject) => {
        const requestId = `get-svg-${Date.now()}`;
        const responseChannel = `get-svg-response-${requestId}`;

        const cleanup = (
            handler?: (event: Electron.IpcMainEvent, svg: string) => void,
        ) => {
            if (handler) {
                ipcMain.removeListener(responseChannel, handler);
            }
            clearTimeout(timeoutId);
        };

        const handler = (event: Electron.IpcMainEvent, svg: string) => {
            cleanup(handler);
            resolve(svg);
        };

        ipcMain.once(responseChannel, handler);

        win.webContents.send("get-svg-on-close", requestId);

        // Optional timeout to avoid hanging
        const timeoutId = setTimeout(() => {
            cleanup(handler);
            reject(new Error("Timeout waiting for SVG response"));
        }, 5000);
    });
}

/**
 * Closes the current database file.
 *
 * @returns 200 for success, -1 for failure
 */
export function closeCurrentFile(isAppQuitting = false): Promise<number> {
    // Closing changes the active file, so it waits for an open that is running (P9.8: the main
    // process stays responsive while a file converts, so "Close File" can arrive meanwhile).
    return withOpenLock(() => closeCurrentFileNow(isAppQuitting));
}

async function closeCurrentFileNow(isAppQuitting: boolean) {
    console.log("closeCurrentFile called. isAppQuitting:", isAppQuitting);
    // console.trace();

    if (!win) return -1;

    closeView3dWindow();
    // A question about converting another file is stale once the person closes the show.
    conversionQuestion.forget();

    if (currentNewShowDraftPath) {
        await discardNewShowDraft();
        if (!isAppQuitting) {
            win.webContents.reload();
        }
        return 200;
    }

    try {
        const svgResult = await requestSvgBeforeClose(win);
        updateRecentFileSvgPreview(DatabaseServices.getDbPath(), svgResult);
    } catch (error) {
        console.error("Error getting SVG on close:", error);
    }

    // Close the current file
    DatabaseServices.setDbPath("", false);
    // A conversion the quit stopped keeps its file as the one to reopen on the next launch.
    if (!(isAppQuitting && conversionWorkersStopped()))
        store.set("databasePath", "");

    // Only reload if we're NOT quitting the app
    if (!isAppQuitting) {
        win.webContents.reload();
    }

    return 200;
}

// Audio files

/** Built when the dialog opens, so the names follow the app language. */
const audioFileDialogFilters = (): Electron.FileFilter[] => [
    {
        name: t("fileDialog.filters.audioFile"),
        extensions: ["mp3", "wav", "ogg", "m4a", "aac", "webm"],
    },
    { name: t("fileDialog.filters.allFiles"), extensions: ["*"] },
];

function audioInsertError(
    message: string,
): DatabaseServices.LegacyDatabaseResponse<AudioFile[]> {
    return { success: false, error: { message } };
}

async function pickAudioFilePath(): Promise<string | null> {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
        filters: audioFileDialogFilters(),
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
}

async function readAudioFileBuffer(filePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });
}

function bufferToArrayBuffer(data: Buffer): ArrayBuffer {
    return data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
}

/**
 * Opens a dialog to import an audio file to the database.
 *
 * @returns 200 for success, -1 for failure (TODO, this function's return value is always error)
 */
export async function insertAudioFile(): Promise<DatabaseServices.AudioInsertResponse> {
    console.log("insertAudioFile");

    if (!win) return audioInsertError("insertAudioFile: window not loaded");

    if (!DatabaseServices.databaseIsReady()) {
        console.error("insertAudioFile: Database is not ready");
        return audioInsertError(t("audio.insert.noFileOpen"));
    }

    try {
        const filePath = await pickAudioFilePath();
        if (!filePath) return { success: false, cancelled: true };

        console.log("loading audio file into buffer:", filePath);
        const data = await readAudioFileBuffer(filePath);

        if (!DatabaseServices.databaseIsReady()) {
            console.error(
                "insertAudioFile: Database became unavailable during upload",
            );
            return audioInsertError(t("audio.insert.databaseUnavailable"));
        }

        const databaseResponse = await DatabaseServices.insertAudioFile({
            data: bufferToArrayBuffer(data),
            path: filePath,
            nickname: basename(filePath),
            selected: true,
        });

        if (!databaseResponse.success) {
            console.error(
                "insertAudioFile: Failed to insert audio file:",
                databaseResponse.error,
            );
        } else {
            console.log(
                "insertAudioFile: Successfully inserted audio file with ID:",
                databaseResponse.result?.[0]?.id,
            );
        }

        return databaseResponse;
    } catch (err) {
        console.error("Error inserting audio file:", err);
        return audioInsertError(
            err instanceof Error ? err.message : String(err),
        );
    }
}

/** Where the migration files are, in development and in a packaged build. */
const migrationsFolderPath = () =>
    join(app.getAppPath(), "electron", "database", "migrations");

/** Backs a file up to userData/backups before migrations, and prunes backups older than 30 days. */
function backupBeforeMigrations(path: string) {
    const backupDir = join(app.getPath("userData"), "backups");
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const originalName = path.split(/[\\/]/).pop();
    const backupPath = join(backupDir, `backup_${timestamp}_${originalName}`);
    console.log("Creating backup of database in " + backupPath);
    fs.copyFileSync(path, backupPath);

    console.log("Deleting backups older than 30 days");
    const files = fs.readdirSync(backupDir);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    files.forEach((file) => {
        const filePath = join(backupDir, file);
        const stats = fs.statSync(filePath);
        if (stats.birthtime < thirtyDaysAgo) {
            fs.unlinkSync(filePath);
        }
    });
}

/** The dependencies of `openShowDatabase` in the running app. */
const openShowDeps = (): OpenShowDeps => ({
    migrationsFolder: migrationsFolderPath(),
    beforeMigrations: backupBeforeMigrations,
    dialogs: () => electronConvertOnOpenDialogs(win),
    // The backup and conversion run in a worker thread, off this event loop (P9.8).
    convertWorker: { workerPath: defaultConvertWorkerPath(__dirname) },
});

/** The window's navigation events, for resuming the renderer's SQL after a reload. */
const reloadEvents = () => (win && !win.isDestroyed() ? win.webContents : null);

/**
 * Sets the active database path and reloads the window. Opens are serialized:
 * one that starts while another runs (for example while a file converts)
 * waits for it, and a second open of a file that is already queued or waiting
 * on a dialog returns that open's result instead of opening it again.
 *
 * @param path path to the database file
 * @param isNewFile True if this is a new file, false if it is an existing file
 * @returns 200, a refusal code, `OPEN_STOPPED_STATUS` when a main-process
 *   dialog already explained why nothing opened, or `NEEDS_CONVERSION_STATUS`
 *   when the renderer must first ask to convert a page-era file
 */
function setActiveDb(
    path: string,
    isNewFile = false,
    options: OpenShowOptions = {},
): Promise<number> {
    // Get the current path from the store if the path is "."
    // I.e. last opened file
    if (path === ".") path = store.get("databasePath") as string;
    return openOnce(path, () =>
        withOpenLock(() => setActiveDbNow(path, isNewFile, options)),
    );
}

async function setActiveDbNow(
    path: string,
    isNewFile: boolean,
    options: OpenShowOptions,
) {
    // This open supersedes any question about converting another file (Confirm already took
    // its file); a page-era file asks again below.
    conversionQuestion.forget();
    refusalAfterReload = null;
    const hadShowOpen = DatabaseServices.getDbPath() !== "";
    try {
        // The 3D View shows one show; a confirmed conversion is about to replace it.
        if (options.conversionConfirmed) closeView3dWindow();

        const result = await openShowDatabase(
            path,
            isNewFile,
            openShowDeps(),
            options,
        );
        result.db?.close();
        const token = result.sqlSuspension;

        if (result.status === NEEDS_CONVERSION_STATUS && result.backupPath) {
            if (token !== undefined) DatabaseServices.resumeSqlProxy(token);
            // A page-era file: nothing was written, and the show that is open stays open and
            // saved as the one to reopen. The renderer asks the person over it whether to
            // convert the file; only Confirm closes it.
            conversionQuestion.ask(
                pendingConversionFor(path, result.backupPath),
            );
            if (!DatabaseServices.getDbPath()) {
                // No show is open (at launch, or an open that got as far as closing it): ask
                // over the launch page.
                store.delete("databasePath");
                win?.setTitle("OpenMarch"); // i18n-ignore: product name
                if (token !== undefined) win?.webContents.reload();
            }
            return result.status;
        }

        // Any other answer may close the show that is open; the 3D View shows one show.
        closeView3dWindow();

        if (result.status !== 200) {
            if (token !== undefined) DatabaseServices.resumeSqlProxy(token);
            if (
                result.status === OPEN_STOPPED_STATUS &&
                conversionWorkersStopped()
            ) {
                // The app is quitting and stopped this file's conversion (rolled back): reopen,
                // and so convert, it on the next launch.
                store.set("databasePath", path);
                return result.status;
            }
            store.delete("databasePath");
            if (result.status === OPEN_STOPPED_STATUS) {
                // Convert on open: a dialog already told the person why the file didn't open.
                // Open nothing.
                win?.setTitle("OpenMarch"); // i18n-ignore: product name
                win?.webContents.reload();
            } else {
                console.error(
                    `Error loading database file [code=${result.status}] [path=${path}]`,
                );
                if (hadShowOpen && !DatabaseServices.getDbPath()) {
                    // The refusal closed the show that was open: go to the launch page, which
                    // explains why the file didn't open.
                    refusalAfterReload = result.status;
                    win?.setTitle("OpenMarch"); // i18n-ignore: product name
                    win?.webContents.reload();
                }
            }
            return result.status;
        }

        // Another show replaced a new-show draft: delete the draft now, so the reload's
        // navigation doesn't discard it and close the show that just opened.
        await forgetReplacedNewShowDraft(path);

        win?.setTitle("OpenMarch - " + path); // i18n-ignore: product name and path
        store.set("databasePath", path); // Save current db path
        win?.webContents.reload();
        // Only once the reloaded page has navigated may it query the file. Another open can
        // start meanwhile; it takes the suspension over, and this resume then leaves it be.
        if (token !== undefined)
            void resumeSqlProxyAfterReload(token, reloadEvents());

        return result.status;
    } catch (error) {
        captureException(error);
        store.delete("databasePath"); // Reset database path
        DatabaseServices.setDbPath("", false);
        dialog.showErrorBox(
            t("fileDialog.openFailed.title"),
            (error as Error).message,
        );
        win?.webContents.reload();
        throw error;
    }
}
