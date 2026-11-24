import type { DropResult } from "@/field/editor/fieldEditor";
import type { MarcherPosition } from "@/field/editor/moveGesture";
import {
    canvasCoordinateWriter,
    timelinePositionsSettled,
    type TimelineEditRequest,
} from "@/timeline/timelineCoordinateWrites";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";

/**
 * Saves marchers dropped on the field through the drop-to-timeline path
 * (`canvasCoordinateWriter`): a range drop creates or joins that range's move,
 * home edits homes, isolation edits the
 * isolated end and moves the playhead there, and a refusal (nothing selected
 * on the timeline) is a toast. `write` is the timeline write, which offers
 * "Move them too" (`moveMarchersInTargetMutationOptions`).
 *
 * Resolves "saved" once the write has reached the resolver, so the field can
 * draw the show with the drop in it; "refused" when nothing was saved (the
 * write's own failure toast, or the refusal's). It must settle on every path:
 * the field draws the marchers where they were dropped until it does.
 */
export function dropMarchersOnTimeline(
    positions: readonly MarcherPosition[],
    write: (request: TimelineEditRequest) => Promise<unknown>,
): Promise<DropResult> {
    return new Promise((resolve) => {
        const save = canvasCoordinateWriter({
            writeTimeline: (request) => {
                write(request)
                    .then(() => timelinePositionsSettled())
                    .then(
                        () => resolve("saved"),
                        () => resolve("refused"),
                    );
            },
            onRefused: (error) => {
                toastTimelineError(error);
                resolve("refused");
            },
        });
        try {
            save(positions.map(({ id, x, y }) => ({ marcher_id: id, x, y })));
        } catch (error) {
            console.error("Error dropping marchers", error);
            resolve("refused");
        }
    });
}
