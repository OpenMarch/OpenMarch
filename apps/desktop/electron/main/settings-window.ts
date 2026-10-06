import { BrowserWindow, screen } from "electron";
import type Store from "electron-store";
import {
    fitBounds,
    SETTINGS_DEFAULT,
    SETTINGS_MIN,
    type Rectangle,
} from "./settings-window-bounds";

const BOUNDS_KEY = "settingsWindowBounds";

let settingsWindow: BrowserWindow | null = null;

interface OpenOptions {
    store: Store;
    parent: BrowserWindow | null;
    preload: string;
    /** Same value the main window uses for `frame` (true only in Playwright codegen). */
    frame: boolean;
    isMacOS: boolean;
    load: (win: BrowserWindow) => void;
}

/** Opens the settings window, or focuses it if it's already open. */
export function openSettingsWindow({
    store,
    parent,
    preload,
    frame,
    isMacOS,
    load,
}: OpenOptions) {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        if (settingsWindow.isMinimized()) settingsWindow.restore();
        settingsWindow.focus();
        return settingsWindow;
    }

    const anchor = parent?.getBounds() ?? screen.getPrimaryDisplay().workArea;
    const fallback: Rectangle = {
        width: SETTINGS_DEFAULT.width,
        height: SETTINGS_DEFAULT.height,
        x: Math.round(anchor.x + (anchor.width - SETTINGS_DEFAULT.width) / 2),
        y: Math.round(anchor.y + (anchor.height - SETTINGS_DEFAULT.height) / 2),
    };
    const bounds = fitBounds(
        store.get(BOUNDS_KEY) as Rectangle | undefined,
        screen.getAllDisplays().map((d) => d.workArea),
        fallback,
    );

    const created = new BrowserWindow({
        ...bounds,
        minWidth: SETTINGS_MIN.width,
        minHeight: SETTINGS_MIN.height,
        title: "Settings",
        show: false,
        autoHideMenuBar: true,
        frame,
        titleBarStyle: "hidden",
        titleBarOverlay: isMacOS,
        trafficLightPosition: { x: 24, y: 9 },
        webPreferences: {
            preload,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    settingsWindow = created;
    created.once("ready-to-show", () => created.show());
    created.on("close", () => {
        store.set(BOUNDS_KEY, created.getBounds());
    });
    created.on("closed", () => {
        settingsWindow = null;
    });
    load(created);
    return created;
}
