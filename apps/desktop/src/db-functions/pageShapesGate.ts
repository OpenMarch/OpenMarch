import { DbTransaction } from "./types";
import { refuse } from "./timelineErrors";
import { timelineModeInTransaction } from "./timelineRipple";

/** Why page shapes can't be edited in timeline mode, as the refusal says it (P7.11). */
export const PAGE_SHAPES_TIMELINE_MESSAGE =
    "Page shapes can't be changed in timeline mode, because they would write page positions the timeline doesn't use. Draw and edit shapes in the Shapes part of the inspector's Timeline section instead.";

/**
 * Refuses (`E-ARGS`) a page-era shape edit when the file's timeline flag is on (P7.11), before
 * anything is written. Every undoable writer of `shapes`, `shape_pages` and
 * `shape_page_marchers` calls it first. Those rows, and the `marcher_pages` rows they move, are
 * frozen page-era data in timeline mode; the timeline's own shapes are `timeline_shapes`.
 *
 * Refused rather than mapped: a page shape puts some of one page's marchers on an SVG path (which
 * can have Bezier segments). Its timeline form is a transition into a spec shape, which is a
 * structural edit (Create Track into a shape) with no Bezier kind.
 */
export async function refusePageShapesInTimelineMode(
    tx: DbTransaction,
): Promise<void> {
    if (await timelineModeInTransaction(tx))
        refuse(PAGE_SHAPES_TIMELINE_MESSAGE);
}
