import type { QueryClient } from "@tanstack/react-query";
import tolgee from "@/global/singletons/Tolgee";
import {
    planCanvasEdit,
    timelineCoordinateRecords,
    timelinePositionsSettled,
} from "@/timeline/timelineCoordinateWrites";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { queueHistoryStep } from "@/shortcuts/handlers/historyQueue";
import { writePlacement } from "../tool/shapePlacement";
import { groupRecipe } from "../group/groupGeometry";
import { groupShape } from "../group/groupShape";
import { placedBoxesRead } from "./placedBoxStore";

/** Group takes at least this many marchers: one alone is no shape to keep */
export const GROUP_MIN = 2;

/**
 * **Group** the marchers `marcherIds` into a shape as they stand (#603), as one undo step. Nobody
 * moves. It follows the rules placing a shape does: it's the edit window's change, saved on that
 * page's move through `writePlacement`, its members set there even though nobody moves
 * (`setAll`), so later pages holding the form follow. Marchers in another shape at that beat leave
 * it (ADR 0006, Revision 2026-10-29); one carried from an earlier page ends there, as a shape
 * placed over it does.
 *
 * It runs in the queue undo, redo and shape saves do, after what's queued before it.
 */
export function groupMarchers(
    marcherIds: readonly number[],
    queryClient: QueryClient,
): Promise<void> {
    const plan = planCanvasEdit();
    const failure = tolgee.t(
        "shapes.placed.groupError",
        "Error grouping the marchers",
    );
    return queueHistoryStep(async () => {
        try {
            if (!plan.ok) {
                toastTimelineError(plan.error, failure);
                return;
            }
            // Where they stand once what ran before (a nudge, an undo) has landed
            await timelinePositionsSettled();
            const standing = timelineCoordinateRecords(
                plan.beat,
                marcherIds,
            ).map((c) => ({ id: c.marcher_id, x: c.x, y: c.y }));
            if (standing.length < GROUP_MIN) return;
            const { params, members } = groupRecipe(standing);
            await writePlacement(
                {
                    recipe: {
                        kind: groupShape.id,
                        kindVersion: groupShape.version,
                        params,
                        orderMode: "nearest",
                        reverse: false,
                    },
                    members,
                    // Nobody moves, and the page still takes the change, as a shape placed does
                    setAll: true,
                },
                queryClient,
                failure,
                plan,
            );
            await timelinePositionsSettled();
            await placedBoxesRead();
        } catch (e) {
            console.error("Couldn't group the marchers", e);
        }
    }, undefined);
}
