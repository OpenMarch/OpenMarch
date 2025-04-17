import { app, ipcMain, Menu } from "electron";
import { release } from "node:os";
import * as DatabaseServices from "../database/database.services";
import { applicationMenu } from "./application-menu";
import { PDFExportService } from "./services/export-service";
import { settingsService } from "./services/settings-service";
import { windowService } from "./services/window-service";
import { fileService } from "./services/file-service";

// Disable GPU Acceleration for Windows 7
if (release().startsWith("6.1")) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}

app.whenReady().then(() => {
    app.setName("OpenMarch");

    Menu.setApplicationMenu(applicationMenu);

    let pathToOpen = settingsService.getSetting("databasePath") as string;

    if (process.argv.length >= 2 && process.argv[1].endsWith(".dots")) {
        pathToOpen = process.argv[1];
    }

    if (pathToOpen && pathToOpen.length > 0)
        fileService.setActiveDb(pathToOpen);

    DatabaseServices.initHandlers();

    // File IO handlers
    ipcMain.handle("database:isReady", DatabaseServices.databaseIsReady);
    ipcMain.handle("database:getPath", () => {
        return DatabaseServices.getDbPath();
    });
    ipcMain.handle("history:undo", async () => executeHistoryAction("undo"));
    ipcMain.handle("history:redo", async () => executeHistoryAction("redo"));

    // init export listeners
    PDFExportService.getService();

    windowService.initMainWindow();
});

// Custom title bar buttons

const isMacOS = process.platform === "darwin";

ipcMain.on("menu:open", () => {
    if (!isMacOS) {
        applicationMenu.popup();
    }
});

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
    windowService.activeWindow?.webContents.send("history:action", response);

    return 200;
}
