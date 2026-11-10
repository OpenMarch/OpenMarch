import { inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import {
    marcherSimpleOnBox,
    overlapsBox,
    type BasicRow,
} from "@/timeline/basicSimple";
import { countsText } from "@/timeline/timelineRangeWords";
import { text } from "@/timeline/timelineText";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { NothingToDo, refuse } from "./timelineErrors";
import { readPageGrid } from "./timelineRipple";
import { readBasicRows } from "./basicRows";
import { isPageBox } from "./timelineMoves";
import { clearOwnPageMoves } from "./timelineMoveHelpers";
import {
    arrivalSkipReason,
    marcherRecipeTimelines,
    readArrival,
    readHeldMarks,
    type HeldArrival,
    type HeldMark,
} from "./timelineHeldMarks";
import { HOME_ARRIVAL, marchersWithShapeHome } from "./timelineHeldArrival";
import { holdReachBack } from "@/timeline/holdExtent";
import { showStartBeat, type PageGrid } from "./timelinePageGrid";

/**
 * **Hold from last keyframe** on a page box, in timeline mode (holds, fork #472; holds README
 * decisions 2 and 3, review R3; ADR 0012 amendment 2026-10-30).
 *
 * For each selected marcher, the page box `[start, end)` becomes one **Held** hold
 * (`timeline_held_marks`). It grows out of whatever last put the marcher there (owner, 2026-11-09):
 * the move arriving at the previous page's flag (`start`), or, where nothing arrives there, what
 * it reaches back to (`holdReachBack`). A drag inside the hold edits that arrival, moving the whole
 * hold (`splitHeldEditsInTransaction`).
 *
 * - The marcher's own moves inside the box go first, as Basic's Set to previous page removes them:
 *   a converted page's shared slot is compacted (`clearOwnPageMoves` with `tidyShared`).
 * - Touching holds are one hold: a Held hold ending at `start` (the previous page, Held already)
 *   grows over the box, and one starting at `end` (the next page held from this page's arrival,
 *   which this removes) is taken in. So holding Page 2 then Page 3 gives what Page 3 then Page 2
 *   does.
 * - The arrival is the move a drag inside the hold edits, found as the drag finds it
 *   (`readArrival`: the highest-layer row ending at `start`, whose move ends there), so every hold
 *   made here is one its drags can reach.
 * - **From the starting spots** (#619): a marcher with no row starting before `start` (Page 1, or
 *   a later page it reaches only by standing on its starting spot) is Held from its starting spot,
 *   and a drag inside the hold moves the starting spot (`readArrival`, `HOME_ARRIVAL`).
 * - **Reaching back** over Not defined pages: the hold starts at the latest of the marcher's last
 *   row end before the page, the end of its own earlier hold (touching holds are one hold), or the
 *   start of the show for a marcher who never moved. The move it then grows out of is checked as
 *   an arrival is: a shape's or follow-the-leader move is skipped (`arrivalShape`,
 *   `arrivalFollowLeader`), since a carried shape is the shape's hold (owner, 2026-11-01).
 *
 * Left alone and reported, with why:
 * - `noArrival`: the row the hold would grow out of ends without arriving there (a lower layer's
 *   row, or its part of a move that runs on), so it has nothing to grow out of;
 * - `homeShape`: it is held from its starting spot, and a placed shape sets that spot
 *   (`marchersWithShapeHome`): a shape gets no Held hold, the shape carried on is its hold (owner,
 *   2026-11-01). Ungroup it at the start of the show (Ungroup on a later page only marks that page) to hold its marchers one by one;
 * - `held`: it is Held over some of the box already;
 * - `crossesFlag`: a move of its runs over one of the box's flags (taking it out of part of a move
 *   is #469's cut in time);
 * - `expertMoves`: its moves in the box overlap, or use a path Basic doesn't edit;
 * - `shape`: a shape or a placed shape's recipe holds it on this page (fork #436 decisions 6–14:
 *   skipped and named until #504);
 * - `followLeader`: it follows the leader on this page;
 * - `arrivalShape`, `arrivalFollowLeader`: the arrival is a shape's move (a shape destination, or a
 *   placed shape's recipe holds the marcher there) or a follow-the-leader move, which a drag inside
 *   the hold would rewrite (owner's rule: skipped and named, #434 / #436).
 *
 * One undo step; a run that holds nobody opens no edit.
 */

/** Why Hold from last keyframe left a marcher alone. */
export type HoldFromPreviousSkipReason =
    | "noArrival"
    | "held"
    | "crossesFlag"
    | "expertMoves"
    | "shape"
    | "followLeader"
    | "arrivalShape"
    | "arrivalFollowLeader"
    | "homeShape";

/** A marcher Hold from last keyframe left alone, with why. */
export interface HoldFromPreviousSkip {
    marcherId: number;
    reason: HoldFromPreviousSkipReason;
    /**
     * `noArrival`: the page starting where the row ends, when that isn't the page held (the hold
     * reached back to it)
     */
    atPage?: string;
}

/** What **Hold from last keyframe** did, marcher ids ascending. */
export interface HoldFromPreviousResult {
    /** The marchers now Held over the box */
    held: number[];
    /** The others, with why */
    skipped: HoldFromPreviousSkip[];
    /** The pages the holds newly cover, first to last, when they reach back beyond the page */
    pagesCovered?: string[];
}

/**
 * **Hold from last keyframe**: each of `marcherIds` that can be is Held over the page box
 * `pageBox` (see the module comment). Refused (E-ARGS) when `pageBox` isn't a page's box.
 */
export async function holdFromPreviousPage({
    db,
    pageBox,
    marcherIds,
}: {
    db: DbConnection;
    pageBox: { start: number; end: number };
    marcherIds: readonly number[];
}): Promise<HoldFromPreviousResult> {
    if (marcherIds.length === 0) return { held: [], skipped: [] };
    try {
        return await transactionWithHistory(
            db,
            "holdFromPreviousPage",
            async (tx) => {
                const result = await holdFromPreviousPageInTransaction({
                    tx,
                    pageBox,
                    marcherIds,
                });
                if (result.held.length === 0) throw new NothingToDo(result);
                return result;
            },
        );
    } catch (e) {
        if (e instanceof NothingToDo) return e.result as HoldFromPreviousResult;
        throw e;
    }
}

/** `holdFromPreviousPage` inside the caller's edit. */
export async function holdFromPreviousPageInTransaction({
    tx,
    pageBox,
    marcherIds,
}: {
    tx: DbTransaction;
    pageBox: { start: number; end: number };
    marcherIds: readonly number[];
}): Promise<HoldFromPreviousResult> {
    const grid = await readPageGrid(tx);
    if (!isPageBox(grid, pageBox))
        refuse(
            text.t("timeline.refusals.holdFromPrevious.wholePage", {
                holdFromPrevious: text.t("timeline.terms.holdFromPrevious"),
                counts: countsText(pageBox, grid.pages.slice(1)),
            }),
        );
    const ids = [...new Set(marcherIds)].sort((x, y) => x - y);
    const rows = await readBasicRows(tx, { marcherIds: ids });
    const marks = await readHeldMarks(tx, ids);
    const showStart = showStartBeat(grid);
    const growths = new Map<number, HoldGrowth>();
    for (const id of ids)
        growths.set(
            id,
            await readHoldGrowth(tx, {
                marcherId: id,
                box: pageBox,
                rows: rows.filter((r) => r.marcherId === id),
                marks: marks.filter((m) => m.marcherId === id),
                showStart,
            }),
        );
    const fromHome = ids.filter(
        (id) => growths.get(id)!.source === HOME_ARRIVAL,
    );
    const arrivals = [...growths.values()]
        .map((g) => g.source)
        .filter(isHeldArrival);
    const shapeHome = await marchersWithShapeHome(tx, fromHome);
    const inRecipe = await marchersInRecipesOf(tx, [
        ...rows.filter((r) => overlapsBox(r, pageBox)).map((r) => r.timelineId),
    ]);
    const inArrivalRecipe = await marcherRecipeTimelines(tx, [
        ...new Set(arrivals.map((a) => a.timelineId)),
    ]);

    const result: HoldFromPreviousResult = { held: [], skipped: [] };
    const toRemove: number[] = [];
    const replaced: number[] = [];
    const newMarks: {
        marcher_id: number;
        start_beat: number;
        end_beat: number;
    }[] = [];
    let firstFilled: number = pageBox.start;
    for (const marcherId of ids) {
        const own = rows.filter((r) => r.marcherId === marcherId);
        const inBox = own.filter((r) => overlapsBox(r, pageBox));
        const ownMarks = marks.filter((m) => m.marcherId === marcherId);
        const growth = growths.get(marcherId)!;
        const { source, joins } = growth;
        // Touching holds are one hold
        const next = ownMarks.find((m) => m.start === pageBox.end);
        const reason = skipReason({
            box: pageBox,
            inBox,
            marks: ownMarks,
            inShapeRecipe: inRecipe.has(marcherId),
            arrival:
                source === "joined"
                    ? "joined"
                    : source === HOME_ARRIVAL
                      ? { home: true, shape: shapeHome.has(marcherId) }
                      : source
                        ? {
                              ...source,
                              inRecipe:
                                  inArrivalRecipe
                                      .get(source.timelineId)
                                      ?.has(marcherId) ?? false,
                          }
                        : null,
        });
        if (reason) {
            const atPage =
                reason === "noArrival" && growth.from !== pageBox.start
                    ? grid.pages.find(
                          (p) => p.start <= growth.from && growth.from < p.end,
                      )?.name
                    : undefined;
            result.skipped.push({
                marcherId,
                reason,
                ...(atPage === undefined ? {} : { atPage }),
            });
            continue;
        }
        toRemove.push(...inBox.map((r) => r.assignmentId));
        if (joins) replaced.push(joins.id);
        if (next) replaced.push(next.id);
        newMarks.push({
            marcher_id: marcherId,
            start_beat: joins?.start ?? growth.from,
            end_beat: next?.end ?? pageBox.end,
        });
        result.held.push(marcherId);
        firstFilled = Math.min(firstFilled, growth.from);
    }
    if (result.held.length === 0) return result;
    if (firstFilled < pageBox.start) {
        const covered = pagesOver(grid, firstFilled, pageBox.end);
        if (covered.length > 1) result.pagesCovered = covered;
    }

    if (toRemove.length > 0) {
        const a = schema.timeline_assignments;
        const removed = await tx
            .select()
            .from(a)
            .where(inArray(a.id, toRemove))
            .all();
        await clearOwnPageMoves(tx, removed, {
            tidyShared: true,
            dropUngrouped: result.held,
        });
    }
    const h = schema.timeline_held_marks;
    if (replaced.length > 0) await tx.delete(h).where(inArray(h.id, replaced));
    await tx.insert(h).values(newMarks);
    return result;
}

/** What a new hold over a box grows out of, for one marcher. */
export interface HoldGrowth {
    /** Where the counts it newly holds start */
    readonly from: number;
    /**
     * The move or starting spot it grows out of (through the earlier hold it joins, if any),
     * "joined" when that hold has neither, or nothing it can grow out of
     */
    readonly source: HeldArrival | typeof HOME_ARRIVAL | "joined" | null;
    /** The earlier hold it joins, if any */
    readonly joins?: HeldMark;
}

const isHeldArrival = (source: HoldGrowth["source"]): source is HeldArrival =>
    typeof source === "object" && source !== null;

/** What a hold of one marcher over `box` grows out of (see the module comment). */
export async function readHoldGrowth(
    tx: DbTransaction,
    {
        marcherId,
        box,
        rows,
        marks,
        showStart,
    }: {
        marcherId: number;
        box: { start: number; end: number };
        rows: readonly BasicRow[];
        marks: readonly HeldMark[];
        showStart: number;
    },
): Promise<HoldGrowth> {
    const arrival = await readArrival(tx, marcherId, box.start);
    if (isHeldArrival(arrival)) return { from: box.start, source: arrival };
    const reach = holdReachBack({
        start: box.start,
        rows,
        marks,
        showStart,
    });
    if (reach.kind === "hold") {
        const joins = marks.find((m) => m.end === reach.beat)!;
        // A later edit can have made what that hold grows out of a shape's move: judged as if new
        return {
            from: reach.beat,
            source: (await readArrival(tx, marcherId, joins.start)) ?? "joined",
            joins,
        };
    }
    if (arrival === HOME_ARRIVAL)
        return { from: reach.beat, source: HOME_ARRIVAL };
    if (reach.kind === "show") return { from: box.start, source: null };
    const reached = await readArrival(tx, marcherId, reach.beat);
    return {
        from: reach.beat,
        source: isHeldArrival(reached) ? reached : null,
    };
}

/** The names of the pages over `[start, end)`, first to last, without page 0's one beat. */
const pagesOver = (grid: PageGrid, start: number, end: number): string[] =>
    grid.pages.flatMap((p) =>
        p.id !== 0 && p.name !== undefined && p.start < end && start < p.end
            ? [p.name]
            : [],
    );

/** Why a marcher can't be Held over `box`, or null when it can. */
function skipReason({
    box,
    inBox,
    marks,
    inShapeRecipe,
    arrival,
}: {
    box: { start: number; end: number };
    inBox: readonly BasicRow[];
    marks: readonly HeldMark[];
    inShapeRecipe: boolean;
    /**
     * The move the hold grows out of, the starting spot (`home`, with whether a shape sets it), or
     * "joined" when it joins an earlier hold of the marcher that has neither (the upkeep's to mend)
     */
    arrival:
        | (HeldArrival & { inRecipe: boolean })
        | { home: true; shape: boolean }
        | "joined"
        | null;
}): HoldFromPreviousSkipReason | null {
    if (marks.some((m) => overlapsBox(m, box))) return "held";
    const verdict = marcherSimpleOnBox(inBox, box);
    if (!verdict.simple) {
        if (verdict.reason === "crossesFlag") return "crossesFlag";
        if (inBox.some((r) => r.pathStyle === "follow_the_leader"))
            return "followLeader";
        if (verdict.reason === "shape") return "shape";
        return "expertMoves";
    }
    if (inShapeRecipe) return "shape";
    if (arrival === null) return "noArrival";
    if (arrival === "joined") return null;
    if ("home" in arrival) return arrival.shape ? "homeShape" : null;
    const arrivalReason = arrivalSkipReason(arrival, arrival.inRecipe);
    if (arrivalReason === "followTheLeader") return "arrivalFollowLeader";
    if (arrivalReason === "shape") return "arrivalShape";
    return null;
}

/** The marchers a placed shape's recipe holds in any of `timelineIds`. */
async function marchersInRecipesOf(
    tx: DbTransaction,
    timelineIds: readonly number[],
): Promise<Set<number>> {
    const byTimeline = await marcherRecipeTimelines(tx, timelineIds);
    return new Set([...byTimeline.values()].flatMap((ids) => [...ids]));
}
