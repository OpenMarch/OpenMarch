/**
 * PROTOTYPE (tempo mode, branch tempo/track-proto): the tempo lanes' UI state, shared by the lanes,
 * their toolbar and the shortcuts: the selected counts, tap tempo, the add/remove answer, and
 * where the mode's header row is.
 */
import { create } from "zustand";
import { addTap } from "./tapTempoMath";

/** Adding or removing counts: re-divide the same time, or shift everything after */
export type CountChoice = "keep" | "shift";
/** The add/remove box's answers: those two, or (adding one count) hold the drill instead */
export type CountAnswer = CountChoice | "hold";

/** The last answer to the add/remove box, or null when there's none yet */
export const readChoice = (): CountAnswer | null => {
    try {
        const v = localStorage.getItem("tempoProto.countChoice");
        return v === "keep" || v === "shift" || v === "hold" ? v : null;
    } catch {
        return null;
    }
};

export interface TempoUiState {
    /** The last answer in the add/remove box, or null before the first */
    choice: CountAnswer | null;
    /** Selected counts (spec beats, `to` exclusive), from dragging along the measures lane */
    range: { from: number; to: number } | null;
    /** Whether the tap tempo panel is open */
    tapOpen: boolean;
    /** Tap tempo's taps (ms, `performance.now()`) since it last started over */
    tapTimes: number[];
    setChoice: (choice: CountAnswer) => void;
    setRange: (range: { from: number; to: number } | null) => void;
    setTapOpen: (open: boolean) => void;
    /** One tap at `now` (ms): opens the panel */
    tap: (now: number) => void;
    resetTaps: () => void;
}

export const useTempoUi = create<TempoUiState>((set) => ({
    choice: readChoice(),
    range: null,
    tapOpen: false,
    tapTimes: [],
    setChoice: (choice) => {
        try {
            localStorage.setItem("tempoProto.countChoice", choice);
        } catch {
            /* a per-viewer convenience only */
        }
        set({ choice });
    },
    setRange: (range) => set({ range }),
    setTapOpen: (tapOpen) => set({ tapOpen }),
    tap: (now) =>
        set((s) => ({ tapOpen: true, tapTimes: addTap(s.tapTimes, now) })),
    resetTaps: () => set({ tapTimes: [] }),
}));

/** Where tempo mode's header goes: a row over the timeline's transport (`TimelineBand.header`) */
export const useHeaderSlot = create<{
    element: HTMLElement | null;
    setElement: (element: HTMLElement | null) => void;
}>((set) => ({
    element: null,
    setElement: (element) => set({ element }),
}));
