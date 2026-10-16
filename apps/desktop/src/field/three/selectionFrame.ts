import type { FieldEditor } from "@/field/editor/fieldEditor";
import {
    boundsOf,
    handlePoints,
    type HandleId,
    type SelectionFrame,
} from "@/field/editor/groupTransform";
import type { FieldPoint } from "@/field/editor/fieldEditor";
import type { FieldMarchers } from "./fieldMarchers";
import { selectionBoxPadding } from "./selectionRing";

/** The selection box without its padding, which follows the zoom. */
export type DrawnSelectionBox = Omit<SelectionFrame, "pad">;

/**
 * The selection box as the field draws it, in field units, or null when
 * fewer than two marchers are selected (a single marcher gets its ring and
 * no box or handles). It fits the selected marchers where they're drawn,
 * except while a rotation is dragged, when it turns with them (#198). None
 * while the line tool is on: its handles do nothing then (#203). The overlay
 * draws it and the field test API reads its handles.
 */
export function drawnSelectionBox(
    marchers: FieldMarchers,
    editor: FieldEditor,
): DrawnSelectionBox | null {
    if (editor.lineToolShape()) return null;
    const rotating = editor.rotationFrame();
    if (rotating) return rotating;
    const { selected, positions, hidden } = marchers;
    const drawn: FieldPoint[] = [];
    // Hidden marchers aren't drawn, and the editor's handles skip them too
    for (let i = 0; i < selected.length; i++)
        if (selected[i] && !hidden[i])
            drawn.push({ x: positions[i * 2], y: positions[i * 2 + 1] });
    const box = drawn.length < 2 ? null : boundsOf(drawn);
    return box && { box, angle: 0 };
}

/** The handles of `box` at `zoom`, in field units. */
export const selectionHandles = (
    box: DrawnSelectionBox,
    zoom: number,
): Record<HandleId, FieldPoint> =>
    handlePoints({ ...box, pad: selectionBoxPadding(zoom) }, zoom);
