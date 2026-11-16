import { create } from "zustand";
import type { PlacedBox } from "./placedBox";

/**
 * Placed boxes and the selection (docs/timeline/research/shapes/07-placed-boxes.md): the box whose
 * members are exactly the selected marchers, if any, and the box you've double-clicked into.
 */
export const useBoxSelectionStore = create<{
    /** The placed box that is selected as a whole */
    readonly selected: PlacedBox | null;
    /** The recipe id of the box you're inside, picking its marchers one by one */
    readonly inside: number | null;
    /** Whether a click on a member selects its box (`useBoxSelection`) */
    readonly enabled: boolean;
}>(() => ({ selected: null, inside: null, enabled: false }));

export const setInsideBox = (inside: number | null): void =>
    useBoxSelectionStore.setState({ inside });

/**
 * The selected box as a number in its floating editor is being dragged, before it's saved on
 * release; null otherwise. The field draws it live.
 */
export const usePlacedBoxPreviewStore = create<{
    readonly params: unknown;
    /** The drag is still held: only it lets go of its preview */
    readonly held: boolean;
}>(() => ({ params: null, held: false }));

/** A number drag shows the box drawn with `params`; null drops any preview */
export const previewPlacedBox = (params: unknown): void =>
    usePlacedBoxPreviewStore.setState({ params, held: params !== null });

/**
 * The number drag is released: its preview, which stays until the box is read back or its save is
 * done (`clearReleasedPreview`)
 */
export function releasePlacedBoxPreview(): unknown {
    usePlacedBoxPreviewStore.setState({ held: false });
    return usePlacedBoxPreviewStore.getState().params;
}

/**
 * Drops a released drag's preview: the box read back replaces it, or its save is done. Never a
 * drag still held: saves wait for the ones before them, so a later drag may have started (#515).
 * With `params`, only the preview of those.
 */
export function clearReleasedPreview(params?: unknown): void {
    const preview = usePlacedBoxPreviewStore.getState();
    if (preview.held || (params !== undefined && preview.params !== params))
        return;
    previewPlacedBox(null);
}

/**
 * A selected placed shape while its edits are being saved (`commitBox`): the shape as the last of
 * them will read it back, null with none going. Until then it's the box selected, so the shape
 * doesn't jump back to where it was, and a press or a key goes on from the edit (a second drag
 * right after the first used to start from the old shape and drop the first).
 */
export const useSavingBoxStore = create<{
    readonly box: PlacedBox | null;
    /** The beats it's saved for: a page it isn't on shows what's stored there (#776) */
    readonly beats: readonly number[];
}>(() => ({ box: null, beats: [] }));

/** The shape being saved, if the field showing `beat` shows it as saved */
export const savingBoxAt = (
    saving: {
        readonly box: PlacedBox | null;
        readonly beats: readonly number[];
    },
    beat: number,
): PlacedBox | null => (saving.beats.includes(beat) ? saving.box : null);
