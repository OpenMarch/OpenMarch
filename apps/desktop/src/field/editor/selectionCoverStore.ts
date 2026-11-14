import { create } from "zustand";
import type { FieldRect } from "./selectionArea";

/**
 * Ground the selection box stands clear of besides its marchers, in field units: the order lane
 * drawn on the selection, with its tip and its marchers' names (pathways step 4j). Set by the order
 * overlay, so the field imports nothing of pathways; the editor reads it through its
 * `selectionCovers` port and the overlay draws the box round it.
 */
export const useSelectionCoverStore = create<{
    readonly covers: FieldRect | null;
}>(() => ({ covers: null }));

/** Sets the cover; an equal rectangle keeps the old one, so nothing redraws for it */
export function setSelectionCover(covers: FieldRect | null): void {
    const now = useSelectionCoverStore.getState().covers;
    if (
        now === covers ||
        (now &&
            covers &&
            now.left === covers.left &&
            now.top === covers.top &&
            now.right === covers.right &&
            now.bottom === covers.bottom)
    )
        return;
    useSelectionCoverStore.setState({ covers });
}
