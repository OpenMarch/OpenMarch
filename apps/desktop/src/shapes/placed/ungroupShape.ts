import type { QueryClient } from "@tanstack/react-query";
import tolgee from "@/global/singletons/Tolgee";
import { db } from "@/global/database/db";
import { transactionWithHistory } from "@/db-functions/history";
import { saveShapeRecipeInTransaction } from "@/db-functions/shapeRecipes";
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
import { toast } from "sonner";
import { carriedOnto, storedBox } from "./commitBox";
import { UNGROUPED_KIND, type PlacedBox } from "./placedBox";
import { invalidatePlacedBoxes, placedBoxesRead } from "./placedBoxStore";

/** What an ungrouped mark stores: no shape, only who it claims */
const UNGROUPED_RECIPE = {
    kind: UNGROUPED_KIND,
    kindVersion: 1,
    params: {},
    orderMode: "nearest",
    reverse: false,
} as const;

/**
 * **Ungroup** a selected placed shape: its marchers stay where they are and stop being a shape,
 * as one undo step. It follows the same rules as editing the shape (`commitBox`):
 *
 * - On the shape's own page (or an edit window reaching back over its move), its recipe becomes
 *   an ungrouped mark (`UNGROUPED_KIND`) in place, so no earlier shape over the same spots shows
 *   again there (a later page's own copy of a page's box), and later pages that held it follow.
 * - On a later page it's only carried onto, the change is that page's: its members are set there,
 *   as an edit that moves no one sets them, and an ungrouped mark on that move ends the shape from
 *   there on. Earlier pages keep it, and later pages holding the form follow.
 *
 * Where no edit can be made (past the last page in Basic, the timeline not ready) it's refused as
 * an edit is. Isolating a move, a shape from another move is refused too: the isolated move
 * can't take the change, and the shape's own move shouldn't lose it.
 *
 * It runs in the queue undo, redo and shape saves do, after what's queued before it.
 */
export function ungroupShape(
    box: PlacedBox,
    queryClient: QueryClient,
): Promise<void> {
    const plan = planCanvasEdit();
    const beat = displayedBeat(useTimelineSelectionStore.getState());
    const isolated = useTimelineSelectionStore.getState().isolation?.timelineId;
    return queueHistoryStep(async () => {
        try {
            if (!plan.ok) {
                toastTimelineError(plan.error, failure());
                return;
            }
            await timelinePositionsSettled();
            await placedBoxesRead();
            // An edit saved just before may have given this page its own copy
            const stored = storedBox(box, beat);
            if (carriedOnto(plan, stored))
                await markUngrouped(stored, plan, queryClient);
            else if (
                isolated !== undefined &&
                stored.recipe.timelineId !== isolated
            )
                toast.error(
                    tolgee.t(
                        "shapes.placed.ungroupIsolated",
                        "Ungroup this shape outside isolation: it comes from an earlier page",
                    ),
                );
            else await ungroupInPlace(stored, queryClient);
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
    await writePlacement(
        {
            recipe: UNGROUPED_RECIPE,
            members: box.recipe.members,
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

/** The shape's own page: its recipe becomes the mark, the positions stay */
async function ungroupInPlace(
    box: PlacedBox,
    queryClient: QueryClient,
): Promise<void> {
    try {
        await transactionWithHistory(db, "ungroupShape", (tx) =>
            saveShapeRecipeInTransaction({
                tx,
                timelineId: box.recipe.timelineId,
                recipe: UNGROUPED_RECIPE,
                members: box.recipe.members,
                replaces: box.recipe.id,
            }),
        );
    } catch (e) {
        toastTimelineError(e, failure());
        return;
    }
    invalidatePlacedBoxes();
    void queryClient.invalidateQueries({ queryKey: historyKeys.all() });
    await placedBoxesRead();
}
