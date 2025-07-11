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
    /** The number of pixels per second in the timeline */
    timelinePixelsPerSecond: number;
    /** The component that is currently focussed */
    focussedComponent: FocusableComponents;
    /** Whether to enable Shift+click lasso selection */
    enableLassoSelection: boolean;
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
    coordinateRounding?: {
        /** In steps, the closest step to round to on the X-axis, offset on the nearestXSteps */
        nearestXSteps?: number;
        /** In steps, the offset from the center-front point to round to on the X-axis */
        referencePointX?: number;
        /** In steps, the closest step to round to on the Y-axis, offset on the nearestYSteps */
        nearestYSteps?: number;
        /** In steps, the offset from the center-front point to round to on the Y-axis */
        referencePointY?: number;
    };
}

// Default settings that will be used if no localStorage data exists
const defaultSettings: UiSettings = {
    isPlaying: false,
    lockX: false,
    lockY: false,
    previousPaths: false,
    nextPaths: false,
    gridLines: true,
    halfLines: true,
    timelinePixelsPerSecond: 40,
    focussedComponent: "canvas",
    enableLassoSelection: true,
    mouseSettings: {
        trackpadMode: true,
        trackpadPanSensitivity: 0.5,
        zoomSensitivity: 1.0,
        panSensitivity: 0.5,
    },
    coordinateRounding: {
        nearestXSteps: 0,
        referencePointX: undefined,
        nearestYSteps: 0,
        referencePointY: undefined,
    },
};

const STORAGE_KEY = "openmarch:uiSettings";

// Helper function to load settings from localStorage
const loadSettings = (): UiSettings => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return defaultSettings;

        const parsed = JSON.parse(stored) as UiSettings;
        // Merge with default settings to ensure all properties exist
        return { ...defaultSettings, ...parsed };
    } catch (error) {
        console.error("Failed to load UI settings from localStorage:", error);
        return defaultSettings;
    }
};

// Helper function to save settings to localStorage
const saveSettings = (settings: UiSettings): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.error("Failed to save UI settings to localStorage:", error);
    }
};

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
    (set, get) => ({
        uiSettings: loadSettings(),

        fetchUiSettings: () => {
            const currentSettings = get().uiSettings;
            const newSettings = {
                ...currentSettings,
            };
            set({ uiSettings: newSettings });
            saveSettings(newSettings);
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
            saveSettings(uiSettings);
        },

        setPixelsPerSecond: (pixelsPerSecond: number) => {
            const newSettings = {
                ...get().uiSettings,
                timelinePixelsPerSecond: pixelsPerSecond,
            };
            set({ uiSettings: newSettings });
            saveSettings(newSettings);
        },
    }),
);
