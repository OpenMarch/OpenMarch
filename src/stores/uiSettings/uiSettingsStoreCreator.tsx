import { type StateCreator } from "zustand";
import * as Interfaces from "../../global/Interfaces";

interface UiSettingsStoreState {
    uiSettings: Interfaces.UiSettings
}
interface UiSettingsStoreActions {
    setUiSettings: (uiSettings: Interfaces.UiSettings, type?: keyof Interfaces.UiSettings) => void;
}
export interface UiSettingsStoreInterface extends UiSettingsStoreState, UiSettingsStoreActions { }

export const uiSettingsStoreCreator: StateCreator<UiSettingsStoreState & UiSettingsStoreActions> = (set) => ({
    uiSettings: {
        isPlaying: false,
        lockX: false,
        lockY: false,
    },

    setUiSettings: (newUiSettings, type) => {
        const uiSettings = { ...newUiSettings };

        if (uiSettings.lockX && type === "lockX") {
            uiSettings.lockY = false;
        }

        if (uiSettings.lockY && type === "lockY") {
            uiSettings.lockX = false;
        }

        window.electron.sendLockX(uiSettings.lockX);
        window.electron.sendLockY(uiSettings.lockY);

        set({ uiSettings: uiSettings });
    }
});
