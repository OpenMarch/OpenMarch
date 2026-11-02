import type { QueryClient } from "@tanstack/react-query";
import { db } from "@/global/database/db";
import { transactionWithHistory } from "@/db-functions/history";
import {
    moveHoldsAnyOf,
    saveShapeRecipeInTransaction,
    type ShapeRecipeMember,
    type ShapeRecipeRecord,
} from "@/db-functions/shapeRecipes";
import { historyKeys } from "@/hooks/queries/useHistory";
import {
    transformMarchersInSelection,
    type CanvasEditPlan,
} from "@/timeline/timelineCoordinateWrites";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { invalidatePlacedBoxes } from "../placed/placedBoxStore";
import type { ShapeContext } from "../types";
import { orderOf, targetsOf, type ToolState } from "./toolMachine";

/**
 * What placing a shape writes: its recipe, and where each member stands in it (ADR 0006). Spots
 * and who goes where are separate: `recipe.params.spots` counts the spots, `members` says who
 * stands on which.
 */
export interface ShapePlacement {
    readonly recipe: ShapeRecipeRecord;
    readonly members: readonly ShapeRecipeMember[];
    /**
     * The recipe this placement edits (a placed shape changed again): replaced when it belongs to
     * the move being written, kept as the earlier move's own otherwise
     */
    readonly replaces?: {
        readonly id: number;
        readonly timelineId: number | null;
    };
    /**
     * Set every member even when nobody moves. The caller decides when: a shape changed on a later
     * page it's only carried onto (`commitBox`), so that page gets its own copy for a change that
     * moves no one (its pivot), and the earlier page keeps its own
     */
    readonly setAll?: boolean;
}

/** What placing the open shape would write; null while there is nothing to place */
export function placementOf(
    tool: ToolState,
    ctx: ShapeContext,
): ShapePlacement | null {
    if (tool.gesture || tool.params === null) return null;
    const targets = targetsOf(tool, ctx);
    if (targets.length === 0) return null;
    const kind = tool.kind.shape;
    return {
        recipe: {
            kind: kind.id,
            kindVersion: kind.version,
            // The spot count keeps holes when members leave later
            params: { ...(tool.params as object), spots: tool.spots },
            // Least travel, or a Line's order (#528); drill order is gone (#429)
            ...orderOf(tool),
        },
        members: targets.map((t) => ({
            marcherId: t.id,
            slot: t.slot,
            x: t.to.x,
            y: t.to.y,
        })),
    };
}

/**
 * Writes a placement: the one write behind every shape placed (#344), a new one (`placeShape`)
 * or an edit of a placed one (`commitBox`). Its members move to their spots through the same path as a canvas drag (they
 * leave the start flag and arrive at the playhead), and the recipe is saved in the same edit, so
 * the two are one undo step. False when the write failed (a toast says why).
 */
export async function writePlacement(
    placement: ShapePlacement,
    queryClient: QueryClient,
    /** The toast's title if the write fails */
    failure: string,
    /**
     * The edit window to write to, the current one unless given: a shape placed because the
     * moment moved on goes where it was drawn, and the playhead stays where it was moved to
     */
    plan: CanvasEditPlan | null = null,
): Promise<boolean> {
    const { members, replaces } = placement;
    const to = new Map(members.map((m) => [m.marcherId, m]));
    const marcherIds = members.map((m) => m.marcherId);
    let saved = false;
    try {
        await transformMarchersInSelection({
            db,
            marcherIds: members.map((m) => m.marcherId),
            transform: (current) =>
                current.flatMap((c) => {
                    const spot = to.get(c.marcher_id);
                    return spot
                        ? [{ marcher_id: c.marcher_id, x: spot.x, y: spot.y }]
                        : [];
                }),
            ...(plan ? { plan, keepPlayhead: true } : {}),
            writesShapes: true,
            // Every member is set where the shape is, the one at its pivot included, so each
            // is in the move its recipe keeps; a change that moves nobody sets no one, unless
            // `setAll`
            setUnmoved: true,
            setAll: placement.setAll,
            afterWrite: async (tx, timelineId) => {
                // A move none of the members are in would keep no one: the edit moved nobody there,
                // and is saved below instead (#485)
                if (!(await moveHoldsAnyOf(tx, timelineId, marcherIds)))
                    return false;
                saved = true;
                await saveShapeRecipeInTransaction({
                    tx,
                    timelineId,
                    recipe: placement.recipe,
                    members,
                    replaces:
                        replaces && replaces.timelineId === timelineId
                            ? replaces.id
                            : undefined,
                });
            },
        });
        // Nobody moved and no move here holds the shape's members (a change without `setAll`):
        // the change goes to the recipe shown, in its own move
        if (!saved && replaces) {
            await transactionWithHistory(db, "editShapeRecipe", (tx) =>
                saveShapeRecipeInTransaction({
                    tx,
                    timelineId: replaces.timelineId,
                    recipe: placement.recipe,
                    members,
                    replaces: replaces.id,
                }),
            );
            invalidatePlacedBoxes();
        }
    } catch (e) {
        toastTimelineError(e, failure);
        return false;
    }
    // Not a React Query mutation, so refresh what one would
    void queryClient.invalidateQueries({ queryKey: historyKeys.all() });
    return true;
}
