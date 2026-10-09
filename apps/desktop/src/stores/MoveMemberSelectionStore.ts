import { create } from "zustand";

/**
 * The marchers a Move card's **Select them** selected, and for which move (docs/timeline/ui.md
 * UI-14, round-2 review), so that going to another move can clear them if they are still the
 * selection (`useClearLeftoverMoveSelection`).
 */
export interface MoveMemberSelection {
    readonly timelineId: number;
    readonly marcherIds: ReadonlySet<number>;
}

interface MoveMemberSelectionState {
    readonly selected: MoveMemberSelection | null;
    readonly record: (selected: MoveMemberSelection) => void;
    readonly clear: () => void;
}

export const useMoveMemberSelectionStore = create<MoveMemberSelectionState>(
    (set) => ({
        selected: null,
        record: (selected) => set({ selected }),
        clear: () => set({ selected: null }),
    }),
);
