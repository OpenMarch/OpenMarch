import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbTransaction } from "./types";
import { shapeRecipesOnly } from "./shapeRecipes";
import type { MoveMemberSkip, MoveMemberSkipReason } from "./timelineMoveCuts";
import {
    hasHeldMarksTable,
    isInsideHeldMark,
    readArrival,
    readHeldMarkArrivals,
    readHeldMarks,
    HOME_ARRIVAL,
    marchersWithShapeHome,
    type HeldArrival,
    type HeldMark,
} from "./timelineHeldArrival";

import { windowWinsOverHold } from "@/timeline/heldRules";
import type { HeldConflictSpot } from "./timelineHeldConflict";

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
 * so setting that move's ending moves the arrival and the whole hold with it. Every hold grows out
 * of a move or the starting spot (owner, 2026-11-09), and the upkeep keeps it so; a marcher Held
 * at `beat` with neither stays with the rest. One whose arrival is a shape's move or a follow-the-leader move, which the edit would rewrite, is left
 * alone and named in `skipped`, as Hold from last keyframe skips it (owner's rule, #434 / #436):
 * a later edit, such as a shape placed on the arrival's page, can make it one.
 *
 * A marcher Held from its starting spot (`readArrival`, `HOME_ARRIVAL`) goes in `homes`: its edit
 * sets its starting spot. One whose starting spot a placed shape sets (`marchersWithShapeHome`) is
 * skipped and named the same way.
 *
 * An Expert window's edit passes its start flag as `windowStart`: a window that starts inside a
 * hold (after its start) **wins** (holds decision 6, review R2, fork #476), so that marcher stays
 * with the rest and its edit becomes the window's move; the window's writer then ends the hold at
 * the start flag (`trimHeldMarksUnderRowsInTransaction`). Only a window starting at or before the
 * hold's start moves the whole hold. The rule is `windowWinsOverHold`, which the bars' drag
 * lighting reads too.
 */
export async function splitHeldEditsInTransaction<
    M extends { marcherId: number },
>(
    tx: DbTransaction,
    beat: number,
    moves: readonly M[],
    { windowStart }: { windowStart?: number } = {},
): Promise<{
    held: HeldArrivalEdit<M>[];
    homes: HeldHomeEdit<M>[];
    skipped: HeldEditSkip[];
    rest: M[];
}> {
    const marks = (
        await readHeldMarks(
            tx,
            moves.map((m) => m.marcherId),
        )
    ).filter(
        (mark) =>
            isInsideHeldMark(mark, beat) &&
            (windowStart === undefined ||
                !windowWinsOverHold(windowStart, mark)),
    );
    if (marks.length === 0)
        return { held: [], homes: [], skipped: [], rest: [...moves] };
    const markOf = new Map(marks.map((mark) => [mark.marcherId, mark]));
    const arrivals = new Map<number, HeldArrival>();
    const fromHome = new Set<number>();
    for (const mark of marks) {
        const arrival = await readArrival(tx, mark.marcherId, mark.start);
        if (arrival === HOME_ARRIVAL) fromHome.add(mark.marcherId);
        else if (arrival) arrivals.set(mark.marcherId, arrival);
    }
    const shapeHome = await marchersWithShapeHome(tx, [...fromHome]);
    const inRecipe = await marcherRecipeTimelines(tx, [
        ...new Set([...arrivals.values()].map((a) => a.timelineId)),
    ]);
    const held: HeldArrivalEdit<M>[] = [];
    const homes: HeldHomeEdit<M>[] = [];
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
    return { held, homes, skipped, rest };
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
 * part after it goes too, since clearing a page clears the hold (#472, #566), and is reported in
 * `later` so the toast can say so.
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

/**
 * **A move written over a hold trims it** (holds 01-edit-rules, general rules; fork #476): after an
 * edit wrote moves for `marcherIds`, each of their marks that one of their rows now overlaps ends
 * where the earliest such row starts, and a mark left with no counts (the row starts at or before
 * the mark's start) goes. The part after the row goes too: excursions are deferred (holds decision
 * 7). Before the edit no row overlapped a mark (H-1), so every overlap is the edit's. An Expert
 * window that starts inside a hold so ends the hold at the start flag (R2), and one that covers a
 * hold's start takes the hold away.
 *
 * @returns the marchers whose marks changed, ascending
 */
export async function trimHeldMarksUnderRowsInTransaction(
    tx: DbTransaction,
    marcherIds: readonly number[],
): Promise<number[]> {
    if (marcherIds.length === 0 || !(await hasHeldMarksTable(tx))) return [];
    const marks = await readHeldMarks(tx, marcherIds);
    if (marks.length === 0) return [];
    const a = schema.timeline_assignments;
    const rows = await tx
        .select({
            marcherId: a.marcher_id,
            start: a.start_beat,
            end: a.end_beat,
        })
        .from(a)
        .where(
            inArray(a.marcher_id, [...new Set(marks.map((m) => m.marcherId))]),
        )
        .all();
    const h = schema.timeline_held_marks;
    const changed = new Set<number>();
    for (const mark of marks) {
        const over = rows.filter(
            (r) =>
                r.marcherId === mark.marcherId &&
                r.start < mark.end &&
                mark.start < r.end,
        );
        if (over.length === 0) continue;
        const end = Math.min(...over.map((r) => r.start));
        if (end <= mark.start) await tx.delete(h).where(eq(h.id, mark.id));
        else await tx.update(h).set({ end_beat: end }).where(eq(h.id, mark.id));
        changed.add(mark.marcherId);
    }
    return [...changed].sort((x, y) => x - y);
}
