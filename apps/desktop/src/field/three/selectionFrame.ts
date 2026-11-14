import type { FieldEditor } from "@/field/editor/fieldEditor";
import {
    boundsOf,
    handlePoints,
    type HandleId,
    type SelectionFrame,
} from "@/field/editor/groupTransform";
import type { FieldPoint } from "@/field/editor/fieldEditor";
import { itemSelectionFrame } from "@/field/editor/itemTransform";
import type { FieldMarchers } from "./fieldMarchers";
import type { FieldItems } from "./fieldItems";
import { selectionBoxPadding } from "./selectionRing";

/**
 * The selection box without its padding, which follows the zoom; an item's
 * frame sits on its Outline, with none.
 */
export type DrawnSelectionBox = Omit<SelectionFrame, "pad"> & { pad?: number };

/**
 * The selection box as the field draws it, in field units, or null when
 * fewer than two marchers are selected (a single marcher gets its ring and
 * no box or handles). It fits the selected marchers where they're drawn,
 * except while a rotation is dragged, when it turns with them (#198). None
 * while a mode with its own handles is on (the shape tool, a selected placed
 * box, #204) or the prop tool (C2.1): its handles do nothing then. The overlay
 * draws it and the field test API reads its handles.
 *
 * One item selected alone gets its own frame instead (C2.1): on its Outline,
 * turned with it, with handles that resize and turn it.
 *
 * While an order lane shows on the selection (pathways step 4j) the box also
 * takes in the lane, its tip and its names (`covers`), and is drawn as a
 * hairline with corner handles, so it never sits on the lane.
 */
export function drawnSelectionBox(
    marchers: FieldMarchers,
    editor: FieldEditor,
    items?: FieldItems,
): DrawnSelectionBox | null {
    if (editor.modeOwnsSelectionBox() || editor.propToolShape()) return null;
    const rotating = editor.rotationFrame();
    if (rotating) return rotating;
    const { selected, positions, hidden } = marchers;
    const item = items && selectedItemFrame(marchers, items);
    if (item) return item;
    const drawn: FieldPoint[] = [];
    // Hidden marchers aren't drawn, and the editor's handles skip them too
    for (let i = 0; i < selected.length; i++)
        if (selected[i] && !hidden[i])
            drawn.push({ x: positions[i * 2], y: positions[i * 2 + 1] });
    const box = drawn.length < 2 ? null : boundsOf(drawn);
    // Clear of the order lane drawn on the selection (step 4j)
    return box && { box, angle: 0, covers: editor.selectionCovers() };
}

/** The frame of the one item selected and drawn, or null for any other selection. */
function selectedItemFrame(
    marchers: FieldMarchers,
    items: FieldItems,
): DrawnSelectionBox | null {
    const { selected, ids } = marchers;
    let only: number | null = null;
    for (let i = 0; i < selected.length; i++) {
        if (!selected[i]) continue;
        if (only !== null) return null;
        only = ids[i];
    }
    if (only === null || !items.isItem(only)) return null;
    const frame = items.frameOf(only);
    return frame && itemSelectionFrame(frame);
}

/** The handles of `box` at `zoom`, in field units. */
export const selectionHandles = (
    box: DrawnSelectionBox,
    zoom: number,
): Record<HandleId, FieldPoint> =>
    handlePoints({ ...box, pad: box.pad ?? selectionBoxPadding(zoom) }, zoom);
