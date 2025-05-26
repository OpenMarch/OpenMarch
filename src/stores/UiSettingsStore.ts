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
        /** Mouse wheel zoom sensitivity (1-10) */
        wheelZoomSensitivity: number;
        /** Whether to enable touchpad gestures */
        enableTouchpadGestures: boolean;
        /** Whether to enable momentum scrolling */
        enableMomentumScrolling: boolean;
        /** Whether to enable canvas panning with left click */
        enableCanvasPanning: boolean;
        /** Whether to enable trackpad mode (specific handling for macOS trackpads) */
        trackpadMode: boolean;
        /** Trackpad pan sensitivity (0.1-3.0) */
        trackpadPanSensitivity: number;
        /** Zoom sensitivity (0.01-0.1) */
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
            timelinePixelsPerSecond: 40,
            /** The component that is currently focussed */
            focussedComponent: "canvas",
            /** Mouse settings */
            mouseSettings: {
                wheelZoomSensitivity: 5,
                enableTouchpadGestures: true,
                enableMomentumScrolling: true,
                enableCanvasPanning: true,
                trackpadMode: true,
                trackpadPanSensitivity: 0.5,
                zoomSensitivity: 0.03,
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
            set({
                uiSettings: {
                    ...state().uiSettings,
                    timelinePixelsPerSecond: pixelsPerSecond,
                },
            });
        },
    }),
);
