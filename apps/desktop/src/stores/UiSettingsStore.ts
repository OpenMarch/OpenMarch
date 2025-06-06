import { create } from "zustand";

export type FocusableComponents = "canvas" | "timeline";
export interface UiSettings {
    lockX: boolean;
    lockY: boolean;
    isPlaying: boolean;
    /** Boolean to view previous page's paths/dots */
    previousPaths: boolean;
    /** Boolean to view next page's paths/dots */
    nextPaths: boolean;
    /** Boolean to view lines for every step on the field */
    gridLines: boolean;
    /** Boolean to view lines for every four steps on the field */
    halfLines: boolean;
    /** Boolean to view audio waveform */
    showWaveform: boolean;
    /** The number of pixels per second in the timeline */
    timelinePixelsPerSecond: number;
    /** The component that is currently focussed */
    focussedComponent: FocusableComponents;
    /** Mouse settings */
    mouseSettings: {
        /** Whether to enable trackpad mode (specific handling for macOS trackpads) */
        trackpadMode: boolean;
        /** Trackpad pan sensitivity (0.1-3.0) */
        trackpadPanSensitivity: number;
        /** Multiplier for base zoom sensitivity. Default: 1.0 (100%). Range 0.5-2.0 (50%-200%). */
        zoomSensitivity: number;
        /** Standard pan sensitivity (0.1-3.0) */
        panSensitivity: number;
    };
}

interface UiSettingsStoreState {
    uiSettings: UiSettings;
}
interface UiSettingsStoreActions {
    fetchUiSettings: () => void;
    setUiSettings: (uiSettings: UiSettings, type?: keyof UiSettings) => void;
    setPixelsPerSecond: (pixelsPerSecond: number) => void;
}
interface UiSettingsStoreInterface
    extends UiSettingsStoreState,
        UiSettingsStoreActions {}

export const useUiSettingsStore = create<UiSettingsStoreInterface>(
    (set, state) => ({
        uiSettings: {
            isPlaying: false,
            lockX: false,
            lockY: false,
            /** Boolean to view previous page's paths/dots */
            previousPaths: false,
            /** Boolean to view next page's paths/dots */
            nextPaths: false,
            /** Boolean to view lines for every step on the field */
            gridLines: true,
            /** Boolean to view lines for every four steps on the field */
            halfLines: true,
            showWaveform: false,
            /** The number of pixels per second in the timeline */
            timelinePixelsPerSecond: localStorage.getItem(
                "timelinePixelsPerSecond",
            )
                ? parseInt(localStorage.getItem("timelinePixelsPerSecond")!)
                : 40,
            /** The component that is currently focussed */
            focussedComponent: "canvas",
            /** Mouse settings */
            mouseSettings: {
                /** Whether to enable trackpad mode (specific handling for macOS trackpads) */
                trackpadMode: true,
                /** Trackpad pan sensitivity (0.1-3.0) */
                trackpadPanSensitivity: 0.5,
                /** Multiplier for base zoom sensitivity. Default: 1.0 (100%). Range 0.5-2.0 (50%-200%). */
                zoomSensitivity: 1.0,
                /** Standard pan sensitivity (0.1-3.0) */
                panSensitivity: 0.5,
            },
        },

        /**
         * Fetch the uiSettings
         * TODO: there are other settings that need to be refactored into this action. right now it's a little scattered
         */
        fetchUiSettings: () => {
            window.electron.getShowWaveform().then((showWaveform: boolean) => {
                set((state) => ({
                    uiSettings: {
                        ...state.uiSettings,
                        showWaveform: showWaveform,
                    },
                }));
            });
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
            window.electron.setShowWaveform(uiSettings.showWaveform);

            set({ uiSettings: uiSettings });
        },
        setPixelsPerSecond: (pixelsPerSecond: number) => {
            // Store in localStorage
            localStorage.setItem(
                "timelinePixelsPerSecond",
                pixelsPerSecond.toString(),
            );

            set({
                uiSettings: {
                    ...state().uiSettings,
                    timelinePixelsPerSecond: pixelsPerSecond,
                },
            });
        },
    }),
);
