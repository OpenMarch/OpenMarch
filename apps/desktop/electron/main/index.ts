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
    clearMissingRecentFiles,
} from "./services/recent-files-service";
import AudioFile from "../../src/global/classes/AudioFile";
import { init, captureException } from "@sentry/electron/main";

import { DrizzleMigrationService } from "../database/services/DrizzleMigrationService";
import { getOrm } from "../database/db";
import { getAutoUpdater } from "./update";
import { repairDatabase } from "../database/repair";
import Database from "libsql";

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
    ipcMain.handle("file:pickSourceFile", async () => pickSourceFile());
    ipcMain.handle(
        "database:createFromLastPage",
        async (_, sourceFilePath?: string) =>
            newFileFromLastPage(sourceFilePath),
    );

    // Recent files handlers
    ipcMain.handle("recent-files:get", getRecentFiles);
    ipcMain.handle("recent-files:remove", (_, filePath) =>
        removeRecentFile(filePath),
    );
    ipcMain.handle("recent-files:clear", clearRecentFiles);
    ipcMain.handle("recent-files:clear-missing", clearMissingRecentFiles);
    ipcMain.handle("recent-files:open", async (_, filePath) => {
        store.set("databasePath", filePath);
        addRecentFile(filePath);

        const resCode = await setActiveDb(filePath);

        // Handle alert dialogs in frontend
        win?.webContents.send("load-file-response", resCode);

        return resCode;
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
 * Creates a new database file path to connect to.
 *
 * @returns 200 for success, -1 for failure
 */
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
        // Get path to new file via dialog
        const dialogResult = await dialog.showSaveDialog(win, {
            buttonLabel: "Create New",
            filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
        });
        if (dialogResult.canceled || !dialogResult.filePath) return;
        filePath = dialogResult.filePath;
    }

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    await setActiveDb(filePath, true);

    // Add to recent files
    addRecentFile(filePath);
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

/**
 * Opens a file dialog to select a source .dots file and returns only the path.
 *
 * @returns The selected file path, or null if canceled
 */
export async function pickSourceFile(): Promise<string | null> {
    if (!win) return null;

    const dialogResult = await dialog.showOpenDialog(win, {
        filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
        properties: ["openFile"],
    });

    if (dialogResult.canceled || !dialogResult.filePaths.length) return null;
    return dialogResult.filePaths[0];
}

type SourceMarcherRow = {
    drill_prefix: string;
    drill_order: number;
    section: string;
    name: string | null;
    year: string | null;
    notes: string | null;
};
type SourcePositionRow = {
    drill_prefix: string;
    drill_order: number;
    x: number;
    y: number;
};

/** Converts a 1-indexed count to a base-26 letter (1→A, 2→B, …, 26→Z, 27→AA). */
function numberToSubsetLetter(n: number): string {
    if (n <= 0) return "";
    let result = "";
    let remaining = n;
    while (remaining > 0) {
        remaining--;
        result = String.fromCharCode(65 + (remaining % 26)) + result;
        remaining = Math.floor(remaining / 26);
    }
    return result;
}

/** Reads marchers, last-page positions, and the last page's set number + subset letter from a source .dots file. */
function readSourceFileData(source: string): {
    marchersData: SourceMarcherRow[];
    positions: SourcePositionRow[];
    lastPageSetNumber: number;
    lastPageSubsetLetter: string;
} {
    const sourceDb = new Database(source, { readonly: true });
    try {
        const marchersData = sourceDb
            .prepare(
                `SELECT drill_prefix, drill_order, section, name, year, notes
                 FROM marchers`,
            )
            .all() as SourceMarcherRow[];

        const lastPage = sourceDb
            .prepare(
                `SELECT p.id FROM pages p
                 JOIN beats b ON p.start_beat = b.id
                 ORDER BY b.position DESC LIMIT 1`,
            )
            .get() as { id: number } | undefined;

        const positions = lastPage
            ? (sourceDb
                  .prepare(
                      `SELECT mp.x, mp.y, m.drill_prefix, m.drill_order
                       FROM marcher_pages mp
                       JOIN marchers m ON mp.marcher_id = m.id
                       WHERE mp.page_id = ?`,
                  )
                  .all(lastPage.id) as SourcePositionRow[])
            : [];

        // Derive the last page's set number and subset letter
        const settingsRow = sourceDb
            .prepare(`SELECT json_data FROM workspace_settings WHERE id = 1`)
            .get() as { json_data: string } | undefined;
        const sourceOffset = settingsRow
            ? (JSON.parse(settingsRow.json_data).pageNumberOffset ?? 0)
            : 0;
        const nonSubsetCount = (
            sourceDb
                .prepare(
                    `SELECT COUNT(*) as cnt FROM pages WHERE id != 0 AND is_subset = 0`,
                )
                .get() as { cnt: number }
        ).cnt;
        const lastPageSetNumber = sourceOffset + nonSubsetCount;

        // Count consecutive trailing subset pages to derive the subset letter
        const orderedSubsets = sourceDb
            .prepare(
                `SELECT p.is_subset FROM pages p
                 JOIN beats b ON p.start_beat = b.id
                 ORDER BY b.position ASC`,
            )
            .all() as { is_subset: number }[];
        let trailingSubsets = 0;
        for (let i = orderedSubsets.length - 1; i >= 0; i--) {
            if (orderedSubsets[i].is_subset) trailingSubsets++;
            else break;
        }
        const lastPageSubsetLetter = numberToSubsetLetter(trailingSubsets);

        return {
            marchersData,
            positions,
            lastPageSetNumber,
            lastPageSubsetLetter,
        };
    } finally {
        sourceDb.close();
    }
}

/**
 * Copies field properties, workspace settings, utility, section appearances,
 * tags, tag appearances, and marcher–tag links from the source file into the
 * newly created file. Workspace settings are overlaid with the derived page
 * number offset and subset letter.
 */
function copySourceSettings(
    sourcePath: string,
    newFilePath: string,
    lastPageSetNumber: number,
    lastPageSubsetLetter: string,
) {
    const newDb = new Database(newFilePath);
    try {
        newDb.prepare("PRAGMA foreign_keys = OFF").run();
        newDb.prepare(`ATTACH DATABASE ? AS source`).run(sourcePath);

        // field_properties (single-row)
        newDb
            .prepare(
                `UPDATE field_properties
             SET json_data = (SELECT json_data FROM source.field_properties WHERE id = 1),
                 image = (SELECT image FROM source.field_properties WHERE id = 1)
             WHERE id = 1`,
            )
            .run();

        // workspace_settings — copy from source then overlay page offsets
        const sourceSettings = newDb
            .prepare(
                `SELECT json_data FROM source.workspace_settings WHERE id = 1`,
            )
            .get() as { json_data: string } | undefined;
        if (sourceSettings) {
            const settings = JSON.parse(sourceSettings.json_data);
            settings.pageNumberOffset = lastPageSetNumber;
            settings.pageStartingSubsetLetter = lastPageSubsetLetter;
            newDb
                .prepare(
                    `UPDATE workspace_settings SET json_data = ? WHERE id = 1`,
                )
                .run(JSON.stringify(settings));
        }

        // utility (single-row)
        newDb
            .prepare(
                `UPDATE utility
             SET last_page_counts = (SELECT last_page_counts FROM source.utility WHERE id = 0),
                 default_beat_duration = (SELECT default_beat_duration FROM source.utility WHERE id = 0)
             WHERE id = 0`,
            )
            .run();

        // section_appearances
        newDb.prepare(`DELETE FROM section_appearances`).run();
        newDb
            .prepare(
                `INSERT INTO section_appearances
                (section, fill_color, outline_color, shape_type, visible, label_visible, equipment_name, equipment_state)
             SELECT section, fill_color, outline_color, shape_type, visible, label_visible, equipment_name, equipment_state
             FROM source.section_appearances`,
            )
            .run();

        // tags (preserve IDs so tag_appearances and marcher_tags can reference them)
        newDb
            .prepare(
                `INSERT OR IGNORE INTO tags (id, name, description, icon, color_hex)
             SELECT id, name, description, icon, color_hex
             FROM source.tags`,
            )
            .run();

        // tag_appearances — set start_page_id = 0 for all
        newDb
            .prepare(
                `INSERT INTO tag_appearances
                (tag_id, start_page_id, priority, fill_color, outline_color, shape_type, visible, label_visible, equipment_name, equipment_state)
             SELECT tag_id, 0, priority, fill_color, outline_color, shape_type, visible, label_visible, equipment_name, equipment_state
             FROM source.tag_appearances`,
            )
            .run();

        // marcher_tags — map marcher_id via drill_prefix + drill_order
        newDb
            .prepare(
                `INSERT INTO marcher_tags (marcher_id, tag_id)
             SELECT m.id, smt.tag_id
             FROM source.marcher_tags smt
             JOIN source.marchers sm ON smt.marcher_id = sm.id
             JOIN marchers m ON m.drill_prefix = sm.drill_prefix AND m.drill_order = sm.drill_order`,
            )
            .run();

        newDb.prepare(`DETACH DATABASE source`).run();
        newDb.prepare("PRAGMA foreign_keys = ON").run();
    } finally {
        newDb.close();
    }
}

/** Inserts marchers and their page-0 positions into the newly created db. */
function seedNewFileWithMarchers(
    filePath: string,
    marchersData: SourceMarcherRow[],
    positions: SourcePositionRow[],
) {
    const newDb = new Database(filePath);
    try {
        const insertMarcher = newDb.prepare(
            `INSERT OR IGNORE INTO marchers
             (drill_prefix, drill_order, section, name, year, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
        );
        for (const m of marchersData) {
            insertMarcher.run(
                m.drill_prefix,
                m.drill_order,
                m.section,
                m.name ?? null,
                m.year ?? null,
                m.notes ?? null,
            );
        }

        const posMap = new Map(
            positions.map((p) => [`${p.drill_prefix}${p.drill_order}`, p]),
        );
        const allMarchers = newDb
            .prepare(`SELECT id, drill_prefix, drill_order FROM marchers`)
            .all() as {
            id: number;
            drill_prefix: string;
            drill_order: number;
        }[];

        for (const m of allMarchers) {
            const pos = posMap.get(`${m.drill_prefix}${m.drill_order}`);
            newDb
                .prepare(
                    `INSERT INTO marcher_pages (marcher_id, page_id, x, y)
                     VALUES (?, 0, ?, ?)
                     ON CONFLICT (marcher_id, page_id) DO UPDATE
                     SET x = excluded.x, y = excluded.y`,
                )
                .run(m.id, pos?.x ?? 0, pos?.y ?? 0);
        }
    } finally {
        newDb.close();
    }
}

/**
 * Creates a new file pre-populated with the marchers and starting positions
 * from the last page of a source .dots file.
 *
 * If no sourceFilePath is provided, uses the currently open file.
 *
 * @param sourceFilePath - Optional path to source file. Defaults to current file.
 * @returns 200 for success, -1 for failure, undefined if canceled
 */
export async function newFileFromLastPage(
    sourceFilePath?: string,
): Promise<200 | -1 | undefined> {
    if (!win) return -1;

    const source = sourceFilePath ?? DatabaseServices.getDbPath();
    if (!source || !fs.existsSync(source)) return -1;

    const { marchersData, positions, lastPageSetNumber, lastPageSubsetLetter } =
        readSourceFileData(source);

    // Show save dialog for the new file
    let filePath: string | undefined;
    if (
        process.env.PLAYWRIGHT_SESSION &&
        process.env.PLAYWRIGHT_NEW_FILE_PATH
    ) {
        filePath = process.env.PLAYWRIGHT_NEW_FILE_PATH;
    } else {
        const dialogResult = await dialog.showSaveDialog(win, {
            buttonLabel: "Create New",
            filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
        });
        if (dialogResult.canceled || !dialogResult.filePath) return undefined;
        filePath = dialogResult.filePath;
    }

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await setActiveDb(filePath, true);

    // Migration creates beat id=0 and page id=0 — seed marchers and positions.
    if (marchersData.length > 0) {
        seedNewFileWithMarchers(filePath, marchersData, positions);
    }

    copySourceSettings(
        source,
        filePath,
        lastPageSetNumber,
        lastPageSubsetLetter,
    );

    addRecentFile(filePath);
    win?.webContents.reload();
    return 200;
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
export async function insertAudioFile(): Promise<
    DatabaseServices.LegacyDatabaseResponse<AudioFile[]>
> {
    console.log("insertAudioFile");

    if (!win)
        return {
            success: false,
            error: { message: "insertAudioFile: window not loaded" },
        };

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

        // Only reload after successful insertion
        if (databaseResponse.success) {
            win?.webContents.reload();
        }

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
            db.prepare("PRAGMA user_version = 7").run();
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
