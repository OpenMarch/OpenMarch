import type {
    AreaKind,
    FieldEditor,
    FieldPointer,
} from "@/field/editor/fieldEditor";
import {
    activeFieldDragMode,
    fieldDragAction,
    holdDragSelects,
    type FieldDragAction,
    type FieldDragMode,
} from "@/components/canvas/touch/fieldDragMode";
import type { SingleFingerRole } from "./fieldGestures";

/**
 * The pill's drag mode on the field (tablet plan 1.3): what a finger or pen
 * press does once it is known to start on empty field. A press on a marcher,
 * a handle or inside the selection box edits as always, and a mouse never
 * comes here.
 */

type Editor = Pick<FieldEditor, "fingerEdits" | "pressOnEmptyField">;

const AREA: Record<Exclude<FieldDragAction, "pan">, AreaKind> = {
    box: "marquee",
    lasso: "lasso",
};

/**
 * What a single finger's press does: edit what it lands on, or, on empty
 * field, what the drag mode says (move the view in Auto and Pan, draw a box
 * or lasso in Box and Lasso). With the prop tool on, or a field mode that
 * claims the press (the open shape tool claims them all), the finger edits:
 * it draws (tablet 1.4). With a mode on that doesn't claim it, an
 * empty-field finger keeps moving the view.
 */
export function fingerRole(
    editor: Editor,
    press: FieldPointer,
    mode: FieldDragMode = activeFieldDragMode(),
): SingleFingerRole {
    if (editor.fingerEdits(press)) return "edit";
    const action = fieldDragAction(mode, "touch");
    if (action === "pan" || !editor.pressOnEmptyField(press)) return "navigate";
    return AREA[action];
}

/** A finger held still on empty field, then dragged: a box in Auto and Pan, else null. */
export function holdDragArea(
    editor: Editor,
    press: FieldPointer,
    mode: FieldDragMode = activeFieldDragMode(),
): AreaKind | null {
    return holdDragSelects(mode) && editor.pressOnEmptyField(press)
        ? "marquee"
        : null;
}

/**
 * What a pen press does, as `fieldPointerInput.ts` asks it: null leaves it to
 * the editor as a mouse press (Auto and Box: a drag from empty field draws a
 * box, as a mouse's does), `"pan"` moves the view, and `"lasso"` draws a lasso
 * through the editor.
 */
export function penDrag(
    editor: Editor,
    press: FieldPointer,
    mode: FieldDragMode = activeFieldDragMode(),
): "pan" | "lasso" | null {
    const action = fieldDragAction(mode, "pen");
    if (action === "box" || !editor.pressOnEmptyField(press)) return null;
    return action;
}
