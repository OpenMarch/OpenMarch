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
import {
    isSameFile,
    publishFile,
    settlePendingDeletes,
    removeWithRetry,
    tempPathBeside,
} from "../database/atomicFile";
import {
    WORKING_COPY_SETTING,
    createWorkingCopyHost,
    workingCopySavesEnabled,
    type RecoverChoice,
    type WorkingCopyOpen,
} from "./workingCopyHost";
import { describeLocation } from "./fileLocation";
import { withoutPaths } from "../database/logSafe";
import {
    type RecoverableWorkingCopy,
    type SaveOutcome,
    type WorkingCopyConflictChoice,
    type WorkingCopySession,
    type WorkingCopyStatus,
    WorkingCopyStorageError,
    removeStaleTempFiles,
} from "../database/workingCopy/WorkingCopySession";
import { createWorkingCopyTelemetry } from "./workingCopyTelemetry";
import { DatabaseSync } from "node:sqlite";
import {
    decideFileVersion,
    PAGE_MODEL_USER_VERSION,
    readUserVersion,
} from "../database/fileVersion";
import { basename, dirname, join, resolve, sep } from "node:path";
import * as DatabaseServices from "../database/database.services";
import { VIEW3D_AUTO_OPEN_SETTING } from "../../src/view3d/sync/protocol";
import { THEME_SYNC_CHANNEL } from "../../src/global/themeSync";
import { buildApplicationMenu } from "./application-menu";
import { onMainLanguageChange, setMainLanguage, t } from "./i18n";
import { connectDiscordIpc, discordIpcPaths } from "./discord/discordIpc";
import {
    createDiscordPresence,
    DISCORD_CLIENT_ID,
} from "./discord/discordPresence";
import {
    DISCORD_PRESENCE_SETTING,
    DISCORD_SHOW_NAME_SETTING,
    discordPresenceEnabled,
    discordShowNameEnabled,
} from "../../src/discord/discordPresenceSettings";
import { textContextMenuTemplate } from "./textContextMenu";
import { openSettingsWindow } from "./settings-window";
import { registerReports } from "./reports";
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
import { init, captureException, captureMessage } from "@sentry/electron/main";

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
    backupBeforeJournalRecovery,
    hasLeftoverJournal,
    isFolderAccessError,
    journalPathFor,
    LEFTOVER_JOURNAL_STATUS,
} from "../database/leftoverJournal";
import {
    JournalRecoveryError,
    recoverFromLeftoverJournal,
    SET_ASIDE_MARK,
} from "./leftoverJournalRecovery";
import { cloudSyncServiceFor } from "./cloudSyncFolder";
import { describeLeftoverJournal } from "./leftoverJournalDiagnostics";
import {
    diagnosticTags,
    stripDiagnosticBreadcrumbs,
} from "./privateDiagnostics";
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
    type OpenShowResult,
    type OpenShowOptions,
} from "./openShow";
import { choosePreviousDotsFile } from "./services/previous-dots-import-service";
import {
    closeView3dWindow,
    getView3dWindow,
    initView3dWindow,
    VIEW3D_WINDOW_DEFAULTS,
    windowBackground,
} from "./view3dWindow";
import {
    displayListing,
    moveToChosenDisplay,
    placementSupported,
    rememberWindowState,
    showWhenReady,
    windowPlacement,
} from "./window-state";
import type { WindowDefaults } from "./window-placement";
import {
    LIST_DISPLAYS_CHANNEL,
    WINDOW_OPEN_ON_SETTINGS,
    type DisplaysResponse,
} from "../../src/settings/windowPlacementSettings";
import { withAppCsp } from "./workerCsp";
import { DESKTOP_PAGE_CSP } from "../../src/security/appCsp";
import {
    APP_INDEX_URL,
    APP_ORIGIN,
    handleAppScheme,
    registerAppScheme,
} from "./appProtocol";
import {
    electronStorageMoveDeps,
    moveRendererStorage,
} from "./rendererStorageMove";
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
/** Set while the window's close handler runs, so a second close request waits for it. */
let windowIsClosing = false;
const store = new Store();
/** No settings yet: a new install, or a test's fresh profile, with no old storage to move */
const isNewProfile = store.size === 0;
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
    // The app's own diagnostics go without the console breadcrumbs, which name files.
    beforeSend: stripDiagnosticBreadcrumbs,
});

/**
 * Whether the app may send its own diagnostics now. Read each time: the person can opt out of
 * analytics after launch.
 */
const diagnosticsAllowed = () =>
    enableSentry &&
    !store.get("optOutAnalytics") &&
    !process.env.PLAYWRIGHT_SESSION;

/** The person's Discord status (Settings > Privacy). Tests never touch a real Discord. */
const discordPresence = createDiscordPresence({
    clientId:
        process.env.PLAYWRIGHT_SESSION || process.env.CI
            ? ""
            : DISCORD_CLIENT_ID,
    connect: () =>
        connectDiscordIpc({
            clientId: DISCORD_CLIENT_ID,
            paths: discordIpcPaths(process.platform, process.env),
            pid: process.pid,
        }),
    isEnabled: () =>
        discordPresenceEnabled(store.get(DISCORD_PRESENCE_SETTING)),
    showsShowName: () =>
        discordShowNameEnabled(store.get(DISCORD_SHOW_NAME_SETTING)),
    t,
});
onMainLanguageChange(() => discordPresence.refresh());

ipcMain.on("settings:set", (event, settings) => {
    for (const [key, value] of Object.entries(settings)) {
        store.set(key, value);
    }
    broadcastSettingsChanged(event.sender, settings);

    // A display just chosen in Settings: an open window moves there now
    if (WINDOW_OPEN_ON_SETTINGS.editor in settings)
        moveToChosenDisplay(store, "editor", win, EDITOR_WINDOW_DEFAULTS);
    if (WINDOW_OPEN_ON_SETTINGS.view3d in settings)
        moveToChosenDisplay(
            store,
            "view3d",
            getView3dWindow(),
            VIEW3D_WINDOW_DEFAULTS,
        );

    if (Object.prototype.hasOwnProperty.call(settings, "language")) {
        setMainLanguage(settings.language);
    }

    // Basic leaves Play On and Loop out of the Playback menu; Save Now follows working-copy saves
    if (
        Object.prototype.hasOwnProperty.call(settings, "editorMode") ||
        Object.prototype.hasOwnProperty.call(settings, WORKING_COPY_SETTING)
    )
        showApplicationMenu();

    // Turning working-copy saves off publishes the open show now. It keeps its working copy
    // until it closes; the next open edits in place. Unpublished changes from earlier sessions
    // are still offered (ADR 0018).
    if (settings[WORKING_COPY_SETTING] === false)
        void workingCopies.current?.flush("setting-off");

    if (Object.prototype.hasOwnProperty.call(settings, "automaticUpdates"))
        updates?.setAutomaticDownload(
            automaticUpdatesAreEnabled(settings.automaticUpdates),
        );

    if (
        DISCORD_PRESENCE_SETTING in settings ||
        DISCORD_SHOW_NAME_SETTING in settings
    )
        discordPresence.refresh();
});

ipcMain.handle("settings:get", (_, key) => {
    return store.get(key);
});

ipcMain.handle(
    LIST_DISPLAYS_CHANNEL,
    (): DisplaysResponse => ({
        supported: placementSupported(),
        displays: displayListing(),
    }),
);

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
// The packaged renderer's own scheme (appProtocol.ts)
registerAppScheme();

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let win: BrowserWindow | null = null;

const EDITOR_WINDOW_DEFAULTS: WindowDefaults = {
    // Maximized the first time; this is its size when un-maximized
    maximized: true,
    size: (workArea) => ({
        width: Math.round(workArea.width * 0.8),
        height: Math.round(workArea.height * 0.8),
    }),
    // Fits a portrait tablet (iPad mini is 744 wide; Windows tablets in
    // portrait or split screen are ~768), where the Inspector folds away
    // (src/utilities/inspectorLayout.ts).
    min: { width: 768, height: 600 },
};

/** Until the editor's first window exists; only hidden windows may be open before it */
let startingUp = true;

// Here, you can also use other preload
const preload = join(__dirname, "../preload/index.js");
const view3dPreload = join(__dirname, "../preload/view3d.js");
const url = process.env.VITE_DEV_SERVER_URL;
// eslint-disable-next-line max-lines-per-function
async function createWindow(title?: string) {
    // Its display, size and maximized state, so it shows once, already in place
    const placement = windowPlacement(store, "editor", EDITOR_WINDOW_DEFAULTS);
    win = new BrowserWindow({
        title: title || "OpenMarch", // i18n-ignore: product name
        icon: join(process.env.VITE_PUBLIC, "favicon.ico"),
        ...placement.bounds,
        show: false,
        backgroundColor: windowBackground(store.get("theme", "light")),
        minWidth: EDITOR_WINDOW_DEFAULTS.min.width,
        minHeight: EDITOR_WINDOW_DEFAULTS.min.height,
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
    rememberWindowState(store, "editor", win);
    showWhenReady(win, placement);
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
            // The app's own scheme sends its headers itself (appProtocol.ts)
            if (details.url.startsWith(`${APP_ORIGIN}/`)) return callback({});
            callback({
                // Each listed worker's script gets its own policy (workerCsp.ts)
                responseHeaders: withAppCsp(
                    details.url,
                    details.responseHeaders,
                    DESKTOP_PAGE_CSP,
                ),
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
        void win.loadURL(APP_INDEX_URL);
    }

    // Test actively push message to the Electron-Renderer
    win.webContents.on("did-finish-load", () => {
        // Every open and close of a show reloads the page
        discordPresence.setScreen({
            showPath: DatabaseServices.getDbPath(),
            isNewShowDraft: !!currentNewShowDraftPath,
        });
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
        if (windowIsClosing) return;
        windowIsClosing = true;
        // A working copy publishes while the window is still visible, so a failed publish can
        // ask the person and they can cancel quitting (ADR 0018).
        if (workingCopies.current) {
            const proceed = await endWorkingCopy("quit").catch((error) => {
                console.error("Error saving before quit:", error);
                return true;
            });
            if (!proceed) {
                windowIsClosing = false;
                // The person kept the app open: it isn't quitting after all
                appIsQuitting = false;
                return;
            }
        }
        win!.hide(); // use non-null assertion now that we're inside the if-block
        closeView3dWindow();

        try {
            await closeCurrentFile(true);
        } catch (e) {
            console.error("Error closing file:", e);
        }
        await finishPendingDeletes();

        isQuitting = true;
        win!.destroy();
        win = null;
        app.quit();
    });

    // Publish when the person switches away, so the show in its folder is current (ADR 0018).
    win.on("blur", () => {
        workingCopies.current?.publishAutomatically("blur");
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
    console.log(
        "Show to open at startup:",
        pathToOpen ? `one in ${whereIs(pathToOpen)}` : "none",
    );
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

/**
 * The file whose last open was refused for a leftover journal SQLite can't use
 * (`LEFTOVER_JOURNAL_STATUS`). The renderer offers to recover it
 * (`load-file:recoverFromJournal`); any other open forgets it.
 */
let leftoverJournalFile: string | null = null;

/**
 * Reports what the leftover journal that stopped an open looks like (no paths), so the cause of
 * repeat cases can be found. Never stops the open's answer.
 */
function reportLeftoverJournal(filePath: string) {
    try {
        const facts = describeLeftoverJournal(filePath);
        console.warn("A leftover journal stopped an open:", facts);
        if (!diagnosticsAllowed()) return;
        captureMessage("Leftover journal stopped an open", {
            level: "warning",
            tags: diagnosticTags({
                syncService: facts.syncService,
                journalOpenForWrite: facts.journalOpenForWrite,
            }),
            extra: { ...facts },
        });
    } catch (error) {
        console.error("Couldn't describe the leftover journal:", error);
    }
}

/** The renderer's questions about a leftover journal that stopped an open. */
function initLeftoverJournalIpcHandlers() {
    ipcMain.handle("load-file:leftoverJournal", () =>
        leftoverJournalFile
            ? basename(journalPathFor(leftoverJournalFile))
            : null,
    );
    ipcMain.handle("load-file:recoverFromJournal", async () =>
        recoverAndOpenLeftoverJournalFile(),
    );
    // The show a leftover journal stopped, else the open show.
    ipcMain.handle("show:cloudSyncFolder", () => {
        const filePath = leftoverJournalFile ?? DatabaseServices.getDbPath();
        const service = cloudSyncServiceFor(filePath);
        return service ? { service, filePath } : null;
    });
}

/**
 * Recovers the refused file from its leftover journal on copies (`leftoverJournalRecovery.ts`),
 * then opens it. Explains in a dialog when it can't.
 */
async function recoverAndOpenLeftoverJournalFile(): Promise<number> {
    const filePath = leftoverJournalFile;
    leftoverJournalFile = null;
    if (!filePath) return -1;
    const name = basename(journalPathFor(filePath));
    try {
        // Nothing may open the file while its journal moves and the recovered show replaces it.
        const result = await withOpenLock(async () =>
            recoverFromLeftoverJournal(filePath, backupDir()),
        );
        if (result.outcome === "damaged") {
            dialog.showErrorBox(
                t("fileDialog.leftoverJournal.damagedTitle"),
                t("fileDialog.leftoverJournal.damagedMessage", { name }),
            );
            return -1;
        }
        if (result.outcome === "recovered")
            console.log(
                `Recovered a show in ${whereIs(filePath)} (${result.from}); its journal is now in ${whereIs(result.journalKeptAt)}`,
            );
    } catch (error) {
        console.error(
            "Couldn't recover from the leftover journal:",
            withoutPaths(error),
        );
        captureException(error);
        const step =
            error instanceof JournalRecoveryError ? error.step : "stage";
        dialog.showErrorBox(
            t("fileDialog.leftoverJournal.failedTitle"),
            step === "move-journal"
                ? t("fileDialog.leftoverJournal.journalMoveFailedMessage", {
                      name,
                  })
                : step === "replace"
                  ? t("fileDialog.leftoverJournal.replaceFailedMessage")
                  : t("fileDialog.leftoverJournal.stageFailedMessage"),
        );
        return -1;
    }
    return openRecentFile(filePath);
}

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

// eslint-disable-next-line max-lines-per-function
function initDatabaseIpcHandlers() {
    ipcMain.handle("database:isReady", DatabaseServices.databaseIsReady);
    ipcMain.handle("database:getPath", () => DatabaseServices.getDbPath());
    ipcMain.handle(
        "working-copy:get-status",
        () => workingCopies.current?.status() ?? null,
    );
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
            // Repair reads the show file, so it must hold the latest changes (ADR 0018).
            if (!(await endWorkingCopy("repair"))) return null;
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
    ipcMain.handle("audio:insert", async () => {
        try {
            return await insertAudioFile();
        } finally {
            DatabaseServices.noteDatabaseActivity();
        }
    });
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
    initWorkingCopyIpcHandlers();
    initLeftoverJournalIpcHandlers();
    initRecentFilesIpcHandlers();
}

void app.whenReady().then(async () => {
    app.setName("OpenMarch");
    clearSaveScratch();
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

    // Working copies a crash left (ADR 0018). Opening one of their shows offers recovery first.
    workingCopies.scanAtStartup();
    const pathToOpen = resolveStartupDatabasePath();
    if (pathToOpen.length > 0) await setActiveDb(pathToOpen);
    DatabaseServices.initHandlers();

    console.log(
        "Open show: " +
            (DatabaseServices.getDbPath()
                ? `in ${whereIs(DatabaseServices.getDbPath())}`
                : "none"),
    );

    initIpcHandlers();
    initGetters();
    initView3dWindow({
        preload: view3dPreload,
        devServerUrl: url,
        appIndexUrl: APP_INDEX_URL,
        icon: join(process.env.VITE_PUBLIC, "favicon.ico"),
        frame: isCodegen,
        getTheme: () => store.get("theme", "light") as string,
        getLanguage: () => store.get("language", "en") as string,
        getEditorWindow: () => win,
        store,
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

    if (!url) {
        handleAppScheme(process.env.DIST);
        // Settings the renderer kept under `file://` (rendererStorageMove.ts); gives up after
        // 10 s so startup goes on
        await moveRendererStorage(electronStorageMoveDeps(store, isNewProfile));
    }

    // i18n-ignore: the product name and a file path, the same in every language
    try {
        await createWindow("OpenMarch - " + store.get("databasePath"));
    } finally {
        startingUp = false;
    }

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
// Not before-quit: a quit can still be cancelled then, and the status would be gone
app.on("will-quit", () => discordPresence.stop());
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
 * Before quitting: gives temp files a sync app still holds up to 10 s to be deleted, so they
 * aren't left beside the show until it next opens. Quitting goes on at the cap (ADR 0018).
 */
async function finishPendingDeletes() {
    const { settled } = await settlePendingDeletes(10_000);
    if (!settled)
        console.warn("Quitting with temp files still held by another program");
}

/**
 * Before a restart for an update or a move to Applications: close the show the way quitting
 * does, but keep it as the file to open on the next launch. A new show that was never saved is
 * discarded, as on quit.
 */
async function closeShowForRestart(): Promise<boolean> {
    const reopen = currentNewShowDraftPath ? "" : DatabaseServices.getDbPath();
    // A working copy publishes while the window is still visible, so a failed publish can ask
    // the person, and they can keep the show open instead (ADR 0018).
    const proceed = await endWorkingCopy("quit").catch((error) => {
        console.error("Error saving before restarting:", error);
        return true;
    });
    if (!proceed) return false;
    // Out of sight, as quitting does: nothing typed now could be saved
    win?.hide();
    try {
        await closeCurrentFile(true);
    } catch (error) {
        console.error("Error closing file before restarting:", error);
    }
    await finishPendingDeletes();
    if (reopen) store.set("databasePath", reopen);
    // The windows close without asking again
    isQuitting = true;
    return true;
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
    if (!(await closeShowForRestart())) return false;
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
        await publishBeforeExport();
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
            await publishBeforeExport();
            return await PDFExportService.createExportDirectory(defaultName);
        },
    );

    // Export SVG pages to PDF
    ipcMain.handle("export:generateDocForMarcher", async (_, args) => {
        return await PDFExportService.generateDocForMarcher(args);
    });

    // Video export (streamed file writing)
    ipcMain.handle("export:videoStart", async (_, fileExtension: string) => {
        await publishBeforeExport();
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

// Close the show's connection on the way out, so nothing is left open on the file (ADR 0018).
app.on("will-quit", () => {
    DatabaseServices.closeDatabase();
});

app.on("window-all-closed", async () => {
    // The storage move's hidden windows close before the editor's opens
    if (startingUp) return;
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
        // Still hidden while it starts: it shows itself, in place, in a moment
        if (win.isVisible()) win.focus();
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
                : void settings.loadURL(`${APP_INDEX_URL}#settings`),
    });
});

registerReports({ getMainWindow: () => win });

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
        saveNow: workingCopySavesEnabled(store.get(WORKING_COPY_SETTING)),
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

// For the preload, before the page's first paint (index.html)
ipcMain.on(THEME_SYNC_CHANNEL, (event) => {
    event.returnValue = store.get("theme", "light");
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
    // Startup opens the editor itself (the storage move's windows are hidden)
    if (startingUp) return;
    const allWindows = BrowserWindow.getAllWindows();
    if (win && !win.isDestroyed()) {
        // Still hidden while it starts: it shows itself, in place, in a moment
        if (win.isVisible()) win.focus();
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
    console.log(`Creating a show in ${whereIs(filePath)}`);

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
        DatabaseServices.closeDatabase();
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

    DatabaseServices.closeDatabase();

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

    try {
        const result = await dialog.showSaveDialog(win, {
            buttonLabel: t("fileDialog.saveCopy.button"),
            filters: [
                {
                    name: t("fileDialog.filters.openMarchFile"),
                    extensions: ["dots"],
                },
            ],
        });
        if (result.canceled || !result.filePath) return 0;
        const target = resolve(result.filePath);

        // A copy over the open show would replace the file under its own connection, and the
        // show already holds these contents: nothing to do. The same file can be spelled
        // differently (case on Windows and macOS, a symbolic link), so compare the files.
        if (isSameFile(target, DatabaseServices.getDbPath())) {
            // With a working copy, the file can be a few seconds behind: write it now.
            const outcome = await workingCopies.current?.flush("save-copy");
            return outcome && !outcome.ok ? -1 : 200;
        }

        await writeSnapshotTo(target);
        addRecentFile(target);
        return 200;
    } catch (err) {
        console.log(err);
        captureException(err);
        return -1;
    }
}

/** A private folder for files a save builds before they go beside the show (ADR 0018). */
const saveScratchPath = () => join(app.getPath("userData"), "save-scratch");

function saveScratchDirectory(): string {
    const directory = saveScratchPath();
    fs.mkdirSync(directory, { recursive: true });
    return directory;
}

/**
 * Deletes snapshots a save left in the scratch folder when the app crashed or was killed during
 * it. Call at startup: the single-instance lock means no other run is saving.
 */
function clearSaveScratch() {
    try {
        fs.rmSync(saveScratchPath(), { recursive: true, force: true });
    } catch (error) {
        console.warn("Couldn't clear the save scratch folder:", error);
    }
}

/**
 * Writes a consistent copy of the open show to `target`. The snapshot is built in the app's
 * user data; only the finished file goes beside `target`, and replaces any file there in one
 * rename (ADR 0018).
 */
async function writeSnapshotTo(target: string) {
    const snapshot = join(saveScratchDirectory(), `${randomUUID()}.dots`);
    try {
        const db = DatabaseServices.connect();
        try {
            db.prepare("VACUUM INTO ?").run(snapshot);
        } finally {
            db.close();
        }
        await publishFile(snapshot, target);
    } finally {
        await removeWithRetry(snapshot);
    }
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

    // Publish and release a working copy (ADR 0018); the person may cancel if that fails.
    if (!(await endWorkingCopy(isAppQuitting ? "quit" : "close"))) return 0;

    // Close the current file
    DatabaseServices.closeDatabase();
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

/** The folder the app keeps backups of show files in. */
const backupDir = () => join(app.getPath("userData"), "backups");

/**
 * Copies a file and its leftover journal into the backups before SQLite plays the journal back
 * (`leftoverJournal.ts`). A failed copy doesn't stop the open: it goes ahead as it always did.
 */
function backupLeftoverJournal(path: string) {
    try {
        const backup = backupBeforeJournalRecovery(path, backupDir());
        if (backup)
            console.log(
                `Leftover journal next to a show in ${whereIs(path)}: copied the file to ${whereIs(backup.showCopy)}` +
                    (backup.journalCopy ? " with its journal" : ""),
            );
    } catch (error) {
        console.error(
            "Couldn't back up a file with a leftover journal:",
            error,
        );
        captureException(error);
    }
}

/** Backs a file up to userData/backups before migrations, and prunes backups older than 30 days. */
function backupBeforeMigrations(path: string) {
    const backupDir = join(app.getPath("userData"), "backups");
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const originalName = path.split(/[\\/]/).pop();
    const backupPath = join(backupDir, `backup_${timestamp}_${originalName}`);
    console.log(`Creating a backup of the show in ${whereIs(backupPath)}`);
    fs.copyFileSync(path, backupPath);

    console.log("Deleting backups older than 30 days");
    const files = fs.readdirSync(backupDir);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    files.forEach((file) => {
        // A journal set aside keeps its original date when moved, so age says nothing; the
        // recovery dialog promised it isn't deleted.
        if (
            file.endsWith(SET_ASIDE_MARK) ||
            file.endsWith(`${SET_ASIDE_MARK}-journal`)
        )
            return;
        const filePath = join(backupDir, file);
        const stats = fs.statSync(filePath);
        if (stats.birthtime < thirtyDaysAgo) {
            fs.unlinkSync(filePath);
        }
    });
}

/************************************** WORKING COPY **************************************/
// Saving through a private working copy (ADR 0018). On unless the "workingCopySaves" setting
// is turned off; OPENMARCH_WORKING_COPY=1 / =0 forces it.

const workingCopyRoot = () => join(app.getPath("userData"), "working-copies");

/** The sync app whose folder holds a show, cached per path (it only reads folder names). */
const syncServiceCache = new Map<string, string | null>();
function syncServiceOf(showPath: string): string | null {
    if (!syncServiceCache.has(showPath))
        syncServiceCache.set(showPath, cloudSyncServiceFor(showPath));
    return syncServiceCache.get(showPath) ?? null;
}

/** Where a file is, for log lines: the kind of folder, never the path (logSafe.ts). */
const whereIs = (filePath: string) =>
    describeLocation(filePath, app.getPath("userData"));

function reportWorkingCopyStatus(status: WorkingCopyStatus) {
    if (!win || win.isDestroyed()) return;
    win.webContents.send("working-copy:status", {
        ...status,
        syncService: syncServiceOf(status.showPath),
    } satisfies WorkingCopyStatus);
    if (isMacOS)
        win.setDocumentEdited(
            status.state !== "saved" && status.state !== "closed",
        );
}

/**
 * Runs `ask` (a working-copy question or the Save As dialog) with the open show's automatic
 * publishes held: no retry, idle or blur publish writes a temp file behind it, and the title bar
 * keeps showing why the last one failed. What the person then chooses publishes at once.
 */
async function withAutomaticPublishesHeld<T>(
    ask: () => Promise<T>,
): Promise<T> {
    const release = workingCopies.current?.holdAutomaticPublishes();
    try {
        return await ask();
    } finally {
        release?.();
    }
}

/** Shows a working-copy question over the window, with automatic publishes held. */
function askWorkingCopyQuestion(
    options: Electron.MessageBoxOptions,
): Promise<Electron.MessageBoxReturnValue> {
    return withAutomaticPublishesHeld(() =>
        win && !win.isDestroyed()
            ? dialog.showMessageBox(win, options)
            : dialog.showMessageBox(options),
    );
}

/** Asks whether to recover a show's unpublished changes before it opens. */
async function askRecoverOnOpen(
    entry: RecoverableWorkingCopy,
): Promise<RecoverChoice> {
    const choices: RecoverChoice[] = ["recover", "discard", "cancel"];
    const edited = entry.manifest.lastEditAt
        ? new Date(entry.manifest.lastEditAt).toLocaleString()
        : "";
    const options: Electron.MessageBoxOptions = {
        type: "warning",
        message: t("fileDialog.recoverOnOpen.message", {
            name: basename(entry.manifest.showPath),
        }),
        detail: t("fileDialog.recoverOnOpen.detail", { time: edited }),
        buttons: [
            t("fileDialog.recoverOnOpen.recover"),
            t("fileDialog.recoverOnOpen.discard"),
            t("fileDialog.recoverOnOpen.cancel"),
        ],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
    };
    // Chosen on the launch page already
    if (approvedRecoveryId === entry.id) return "recover";
    // A Playwright run can't answer a native dialog: recover, as the safe choice.
    if (process.env.PLAYWRIGHT_SESSION) return "recover";
    const { response } = await askWorkingCopyQuestion(options);
    return choices[response] ?? "cancel";
}

const workingCopies = createWorkingCopyHost({
    sessionOptions: () => ({
        workingRoot: workingCopyRoot(),
        appVersion: app.getVersion(),
        platform: process.platform,
        onStatus: reportWorkingCopyStatus,
        onPublish: (event) => workingCopyTelemetry.publish(event),
    }),
    askRecover: async (entry) => {
        workingCopyTelemetry.recoveryOffered();
        const choice = await askRecoverOnOpen(entry);
        if (choice === "recover") workingCopyTelemetry.recoveryTaken();
        return choice;
    },
    askUnpublished: askAboutUnpublishedChanges,
    onSessionChange: (session) => {
        if (session)
            workingCopyTelemetry.sessionStarted(
                syncServiceOf(session.showPath),
            );
        else workingCopyTelemetry.sessionEnded();
    },
});

/** Non-identifying publish numbers for Sentry, respecting the analytics opt-out (ADR 0018). */
const workingCopyTelemetry = createWorkingCopyTelemetry({
    enabled: diagnosticsAllowed,
    platform: process.platform,
    appVersion: app.getVersion(),
});

type UnpublishedAnswer = "retry" | "overwrite" | "saveAs" | "close" | "cancel";

/** Asks what to do when the publish before closing or quitting failed (ADR 0018). */
async function askAboutUnpublishedChanges(
    session: WorkingCopySession,
    outcome: Extract<SaveOutcome, { ok: false }>,
): Promise<"close" | "cancel" | "retried"> {
    const name = basename(session.showPath);
    const choices: { label: string; answer: UnpublishedAnswer }[] =
        outcome.state === "conflict"
            ? [
                  {
                      label: t("fileDialog.unpublished.keepMine"),
                      answer: "overwrite",
                  },
                  {
                      label: t("fileDialog.unpublished.saveAs"),
                      answer: "saveAs",
                  },
              ]
            : outcome.state === "readOnly"
              ? [
                    {
                        label: t("fileDialog.unpublished.saveAs"),
                        answer: "saveAs",
                    },
                ]
              : [
                    {
                        label: t("fileDialog.unpublished.retry"),
                        answer: "retry",
                    },
                    {
                        label: t("fileDialog.unpublished.saveAs"),
                        answer: "saveAs",
                    },
                ];
    choices.push(
        { label: t("fileDialog.unpublished.closeAnyway"), answer: "close" },
        { label: t("fileDialog.unpublished.cancel"), answer: "cancel" },
    );
    const service = syncServiceOf(session.showPath);
    const options: Electron.MessageBoxOptions = {
        type: "warning",
        message: t("fileDialog.unpublished.message", { name }),
        detail: [
            outcome.state === "conflict"
                ? t("fileDialog.unpublished.conflictDetail", { name })
                : outcome.state === "readOnly"
                  ? t("fileDialog.unpublished.readOnlyDetail", { name })
                  : service
                    ? t("fileDialog.unpublished.busySyncDetail", {
                          name,
                          service,
                      })
                    : t("fileDialog.unpublished.busyDetail", { name }),
            t("fileDialog.unpublished.keptDetail"),
        ].join("\n\n"),
        buttons: choices.map((choice) => choice.label),
        defaultId: 0,
        cancelId: choices.length - 1,
        noLink: true,
    };
    // A Playwright run can't answer: close and keep the changes for recovery.
    if (process.env.PLAYWRIGHT_SESSION) return "close";
    const { response } = await askWorkingCopyQuestion(options);
    const answer = choices[response]?.answer ?? "cancel";
    if (answer === "cancel" || answer === "close") return answer;
    if (answer === "overwrite") await session.overwriteShow();
    else if (answer === "saveAs") {
        const target = await chooseWorkingCopyTarget(session.showPath);
        if (target) await saveWorkingCopyAs(session, target);
    }
    return "retried";
}

/** Asks where to save the open show as a new file. */
async function chooseWorkingCopyTarget(
    showPath: string,
): Promise<string | null> {
    const name = basename(showPath).replace(/\.dots$/i, "");
    const result = await withAutomaticPublishesHeld(() =>
        showSaveDialogHandler({
            buttonLabel: t("fileDialog.saveAs.button"),
            defaultPath: join(dirname(showPath), `${name} (2).dots`),
            filters: [
                {
                    name: t("fileDialog.filters.openMarchFile"),
                    extensions: ["dots"],
                },
            ],
        }),
    );
    if (result.canceled || !result.filePath) return null;
    return result.filePath.endsWith(".dots")
        ? result.filePath
        : `${result.filePath}.dots`;
}

/** Makes `newShowPath` the open show's file and publishes to it (Save As). */
async function saveWorkingCopyAs(
    session: WorkingCopySession,
    newShowPath: string,
): Promise<SaveOutcome> {
    const outcome = await session.retarget(newShowPath);
    DatabaseServices.setWorkingCopyShowPath(session.showPath);
    store.set("databasePath", session.showPath);
    addRecentFile(session.showPath);
    win?.setTitle("OpenMarch - " + session.showPath); // i18n-ignore: product name and path
    if (isMacOS) win?.setRepresentedFilename(session.showPath);
    reportWorkingCopyStatus(session.status());
    return outcome;
}

/** Recovery the person already chose on the launch page, so opening doesn't ask again. */
let approvedRecoveryId: string | null = null;

function initWorkingCopyIpcHandlers() {
    ipcMain.handle("working-copy:save-now", () => publishNow());
    ipcMain.handle("working-copy:save-as", async () => {
        const session = workingCopies.current;
        if (!session)
            return { ok: false, state: "closed", message: "No show is open" };
        const target = await chooseWorkingCopyTarget(session.showPath);
        if (!target) return { ok: false, cancelled: true };
        return saveWorkingCopyAs(session, target);
    });
    ipcMain.handle(
        "working-copy:resolve-conflict",
        async (_, choice: WorkingCopyConflictChoice) => {
            const session = workingCopies.current;
            if (!session)
                return {
                    ok: false,
                    state: "closed",
                    message: "No show is open",
                };
            if (choice === "keepMine") return session.overwriteShow();
            if (choice === "keepTheirs") {
                // Drop the working copy and reopen the show as it is on disk.
                const showPath = session.showPath;
                await workingCopies.discardCurrent(() =>
                    DatabaseServices.closeDatabase(),
                );
                const resCode = await setActiveDb(showPath);
                return resCode === 200
                    ? { ok: true }
                    : { ok: false, state: "closed", message: String(resCode) };
            }
            const target = await chooseWorkingCopyTarget(session.showPath);
            if (!target) return { ok: false, cancelled: true };
            return saveWorkingCopyAs(session, target);
        },
    );
    ipcMain.handle("working-copy:list-recoverable", () =>
        workingCopies.listRecoverable(),
    );
    ipcMain.handle("working-copy:recover", async (_, id: string) => {
        const entry = workingCopies.findRecoverable(id);
        if (!entry) return 404;
        approvedRecoveryId = id;
        workingCopyTelemetry.recoveryOffered();
        workingCopyTelemetry.recoveryTaken();
        try {
            const resCode = await setActiveDb(entry.manifest.showPath);
            if (resCode === 200) addRecentFile(entry.manifest.showPath);
            return resCode;
        } finally {
            approvedRecoveryId = null;
        }
    });
    ipcMain.handle("working-copy:discard", (_, id: string) => {
        workingCopies.discard(id);
    });
}

/** Publishes and releases the open working copy; false if the person cancelled. */
function endWorkingCopy(reason: string): Promise<boolean> {
    return workingCopies.end(reason, () => DatabaseServices.closeDatabase());
}

/** Publishes the open show now (File ▸ Save Now, Ctrl/Cmd+S). */
export async function publishNow() {
    await workingCopies.current?.flush("shortcut");
}

/** Publishes the open show before an export reads it from disk or shares it. */
async function publishBeforeExport() {
    const outcome = await workingCopies.current?.flush("export");
    if (outcome && !outcome.ok)
        console.warn(
            "Exporting before the show could be saved:",
            outcome.state,
        );
}

/**
 * Whether `path` can open through a working copy: an existing timeline-era file this build
 * opens as it is. A page-era file converts in place first (the convert-on-open flow), and a
 * file this build refuses is refused by the usual open, which writes nothing.
 *
 * A leftover journal is played back here, after the usual backup, exactly as the usual open
 * would; when SQLite can't use it, the open stops with `LEFTOVER_JOURNAL_STATUS`.
 */
function checkWorkingCopyOpen(
    path: string,
): "working-copy" | "in-place" | number {
    if (!fs.existsSync(path)) return "in-place";
    if (hasLeftoverJournal(path)) {
        backupLeftoverJournal(path);
        let db: DatabaseSync | undefined;
        try {
            db = new DatabaseSync(path);
            db.prepare("SELECT count(*) FROM sqlite_master").get();
        } catch (error) {
            if (isFolderAccessError(error)) return LEFTOVER_JOURNAL_STATUS;
            return "in-place";
        } finally {
            db?.close();
        }
    }
    let version: number;
    let db: DatabaseSync | undefined;
    try {
        db = new DatabaseSync(path, { readOnly: true });
        version = readUserVersion(db);
    } catch {
        return "in-place";
    } finally {
        db?.close();
    }
    const { action } = decideFileVersion(version, false);
    if (action !== "accept" && action !== "downgrade") return "in-place";
    if (version === PAGE_MODEL_USER_VERSION) return "in-place";
    try {
        fs.accessSync(path, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
        return 403;
    }
    // Publishing renames a file into the show's folder: check that a new file can go there
    // (on macOS, access checks can pass for Documents or Downloads while writes fail).
    const probe = tempPathBeside(path);
    try {
        fs.writeFileSync(probe, "", { flag: "wx" });
    } catch (error) {
        console.error("Can't write beside the show:", withoutPaths(error));
        return 403;
    }
    void removeWithRetry(probe);
    return "working-copy";
}

/** Whether `path` is a page-era (version 7) show, which asks whether to convert it before it opens. */
function isPageEraFile(path: string): boolean {
    let db: DatabaseSync | undefined;
    try {
        db = new DatabaseSync(path, { readOnly: true });
        return readUserVersion(db) === PAGE_MODEL_USER_VERSION;
    } catch {
        return false;
    } finally {
        db?.close();
    }
}

/**
 * The open itself: through a working copy when working-copy saves are on (or to continue a
 * recovered one), otherwise in place. A new show is created in place, then reopened through a
 * working copy.
 */
async function openShowWithSaveMode(
    path: string,
    isNewFile: boolean,
    options: OpenShowOptions,
    recover?: RecoverableWorkingCopy,
): Promise<OpenShowResult> {
    // The caller (setActiveDbNow) has published and released the show that was open, unless
    // this file only asks whether to convert it first.
    const enabled =
        workingCopySavesEnabled(store.get(WORKING_COPY_SETTING)) &&
        !isNewShowDraftPath(path);
    if (!recover && !enabled) {
        // Temp files a working-copy publish or Save As Copy left beside it (a sync app held
        // them), now that it's edited in place.
        if (!isNewFile) void removeStaleTempFiles(path);
        return openShowDatabase(path, isNewFile, openShowDeps(), options);
    }

    if (isNewFile) {
        const created = await openShowDatabase(path, true, openShowDeps());
        created.db?.close();
        if (created.sqlSuspension !== undefined)
            DatabaseServices.resumeSqlProxy(created.sqlSuspension);
        DatabaseServices.closeDatabase();
        if (created.status !== 200) return created;
    }

    if (!recover) {
        const check = checkWorkingCopyOpen(path);
        if (typeof check === "number") return { status: check };
        if (check === "in-place") {
            void removeStaleTempFiles(path);
            return openShowDatabase(path, false, openShowDeps(), options);
        }
    }

    const showPath = recover?.manifest.showPath ?? resolve(path);
    let opened: WorkingCopyOpen<OpenShowResult>;
    try {
        opened = await workingCopies.open(showPath, {
            recover,
            migrate: async (workingPath) => {
                const result = await openShowDatabase(
                    workingPath,
                    false,
                    {
                        ...openShowDeps(),
                        // The backup is of the show, under its own name.
                        beforeMigrations: () =>
                            backupBeforeMigrations(showPath),
                        beforeJournalRecovery: undefined,
                    },
                    options,
                );
                result.db?.close();
                return { ...result, db: undefined };
            },
            connect: (session) =>
                DatabaseServices.connectToWorkingCopy({
                    showPath: session.showPath,
                    workingPath: session.workingPath,
                    onActivity: () => session.noteActivity(),
                }),
        });
    } catch (error) {
        // Only when OpenMarch's own folder can't hold a copy (full, read-only), and before a
        // session took over. Anything about the show itself, such as a sync app writing it while
        // it's copied, is reported as usual: editing it in place is what goes wrong in synced
        // folders. Edit in place, as before working-copy saves, rather than refuse the show.
        if (
            recover ||
            workingCopies.current ||
            !(error instanceof WorkingCopyStorageError)
        )
            throw error;
        console.error(
            "Couldn't open through a working copy, editing in place:",
            withoutPaths(error),
        );
        void removeStaleTempFiles(path);
        return openShowDatabase(path, false, openShowDeps(), options);
    }
    if (opened.session)
        workingCopyTelemetry.tempFilesFound(opened.staleTempFiles);
    if (opened.session)
        console.log(
            `Editing a show in ${whereIs(opened.session.showPath)} through a working copy in ${whereIs(opened.session.workingPath)}` +
                (opened.staleTempFiles
                    ? ` (removed ${opened.staleTempFiles} leftover temp files)`
                    : ""),
        );
    return opened.result;
}

/** The dependencies of `openShowDatabase` in the running app. */
const openShowDeps = (): OpenShowDeps => ({
    migrationsFolder: migrationsFolderPath(),
    beforeMigrations: backupBeforeMigrations,
    beforeJournalRecovery: backupLeftoverJournal,
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

// eslint-disable-next-line max-lines-per-function
async function setActiveDbNow(
    path: string,
    isNewFile: boolean,
    options: OpenShowOptions,
) {
    // This open supersedes any question about converting another file (Confirm already took
    // its file); a page-era file asks again below.
    conversionQuestion.forget();
    refusalAfterReload = null;
    leftoverJournalFile = null;
    const hadShowOpen = DatabaseServices.getDbPath() !== "";
    try {
        // Publish and release the open show first (ADR 0018); the person may cancel if that
        // fails. Then unpublished changes from an earlier session are offered before anything
        // opens, whichever way the show is being opened, including changes closing the open
        // show just left behind. A page-era file first asks whether to convert it, over the
        // open show, as with working-copy saves off: only Confirm closes the open show.
        const closeConnections = () => DatabaseServices.closeDatabase();
        const recover = isNewFile
            ? (await endWorkingCopy("switch"))
                ? null
                : "cancel"
            : await workingCopies.prepareOpen(path, {
                  closeConnections,
                  keepCurrentOpen:
                      !options.conversionConfirmed && isPageEraFile(path),
              });
        if (recover === "cancel") return OPEN_STOPPED_STATUS;

        // The 3D View shows one show; a confirmed conversion is about to replace it.
        if (options.conversionConfirmed) closeView3dWindow();

        const result = await openShowWithSaveMode(
            path,
            isNewFile,
            options,
            recover ?? undefined,
        );
        result.db?.close();
        const token = result.sqlSuspension;
        // The renderer offers to open it without the journal (`load-file:recoverFromJournal`).
        if (result.status === LEFTOVER_JOURNAL_STATUS) {
            leftoverJournalFile = path;
            reportLeftoverJournal(path);
        }

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
                    `Error loading database file [code=${result.status}] [in ${whereIs(path)}]`,
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
        DatabaseServices.closeDatabase();
        dialog.showErrorBox(
            t("fileDialog.openFailed.title"),
            (error as Error).message,
        );
        win?.webContents.reload();
        throw error;
    }
}
