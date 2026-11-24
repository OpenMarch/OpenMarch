import { create } from "zustand";
import type { DatabaseCue } from "@/db-functions/cues";

/** What names a picked cue: its id and when it was made, since ids are per file. */
export interface CuePick {
    readonly cueId: number | null;
    readonly createdAt: string | null;
}

/**
 * The cue picked in a cue lane (fork #992): the one "Add selected to this cue", "Remove selected
 * from this cue", "Make momentary" and "Delete cue" act on. Null when none is picked; those
 * commands then act on the single Equipment cue on the playhead's count, if there is exactly one.
 * Not saved. A pick that names no cue in the open show (deleted, undone, or another show's cue
 * with the same id) counts as none (`pickedCueIn`), and `useCueCommands` clears it.
 */
interface CueSelectionState extends CuePick {
    readonly pick: (cue: Pick<DatabaseCue, "id" | "createdAt"> | null) => void;
}

export const useCueSelectionStore = create<CueSelectionState>((set) => ({
    cueId: null,
    createdAt: null,
    pick: (cue) =>
        set({ cueId: cue?.id ?? null, createdAt: cue?.createdAt ?? null }),
}));

/** The picked cue among `cues`: the one with its id and creation time, or null. */
export function pickedCueIn<C extends Pick<DatabaseCue, "id" | "createdAt">>(
    cues: readonly C[],
    { cueId, createdAt }: CuePick,
): C | null {
    if (cueId === null) return null;
    return (
        cues.find((c) => c.id === cueId && c.createdAt === createdAt) ?? null
    );
}
