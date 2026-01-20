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
import { join } from "node:path";
import * as DatabaseServices from "../database/database.services";
import { applicationMenu } from "./application-menu";
import { PDFExportService } from "./services/export-service";
import {
    addRecentFile,
    getRecentFiles,
    removeRecentFile,
    clearRecentFiles,
    updateRecentFileSvgPreview,
} from "./services/recent-files-service";
import AudioFile from "../../src/global/classes/AudioFile";
import { init, captureException } from "@sentry/electron/main";

import { DrizzleMigrationService } from "../database/services/DrizzleMigrationService";
import { getOrm } from "../database/db";
import { getAutoUpdater } from "./update";
import { repairDatabase } from "../database/repair";

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

void app.whenReady().then(async () => {
    app.setName("OpenMarch");
    console.log("NODE:", process.versions.node);

    if (isCodegen) {
        console.log("🎭 Running in Playwright Codegen mode");
    } else {
        console.log("Not running in codegen mode");
    }

    Menu.setApplicationMenu(applicationMenu);

    let pathToOpen = store.get("databasePath") as string;
    if (process.argv.length >= 2 && process.argv[1].endsWith(".dots")) {
        pathToOpen = process.argv[1];
    } else if (process.argv.length >= 3 && process.argv[2].endsWith(".dots")) {
        pathToOpen = process.argv[2];
    }
    console.log("Path to Open:", pathToOpen);
    if (pathToOpen && pathToOpen.length > 0) await setActiveDb(pathToOpen);
    DatabaseServices.initHandlers();

    // Database handlers
    console.log("db_path: " + DatabaseServices.getDbPath());

    // File IO handlers
    ipcMain.handle("database:isReady", DatabaseServices.databaseIsReady);
    ipcMain.handle("database:getPath", () => {
        return DatabaseServices.getDbPath();
    });
    ipcMain.handle("database:save", async () => saveFile());
    ipcMain.handle("database:load", async () => loadDatabaseFile());
    ipcMain.handle("database:create", async () => newFile());
    ipcMain.handle("database:createAtPath", async (_, filePath: string) =>
        createFileAtPath(filePath),
    );
    ipcMain.handle("database:createForWizard", async (_, filePath: string) =>
        createFileForWizard(filePath),
    );
    ipcMain.handle(
        "dialog:showSaveDialog",
        async (_, options: Electron.SaveDialogOptions) => {
            if (!win) return { canceled: true, filePath: undefined };
            return await dialog.showSaveDialog(win, options);
        },
    );
    ipcMain.handle("getDefaultDocumentsPath", () => {
        return app.getPath("documents");
    });
    ipcMain.handle("file:exists", (_, filePath: string) => {
        if (!filePath) return false;
        // Ensure .dots extension
        const pathToCheck = filePath.endsWith(".dots")
            ? filePath
            : `${filePath}.dots`;
        return fs.existsSync(pathToCheck);
    });
    ipcMain.handle("database:repair", async (_, dbPath: string) => {
        try {
            const newPath = await repairDatabase(dbPath);
            // Set the new database path and reload the window
            await setActiveDb(newPath);
            return newPath;
        } catch (error) {
            console.error("Error repairing database:", error);
            throw error;
        }
    });
    ipcMain.handle("audio:insert", async () => insertAudioFile());

    // Wizard flag handlers
    ipcMain.handle("wizard:shouldShow", () => {
        const shouldShow = store.get("showSetupWizard", false) as boolean;
        if (shouldShow) {
            // Clear the flag after reading it
            store.delete("showSetupWizard");
        }
        return shouldShow;
    });

    // Recent files handlers
    ipcMain.handle("recent-files:get", getRecentFiles);
    ipcMain.handle("recent-files:remove", (_, filePath) =>
        removeRecentFile(filePath),
    );
    ipcMain.handle("recent-files:clear", clearRecentFiles);
    ipcMain.handle("recent-files:open", async (_, filePath) => {
        if (!filePath || !fs.existsSync(filePath)) return -1;

        DatabaseServices.setDbPath(filePath);
        store.set("databasePath", filePath);
        addRecentFile(filePath);

        await setActiveDb(filePath);
        return 200;
    });

    // Getters
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

app.on("second-instance", () => {
    if (win) {
        // Focus on the main window if the user tried to open another
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

app.on("second-instance", () => {
    if (win) {
        // Focus on the main window if the user tried to open another
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});

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

    // Ensure .dots extension
    if (!filePath.endsWith(".dots")) {
        filePath = `${filePath}.dots`;
    }

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    await setActiveDb(filePath, true);

    // Add to recent files
    addRecentFile(filePath);

    return 200;
}

/**
 * Creates a database file for the wizard without reloading the window.
 * This allows database operations during the wizard while keeping the canvas from rendering.
 *
 * @param filePath The path where the file should be created
 * @returns 200 for success, -1 for failure
 */
async function createFileForWizard(filePath: string) {
    console.log("createFileForWizard:", filePath);

    if (!filePath) return -1;

    if (!win) return -1;

    let db: ReturnType<typeof DatabaseServices.connect> | undefined;
    try {
        // Ensure .dots extension
        if (!filePath.endsWith(".dots")) {
            filePath = `${filePath}.dots`;
        }

        // Delete existing file if it exists
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Set the database path and create the file without reloading
        DatabaseServices.setDbPath(filePath, true);
        store.set("databasePath", filePath);
        win?.setTitle("OpenMarch - " + filePath);

        // Connect to database and run migrations
        db = DatabaseServices.connect();
        if (!db) {
            console.error("Error connecting to database");
            return -1;
        }

        const drizzleDb = getOrm(db);
        const migrator = new DrizzleMigrationService(drizzleDb, db);

        // Set user version for new file
        db.pragma(`user_version = ${DB_USER_VERSION}`);

        // Apply migrations
        await migrator.applyPendingMigrations(
            join(app.getAppPath(), "electron", "database", "migrations"),
        );

        // Initialize database (create default data)
        await migrator.initializeDatabase(drizzleDb);

        // Add to recent files
        addRecentFile(filePath);

        return 200;
    } catch (error) {
        captureException(error);
        store.delete("databasePath"); // Reset database path
        DatabaseServices.setDbPath("", false);
        console.error("Error creating database for wizard:", error);
        return -1;
    } finally {
        // Ensure database connection is closed to avoid locking the SQLite file
        db?.close();
    }
}

/**
 * Creates a new database file path to connect to.
 *
 * @returns 200 for success, -1 for failure
 */
async function newFile() {
    console.log("newFile");

    if (!win) return -1;

    // Close the current file first (if one is open)
    try {
        const svgResult = await requestSvgBeforeClose(win);
        const currentDbPath = DatabaseServices.getDbPath();
        if (currentDbPath) {
            updateRecentFileSvgPreview(currentDbPath, svgResult);
        }
    } catch (error) {
        console.error("Error getting SVG on close:", error);
    }

    // Close the current file
    DatabaseServices.setDbPath("", false);
    store.set("databasePath", "");

    // Set flag to show wizard after reload (file will be created in wizard)
    store.set("showSetupWizard", true);

    win?.webContents.reload();

    return 200;
}

// Database (main file)

/**
 * Opens a dialog to create a new database file path to connect to with the data of the current database.
 * I.e. Save As..
 * OpenMarch automatically saves changes to the database, so this is not a save function.
 *
 * @returns 200 for success, -1 for failure
 */
async function saveFile() {
    console.log("saveFile");

    if (!win) return -1;

    const db = DatabaseServices.connect();

    // Save
    dialog
        .showSaveDialog(win, {
            buttonLabel: "Save Copy",
            filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
        })
        .then(async (path) => {
            if (path.canceled || !path.filePath) return -1;

            const serializedDb = db.serialize();
            const uint8Array = Uint8Array.from(serializedDb);

            fs.writeFileSync(path.filePath, uint8Array);

            await setActiveDb(path.filePath);
            return 200;
        })
        .catch((err) => {
            console.log(err);
            return -1;
        });
}

/**
 * Opens a dialog to load a database file path to connect to.
 *
 * @returns 200 for success, -1 for failure
 */
async function loadDatabaseFile() {
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
            // If the user cancels the dialog, and there is no previous path, return -1
            // if (path.canceled || !path.filePaths[0]) return -1;

            DatabaseServices.setDbPath(path.filePaths[0]);
            store.set("databasePath", path.filePaths[0]); // Save the path for next time

            // Add to recent files
            addRecentFile(path.filePaths[0]);

            await setActiveDb(path.filePaths[0]);
            return 200;
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
async function closeCurrentFile(isAppQuitting = false) {
    console.log("closeCurrentFile called. isAppQuitting:", isAppQuitting);
    // console.trace();

    if (!win) return -1;

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

/**
 * Opens a dialog to import an audio file to the database.
 *
 * @returns 200 for success, -1 for failure (TODO, this function's return value is always error)
 */
async function insertAudioFile(): Promise<
    DatabaseServices.LegacyDatabaseResponse<AudioFile[]>
> {
    console.log("insertAudioFile");

    if (!win)
        return {
            success: false,
            error: { message: "insertAudioFile: window not loaded" },
        };

    // Check if database is ready before proceeding
    const dbReady = DatabaseServices.databaseIsReady();
    if (!dbReady) {
        console.error("insertAudioFile: Database is not ready");
        return {
            success: false,
            error: {
                message:
                    "Database is not ready. Please ensure a database file is open or complete the wizard setup first.",
            },
        };
    }

    try {
        // Open file dialog
        const path = await dialog.showOpenDialog(win, {
            filters: [
                {
                    name: "Audio File (.mp3, .wav, .ogg)",
                    extensions: ["mp3", "wav", "ogg"],
                },
                { name: "All Files", extensions: ["*"] },
            ],
        });

        if (path.canceled || !path.filePaths[0]) {
            return {
                success: false,
                error: {
                    message:
                        "insertAudioFile: Operation was cancelled or no audio file was provided",
                },
            };
        }

        console.log("loading audio file into buffer:", path.filePaths[0]);

        // Read file asynchronously and wait for completion
        const data = await new Promise<Buffer>((resolve, reject) => {
            fs.readFile(path.filePaths[0], (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });

        // Double-check database is still ready before inserting
        const dbStillReady = DatabaseServices.databaseIsReady();
        if (!dbStillReady) {
            console.error(
                "insertAudioFile: Database became unavailable during upload",
            );
            return {
                success: false,
                error: {
                    message:
                        "Database became unavailable. Please try again after ensuring the database file is ready.",
                },
            };
        }

        // Insert audio file into database
        const databaseResponse = await DatabaseServices.insertAudioFile({
            id: -1,
            data: Buffer.from(
                data.buffer.slice(
                    data.byteOffset,
                    data.byteOffset + data.byteLength,
                ),
            ) as any as ArrayBuffer,
            path: path.filePaths[0],
            nickname: path.filePaths[0],
            selected: true,
        });

        // Verify the insert was successful
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

        // Don't reload - let the frontend handle refreshing via React Query/invalidation
        // The RegisteredActionsHandler will refresh the audio files after insertion

        return databaseResponse;
    } catch (err) {
        console.error("Error inserting audio file:", err);
        return {
            success: false,
            error: {
                message: err instanceof Error ? err.message : String(err),
            },
        };
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

        if (!fs.existsSync(path) && !isNewFile) {
            store.delete("databasePath");
            console.error("Database file does not exist:", path);
            return;
        }
        DatabaseServices.setDbPath(path, isNewFile);
        win?.setTitle("OpenMarch - " + path);

        const db = DatabaseServices.connect();
        if (!db) {
            console.error("Error connecting to database");
            return;
        }

        const drizzleDb = getOrm(db);
        const migrator = new DrizzleMigrationService(drizzleDb, db);

        // If this isn't a new file, create backups before applying migrations
        if (!isNewFile) {
            console.log(
                "Checking database version to see if migration is needed",
            );
            if (migrator.hasPendingMigrations()) {
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
            db.pragma(`user_version = ${DB_USER_VERSION}`);
        }
        await migrator.applyPendingMigrations(
            join(app.getAppPath(), "electron", "database", "migrations"),
        );

        if (isNewFile) {
            await DrizzleMigrationService.initializeDatabase(drizzleDb, db);
        }

        store.set("databasePath", path); // Save current db path
        win?.webContents.reload();
    } catch (error) {
        captureException(error);
        store.delete("databasePath"); // Reset database path
        DatabaseServices.setDbPath("", false);
        dialog.showErrorBox("Error Loading Database", (error as Error).message);
        win?.webContents.reload();
        throw error;
    }
}

// Export main-process APIs used by other modules
export { loadDatabaseFile, newFile, saveFile, closeCurrentFile };
