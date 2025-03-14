import { app, BrowserWindow, shell, ipcMain, Menu, dialog } from "electron";
import Store from "electron-store";
import * as fs from "fs";
import { release } from "node:os";
import { join } from "node:path";
import * as DatabaseServices from "../database/database.services";
import { applicationMenu } from "./application-menu";
import { PDFExportService } from "./services/export-service";
import { update } from "./update";
import AudioFile from "@/global/classes/AudioFile";
import { parseMxl } from "../mxl/MxlUtil";
import { init, captureException } from "@sentry/electron/main";

// const xml2abc = require('../xml2abc-js/xml2abc.js')
// const xml2abc = require('./xml2abc.js')
// const $ = require('jquery');

// Modify this when the database is updated
import CurrentDatabase from "../database/versions/CurrentDatabase";
import {
    getFieldPropertiesJson,
    updateFieldProperties,
    updateFieldPropertiesImage,
} from "../database/tables/FieldPropertiesTable";

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

const store = new Store();
init({
    dsn: "https://86f3d9182d9c458f846a0b726cb6bfc1@app.glitchtip.com/10601",
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

async function createWindow(title?: string) {
    win = new BrowserWindow({
        title: title || "OpenMarch",
        icon: join(process.env.VITE_PUBLIC, "favicon.ico"),
        minWidth: 1000,
        minHeight: 400,
        autoHideMenuBar: true,
        frame: false,
        trafficLightPosition: { x: 24, y: 9 },
        titleBarStyle: "hidden",
        webPreferences: {
            preload,
            // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
            // Consider using contextBridge.exposeInMainWorld
            // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
            nodeIntegration: false, // is default value after Electron v5
            contextIsolation: true, // protect against prototype pollution
        },
    });

    if (url) {
        // electron-vite-vue#298
        win.loadURL(url);
        win.on("ready-to-show", () => {
            if (win) win.webContents.openDevTools();
        });
    } else {
        win.loadFile(indexHtml);
    }

    // Test actively push message to the Electron-Renderer
    win.webContents.on("did-finish-load", () => {
        win?.maximize();
        win?.webContents.send(
            "main-process-message",
            new Date().toLocaleString(),
        );
    });

    // Make all links open with the browser, not with the application
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https:")) shell.openExternal(url);
        return { action: "deny" };
    });

    // Apply electron-updater
    update(win);
}

app.whenReady().then(async () => {
    app.setName("OpenMarch");
    console.log("NODE:", process.versions.node);

    Menu.setApplicationMenu(applicationMenu);
    const previousPath = store.get("databasePath") as string;
    if (previousPath && previousPath.length > 0) setActiveDb(previousPath);
    // Database handlers
    console.log("db_path: " + DatabaseServices.getDbPath());

    DatabaseServices.initHandlers();

    // File IO handlers
    ipcMain.handle("database:isReady", DatabaseServices.databaseIsReady);
    ipcMain.handle("database:getPath", () => {
        return DatabaseServices.getDbPath();
    });
    ipcMain.handle("database:save", async () => saveFile());
    ipcMain.handle("database:load", async () => loadDatabaseFile());
    ipcMain.handle("database:create", async () => newFile());
    ipcMain.handle("history:undo", async () => executeHistoryAction("undo"));
    ipcMain.handle("history:redo", async () => executeHistoryAction("redo"));
    ipcMain.handle("audio:insert", async () => insertAudioFile());
    ipcMain.handle("measure:insert", async () =>
        launchImportMusicXmlFileDialogue(),
    );
    ipcMain.handle("field_properties:export", async () =>
        exportFieldPropertiesFile(),
    );
    ipcMain.handle("field_properties:import", async () =>
        importFieldPropertiesFile(),
    );
    ipcMain.handle("field_properties:import_image", async () =>
        importFieldPropertiesImage(),
    );

    // Getters
    initGetters();

    await createWindow("OpenMarch - " + store.get("databasePath"));
});

function initGetters() {
    // Store selected page and marchers
    ipcMain.on("send:selectedPage", async (_, selectedPageId: number) => {
        store.set("selectedPageId", selectedPageId);
    });
    ipcMain.on(
        "send:selectedMarchers",
        async (_, selectedMarchersId: number[]) => {
            store.set("selectedMarchersId", selectedMarchersId);
        },
    );

    // Store locked x or y axis
    store.set("lockX", false);
    store.set("lockY", false);
    ipcMain.on("send:lockX", async (_, lockX: boolean) => {
        store.set("lockX", lockX as boolean);
    });
    ipcMain.on("send:lockY", async (_, lockY: boolean) => {
        store.set("lockY", lockY as boolean);
    });

    // Exports
    ipcMain.handle("export:pdf", async (_, params) => {
        return await PDFExportService.export(
            params.sheets,
            params.organizeBySection,
        );
    });

    // Export Full Charts
    // ipcMain.handle(

    //    "send:exportCanvas",
    //   async (_, dataUrl: string) =>
    //       await exportCanvas(dataUrl)
    //);
}

app.on("window-all-closed", () => {
    win = null;
    if (process.platform !== "darwin") app.quit();
});

app.on("open-file", (event, path) => {
    event.preventDefault();
    setActiveDb(path);
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

//

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
        createWindow();
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
        childWindow.loadURL(`${url}#${arg}`);
    } else {
        childWindow.loadFile(indexHtml, { hash: arg });
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

    // Get path to new file
    dialog
        .showSaveDialog(win, {
            buttonLabel: "Create New",
            filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
        })
        .then((path) => {
            if (path.canceled || !path.filePath) return;

            setActiveDb(path.filePath, true);
            const dbVersion = new CurrentDatabase(DatabaseServices.connect);
            dbVersion.createTables();
            win?.webContents.reload();

            return 200;
        })
        .catch((err) => {
            console.log(err);
            return -1;
        });
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

    // Save database file
    store.set("database", db.serialize());

    // Save
    dialog
        .showSaveDialog(win, {
            buttonLabel: "Save Copy",
            filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
        })
        .then((path) => {
            if (path.canceled || !path.filePath) return -1;

            const serializedDb = db.serialize();
            const uint8Array = Uint8Array.from(serializedDb);

            fs.writeFileSync(path.filePath, uint8Array);

            setActiveDb(path.filePath);
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
        .then((path) => {
            DatabaseServices.setDbPath(path.filePaths[0]);
            store.set("databasePath", path.filePaths[0]); // Save the path for next time

            // If the user cancels the dialog, and there is no previous path, return -1
            if (path.canceled || !path.filePaths[0]) return -1;

            setActiveDb(path.filePaths[0]);
            return 200;
        })
        .catch((err) => {
            console.log(err);
            return -1;
        });
}

// Field properties

/**
 * Opens a dialog to export the field properties to a file.
 * The file's extension is  .fieldots, but it's actually a JSON file.
 *
 * @returns 200 for success, -1 for failure
 */
export async function exportFieldPropertiesFile() {
    console.log("exportFieldPropertiesFile");

    if (!win) return -1;

    const jsonStr = getFieldPropertiesJson({
        db: DatabaseServices.connect(),
    }).data;

    // Save
    dialog
        .showSaveDialog(win, {
            buttonLabel: "Save Field",
            filters: [
                { name: "OpenMarch Field File", extensions: ["fieldots"] },
            ],
        })
        .then((path) => {
            if (path.canceled || !path.filePath) return -1;

            fs.writeFileSync(path.filePath, jsonStr, {
                encoding: "utf-8",
            });

            return 200;
        })
        .catch((err) => {
            console.log(err);
            return -1;
        });
}

/**
 * Opens a dialog to import a field properties file and updates the field properties in the database.
 * The file's extension is .fieldots, but it's actually a JSON file.
 *
 * @returns 200 for success, -1 for failure
 */
export async function importFieldPropertiesFile() {
    console.log("importFieldPropertiesFile");

    if (!win) return -1;

    // If there is no previous path, open a dialog
    dialog
        .showOpenDialog(win, {
            filters: [
                { name: "OpenMarch Field File", extensions: ["fieldots"] },
            ],
        })
        .then((path) => {
            const fileContents = fs.readFileSync(path.filePaths[0]);
            const jsonStr = fileContents.toString();
            updateFieldProperties({
                db: DatabaseServices.connect(),
                fieldProperties: jsonStr,
            });

            // If the user cancels the dialog, and there is no previous path, return -1
            if (path.canceled || !path.filePaths[0]) return -1;

            win?.webContents.send("field_properties:onImport");

            return 200;
        })
        .catch((err) => {
            console.log(err);
            return -1;
        });
}

export async function importFieldPropertiesImage() {
    console.log("importFieldPropertiesFile");

    if (!win) return -1;

    // If there is no previous path, open a dialog
    dialog
        .showOpenDialog(win, {
            filters: [
                {
                    name: "All Images",
                    extensions: ["jpg", "jpeg", "png", "bmp", "gif", "webp"],
                },
                {
                    name: "JPEG Image",
                    extensions: ["jpg", "jpeg"],
                },
                {
                    name: "PNG Image",
                    extensions: ["png"],
                },
                {
                    name: "GIF Image",
                    extensions: ["gif"],
                },
                {
                    name: "WEBP Image",
                    extensions: ["webp"],
                },
                {
                    name: "GIF Image",
                    extensions: ["gif"],
                },
                {
                    name: "BMP Image",
                    extensions: ["bmp"],
                },
                {
                    name: "All Files",
                    extensions: ["*"],
                },
            ],
        })
        .then((path) => {
            updateFieldPropertiesImage({
                db: DatabaseServices.connect(),
                imagePath: path.filePaths[0],
            });

            // If the user cancels the dialog, and there is no previous path, return -1
            if (path.canceled || !path.filePaths[0]) return -1;

            win?.webContents.send("field_properties:onImageImport");

            return 200;
        })
        .catch((err) => {
            console.log(err);
            return -1;
        });
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

    let databaseResponse: DatabaseServices.LegacyDatabaseResponse<AudioFile[]>;
    // If there is no previous path, open a dialog
    databaseResponse = await dialog
        .showOpenDialog(win, {
            filters: [
                { name: "Audio File", extensions: ["mp3", "wav", "ogg"] },
                { name: "All Files", extensions: ["*"] },
            ],
        })
        .then((path) => {
            console.log("loading audio file into buffer:", path.filePaths[0]);
            fs.readFile(path.filePaths[0], (err, data) => {
                if (err) {
                    console.error("Error reading audio file:", err);
                    return -1;
                }

                // 'data' is a buffer containing the file contents
                // Id is -1 to conform with interface
                DatabaseServices.insertAudioFile({
                    id: -1,
                    data,
                    path: path.filePaths[0],
                    nickname: path.filePaths[0],
                    selected: true,
                }).then((response) => {
                    databaseResponse = response;
                });
            });
            if (path.canceled || !path.filePaths[0])
                return {
                    success: false,
                    error: {
                        message:
                            "insertAudioFile: Operation was cancelled or no audio file was provided",
                    },
                };

            // setActiveDb(path.filePaths[0]);
            return databaseResponse;
        })
        .catch((err) => {
            // TODO how to print/return stack here?
            console.log(err);
            return { success: false, error: { message: err } };
        });
    return (
        databaseResponse || {
            success: false,
            error: { message: "Error inserting audio file" },
        }
    );
}

/**
 * Opens a dialog to import a MusicXML file into OpenMarch.
 *
 * This function does not actually insert the file into the database, but rather reads the file and returns the xml data.
 * This was done due to issues getting xml2abc to work in the main process.
 *
 * @returns Promise<string | undefined> - The string xml data of the musicxml file, or undefined if the operation was cancelled/failed.
 */
export async function launchImportMusicXmlFileDialogue(): Promise<
    string | undefined
> {
    console.log("readMusicXmlFile");

    if (!win) {
        console.error("window not loaded");
        return;
    }

    // If there is no previous path, open a dialog
    const dialogueResponse = await dialog.showOpenDialog(win, {
        filters: [
            {
                name: "MusicXML File",
                extensions: ["mxl", "musicxml", "xml"],
            },
            { name: "All Files", extensions: ["*"] },
        ],
    });

    if (dialogueResponse.canceled || !dialogueResponse.filePaths[0]) {
        console.error("Operation was cancelled or no file was provided");
        return;
    }

    console.log("loading musicxml file:", dialogueResponse.filePaths[0]);
    const filePath = dialogueResponse.filePaths[0];

    let xmlString;
    if (filePath.endsWith(".mxl")) {
        xmlString = parseMxl(filePath);
    } else {
        xmlString = fs.readFileSync(filePath, "utf8");
    }
    return xmlString;
}

/**
 * Performs an undo or redo action on the history stacks based on the type.
 *
 * @param type 'undo' or 'redo'
 * @returns 200 for success, -1 for failure
 */
export async function executeHistoryAction(type: "undo" | "redo") {
    const response = DatabaseServices.performHistoryAction(type);

    if (!response.success) {
        console.log(`Error ${type}ing`);
        return -1;
    }

    // send a message to the renderer to fetch the updated data
    win?.webContents.send("history:action", response);

    return 200;
}

/**
 * Triggers the renderer to fetch all data of the given type.
 *
 * @param type 'marcher' | 'page' | 'marcher_page'
 */
export async function triggerFetch(type: "marcher" | "page" | "marcher_page") {
    win?.webContents.send("fetch:all", type);
}

/**
 * Sets the active database path and reloads the window.
 *
 * @param path path to the database file
 * @param isNewFile True if this is a new file, false if it is an existing file
 */
function setActiveDb(path: string, isNewFile = false) {
    try {
        if (!fs.existsSync(path) && !isNewFile) {
            store.delete("databasePath");
            console.error("Database file does not exist:", path);
            return;
        }

        DatabaseServices.setDbPath(path, isNewFile);
        win?.setTitle("OpenMarch - " + path);

        const migrator = new CurrentDatabase(DatabaseServices.connect);
        const db = DatabaseServices.connect();
        if (!db) {
            console.error("Error connecting to database");
            return;
        }
        if (!isNewFile) {
            console.log(
                "Checking database version to see if migration is needed",
            );
            CurrentDatabase.getVersion(db);
            // Create backup before migration
            if (CurrentDatabase.getVersion(db) !== migrator.version) {
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
            migrator.migrateToThisVersion();
        } else console.log(`Creating new database at ${path}`);

        !isNewFile && win?.webContents.reload();
        store.set("databasePath", path); // Save current db path
    } catch (error) {
        captureException(error);
        store.delete("databasePath"); // Reset database path
        DatabaseServices.setDbPath("", false);
        dialog.showErrorBox("Error Loading Database", (error as Error).message);
        win?.webContents.reload();
        throw error;
    }
}
