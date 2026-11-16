import { create } from "zustand";

/**
 * The cue picked in a cue lane (fork #992): the one "Add selected to this cue", "Remove selected
 * from this cue", "Make momentary" and "Delete cue" act on. Null when none is picked; those
 * commands then act on the single Equipment cue on the playhead's count, if there is exactly one.
 * Not saved; a cue that goes away (undo, a delete) is dropped where it's read.
 */
interface CueSelectionState {
    readonly cueId: number | null;
    readonly pick: (cueId: number | null) => void;
}

export const useCueSelectionStore = create<CueSelectionState>((set) => ({
    cueId: null,
    pick: (cueId) => set({ cueId }),
}));
