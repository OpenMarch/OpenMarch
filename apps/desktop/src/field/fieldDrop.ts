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
    isLocked: (id: number) => boolean = () => false,
): Promise<DropResult> {
    const locked = lockedItemsDrop(positions, isLocked);
    if (locked)
        return write(locked)
            .then(() => timelinePositionsSettled())
            .then(
                () => "saved" as const,
                () => "refused" as const,
            );
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

/**
 * A drop of locked items alone (the pit's equipment, instruments.md section 6): written to their
 * homes, since a locked item has one position for the whole show, so it is saved on any page,
 * with or without a window or an isolated move. Null when anyone else was dropped too: the
 * timeline's rules decide, and the write sets the locked items' homes anyway
 * (`splitLockedItemMovesInTransaction`).
 */
export function lockedItemsDrop(
    positions: readonly MarcherPosition[],
    isLocked: (id: number) => boolean,
): TimelineEditRequest | null {
    if (positions.length === 0 || !positions.every((p) => isLocked(p.id)))
        return null;
    return {
        target: { kind: "home" },
        moves: positions.map(({ id, x, y }) => ({ marcherId: id, x, y })),
    };
}
