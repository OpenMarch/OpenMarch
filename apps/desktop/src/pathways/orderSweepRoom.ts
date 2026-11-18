/**
 * Set order takes the field's presses and keys (pathways step 4g), and the order it draws waits
 * while a shape tool or the pen (the Follow tool too) is open. So opening it closes them first, as
 * opening either of them closes Set order (`useShapeFieldModes`), rather than running hidden
 * behind them.
 */
import tolgee from "@/global/singletons/Tolgee";
import {
    discardShapeTool,
    restoreDiscardedShape,
} from "@/shapes/tool/shapeLeave";
import { useShapeToolStore } from "@/shapes/tool/shapeToolStore";
import { cancelOrderSweep } from "./marcherOrderStore";
import { closePath, usePathPenStore } from "./pathPenStore";

/**
 * Why Set order can't open now, or null: a path being drawn with points placed, which closing
 * would throw away with no undo to bring it back
 */
export function orderSweepBlocked(
    session = usePathPenStore.getState().session,
): string | null {
    if (session?.phase === "drawing" && session.points.length > 0)
        return tolgee.t(
            "pathways.order.refuseDrawing",
            "Finish or cancel the path first",
        );
    return null;
}

/**
 * Closes what would hide Set order: an open shape tool (discarded as Escape does it, so undo
 * brings it back) and an open path or Follow tool (closed, its path left drawn). False, closing
 * nothing, when `orderSweepBlocked` says it can't open.
 */
export function makeRoomForOrderSweep(): boolean {
    if (orderSweepBlocked() !== null) return false;
    if (useShapeToolStore.getState().tool) discardShapeTool();
    const { session } = usePathPenStore.getState();
    if (session && session.phase !== "closed") closePath();
    return true;
}

/**
 * Undo or redo while Set order is on: it cancels Set order and undoes nothing in the show. Set
 * order writes nothing until it's kept, so the show's last edit isn't what the person sees as the
 * last step. Undo brings back a shape tool that opening Set order discarded (`makeRoomForOrderSweep`),
 * as undo right after Escape does; otherwise the next undo works as usual.
 */
export function undoInOrderSweep(redo = false): void {
    cancelOrderSweep();
    if (!redo) restoreDiscardedShape();
}
