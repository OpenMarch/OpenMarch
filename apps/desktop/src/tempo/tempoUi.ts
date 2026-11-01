/**
 * PROTOTYPE (tempo mode, branch tempo/track-proto): the tempo lanes' UI state, shared by the lanes,
 * their toolbar and the shortcuts: the selected counts, taps and drafts, the add/remove answer, and
 * where the mode's header row is.
 */
import { create } from "zustand";

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
    /** Whether grabbing the music, count lines and taps snap to hits in the music */
    snap: boolean;
    /** Selected counts (spec beats, `to` exclusive), from dragging along the measures lane */
    range: { from: number; to: number } | null;
    /** Taps of the pass in progress (show seconds), or null when not tapping */
    taps: number[] | null;
    /** Taps waiting to be applied: which count, and when */
    draft: { beat: number; seconds: number }[] | null;
    /** Counts the last fit placed without a hit to land on */
    unsure: ReadonlySet<number>;
    setChoice: (choice: CountAnswer) => void;
    setSnap: (snap: boolean) => void;
    setRange: (range: { from: number; to: number } | null) => void;
    setTaps: (taps: number[] | null) => void;
    setDraft: (draft: { beat: number; seconds: number }[] | null) => void;
    setUnsure: (unsure: ReadonlySet<number>) => void;
}

export const useTempoUi = create<TempoUiState>((set) => ({
    choice: readChoice(),
    snap: true,
    range: null,
    taps: null,
    draft: null,
    unsure: new Set(),
    setChoice: (choice) => {
        try {
            localStorage.setItem("tempoProto.countChoice", choice);
        } catch {
            /* a per-viewer convenience only */
        }
        set({ choice });
    },
    setSnap: (snap) => set({ snap }),
    setRange: (range) => set({ range }),
    setTaps: (taps) => set({ taps }),
    setDraft: (draft) => set({ draft }),
    setUnsure: (unsure) => set({ unsure }),
}));

/** Where tempo mode's header goes: a row over the timeline's transport (`TimelineBand.header`) */
export const useHeaderSlot = create<{
    element: HTMLElement | null;
    setElement: (element: HTMLElement | null) => void;
}>((set) => ({
    element: null,
    setElement: (element) => set({ element }),
}));
