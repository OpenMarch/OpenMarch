import type { LibraryPrunePlan } from "@/view3d/library/showLibraryPrune";
import { pruneShowLibraryInTransaction } from "./showLibrary";
import type { DbConnection } from "./types";

/**
 * Save's prune of the show's Library (props-spec section 2, ADR 0002 D-12):
 * removes the embedded Versions nothing keeps, then the blobs no Version
 * names. Kept: everything `libraryReferences` finds (the floor, the Item
 * tables, undo and redo history). The app autosaves, so this runs when the
 * show closes and before Save Copy. Outside undo history, like embedding.
 */
export function pruneShowLibraryOnSave({
    db,
}: {
    db: DbConnection;
}): Promise<LibraryPrunePlan> {
    return db.transaction(async (tx) =>
        pruneShowLibraryInTransaction({ tx, keep: [] }),
    );
}
