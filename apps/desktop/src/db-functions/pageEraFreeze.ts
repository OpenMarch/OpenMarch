import { DbTransaction } from "./types";
import { refuse } from "./timelineErrors";
import { timelineModeInTransaction } from "./timelineRipple";

/** Why a page-era position or pathway can't be written in timeline mode (P9.5). */
export const PAGE_ERA_FROZEN_MESSAGE =
    "Page positions and pathways can't be changed in timeline mode: they are kept read-only from before the show was converted. Move marchers on the canvas or in the inspector's Timeline section instead.";

/**
 * Refuses (`E-ARGS`) a write to the page-era position tables (`marcher_pages`, `pathways`,
 * `midsets`) when the file's timeline flag is on, before anything is written (P9.5). In timeline
 * mode those rows are frozen: they keep the positions from before the conversion for one release
 * and are dropped in Phase 10. The database refuses the same writes with the
 * `page_era_frozen_*` triggers (`electron/database/migrations/triggers.ts`); this gives the caller
 * a message `toastTimelineError` can show instead of a SQLite error.
 *
 * Page shapes (`shapes`, `shape_pages`, `shape_page_marchers`) refuse through
 * `refusePageShapesInTimelineMode` (P7.11), with their own message.
 */
export async function refusePageEraWriteInTimelineMode(
    tx: DbTransaction,
): Promise<void> {
    if (await timelineModeInTransaction(tx)) refuse(PAGE_ERA_FROZEN_MESSAGE);
}
