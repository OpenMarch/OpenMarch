import { ipcMain } from "electron";
import Store from "electron-store";

export interface Settings {
    showLaunchPage: boolean;
    databasePath: string;
    theme: string;
    showWaveform: boolean;
    showGridLines: boolean;
    showHalfLines: boolean;
    showPreviousPaths: boolean;
    showNextPaths: boolean;
    lockMovementX: boolean;
    lockMovementY: boolean;
    snapToGrid: boolean;
}

export const DefaultSettings: Settings = {
    showLaunchPage: true,
    databasePath: "",
    theme: "light",
    showWaveform: true,
    showGridLines: true,
    showHalfLines: true,
    showPreviousPaths: false,
    showNextPaths: false,
    lockMovementX: false,
    lockMovementY: false,
    snapToGrid: false,
};

let instance: SettingsService;

class SettingsService {
    private store = new Store({ name: "settings", defaults: DefaultSettings });

    static getService() {
        if (!instance) {
            instance = new SettingsService();
        }
        return instance;
    }

    private constructor() {
        ipcMain.handle("settings:getAll", () => this.getAll());
        ipcMain.handle("settings:get", (_, ...args) =>
            this.getSetting(args[0]),
        );
        ipcMain.handle("settings:set", (_, ...args) =>
            this.setSetting(args[0], args[1]),
        );
    }

    getAll = () => {
        const settings = this.store.store;
        return settings;
    };

    getSetting = (key: string) => {
        const settings = this.store.get(key);
        return settings;
    };

    setSetting = (key: string, value: any) => {
        this.store.set(key, value);
    };

    deleteSetting = (key: keyof Settings) => {
        this.store.delete(key);
    };
}

export const settingsService = SettingsService.getService();
