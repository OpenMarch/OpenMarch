import { create } from "zustand";
import * as Interfaces from "../global/Interfaces";

interface UiSettingsStoreState {
    uiSettings: Interfaces.UiSettings;
}
interface UiSettingsStoreActions {
    setUiSettings: (
        uiSettings: Interfaces.UiSettings,
        type?: keyof Interfaces.UiSettings
    ) => void;
}
interface UiSettingsStoreInterface
    extends UiSettingsStoreState,
        UiSettingsStoreActions {}

export const useUiSettingsStore = create<UiSettingsStoreInterface>((set) => ({
    uiSettings: {
        isPlaying: false,
        lockX: false,
        lockY: false,
        /** Boolean to view previous page's paths/dots */
        previousPaths: false,
        /** Boolean to view next page's paths/dots */
        nextPaths: false,
    },

    /**
     * Set the uiSettings
     *
     * @param newUiSettings the new uiSettings
     * @param type the ui setting that is being changed. E.g. "lockX" if changing lockX, "lockY", if changing lockY
     * This must be passed to keep lockX and lockY from being true at the same time
     */
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
    },
}));
