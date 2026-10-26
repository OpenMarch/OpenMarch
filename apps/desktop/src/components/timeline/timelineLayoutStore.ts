import { create } from "zustand";

/**
 * How the timeline is laid out in touch mode (the mouse layout is always the
 * full one): `expanded` shows the full timeline (transport card, pages and
 * audio); compact is one slim row. `showAudio` adds the waveform row to the
 * compact row. Both are remembered in localStorage.
 */
export const TIMELINE_EXPANDED_KEY = "openmarch:timelineExpanded";
export const TIMELINE_AUDIO_KEY = "openmarch:timelineShowAudio";

const readFlag = (key: string, fallback: boolean): boolean => {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : raw === "true";
    } catch {
        return fallback;
    }
};

const writeFlag = (key: string, value: boolean) => {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // Storage may be unavailable (private window); keep it in memory
    }
};

interface TimelineLayoutState {
    expanded: boolean;
    showAudio: boolean;
    setExpanded: (expanded: boolean) => void;
    setShowAudio: (showAudio: boolean) => void;
}

export const useTimelineLayoutStore = create<TimelineLayoutState>((set) => ({
    // Compact by default: tablets need the height for the field
    expanded: readFlag(TIMELINE_EXPANDED_KEY, false),
    showAudio: readFlag(TIMELINE_AUDIO_KEY, false),
    setExpanded: (expanded) => {
        writeFlag(TIMELINE_EXPANDED_KEY, expanded);
        set({ expanded });
    },
    setShowAudio: (showAudio) => {
        writeFlag(TIMELINE_AUDIO_KEY, showAudio);
        set({ showAudio });
    },
}));
