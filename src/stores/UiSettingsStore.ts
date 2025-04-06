import { create } from "zustand";

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

interface SettingsStoreActions {
    hydrateSettings: () => void;
    setSetting: (key: keyof Settings, value: any) => void;
}

export const useSettingsStore = create<Settings & SettingsStoreActions>(
    (set) => ({
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

        hydrateSettings: () => {
            window.electron.getAllSettings().then((settings) => {
                set(settings);
                console.log("hydratedSettings", settings);
            });
        },

        setSetting: (key, value) => {
            window.electron.setSetting(key, value);

            set({ [key]: value });
        },
    }),
);

export const uiSettingsSelector = (state: Settings) => ({
    showLaunchPage: state.showLaunchPage,
    databasePath: state.databasePath,
    theme: state.theme,
    showWaveform: state.showWaveform,
    showGridLines: state.showGridLines,
    showHalfLines: state.showHalfLines,
    showPreviousPaths: state.showPreviousPaths,
    showNextPaths: state.showNextPaths,
    lockMovementX: state.lockMovementX,
    lockMovementY: state.lockMovementY,
    snapToGrid: state.snapToGrid,
});
