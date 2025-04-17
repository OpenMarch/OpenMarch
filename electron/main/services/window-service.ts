import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { settingsService } from "./settings-service";

process.env.DIST_ELECTRON = join(__dirname, "../");
process.env.DIST = join(process.env.DIST_ELECTRON, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
    ? join(process.env.DIST_ELECTRON, "../public")
    : process.env.DIST;
const defaultPreload = join(__dirname, "../preload/index.js");
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const indexHtml = join(process.env.DIST, "index.html");

let instance: WindowService;

class WindowService {
    private mainWindow: BrowserWindow | null = null;

    static getService() {
        if (!instance) {
            instance = new WindowService();
        }

        return instance;
    }

    private constructor() {
        ipcMain.handle("open-win", (_, url) => {
            this.newWindow("");
        });

        app.on("window-all-closed", () => {
            this.mainWindow = null;
            if (process.platform !== "darwin") app.quit();
        });

        ipcMain.on("window:close", () => {
            this.activeWindow?.close();
        });

        ipcMain.on("window:maximize", () => {
            if (this.activeWindow?.isMaximized()) {
                this.activeWindow.unmaximize();
            } else {
                this.activeWindow?.maximize();
            }
        });

        ipcMain.on("window:minimize", () => {
            this.activeWindow?.minimize();
        });

        app.on("activate", () => {
            const allWindows = BrowserWindow.getAllWindows();
            if (allWindows.length) {
                allWindows[0].focus();
            } else {
                this.initMainWindow();
            }
        });
    }

    get activeWindow() {
        return BrowserWindow.getFocusedWindow();
    }

    newWindow(
        url: string,
        title = "OpenMarch",
        preload = defaultPreload,
        minWidth = 1000,
        minHeight = 400,
    ): BrowserWindow {
        const window = new BrowserWindow({
            title: title ? title : "OpenMarch",
            icon: join(process.env.VITE_PUBLIC, "favicon.ico"),
            minWidth: minWidth,
            minHeight: minHeight,
            autoHideMenuBar: true,
            frame: false,
            trafficLightPosition: { x: 24, y: 9 },
            titleBarStyle: "hidden",
            webPreferences: {
                preload: preload,
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        // Make all links open with the browser, not with the application
        window.webContents.setWindowOpenHandler(({ url }) => {
            if (url.startsWith("https:")) shell.openExternal(url);
            return { action: "deny" };
        });

        //Sentry
        window.webContents.session.webRequest.onHeadersReceived(
            (details, callback) => {
                callback({
                    responseHeaders: {
                        ...details.responseHeaders,
                        "Content-Security-Policy": [
                            "script-src 'self' 'unsafe-inline' https://app.glitchtip.com",
                        ],
                    },
                });
            },
        );

        if (devServerUrl) {
            // electron-vite-vue#298
            window.loadURL(devServerUrl);
            window.on("ready-to-show", () => {
                if (window) {
                    window.webContents.openDevTools();
                }
            });
        } else {
            window.loadFile(`${indexHtml}${url}`);
        }

        return window;
    }

    initMainWindow(): BrowserWindow {
        this.mainWindow = this.newWindow(
            "/",
            "OpenMarch - " + settingsService.getSetting("databasePath"),
        );

        // Apply electron-updater
        // update(win);

        this.mainWindow.maximize();

        return this.mainWindow;
    }
}

export const windowService = WindowService.getService();
