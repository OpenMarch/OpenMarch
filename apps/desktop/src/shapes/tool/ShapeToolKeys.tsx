import {
    discardShapeTool,
    restoreDiscardedShape,
    undoOpenShape,
} from "./shapeLeave";
import { NUDGE_ACTION_IDS, type NudgeArgs } from "@/shortcuts/definitions";
import { resolveNudgeDistance } from "@/shortcuts/nudge";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    useActionHandler,
    useActionHandlerGroup,
} from "@/shortcuts/useActionHandler";
import { currentShapeField, shapeContextFor } from "../field/shapeFieldContext";
import { nudgeEnvFor } from "./toolEnv";
import { edit, redo } from "./toolMachine";
import { updateTool, useShapeToolStore } from "./shapeToolStore";
import { cancelShapeGesture } from "./shapeToolMode";

const NUDGE_DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
} as const;

/**
 * The keys the open shape tool takes over. Mounted only while it's open, after the editor's own
 * handlers, so these sit on top of them and the keys go back once the tool closes.
 *
 * - Escape: a gesture goes back to where it started; otherwise the tool closes, placing nothing.
 *   That is an undo step: undo right after it brings the shape back ({@link DiscardedShapeKeys}).
 * - Undo and Redo step through the shape's own edits; the show is untouched until Place.
 * - The nudge keys move the whole shape, as one undo step each (08), not the marchers under it.
 */
export function ShapeToolKeys(): null {
    const rounding = useUiSettingsStore((s) => s.uiSettings.coordinateRounding);
    useActionHandler("cancelAlignmentUpdates", () => {
        const { tool } = useShapeToolStore.getState();
        if (tool?.gesture) cancelShapeGesture();
        else discardShapeTool();
    });
    useActionHandler("performUndo", undoOpenShape);
    useActionHandler("performRedo", () => updateTool(redo));
    useActionHandlerGroup(NUDGE_ACTION_IDS, (_id, args) => {
        const field = currentShapeField();
        if (!field) return;
        const nudge = args as unknown as NudgeArgs;
        const d = NUDGE_DIRECTIONS[nudge.direction];
        const px =
            resolveNudgeDistance(nudge, rounding) *
            field.fieldProperties.pixelsPerStep;
        const env = nudgeEnvFor(field, nudge);
        updateTool((tool) => {
            if (tool.params === null || tool.gesture) return tool;
            const params = tool.kind.move(
                tool.params,
                tool.marchers.length,
                { x: d.x * px, y: d.y * px },
                env,
            );
            return edit(tool, params, shapeContextFor(field));
        });
    });
    return null;
}

/**
 * Mounted while a shape Escape discarded can still come back, on top of the editor's keys: the
 * undo right after Escape opens the shape again, with its numbers and who goes where, instead of
 * undoing the show (spec #344). Anything else that happens first (an edit, a new moment, another
 * selection) ends this, and undo is the show's again.
 */
export function DiscardedShapeKeys(): null {
    useActionHandler("performUndo", () => {
        restoreDiscardedShape();
    });
    return null;
}
