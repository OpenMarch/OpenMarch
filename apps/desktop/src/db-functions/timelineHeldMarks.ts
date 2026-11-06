import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbTransaction } from "./types";
import { shapeRecipesOnly } from "./shapeRecipes";
import type { MoveMemberSkip, MoveMemberSkipReason } from "./timelineMoveCuts";
import {
    hasHeldMarksTable,
    isInsideHeldMark,
    readArrival,
    readBorrowSource,
    readHeldMarkArrivals,
    readHeldMarks,
    HOME_ARRIVAL,
    marchersWithShapeHome,
    type HeldArrival,
    type HeldMark,
} from "./timelineHeldArrival";

import type { HeldConflictSpot } from "./timelineHeldConflict";
import { readPageGrid } from "./timelinePageGrid";

export {
    heldConflictInTransaction,
    nameHeldConflict,
    type HeldConflict,
    type HeldConflictSpot,
} from "./timelineHeldConflict";
export {
    hasHeldMarksTable,
    isInsideHeldMark,
    readArrival,
    readHeldMarks,
    type HeldArrival,
    type HeldMark,
} from "./timelineHeldArrival";

/**
 * **Held** holds (holds README decisions 2 and 4; ADR 0012 amendment 2026-10-30): a stored mark
 * (`timeline_held_marks`) over a stretch where one marcher has no move, meaning "stand still here
 * on purpose". The resolver never reads it: the marcher holds there anyway (spec R-6). It changes
 * only how an edit inside it is routed, and what the timeline draws.
 *
 * A mark runs over `[start, end)` in spec beats. A count `c` is **inside** it when
 * `start < c <= end`: the marcher stands there at every such count, and at `start` it is still
 * arriving. No move of the marcher overlaps a mark (H-1) and one marcher's marks don't overlap
 * (H-3); the commit check (`timeline_held_violations`) rejects an edit that breaks either.
 *
 * **Keeping marks true** (ADR 0012 amendment 2026-10-30, part 2). A mark grows out of its
 * **arrival**: the marcher's highest-layer row ending at the mark's start, whose move ends there
 * too (`arrivalRowSql`, the one rule), which a drag inside the mark edits.
 *
 * - Page and beat edits move marks with the rows (`planTimelineRipple`).
 * - Every edit, after its own statements and before the commit check, keeps the marks true
 *   (`keepHeldMarksTrueInTransaction`, run by `transactionWithHistory`, never by undo or redo
 *   replay, which restore what the edit changed; #473): a mark follows an arrival the edit
 *   re-timed, goes with one it deleted, is trimmed where a row it re-timed now covers it, and
 *   merges with a mark it now touches.
 */

/** A Held marcher's edit, routed to the move that arrives at its hold's start (decision 4). */
export interface HeldArrivalEdit<M extends { marcherId: number }> {
    readonly move: M;
    readonly mark: HeldMark;
    /** The move (timeline) whose end is the hold's start */
    readonly timelineId: number;
}

/**
 * A Held marcher's edit whose hold grows out of its **starting spot** (#619): it sets the
 * marcher's starting spot, so the whole hold moves with it.
 */
export interface HeldHomeEdit<M extends { marcherId: number }> {
    readonly move: M;
    readonly mark: HeldMark;
}

/**
 * A Held marcher's edit inside a **borrowed hold** (fork #474; holds 04-anchors): nothing arrives
 * at the hold's start, so the edit adds a move over `[from, mark.start)` ending where the marcher
 * is dragged, and the hold then grows out of that move's diamond (an arrival hold).
 */
export interface HeldBorrowedEdit<M extends { marcherId: number }> {
    readonly move: M;
    readonly mark: HeldMark;
    /**
     * Where the added move starts (`borrowedMoveStart`): the latest of the marcher's last arrival,
     * the end of an earlier hold of its own and the page flag before the hold's start
     */
    readonly from: number;
}

/**
 * Where a move added by a drag inside a borrowed hold starting at `start` begins (holds
 * 04-anchors, consistency review M2): the latest of `lastArrival` (where the marcher's last row
 * before the hold ends), the end of an earlier mark of its own, and the page flag before `start`,
 * so it never covers a neighboring hold or another page's move. `null` when that leaves no counts.
 *
 * @param flags every page flag (each page's end), any order
 * @param marks the marcher's marks
 */
export function borrowedMoveStart({
    start,
    lastArrival,
    marks,
    flags,
}: {
    start: number;
    lastArrival: number;
    marks: readonly Pick<HeldMark, "end">[];
    flags: readonly number[];
}): number | null {
    let from = lastArrival;
    for (const mark of marks)
        if (mark.end < start) from = Math.max(from, mark.end);
    for (const flag of flags) if (flag < start) from = Math.max(from, flag);
    return from < start ? from : null;
}

/** A Held marcher an edit inside its hold left alone, with why. */
export type HeldEditSkip = Pick<MoveMemberSkip, "marcherId" | "reason">;

/**
 * Deletes the holds from the starting spots (#619) of those of `marcherIds` whose starting spot a
 * placed shape now sets (`marchersWithShapeHome`): a shape's starting spots get no Held hold, the
 * shape carried on is its hold (owner, 2026-11-01). Run in the edit that placed the shape, after
 * its recipe is written, so both are one undo step.
 *
 * @returns the marchers whose holds went
 */
export async function dropShapeHomeHoldsInTransaction(
    tx: DbTransaction,
    marcherIds: readonly number[],
): Promise<number[]> {
    const shaped = await marchersWithShapeHome(tx, marcherIds);
    if (shaped.size === 0) return [];
    const gone = (await readHeldMarkArrivals(tx)).filter(
        (m) => m.fromHome && shaped.has(m.marcherId),
    );
    if (gone.length === 0) return [];
    await tx.delete(schema.timeline_held_marks).where(
        inArray(
            schema.timeline_held_marks.id,
            gone.map((m) => m.id),
        ),
    );
    return [...new Set(gone.map((m) => m.marcherId))].sort((x, y) => x - y);
}

/**
 * Splits an edit at the count `beat` into the moved marchers that are Held there, those skipped,
 * and the rest.
 *
 * A Held marcher's edit is the edit of the move that arrives at its hold's start (`readArrival`),
 * so setting that move's ending moves the arrival and the whole hold with it. One whose arrival is
 * a shape's move or a follow-the-leader move, which the edit would rewrite, is left alone and named
 * in `skipped`, as Hold from previous page skips it (owner's rule, #434 / #436): a later edit, such
 * as a shape placed on the arrival's page, can make it one.
 *
 * A marcher Held at `beat` in a **borrowed hold** (nothing ends at its start, `readBorrowSource`;
 * fork #474) goes in `borrowed`: its edit adds a move ending at the hold's start
 * (`borrowedMoveStart`), and the hold then grows out of it. One whose hold has no room for that
 * move (a row on a lower layer ends at its start) stays with the rest, as before.
 *
 * A marcher Held from its starting spot (`readArrival`, `HOME_ARRIVAL`) goes in `homes`: its edit
 * sets its starting spot. One whose starting spot a placed shape sets (`marchersWithShapeHome`) is
 * skipped and named the same way.
 */
export async function splitHeldEditsInTransaction<
    M extends { marcherId: number },
>(
    tx: DbTransaction,
    beat: number,
    moves: readonly M[],
): Promise<{
    held: HeldArrivalEdit<M>[];
    homes: HeldHomeEdit<M>[];
    borrowed: HeldBorrowedEdit<M>[];
    skipped: HeldEditSkip[];
    rest: M[];
}> {
    const marks = (
        await readHeldMarks(
            tx,
            moves.map((m) => m.marcherId),
        )
    ).filter((mark) => isInsideHeldMark(mark, beat));
    if (marks.length === 0)
        return {
            held: [],
            homes: [],
            borrowed: [],
            skipped: [],
            rest: [...moves],
        };
    const markOf = new Map(marks.map((mark) => [mark.marcherId, mark]));
    const arrivals = new Map<number, HeldArrival>();
    const fromHome = new Set<number>();
    /** Where a borrowed hold's added move starts, by marcher */
    const borrowFrom = new Map<number, number>();
    let flags: number[] | undefined;
    for (const mark of marks) {
        const arrival = await readArrival(tx, mark.marcherId, mark.start);
        if (arrival === HOME_ARRIVAL) fromHome.add(mark.marcherId);
        else if (arrival) arrivals.set(mark.marcherId, arrival);
        else {
            const source = await readBorrowSource(
                tx,
                mark.marcherId,
                mark.start,
            );
            if (!source) continue;
            flags ??= (await readPageGrid(tx)).pages.map((p) => p.end);
            const from = borrowedMoveStart({
                start: mark.start,
                lastArrival: source.end,
                marks: await readHeldMarks(tx, [mark.marcherId]),
                flags,
            });
            if (from !== null) borrowFrom.set(mark.marcherId, from);
        }
    }
    const shapeHome = await marchersWithShapeHome(tx, [...fromHome]);
    const inRecipe = await marcherRecipeTimelines(tx, [
        ...new Set([...arrivals.values()].map((a) => a.timelineId)),
    ]);
    const held: HeldArrivalEdit<M>[] = [];
    const homes: HeldHomeEdit<M>[] = [];
    const borrowed: HeldBorrowedEdit<M>[] = [];
    const skipped: HeldEditSkip[] = [];
    const rest: M[] = [];
    for (const move of moves) {
        const mark = markOf.get(move.marcherId);
        if (mark && fromHome.has(move.marcherId)) {
            if (shapeHome.has(move.marcherId))
                skipped.push({ marcherId: move.marcherId, reason: "shape" });
            else homes.push({ move, mark });
            continue;
        }
        const from = borrowFrom.get(move.marcherId);
        if (mark && from !== undefined) {
            borrowed.push({ move, mark, from });
            continue;
        }
        const arrival = arrivals.get(move.marcherId);
        if (!mark || !arrival) {
            rest.push(move);
            continue;
        }
        const reason = arrivalSkipReason(
            arrival,
            inRecipe.get(arrival.timelineId)?.has(move.marcherId) ?? false,
        );
        if (reason) skipped.push({ marcherId: move.marcherId, reason });
        else held.push({ move, mark, timelineId: arrival.timelineId });
    }
    return { held, homes, borrowed, skipped, rest };
}

/**
 * Why a drag inside a hold can't edit `arrival`, or null when it can: it is a follow-the-leader
 * move, or a shape's move (a shape destination, or a placed shape's recipe holds the marcher in
 * it, `inRecipe`), which the edit would rewrite.
 */
export function arrivalSkipReason(
    arrival: HeldArrival,
    inRecipe: boolean,
): MoveMemberSkipReason | null {
    if (arrival.pathStyle === "follow_the_leader") return "followTheLeader";
    if (arrival.shapeId !== null || inRecipe) return "shape";
    return null;
}

/**
 * For each of `timelineIds` with a placed shape's recipe, the marchers it holds. An ungrouped mark
 * (`shapeRecipesOnly`) holds nobody in a shape.
 */
export async function marcherRecipeTimelines(
    tx: DbTransaction,
    timelineIds: readonly number[],
): Promise<Map<number, Set<number>>> {
    const out = new Map<number, Set<number>>();
    if (timelineIds.length === 0) return out;
    const r = schema.timeline_shape_recipes;
    const m = schema.timeline_shape_recipe_marchers;
    const rows = await tx
        .select({ timelineId: r.timeline_id, marcherId: m.marcher_id })
        .from(m)
        .innerJoin(r, eq(r.id, m.recipe_id))
        .where(
            and(
                inArray(r.timeline_id, [...new Set(timelineIds)]),
                shapeRecipesOnly(),
            ),
        )
        .all();
    for (const row of rows) {
        if (row.timelineId === null) continue;
        const ids = out.get(row.timelineId) ?? new Set<number>();
        ids.add(row.marcherId);
        out.set(row.timelineId, ids);
    }
    return out;
}

/**
 * **Clear this page** for Held marchers (#472): the part of each of `marcherIds`' marks over `box`
 * goes, so the page is Not set for them. A part before the box stays (its arrival is unchanged); a
 * part after it would have nothing arriving at its start, so it goes too (dropped when its
 * arrival is gone, `keepHeldMarksTrueInTransaction`), and is reported in `later` so the toast
 * can say so.
 *
 * @returns `marchers`, those whose marks changed, ascending, and `later`, the marchers whose
 *   hold on later pages went too, each at the box's end
 */
export async function clearHeldMarksOverInTransaction(
    tx: DbTransaction,
    marcherIds: readonly number[],
    box: { start: number; end: number },
): Promise<{ marchers: number[]; later: HeldConflictSpot[] }> {
    if (marcherIds.length === 0 || !(await hasHeldMarksTable(tx)))
        return { marchers: [], later: [] };
    const h = schema.timeline_held_marks;
    const over = (await readHeldMarks(tx, marcherIds)).filter(
        (m) => m.start < box.end && box.start < m.end,
    );
    for (const mark of over) {
        if (mark.start < box.start)
            await tx
                .update(h)
                .set({ end_beat: box.start })
                .where(eq(h.id, mark.id));
        else await tx.delete(h).where(eq(h.id, mark.id));
    }
    return {
        marchers: [...new Set(over.map((m) => m.marcherId))].sort(
            (x, y) => x - y,
        ),
        later: over
            .filter((m) => m.end > box.end)
            .map((m) => ({ marcherId: m.marcherId, beat: box.end })),
    };
}
