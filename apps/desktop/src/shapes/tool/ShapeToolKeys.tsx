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
import { clearSelection, edit, finishPoints, redo } from "./toolMachine";
import { updateTool, useShapeToolStore } from "./shapeToolStore";
import { cancelShapeGesture, removeLastShapePoint } from "./shapeToolMode";

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
 * - Escape: a gesture goes back to where it started; a selected point (#557) is cleared;
 *   otherwise the tool closes, placing nothing. The touch layout's Discard (`shapeDiscard`) does
 *   the same, skipping the selected point.
 * - Enter while clicking a line's points finishes the line (#524); otherwise it's Place.
 *   That is an undo step: undo right after it brings the shape back ({@link DiscardedShapeKeys}).
 * - Backspace or Delete while clicking a line's points takes the last one back, as a right-click
 *   does (owner, option A on #522), and so does undo; otherwise undo and redo step through the
 *   shape's own edits. The show is untouched until Place.
 * - The nudge keys move the whole shape, as one undo step each (08), not the marchers under it.
 */
export function ShapeToolKeys(): null {
    const rounding = useUiSettingsStore((s) => s.uiSettings.coordinateRounding);
    useActionHandler("cancelAlignmentUpdates", () => {
        const { tool } = useShapeToolStore.getState();
        if (tool?.gesture) cancelShapeGesture();
        // A selected point first (#557), then the shape
        else if (tool?.selected) updateTool(clearSelection);
        else discardShapeTool();
    });
    // The touch layout's Discard (tablet 1.4): Escape's, without its first step of letting go of
    // a selected point. A drag or the points being clicked go; otherwise the shape, placing nothing
    useActionHandler(
        "shapeDiscard",
        () => {
            const { tool } = useShapeToolStore.getState();
            if (tool?.gesture) cancelShapeGesture();
            else discardShapeTool();
        },
        { ignoreRepeat: true },
    );
    // Enter while clicking points finishes the line rather than placing it (#524). Registered
    // only then: a handler on top that can't run doesn't let Enter through to Place.
    const clicking = useShapeToolStore(
        (s) => s.tool?.gesture?.type === "points",
    );
    useActionHandler(
        "applyShape",
        () => {
            const field = currentShapeField();
            if (field)
                updateTool((t) => finishPoints(t, shapeContextFor(field)));
        },
        {},
        clicking,
    );
    // Registered only while clicking points, so Backspace and Delete reach nothing else then
    useActionHandler(
        "shapeRemoveLastPoint",
        () => {
            removeLastShapePoint();
        },
        {},
        clicking,
    );
    useActionHandler("performUndo", () => {
        if (!removeLastShapePoint()) undoOpenShape();
    });
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
