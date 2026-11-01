import type { QueryClient } from "@tanstack/react-query";
import tolgee from "@/global/singletons/Tolgee";
import { db } from "@/global/database/db";
import { transactionWithHistory } from "@/db-functions/history";
import { deleteShapeRecipeInTransaction } from "@/db-functions/shapeRecipes";
import { historyKeys } from "@/hooks/queries/useHistory";
import {
    planCanvasEdit,
    timelinePositionsSettled,
    type CanvasEditPlan,
} from "@/timeline/timelineCoordinateWrites";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { queueHistoryStep } from "@/shortcuts/handlers/historyQueue";
import { writePlacement } from "../tool/shapePlacement";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { carriedOnto, storedBox } from "./commitBox";
import { UNGROUPED_KIND, type PlacedBox } from "./placedBox";
import { invalidatePlacedBoxes, placedBoxesRead } from "./placedBoxStore";

/**
 * **Ungroup** a selected placed shape: its marchers stay where they are and stop being a shape,
 * as one undo step. It follows the same rules as editing the shape (`commitBox`):
 *
 * - On the shape's own page (or an edit window reaching back over its move), the shape is deleted,
 *   and the later pages that held it follow.
 * - On a later page it's only carried onto, the change is that page's: its members are set there,
 *   as an edit that moves no one sets them, and an ungrouped mark (`UNGROUPED_KIND`) on that move
 *   ends the shape from there on. Earlier pages keep it, and later pages holding the form follow.
 *
 * It runs in the queue undo, redo and shape saves do, after what's queued before it.
 */
export function ungroupShape(
    box: PlacedBox,
    queryClient: QueryClient,
): Promise<void> {
    const plan = planCanvasEdit();
    const beat = displayedBeat(useTimelineSelectionStore.getState());
    return queueHistoryStep(async () => {
        try {
            await timelinePositionsSettled();
            await placedBoxesRead();
            // An edit saved just before may have given this page its own copy
            const stored = storedBox(box, beat);
            await (carriedOnto(plan, stored)
                ? markUngrouped(stored, plan, queryClient)
                : deleteShape(stored, queryClient));
        } catch (e) {
            console.error("Couldn't ungroup the shape", e);
        }
    }, undefined);
}

const failure = () =>
    tolgee.t("shapes.placed.ungroupError", "Error ungrouping the shape");

/** A later page: its members set where they stand, with a mark that they're ungrouped */
async function markUngrouped(
    box: PlacedBox,
    plan: CanvasEditPlan,
    queryClient: QueryClient,
): Promise<void> {
    const { members } = box.recipe;
    await writePlacement(
        {
            recipe: {
                kind: UNGROUPED_KIND,
                kindVersion: 1,
                params: {},
                orderMode: "nearest",
                reverse: false,
            },
            members,
            // Nobody moves, and the page still takes the change, as a shape edited there does
            setAll: true,
        },
        queryClient,
        failure(),
        plan,
    );
    await timelinePositionsSettled();
    await placedBoxesRead();
}

/** The shape's own page: the recipe goes, the positions stay */
async function deleteShape(
    box: PlacedBox,
    queryClient: QueryClient,
): Promise<void> {
    try {
        await transactionWithHistory(db, "ungroupShape", (tx) =>
            deleteShapeRecipeInTransaction(tx, box.recipe.id),
        );
    } catch (e) {
        toastTimelineError(e, failure());
        return;
    }
    invalidatePlacedBoxes();
    void queryClient.invalidateQueries({ queryKey: historyKeys.all() });
    await placedBoxesRead();
}
