import { create } from "zustand";

/**
 * Notes about each move that the timeline works out from its tracks and the inspector's Move card
 * shows too (UI-14 review): why a move's clip is dashed, "Overridden by Move 4 on Page 3, counts
 * 1–4", by stored timeline id. Kept by `TimelineModePanel`.
 */
interface MoveNotesState {
    readonly overridden: ReadonlyMap<number, string>;
    readonly setOverridden: (overridden: ReadonlyMap<number, string>) => void;
}

export const useMoveNotesStore = create<MoveNotesState>((set) => ({
    overridden: new Map(),
    setOverridden: (overridden) => set({ overridden }),
}));
