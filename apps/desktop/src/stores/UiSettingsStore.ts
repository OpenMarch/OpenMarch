import { create } from "zustand";
import { parseTimelineHeight } from "@/components/timeline/timelineSplit";
import { syncFromStorage } from "@/stores/syncFromStorage";
import {
    clampStartFlagPositions,
    DEFAULT_START_FLAG_POSITIONS,
    parseStartFlagPositions,
    type StartFlagPositionsSettings,
} from "@/timeline/startFlagLevels";
import {
    parseWaveformStyle,
    type WaveformStyle,
} from "@/timeline/timelineWaveform";

export type FocusableComponents = "canvas" | "timeline";
export interface UiSettings {
    lockX: boolean;
    lockY: boolean;
    /**
     * The Snap toggle (modifier roles, version A): off, shape and marcher drags on the field don't
     * snap to half steps, the rounding grid or 15° turns, and nothing pulls them onto lines, guides
     * or other marchers. Never saved: on at every launch and whenever a file opens.
     */
    snap: boolean;
    isPlaying: boolean;
    /** Whether to show the full database path in the title bar */
    showFullDatabasePath: boolean;
    /** Boolean to view next page's paths/dots */
    nextPaths: boolean;
    /** Start flag positions (#331): what the field draws normally, and while N is held */
    startFlagPositions: StartFlagPositionsSettings;
    /** Boolean to force-show over-threshold paths and apply step-size warning styling */
    stepSizeWarnings: boolean;
    /** Boolean to show collision markers on the canvas */
    showCollisions: boolean;
    /** Boolean to view lines for every step on the field */
    gridLines: boolean;
    /** Boolean to view lines for every four steps on the field */
    halfLines: boolean;
    /** Performance mode: the field always draws in its low-quality mode (ADR 0005 D-3) */
    fieldPerformanceMode: boolean;
    /** The number of pixels per second in the timeline */
    timelinePixelsPerSecond: number;
    /** The timeline-mode timeline's zoom, in pixels per beat (UI-12: remembered) */
    timelinePixelsPerBeat: number;
    /** Whether the timeline-mode timeline is drawn as its compact strip (UI-12) */
    timelineCompact: boolean;
    /** The timeline pane's height in pixels, set by the splitter; null fits it to its tracks */
    timelineHeight: number | null;
    /** Whether the timeline was fitted to the show, so the next show opens fitted (UI-12) */
    timelineZoomFitted: boolean;
    /** How the timeline draws the waveform: simplified rounded bars or precise per-beat detail */
    timelineWaveformStyle: WaveformStyle;
    /** The current audio volume percentage for timeline playback */
    audioVolume: number;
    /** Whether all app audio is muted */
    audioMuted: boolean;
    /** The component that is currently focussed */
    focussedComponent: FocusableComponents;
    /** Mouse settings */
    mouseSettings: {
        /** Whether to enable trackpad mode (specific handling for macOS trackpads) */
        trackpadMode: boolean;
        /** Trackpad wheel pan sensitivity (0.1-3.0) */
        trackpadPanSensitivity: number;
        /** Zoom sensitivity multiplier. Default: 1.0 (100%). Range 0.5-4.0. */
        zoomSensitivity: number;
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
    /**
     * Marcher labels on the field: full drill numbers, numbers only, off, or `auto` (full drill
     * numbers, shrunk as far as a smallest readable size where they would touch)
     */
    marcherLabels?: MarcherLabelForm;
    /** Marcher labels' size on the field */
    marcherLabelSize?: MarcherLabelSize;
    /** Marcher labels above their dots, or beside them (to the right) */
    marcherLabelPosition?: "above" | "beside";
    /**
     * When placed shapes (a box after Place) show their outline and label on the field: while
     * any member is selected, always, or never
     */
    shapes?: ShapeOutlines;
    /**
     * While a shape is open, who isn't in it is faded (`rest`, the default) or only while the
     * shape is being drawn (`drawing`) (docs/timeline/research/shapes/08-shape-system-ux.md)
     */
    shapeFocus?: ShapeFocus;
    /**
     * Whether an open shape shows its walks and start rings (#403): the floating editor's
     * Pathways toggle. Off by default.
     */
    shapeWalks?: boolean;
    /** Whether props show their names on the canvas, unless `propNameOverrides` says otherwise */
    showPropNames: boolean;
    /** Per prop: whether its name shows. Key is the item id. */
    propNameOverrides: Record<string, boolean>;
    /** Per prop: true hides it on the canvas wherever the timeline has it. Key is the item id. */
    hiddenPropIds: Record<string, boolean>;
    /** Whether to enable Tolgee In-Context Translating */
    tolgeeDevTools?: boolean;
    /** Tolgee API Key for In-Context Translating */
    tolgeeApiKey?: string;
}

export type MarcherLabelForm = "auto" | "names" | "numbers" | "off";
export type MarcherLabelSize = "small" | "normal" | "large";
export type ShapeOutlines = "selected" | "always" | "off";
export type ShapeFocus = "rest" | "drawing";

/** How much each label size scales the labels' normal size */
export const LABEL_SIZE_SCALE: Record<MarcherLabelSize, number> = {
    small: 0.7,
    normal: 1,
    large: 1.4,
};

// Default settings that will be used if no localStorage data exists
export const defaultSettings: UiSettings = {
    isPlaying: false,
    lockX: false,
    lockY: false,
    snap: true,
    showFullDatabasePath: false,
    nextPaths: false,
    startFlagPositions: DEFAULT_START_FLAG_POSITIONS,
    stepSizeWarnings: false,
    showCollisions: false,
    gridLines: true,
    halfLines: true,
    fieldPerformanceMode: false,
    timelinePixelsPerSecond: 40,
    timelinePixelsPerBeat: 16,
    timelineCompact: false,
    timelineHeight: null,
    timelineZoomFitted: false,
    timelineWaveformStyle: "simplified",
    audioVolume: 100,
    audioMuted: false,
    focussedComponent: "canvas",
    mouseSettings: {
        trackpadMode: true,
        trackpadPanSensitivity: 0.5,
        zoomSensitivity: 1.0,
    },
    coordinateRounding: {
        nearestXSteps: 0,
        referencePointX: undefined,
        nearestYSteps: 0,
        referencePointY: undefined,
    },
    marcherLabels: "auto",
    shapes: "selected",
    shapeFocus: "rest",
    shapeWalks: false,
    showPropNames: false,
    propNameOverrides: {},
    hiddenPropIds: {},
    tolgeeDevTools: false,
};

export const UI_SETTINGS_STORAGE_KEY = "openmarch:uiSettings";

const clampZoomSensitivity = (value: number): number =>
    Math.min(4.0, Math.max(0.5, value));

// Helper function to parse settings from a JSON string
// Throws on bad JSON or invalid structure
const parseSettings = (raw: string): UiSettings => {
    // `previousPaths` (Previous paths) gave way to start flag positions (#331): dropped
    const { previousPaths: _previousPaths, ...parsed } = JSON.parse(
        raw,
    ) as UiSettings & { previousPaths?: unknown };
    const mergedMouseSettings = {
        ...defaultSettings.mouseSettings,
        ...parsed.mouseSettings,
    };
    if (mergedMouseSettings.zoomSensitivity !== undefined) {
        mergedMouseSettings.zoomSensitivity = clampZoomSensitivity(
            mergedMouseSettings.zoomSensitivity,
        );
    }
    // Merge with default settings to ensure all properties exist
    // Deep merge nested objects to preserve new properties in defaults
    return {
        ...defaultSettings,
        ...parsed,
        // Never kept: a stored value (from before it was dropped on save) is ignored
        snap: defaultSettings.snap,
        timelineHeight: parseTimelineHeight(parsed.timelineHeight),
        timelineWaveformStyle: parseWaveformStyle(parsed.timelineWaveformStyle),
        startFlagPositions: parseStartFlagPositions(parsed.startFlagPositions),
        mouseSettings: mergedMouseSettings,
        coordinateRounding: parsed.coordinateRounding
            ? {
                  ...defaultSettings.coordinateRounding,
                  ...parsed.coordinateRounding,
              }
            : defaultSettings.coordinateRounding,
    };
};

// Helper function to load settings from localStorage
const loadSettings = (): UiSettings => {
    try {
        const stored = localStorage.getItem(UI_SETTINGS_STORAGE_KEY);
        return stored ? parseSettings(stored) : defaultSettings;
    } catch (error) {
        console.error("Failed to load UI settings from localStorage:", error);
        return defaultSettings;
    }
};

// Helper function to save settings to localStorage
const saveSettings = (settings: UiSettings): void => {
    // The Snap toggle is never kept
    const { snap: _snap, ...kept } = settings;
    try {
        localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(kept));
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
    setTimelinePixelsPerBeat: (pixelsPerBeat: number) => void;
    setTimelineZoomFitted: (fitted: boolean) => void;
    /** Turns the compact timeline on or off (`!timelineCompact` without an argument) */
    setTimelineCompact: (compact?: boolean) => void;
    setTimelineHeight: (height: number | null) => void;
    /** Saves both start flag positions states, narrowing paths to the dots level */
    setStartFlagPositions: (settings: StartFlagPositionsSettings) => void;
    toggleAudioMute: () => void;
    setAudioVolume: (volume: number) => void;
    /** Turns the Snap toggle on or off (`!snap` without an argument); never saved */
    setSnap: (on?: boolean) => void;
}
interface UiSettingsStoreInterface
    extends UiSettingsStoreState, UiSettingsStoreActions {}

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

            if (uiSettings.mouseSettings?.zoomSensitivity !== undefined) {
                uiSettings.mouseSettings.zoomSensitivity = clampZoomSensitivity(
                    uiSettings.mouseSettings.zoomSensitivity,
                );
            }

            if (uiSettings.lockX && type === "lockX") {
                uiSettings.lockY = false;
            }

            if (uiSettings.lockY && type === "lockY") {
                uiSettings.lockX = false;
            }

            // Disable collisions for now
            uiSettings.showCollisions = false;

            set({ uiSettings: uiSettings });
            saveSettings(uiSettings);
        },

        setPixelsPerSecond: (pixelsPerSecond: number) =>
            setSetting("timelinePixelsPerSecond", pixelsPerSecond),
        setTimelinePixelsPerBeat: (pixelsPerBeat: number) =>
            setSetting("timelinePixelsPerBeat", pixelsPerBeat),
        setTimelineZoomFitted: (fitted: boolean) =>
            setSetting("timelineZoomFitted", fitted),
        setTimelineHeight: (height: number | null) =>
            setSetting("timelineHeight", parseTimelineHeight(height)),
        setStartFlagPositions: (settings: StartFlagPositionsSettings) =>
            setSetting("startFlagPositions", clampStartFlagPositions(settings)),
        setTimelineCompact: (compact?: boolean) =>
            setSetting(
                "timelineCompact",
                compact ?? !get().uiSettings.timelineCompact,
            ),
        toggleAudioMute: () => {
            const current = get().uiSettings;
            const newSettings = {
                ...current,
                audioMuted: !current.audioMuted,
            };
            set({ uiSettings: newSettings });
            saveSettings(newSettings);
        },
        setAudioVolume: (volume: number) => {
            const clampedVolume = Math.min(100, Math.max(0, volume));
            const current = get().uiSettings;
            const newSettings = {
                ...current,
                audioVolume: clampedVolume,
                audioMuted: clampedVolume === 0 ? true : current.audioMuted,
            };
            if (clampedVolume > 0 && current.audioMuted) {
                newSettings.audioMuted = false;
            }
            set({ uiSettings: newSettings });
            saveSettings(newSettings);
        },
        setSnap: (on?: boolean) => {
            const current = get().uiSettings;
            const snap = on ?? !current.snap;
            if (current.snap === snap) return;
            set({ uiSettings: { ...current, snap } });
        },
    }),
);

// Another window's save carries no Snap toggle: this window keeps its own
syncFromStorage(UI_SETTINGS_STORAGE_KEY, parseSettings, (uiSettings) =>
    useUiSettingsStore.setState((state) => ({
        uiSettings: { ...uiSettings, snap: state.uiSettings.snap },
    })),
);

/** The Snap toggle as it is now (`UiSettings.snap`), for code that reads it at event time */
export const isSnapOn = (): boolean =>
    useUiSettingsStore.getState().uiSettings.snap;
/**
 * Sets one setting and saves it. An unchanged value keeps the settings object, so nothing
 * re-renders and nothing is written (the timeline saves its zoom and fit after every gesture).
 */
function setSetting<K extends keyof UiSettings>(key: K, value: UiSettings[K]) {
    const current = useUiSettingsStore.getState().uiSettings;
    if (current[key] === value) return;
    const newSettings = { ...current, [key]: value };
    useUiSettingsStore.setState({ uiSettings: newSettings });
    saveSettings(newSettings);
}
