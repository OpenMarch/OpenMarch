import { cancelGesture, undo } from "./toolMachine";
import {
    closeShapeTool,
    isShapeAway,
    updateTool,
    useShapeToolStore,
} from "./shapeToolStore";

/**
 * How an open shape ends without Enter (spec #344, "Leaving"; #416):
 *
 * - Nothing else places it. Moving around the timeline, playing and a new selection
 *   leave it open; while it can't be seen it waits (`isShapeHidden`) and nothing acts on it.
 * - Escape: the shape is discarded, and that is an undo step of its own: undo right after it
 *   brings the shape back with its numbers, who goes where and its own history. The away chip's
 *   Dismiss, and starting a new shape away from a waiting one, discard it the same way.
 */

/** Escape: closes the open tool, placing nothing, and keeps its shape for undo */
export function discardShapeTool(): void {
    const { tool, openedAt, moment } = useShapeToolStore.getState();
    if (!tool) return;
    closeShapeTool();
    const settled = cancelGesture(tool);
    if (settled.params !== null)
        useShapeToolStore.setState({
            discarded: { tool: settled, openedAt, moment },
        });
}

/**
 * A new shape is starting (B, the Shapes tab, the ring, the command bar): one waiting away from
 * its moment is dismissed as Escape would, so the new one opens here (#416). Nothing happens to
 * a shape that is showing, which the new kind changes instead.
 */
export function startOverWaitingShape(): void {
    if (useShapeToolStore.getState().tool && isShapeAway()) discardShapeTool();
}

/**
 * Undo with a shape open: a step back in its own history. With nothing drawn and no history,
 * a shape dismissed to start this one comes back instead.
 */
export function undoOpenShape(): void {
    const { tool, discarded } = useShapeToolStore.getState();
    if (!tool) return;
    if (discarded && tool.params === null && tool.past.length === 0) {
        closeShapeTool();
        restoreDiscardedShape();
        return;
    }
    updateTool(undo);
}

/** Whether undo now would bring back a discarded shape */
export function hasDiscardedShape(): boolean {
    return useShapeToolStore.getState().discarded !== null;
}

/** Undo after Escape: opens the discarded shape again. False when there is none to bring back */
export function restoreDiscardedShape(): boolean {
    const { discarded, tool } = useShapeToolStore.getState();
    if (!discarded || tool) return false;
    useShapeToolStore.setState({
        tool: discarded.tool,
        openedAt: discarded.openedAt,
        moment: discarded.moment,
        discarded: null,
    });
    return true;
}

/** Something else happened since Escape (an edit, a new moment): undo is the show's again */
export function forgetDiscardedShape(): void {
    if (hasDiscardedShape()) useShapeToolStore.setState({ discarded: null });
}
