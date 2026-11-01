import { planCanvasEdit } from "@/timeline/timelineCoordinateWrites";
import {
    currentShapeField,
    marchersOnField,
    shapeContextFor,
} from "../field/shapeFieldContext";
import { shapeSelectionGate } from "./selectionGate";
import { toolEnvFor } from "./toolEnv";
import type { AnyToolKind } from "./toolKind";
import { openTool, switchKind } from "./toolMachine";
import {
    closeShapeTool,
    isShapeShown,
    openShapeTool,
    updateTool,
    useShapeToolStore,
} from "./shapeToolStore";
import { startOverWaitingShape } from "./shapeLeave";

export type KindPickGate =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: string };

/**
 * Whether a kind can be picked now, and why not: with a shape showing it always can (the shape
 * turns into it); otherwise it opens on the selection, so the selection gate decides. Pass
 * whether one is showing (`useShapeShown`): one waiting elsewhere is dismissed instead (#416).
 */
export function kindPickGate(
    shapeOpen: boolean,
    selected: readonly { readonly id: number }[],
): KindPickGate {
    if (shapeOpen) return { ok: true };
    const gate = shapeSelectionGate(selected);
    return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
}

/**
 * A click on the kind that's already picked, in the Shapes tab (#411): with nothing drawn yet it
 * closes the tool, as a second click on a tool does; once a shape is drawn it does nothing, so a
 * stray click never throws a shape away (Escape still discards it)
 */
export function clickPickedKind(): void {
    const { tool } = useShapeToolStore.getState();
    if (tool && tool.params === null && !tool.gesture) closeShapeTool();
}

/**
 * The host's way to pick a shape kind (#344), for the Shapes tab, the kind's key, the ring and the
 * command bar alike. With no shape open it arms `kind` on the selected performers, ready to draw.
 * With one showing, the open shape turns into `kind` keeping its frame (center, size, turn and
 * flip) as one undo step. One waiting away from its moment is dismissed as Escape would, undo
 * bringing it back, and the new kind arms here (#416). False when nothing happened (no field, or
 * nobody selected).
 */
export function pickShapeKind(
    kind: AnyToolKind,
    selected: readonly { readonly id: number }[],
): boolean {
    const field = currentShapeField();
    if (!field) return false;
    if (isShapeShown()) {
        updateTool((tool) =>
            switchKind(tool, kind, shapeContextFor(field), toolEnvFor(field)),
        );
        return true;
    }
    const gate = shapeSelectionGate(selected);
    if (!gate.ok) return false;
    const startingOver = useShapeToolStore.getState().tool !== null;
    startOverWaitingShape();
    openShapeTool(
        openTool(kind, marchersOnField(field, gate.ids)),
        planCanvasEdit(),
        undefined,
        { keepDiscarded: startingOver },
    );
    return true;
}
