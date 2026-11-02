import { inArray } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbTransaction } from "./types";
import { TimelineCommitViolationError } from "./timelineChanges";
import {
    readHeldMarkArrivals,
    type HeldMarkArrival,
} from "./timelineHeldArrival";
import { nameHeldConflict, type HeldConflict } from "./timelineHeldConflict";

/**
 * **Keeping Held marks true after an edit** (ADR 0001 amendment 2026-10-30, part 2; the small
 * form #472 needs while every mark is an arrival hold, which #473 grows into the full upkeep).
 *
 * `transactionWithHistory` reads each mark's arrival row (`arrivalRowSql`) before the edit's
 * function, and checks the marks right after it, before the history group is read, so what it
 * writes is in the edit's undo step. It never runs during undo or redo replay, which restore the
 * marks an edit dropped. For each mark nothing arrives at after the edit:
 *
 * - its arrival row was **deleted** (Remove keyframe, Delete move, a page's move taken out), or
 *   it had none: the mark is deleted. A mark over counts nothing arrives at could never be
 *   reached by a drag, and only blocks edits (holds decision 17);
 * - its arrival row is still there but ends somewhere else (a resize, a clip drag or a merge
 *   refit of the arrival's move): the edit is refused with `E-H1`, naming the marcher and the
 *   held page, until #473 moves the hold with it.
 *
 * A mark something still arrives at stays, whichever row that is: Basic rewrites a page's move
 * (a new row ending at the same flag), and page and beat edits move a mark with its arrival
 * (`planTimelineRipple`).
 *
 * A mark that grows out of the marcher's **starting spot** (`homeArrivalSql`, #619: no row of the
 * marcher starts before it) has an arrival too, and stays. One whose arrival row the edit deleted
 * doesn't become one: removing the keyframe a hold grows out of removes the hold, even when the
 * marcher now stands on its starting spot up to it. One an edit gave a move starting before it,
 * not ending at its start (a move on an earlier page, or **Set as shown** there), has nothing left
 * to grow out of and is deleted too: holding from where that move ends is a borrowed hold (#474).
 * The edits that can do this say whose holds went (`startHoldsLostInTransaction`).
 */

/** Each mark's arrival row before an edit, by mark id (`readHeldMarkArrivals`). */
export type HeldArrivalsBefore = ReadonlyMap<number, number | null>;

/** The marks' arrival rows, read before an edit's function runs. */
export async function readHeldArrivalsBefore(
    tx: DbTransaction,
): Promise<HeldArrivalsBefore> {
    return new Map(
        (await readHeldMarkArrivals(tx)).map((m) => [m.id, m.arrivalId]),
    );
}

/**
 * The holds from the starting spots (#619) that the upkeep after this edit will delete, named for
 * the edit's message, or `undefined` when there are none: marks that had no arrival row before the
 * edit, and now have neither a row nor the starting spot to grow out of, because the edit gave the
 * marcher a move starting before the hold that doesn't end at its start. Call it at the end of the
 * edit's function, with the arrivals read at its start (`readHeldArrivalsBefore`).
 */
export async function startHoldsLostInTransaction(
    tx: DbTransaction,
    before: HeldArrivalsBefore,
): Promise<HeldConflict | undefined> {
    const lost = (await readHeldMarkArrivals(tx)).filter(
        (m) =>
            m.arrivalId === null &&
            !m.fromHome &&
            before.has(m.id) &&
            before.get(m.id) === null,
    );
    if (lost.length === 0) return undefined;
    return nameHeldConflict(
        tx,
        lost.map((m) => ({ marcherId: m.marcherId, beat: m.start })),
    );
}

/**
 * Drops the marks whose arrival row the edit deleted, and refuses (`E-H1`) an edit that left a
 * mark's arrival row ending elsewhere (see the module comment).
 */
export async function keepHeldMarksTrueInTransaction(
    tx: DbTransaction,
    before: HeldArrivalsBefore,
): Promise<void> {
    const hadRow = (m: HeldMarkArrival) => {
        const id = before.get(m.id);
        return id !== undefined && id !== null;
    };
    const orphans = (await readHeldMarkArrivals(tx)).filter(
        (m) => m.arrivalId === null && (!m.fromHome || hadRow(m)),
    );
    if (orphans.length === 0) return;
    const A = schema.timeline_assignments;
    const wereArrivals = orphans.flatMap((m) => {
        const id = before.get(m.id);
        return id === undefined || id === null ? [] : [id];
    });
    const stillThere = new Set(
        wereArrivals.length === 0
            ? []
            : (
                  await tx
                      .select({ id: A.id })
                      .from(A)
                      .where(inArray(A.id, wereArrivals))
                      .all()
              ).map((r) => r.id),
    );
    const moved = (m: HeldMarkArrival) => {
        const id = before.get(m.id);
        return id !== undefined && id !== null && stillThere.has(id);
    };
    const movedAway = orphans.filter(moved);
    if (movedAway.length > 0)
        throw new TimelineCommitViolationError(
            movedAway.map((m) => ({
                code: "E-H1",
                transitionId: null,
                detail: `marcher ${m.marcherId} is Held over [${m.start}, ${m.end}) but its arrival no longer ends at ${m.start}`,
            })),
            await nameHeldConflict(
                tx,
                movedAway.map((m) => ({
                    marcherId: m.marcherId,
                    beat: m.start,
                })),
            ),
        );
    await tx.delete(schema.timeline_held_marks).where(
        inArray(
            schema.timeline_held_marks.id,
            orphans.map((m) => m.id),
        ),
    );
}
