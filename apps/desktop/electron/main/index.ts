/* eslint-disable no-console */
import {
    app,
    BrowserWindow,
    shell,
    ipcMain,
    Menu,
    dialog,
    MenuItemConstructorOptions,
} from "electron";
import Store from "electron-store";
import * as fs from "fs";
import { release } from "node:os";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve, sep } from "node:path";
import * as DatabaseServices from "../database/database.services";
import { applicationMenu } from "./application-menu";
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
import AudioFile from "../../src/global/classes/AudioFile";
import { init, captureException } from "@sentry/electron/main";

import { DrizzleMigrationService } from "../database/services/DrizzleMigrationService";
import { getOrm } from "../database/db";
import { getAutoUpdater } from "./update";
import { repairDatabase } from "../database/repair";
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
const DB_USER_VERSION = 7;

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

const enableSentry =
    process.env.NODE_ENV !== "development" && !store.get("optOutAnalytics");
console.log("Sentry error reporting enabled:", enableSentry);
init({
    dsn: "https://72e6204c8e527c4cb7a680db2f9a1e0b@o4509010215239680.ingest.us.sentry.io/4509010222579712",
    enabled: enableSentry,
});

ipcMain.on("settings:set", (_, settings) => {
    for (const [key, value] of Object.entries(settings)) {
        store.set(key, value);
    }
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
if (release().startsWith("6.1")) app.disableHardwareAcceleration();

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
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = join(process.env.DIST, "index.html");
// eslint-disable-next-line max-lines-per-function
async function createWindow(title?: string) {
    win = new BrowserWindow({
        title: title || "OpenMarch",
        icon: join(process.env.VITE_PUBLIC, "favicon.ico"),
        minWidth: 1000,
        minHeight: 600,
        autoHideMenuBar: true,
        // Show frame in codegen mode for easier interaction
        frame: isCodegen,
        trafficLightPosition: { x: 24, y: 9 },
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
            void discardNewShowDraft();
        },
    );

    win.on("close", async (event: Electron.Event) => {
        if (isQuitting) return;

        event.preventDefault();
        win!.hide(); // use non-null assertion now that we're inside the if-block

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
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https:")) void shell.openExternal(url);
        return { action: "deny" };
    });

    // Context menu with spellcheck suggestions and basic edit actions
    win.webContents.on("context-menu", (event, params) => {
        const template: MenuItemConstructorOptions[] = [];

        if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
            template.push(
                ...params.dictionarySuggestions.map((suggestion) => ({
                    label: suggestion,
                    click: () => {
                        win?.webContents.replaceMisspelling(suggestion);
                    },
                })),
                { type: "separator" },
            );
        }

        if (params.isEditable) {
            template.push(
                { role: "undo" },
                { role: "redo" },
                { type: "separator" },
                { role: "cut" },
                { role: "copy" },
                { role: "paste" },
                { type: "separator" },
                { role: "selectAll" },
            );
        } else if (params.selectionText && params.selectionText.trim()) {
            template.push({ role: "copy" }, { role: "selectAll" });
        }

        if (!template.length) return;

        const menu = Menu.buildFromTemplate(template);
        menu.popup({ window: win! });
    });

    // Apply electron-updater
    const autoUpdater = getAutoUpdater();
    await autoUpdater.checkForUpdatesAndNotify();
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

async function openRecentFile(filePath: string) {
    store.set("databasePath", filePath);
    addRecentFile(filePath);

    const resCode = await setActiveDb(filePath);

    win?.webContents.send("load-file-response", resCode);

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
    ipcMain.handle("newShow:discardDraft", async () => discardNewShowDraft());
    ipcMain.handle("newShow:getDraftPath", () => currentNewShowDraftPath);
    ipcMain.handle("database:repair", async (_, dbPath: string) => {
        try {
            const newPath = await repairDatabase(dbPath);
            await setActiveDb(newPath);
            return newPath;
        } catch (error) {
            console.error("Error repairing database:", error);
            throw error;
        }
    });
    ipcMain.handle("audio:insert", async () => insertAudioFile());
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

    Menu.setApplicationMenu(applicationMenu);

    const pathToOpen = resolveStartupDatabasePath();
    if (pathToOpen.length > 0) await setActiveDb(pathToOpen);
    DatabaseServices.initHandlers();

    console.log("db_path: " + DatabaseServices.getDbPath());

    initIpcHandlers();
    initGetters();

    await createWindow("OpenMarch - " + store.get("databasePath"));
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

app.on("window-all-closed", async () => {
    win = null;
    if (process.platform !== "darwin") app.quit();
});

app.on("open-file", async (event, path) => {
    event.preventDefault();
    await setActiveDb(path);
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

const isMacOS = process.platform === "darwin";

ipcMain.on("window:minimize", () => {
    win?.minimize();
});

ipcMain.on("window:maximize", () => {
    if (win?.isMaximized()) {
        win.unmaximize();
    } else {
        win?.maximize();
    }
});

ipcMain.on("window:close", () => {
    void closeCurrentFile();
    win?.close();
});

ipcMain.on(`menu:open`, () => {
    if (!isMacOS) {
        applicationMenu.popup();
    }
});

// Theme stores

ipcMain.handle("get-theme", () => {
    return store.get("theme", "light");
});

ipcMain.handle("set-theme", (event, theme) => {
    store.set("theme", theme);
});

// Language stores

ipcMain.handle("get-language", () => {
    return store.get("language", "en");
});

ipcMain.handle("set-language", (event, language) => {
    store.set("language", language);
});

// file management

ipcMain.handle("closeCurrentFile", () => {
    void closeCurrentFile();
});

// Plugins
ipcMain.handle("plugins:list", async () => {
    const pluginsDir = join(app.getPath("userData"), "plugins");
    if (!fs.existsSync(pluginsDir)) return [];
    return fs
        .readdirSync(pluginsDir)
        .filter((file) => file.endsWith(".om.js"))
        .map((file) => join(pluginsDir, file));
});

ipcMain.handle("plugins:get", async (_, pluginPath) => {
    return fs.readFileSync(pluginPath, "utf-8");
});

ipcMain.handle("plugins:install", async (_, pluginUrl) => {
    const pluginsDir = join(app.getPath("userData"), "plugins");
    if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir);
    }
    let response;

    try {
        response = await fetch(pluginUrl);
        if (!response.ok) {
            return false;
        }
    } catch (e) {
        console.error(e);
        return false;
    }

    const pluginCode = await response.text();
    const pluginName = pluginUrl.split("/").pop();
    const pluginPath = join(pluginsDir, pluginName);

    fs.writeFileSync(pluginPath, pluginCode, "utf-8");
    return true;
});

ipcMain.handle("plugins:uninstall", async (_, fileName) => {
    const pluginsDir = join(app.getPath("userData"), "plugins");
    if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir);
    }

    try {
        fs.rmSync(join(pluginsDir, fileName));
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
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
    if (allWindows.length) {
        allWindows[0].focus();
    } else {
        void createWindow();
    }
});

// New window example arg: new windows url
ipcMain.handle("open-win", (_, arg) => {
    const childWindow = new BrowserWindow({
        webPreferences: {
            preload,
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        void childWindow.loadURL(`${url}#${arg}`);
    } else {
        void childWindow.loadFile(indexHtml, { hash: arg });
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

    let db: ReturnType<typeof DatabaseServices.connect> | undefined;
    try {
        const resCode = DatabaseServices.setDbPath(filePath, isNewFile);
        if (resCode !== 200) {
            return resCode;
        }

        store.set("databasePath", filePath);
        win.setTitle("OpenMarch - " + filePath);

        db = DatabaseServices.connect();
        if (!db) {
            console.error("Error connecting to database");
            return -1;
        }

        const drizzleDb = getOrm(db);
        const migrator = new DrizzleMigrationService(drizzleDb, db);
        const migrationsFolder = join(
            app.getAppPath(),
            "electron",
            "database",
            "migrations",
        );

        db.prepare(`PRAGMA user_version = ${DB_USER_VERSION}`).run();
        await migrator.applyPendingMigrations(migrationsFolder);
        await DrizzleMigrationService.initializeDatabase(drizzleDb, db);

        return 200;
    } catch (error) {
        captureException(error);
        store.delete("databasePath");
        DatabaseServices.setDbPath("", false);
        console.error("Error opening database without reload:", error);
        return -1;
    } finally {
        db?.close();
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

/**
 * Moves the draft file to the user's chosen path and reloads into the editor.
 */
export async function finalizeNewShowDraft(
    targetPath: string,
    projectName?: string,
): Promise<number> {
    if (!currentNewShowDraftPath || !win) return -1;

    const draftPath = currentNewShowDraftPath;
    const finalPath = projectName
        ? resolveFinalizeTargetPath(projectName, targetPath)
        : targetPath.endsWith(".dots")
          ? targetPath
          : `${targetPath}.dots`;

    const finalDir = dirname(finalPath);
    if (!fs.existsSync(finalDir)) {
        fs.mkdirSync(finalDir, { recursive: true });
    }

    try {
        DatabaseServices.connect()?.close();
    } catch {
        // ignore close errors
    }

    if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
    }

    fs.renameSync(draftPath, finalPath);
    currentNewShowDraftPath = null;

    await setActiveDb(finalPath, false);
    addRecentFile(finalPath);

    return 200;
}

/**
 * Deletes the draft file and clears the DB connection without reloading.
 */
export async function discardNewShowDraft(): Promise<number> {
    const draftPath = currentNewShowDraftPath;
    currentNewShowDraftPath = null;

    if (!draftPath) {
        return 200;
    }

    try {
        DatabaseServices.connect()?.close();
    } catch {
        // ignore
    }

    DatabaseServices.setDbPath("", false);

    const storedPath = store.get("databasePath") as string | undefined;
    if (storedPath === draftPath) {
        store.delete("databasePath");
    }

    if (fs.existsSync(draftPath)) {
        fs.unlinkSync(draftPath);
    }

    return 200;
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
            buttonLabel: "Create New",
            filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
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
            buttonLabel: "Save Copy",
            filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
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
            filters: [
                { name: "OpenMarch File", extensions: ["dots"] },
                { name: "All Files", extensions: ["*"] },
            ],
        })
        .then(async (path) => {
            if (path.canceled) return -1;

            store.set("databasePath", path.filePaths[0]); // Save the path for next time
            // Add to recent files
            addRecentFile(path.filePaths[0]);

            const resCode = await setActiveDb(path.filePaths[0]);

            // Handle alert dialogs in frontend
            win?.webContents.send("load-file-response", resCode);

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
export async function closeCurrentFile(isAppQuitting = false) {
    console.log("closeCurrentFile called. isAppQuitting:", isAppQuitting);
    // console.trace();

    if (!win) return -1;

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
    store.set("databasePath", "");

    // Only reload if we're NOT quitting the app
    if (!isAppQuitting) {
        win.webContents.reload();
    }

    return 200;
}

// Audio files

const AUDIO_FILE_DIALOG_FILTERS: Electron.FileFilter[] = [
    {
        name: "Audio File",
        extensions: ["mp3", "wav", "ogg", "m4a", "aac", "webm"],
    },
    { name: "All Files", extensions: ["*"] },
];

function audioInsertError(
    message: string,
): DatabaseServices.LegacyDatabaseResponse<AudioFile[]> {
    return { success: false, error: { message } };
}

async function pickAudioFilePath(): Promise<string | null> {
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
        filters: AUDIO_FILE_DIALOG_FILTERS,
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
    return Buffer.from(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    ) as any as ArrayBuffer;
}

/**
 * Opens a dialog to import an audio file to the database.
 *
 * @returns 200 for success, -1 for failure (TODO, this function's return value is always error)
 */
export async function insertAudioFile(): Promise<
    DatabaseServices.LegacyDatabaseResponse<AudioFile[]>
> {
    console.log("insertAudioFile");

    if (!win) return audioInsertError("insertAudioFile: window not loaded");

    if (!DatabaseServices.databaseIsReady()) {
        console.error("insertAudioFile: Database is not ready");
        return audioInsertError(
            "No file is open. Create or open a show first.",
        );
    }

    try {
        const filePath = await pickAudioFilePath();
        if (!filePath) {
            return audioInsertError(
                "insertAudioFile: Operation was cancelled or no audio file was provided",
            );
        }

        console.log("loading audio file into buffer:", filePath);
        const data = await readAudioFileBuffer(filePath);

        if (!DatabaseServices.databaseIsReady()) {
            console.error(
                "insertAudioFile: Database became unavailable during upload",
            );
            return audioInsertError(
                "Database became unavailable. Please try again after ensuring the database file is ready.",
            );
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

/**
 * Sets the active database path and reloads the window.
 *
 * @param path path to the database file
 * @param isNewFile True if this is a new file, false if it is an existing file
 */
async function setActiveDb(path: string, isNewFile = false) {
    try {
        // Get the current path from the store if the path is "."
        // I.e. last opened file
        if (path === ".") path = store.get("databasePath") as string;

        const resCode = DatabaseServices.setDbPath(path, isNewFile);

        if (resCode !== 200) {
            store.delete("databasePath");
            console.error(
                `Error loading database file [code=${resCode}] [path=${path}]`,
            );
            return resCode;
        }

        win?.setTitle("OpenMarch - " + path);

        const db = DatabaseServices.connect();
        if (!db) {
            console.error("Error connecting to database");
            return 500;
        }

        const drizzleDb = getOrm(db);
        const migrator = new DrizzleMigrationService(drizzleDb, db);

        const migrationsFolder = join(
            app.getAppPath(),
            "electron",
            "database",
            "migrations",
        );

        // If this isn't a new file, create backups before applying migrations
        if (!isNewFile) {
            console.log(
                "Checking database version to see if migration is needed",
            );
            if (migrator.hasPendingMigrations(migrationsFolder)) {
                const backupDir = join(app.getPath("userData"), "backups");
                if (!fs.existsSync(backupDir)) {
                    fs.mkdirSync(backupDir);
                }
                const timestamp = new Date()
                    .toISOString()
                    .replace(/[:.]/g, "-");
                const originalName = path.split(/[\\/]/).pop();
                const backupPath = join(
                    backupDir,
                    `backup_${timestamp}_${originalName}`,
                );
                console.log("Creating backup of database in " + backupPath);
                fs.copyFileSync(path, backupPath);

                console.log("Deleting backups older than 30 days");
                // Delete backups older than 30 days
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
        } else {
            db.prepare(`PRAGMA user_version = ${DB_USER_VERSION}`).run();
        }
        await migrator.applyPendingMigrations(migrationsFolder);

        if (isNewFile) {
            await DrizzleMigrationService.initializeDatabase(drizzleDb, db);
        }

        store.set("databasePath", path); // Save current db path
        win?.webContents.reload();

        return resCode;
    } catch (error) {
        captureException(error);
        store.delete("databasePath"); // Reset database path
        DatabaseServices.setDbPath("", false);
        dialog.showErrorBox("Error Loading Database", (error as Error).message);
        win?.webContents.reload();
        throw error;
    }
}
