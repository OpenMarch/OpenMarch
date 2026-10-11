/* eslint-disable no-console */
/**
 * The 3D View window (ADR 0002 D-3): at most one, opened from the editor,
 * closed with the editor or the show. It loads the editor's renderer bundle
 * with `?view=3d` and gets its own read-only preload (`preload/view3d.ts`).
 *
 * Sync (ADR 0002 D-4): main relays the editor's clock, selection and
 * invalidations to the window, and the window's `hello`, venue-change and
 * playback requests to the editor, without reading the payloads. It tells
 * the editor whether the window is open with `view3d:window-state`.
 */
import { BrowserWindow, ipcMain, shell } from "electron";
import { basename, extname } from "node:path";
import * as DatabaseServices from "../database/database.services";
import { isReadOnlySql, isView3dSqlReadMethod } from "./view3dSql";
import {
    VIEW3D_HELLO_CHANNEL,
    VIEW3D_PLAYBACK_REQUEST_CHANNEL,
    VIEW3D_PUBLISH_CHANNELS,
    VIEW3D_VENUE_CHANGE_REQUEST_CHANNEL,
    VIEW3D_WINDOW_STATE_CHANNEL,
} from "../../src/view3d/sync/protocol";

export interface View3dWindowConfig {
    /** Absolute path of the built `preload/view3d.js`. */
    preload: string;
    /** Vite dev server URL in development, otherwise undefined. */
    devServerUrl?: string;
    /** Absolute path of the built renderer `index.html`. */
    indexHtml: string;
    icon: string;
    /** Show a native frame (Playwright codegen), like the editor window. */
    frame: boolean;
    getTheme: () => string;
    getLanguage: () => string;
    /** The editor window, which publishes to and answers the 3D View. */
    getEditorWindow: () => BrowserWindow | null;
}

/** Height of the app's TitleBar, so native window controls line up with it. */
const TITLE_BAR_HEIGHT = 37;

const TITLE_BAR_COLORS = {
    dark: { color: "#0f0e13", symbolColor: "#d0d0d0" },
    light: { color: "#ecebf0", symbolColor: "#202020" },
} as const;

let config: View3dWindowConfig | null = null;
let view3dWindow: BrowserWindow | null = null;

/** The show's file name without `.dots`, for the window title. */
export function showNameFromPath(dbPath: string): string {
    const file = basename(dbPath);
    return extname(file).toLowerCase() === ".dots"
        ? file.slice(0, -".dots".length)
        : file;
}

function isView3dSender(sender: Electron.WebContents): boolean {
    return (
        !!view3dWindow &&
        !view3dWindow.isDestroyed() &&
        sender === view3dWindow.webContents
    );
}

async function handleSqlRead(
    event: Electron.IpcMainInvokeEvent,
    sql: unknown,
    params: unknown,
    method: unknown,
) {
    if (!isView3dSender(event.sender)) {
        throw new Error("view3d:sql-read is only available to the 3D View");
    }
    if (!isReadOnlySql(sql)) {
        throw new Error("3D View: only SELECT or WITH statements are allowed");
    }
    if (!isView3dSqlReadMethod(method)) {
        throw new Error(`3D View: unsupported SQL method ${String(method)}`);
    }
    if (!Array.isArray(params)) {
        throw new Error("3D View: SQL params must be an array");
    }
    return DatabaseServices.handleReadOnlySqlProxy(
        sql as string,
        params,
        method,
    );
}

function getEditorWebContents(): Electron.WebContents | null {
    const editor = config?.getEditorWindow();
    return editor && !editor.isDestroyed() ? editor.webContents : null;
}

function isEditorSender(sender: Electron.WebContents): boolean {
    return sender === getEditorWebContents();
}

/** Tells the editor whether a 3D View window is open, so it publishes only then. */
function sendWindowState(open: boolean) {
    getEditorWebContents()?.send(VIEW3D_WINDOW_STATE_CHANNEL, open);
}

/** Registers the 3D View IPC handlers. Call once, after `app` is ready. */
export function initView3dWindow(windowConfig: View3dWindowConfig) {
    config = windowConfig;

    ipcMain.handle("view3d:open", (_event, options: unknown) =>
        openView3dWindow({
            background:
                typeof options === "object" &&
                options !== null &&
                (options as { background?: unknown }).background === true,
        }),
    );
    ipcMain.handle("view3d:sql-read", handleSqlRead);

    // Editor → window: clock, selection and invalidate, relayed as they are.
    for (const channel of VIEW3D_PUBLISH_CHANNELS) {
        ipcMain.on(channel, (event, payload: unknown) => {
            if (!isEditorSender(event.sender)) return;
            getView3dWindow()?.webContents.send(channel, payload);
        });
    }

    // Window → editor: the window is ready, and the editor answers with a
    // fresh clock and selection. Also tells an editor that missed the
    // window-state push (for example after a reload) that the window is open.
    ipcMain.on(VIEW3D_HELLO_CHANNEL, (event) => {
        if (!isView3dSender(event.sender)) return;
        getEditorWebContents()?.send(VIEW3D_HELLO_CHANNEL);
    });

    // Window → editor: the editor validates and writes the settings, or
    // checks and runs the playback action.
    for (const channel of [
        VIEW3D_VENUE_CHANGE_REQUEST_CHANNEL,
        VIEW3D_PLAYBACK_REQUEST_CHANNEL,
    ]) {
        ipcMain.on(channel, (event, payload: unknown) => {
            if (!isView3dSender(event.sender)) return;
            getEditorWebContents()?.send(channel, payload);
        });
    }
}

function buildQuery(): Record<string, string> {
    const theme = config?.getTheme() === "light" ? "light" : "dark";
    return {
        view: "3d",
        show: showNameFromPath(DatabaseServices.getDbPath()),
        theme,
        lang: config?.getLanguage() || "en",
    };
}

/**
 * Opens the 3D View window, or focuses it if it's already open.
 *
 * With `background`, used when the app opens it with a show, a new window
 * shows without taking focus from the editor, and an open one is left as
 * it is.
 *
 * @returns false when no show is open, so there is nothing to show.
 */
export function openView3dWindow({
    background = false,
}: { background?: boolean } = {}): boolean {
    if (!config || !DatabaseServices.databaseIsReady()) return false;

    if (view3dWindow && !view3dWindow.isDestroyed()) {
        if (background) return true;
        if (view3dWindow.isMinimized()) view3dWindow.restore();
        view3dWindow.show();
        view3dWindow.focus();
        return true;
    }

    const query = buildQuery();
    const isMacOS = process.platform === "darwin";
    const colors = TITLE_BAR_COLORS[query.theme === "light" ? "light" : "dark"];

    const created = new BrowserWindow({
        title: `3D View — ${query.show}`,
        icon: config.icon,
        width: 1280,
        height: 800,
        minWidth: 640,
        minHeight: 400,
        backgroundColor: colors.color,
        show: !background,
        autoHideMenuBar: true,
        frame: config.frame,
        titleBarStyle: "hidden",
        trafficLightPosition: { x: 24, y: 9 },
        // Frameless like the editor. The app's TitleBar is the drag region,
        // and the system draws the window controls on Windows and Linux, so
        // the window needs no extra IPC for minimize, maximize and close.
        titleBarOverlay: isMacOS
            ? undefined
            : { ...colors, height: TITLE_BAR_HEIGHT },
        webPreferences: {
            preload: config.preload,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false,
        },
    });
    view3dWindow = created;
    if (background) created.once("ready-to-show", () => created.showInactive());

    created.on("closed", () => {
        if (view3dWindow === created) view3dWindow = null;
        if (!view3dWindow) sendWindowState(false);
    });

    // Keep the window on the bundled renderer: no navigation, no popups.
    created.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https:")) void shell.openExternal(url);
        return { action: "deny" };
    });
    created.webContents.on("will-navigate", (event) => event.preventDefault());

    if (config.devServerUrl) {
        const url = new URL(config.devServerUrl);
        for (const [key, value] of Object.entries(query)) {
            url.searchParams.set(key, value);
        }
        void created.loadURL(url.toString());
    } else {
        void created.loadFile(config.indexHtml, { query });
    }

    sendWindowState(true);
    console.log("3D View window opened");
    return true;
}

/** Closes the 3D View window if it's open. Called when the show or the editor closes. */
export function closeView3dWindow() {
    if (view3dWindow && !view3dWindow.isDestroyed()) {
        // `destroy()` emits "closed", which sends the window state.
        view3dWindow.destroy();
    }
    view3dWindow = null;
}

/** The open 3D View window, if any. */
export function getView3dWindow(): BrowserWindow | null {
    return view3dWindow && !view3dWindow.isDestroyed() ? view3dWindow : null;
}
