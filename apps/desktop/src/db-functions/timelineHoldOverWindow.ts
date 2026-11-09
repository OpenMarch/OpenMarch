import { inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { BasicRow } from "@/timeline/basicSimple";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { NothingToDo, refuse } from "./timelineErrors";
import { readBasicRows } from "./basicRows";
import { takeMarchersOutOfRangeInTransaction } from "./timelineMoveCuts";
import {
    arrivalSkipReason,
    marcherRecipeTimelines,
    readArrival,
    readHeldMarks,
    type HeldMark,
} from "./timelineHeldMarks";
import { HOME_ARRIVAL, marchersWithShapeHome } from "./timelineHeldArrival";
import { readHoldGrowth, type HoldGrowth } from "./timelineHoldFromPrevious";
import { readPageGrid } from "./timelineRipple";
import { showEndBeat, showStartBeat } from "./timelinePageGrid";
import { holdOverWindowStart, holdWindowInShow } from "@/timeline/holdExtent";

/**
 * **Hold over the window** (holds, fork #476; holds README decision 3, review R8, 01-edit-rules
 * "Hold over the window"; ADR 0012 amendment 2026-10-30): in Expert, each selected marcher is Held
 * from the start flag `S` to the playhead `P`.
 *
 * - Its moves inside the window go (`takeMarchersOutOfRangeInTransaction`, the holds commands' cut
 *   and remove): a move crossing `S` is cut there, so its first part arrives at `S` and the hold
 *   grows out of it; a move crossing `P` is cut there and keeps its destination, so the marcher
 *   walks the rest of it from where it holds, faster (the step-size warning shows it, R8). Where
 *   others share a move whose path a cut would change, the marcher is taken into a move of its own
 *   first, as Clear this page does.
 * - It gets one Held mark over the window, joined with any mark of its own the window overlaps or
 *   touches (touching holds are one hold, 04-anchors).
 * - The hold grows out of whatever last put the marcher there (`holdOverWindowStart`, owner,
 *   2026-11-09): the cut's first part or a move ending at `S`; or, where the marcher stands in Not
 *   defined pages, what it reaches back to, as Hold from last keyframe does (`holdReachBack`): its
 *   last move's end, the end of a hold of its own, or the start of the show. A hold of its own
 *   that `S` is inside or ends at is joined.
 *
 * Left alone and reported, with why (`HoldOverWindowSkipReason`):
 * - `held`: it is Held over the whole window already;
 * - `shape`, `followLeader`, `followLeaderOrder`: a move it would be taken out of is a shape's, or
 *   follows the leader, or it shares a curved move with an inheriting follow-the-leader order
 *   (the holds commands' rule, owner 2026-10-30, until #434 / #504);
 * - `arrivalShape`, `arrivalFollowLeader`, `homeShape`: the hold would grow out of a shape's move,
 *   a follow-the-leader move or a shape's starting spot, which a drag inside it would rewrite (as
 *   Hold from last keyframe skips it). That includes a move on a higher layer ending at `S` above
 *   a move crossing `S`: after the cut it is the arrival (`arrivalRowSql`), so it is checked
 *   before anything is cut;
 * - `endsWithoutArriving`: the row the hold would grow out of ends without arriving there (a lower
 *   layer's row, or its part of a move that runs on), so it has nothing to grow out of.
 *
 * One undo step; a run that holds nobody opens no edit.
 */

/** Why Hold over the window left a marcher alone. */
export type HoldOverWindowSkipReason =
    | "held"
    | "shape"
    | "followLeader"
    | "followLeaderOrder"
    | "arrivalShape"
    | "arrivalFollowLeader"
    | "homeShape"
    | "endsWithoutArriving";

/** A marcher a hold command left alone, with why. */
export interface HoldSkip<R extends string> {
    marcherId: number;
    reason: R;
}

/** What **Hold over the window** did, marcher ids ascending. */
export interface HoldOverWindowResult {
    /** The marchers now Held over the window */
    held: number[];
    /** The others, with why */
    skipped: HoldSkip<HoldOverWindowSkipReason>[];
}

/** **Hold over the window** `window` (`[S, P)`) for `marcherIds` (see the module comment). */
export async function holdOverWindow({
    db,
    window,
    marcherIds,
}: {
    db: DbConnection;
    window: { start: number; end: number };
    marcherIds: readonly number[];
}): Promise<HoldOverWindowResult> {
    if (marcherIds.length === 0) return { held: [], skipped: [] };
    try {
        return await transactionWithHistory(
            db,
            "holdOverWindow",
            async (tx) => {
                const result = await holdOverWindowInTransaction({
                    tx,
                    window,
                    marcherIds,
                });
                if (result.held.length === 0) throw new NothingToDo(result);
                return result;
            },
        );
    } catch (e) {
        if (e instanceof NothingToDo) return e.result as HoldOverWindowResult;
        throw e;
    }
}

/**
 * What a marcher's hold over a window grows out of: the first part of a move crossing the window's
 * start (`"cut"`), or what Hold from last keyframe would grow it out of (`HoldGrowth`). Read before
 * anything is cut, since the takeout can't be undone for one marcher.
 */
type PlannedSource = HoldGrowth["source"] | "cut";

/** What `rows`' marcher's hold over `window` would grow out of; `own` are its marks. */
async function plannedSource(
    tx: DbTransaction,
    marcherId: number,
    rows: readonly BasicRow[],
    own: readonly HeldMark[],
    window: { start: number; end: number },
    showStart: number,
): Promise<PlannedSource> {
    const windowStart = window.start;
    // Joining a hold: judged by what that hold grows out of, as if new
    const joins = own.find(
        (m) => m.start < windowStart && windowStart <= m.end,
    );
    if (joins)
        return (await readArrival(tx, marcherId, joins.start)) ?? "joined";
    const crossing = rows.filter(
        (r) => r.start < windowStart && windowStart < r.end,
    );
    if (crossing.length > 0) {
        // After the cut its first part ends at the flag, but the arrival is the highest-layer row
        // ending there (`arrivalRowSql`): a row on a layer above the cut's that already ends at
        // the flag wins, and the hold would grow out of it
        const cutLayer = Math.max(...crossing.map((r) => r.layer));
        if (!rows.some((r) => r.end === windowStart && r.layer >= cutLayer))
            return "cut";
        return readArrival(tx, marcherId, windowStart);
    }
    const growth = await readHoldGrowth(tx, {
        marcherId,
        box: window,
        rows,
        marks: own,
        showStart,
    });
    return growth.source;
}

/** `holdOverWindow` inside the caller's edit. Refused (E-ARGS) for an empty window. */
export async function holdOverWindowInTransaction({
    tx,
    window: asked,
    marcherIds,
}: {
    tx: DbTransaction;
    window: { start: number; end: number };
    marcherIds: readonly number[];
}): Promise<HoldOverWindowResult> {
    if (
        !Number.isInteger(asked.start) ||
        !Number.isInteger(asked.end) ||
        asked.start < 0 ||
        asked.end <= asked.start
    )
        refuse(
            `Hold over the window needs a window of whole beats, got [${asked.start}, ${asked.end})`,
        );
    const grid = await readPageGrid(tx);
    const showStart = showStartBeat(grid);
    const window = holdWindowInShow(asked, showStart, showEndBeat(grid));
    if (!window) return { held: [], skipped: [] };
    const ids = [...new Set(marcherIds)].sort((x, y) => x - y);
    const rows = await readBasicRows(tx, { marcherIds: ids });
    const marks = await readHeldMarks(tx, ids);
    const result: HoldOverWindowResult = { held: [], skipped: [] };
    const fromHome: number[] = [];
    const planned = new Map<number, PlannedSource>();
    for (const marcherId of ids) {
        const own = marks.filter((m) => m.marcherId === marcherId);
        if (own.some((m) => m.start <= window.start && window.end <= m.end)) {
            result.skipped.push({ marcherId, reason: "held" });
            continue;
        }
        const plan = await plannedSource(
            tx,
            marcherId,
            rows.filter((r) => r.marcherId === marcherId),
            own,
            window,
            showStart,
        );
        planned.set(marcherId, plan);
        if (plan === HOME_ARRIVAL) fromHome.push(marcherId);
    }
    const shapeHome = await marchersWithShapeHome(tx, fromHome);
    const inRecipe = await marcherRecipeTimelines(tx, [
        ...new Set(
            [...planned.values()].flatMap((p) =>
                isArrivalRow(p) ? [p.timelineId] : [],
            ),
        ),
    ]);
    const eligible: number[] = [];
    for (const [marcherId, plan] of planned) {
        const reason = startSkipReason(
            plan,
            shapeHome.has(marcherId),
            isArrivalRow(plan)
                ? (inRecipe.get(plan.timelineId)?.has(marcherId) ?? false)
                : false,
        );
        if (reason) result.skipped.push({ marcherId, reason });
        else eligible.push(marcherId);
    }
    if (eligible.length === 0) return sorted(result);

    // Where each hold starts, from the rows and marks before the cut (the preview reads the same)
    const starts = new Map(
        eligible.map((marcherId) => [
            marcherId,
            holdOverWindowStart({
                windowStart: window.start,
                rows: rows.filter((r) => r.marcherId === marcherId),
                marks: marks.filter((m) => m.marcherId === marcherId),
                showStart,
            }),
        ]),
    );

    // Out of every move inside the window, cut where a move crosses its edges
    const out = await takeMarchersOutOfRangeInTransaction({
        tx,
        marcherIds: eligible,
        range: window,
    });
    const stayed = new Set(out.skipped.map((s) => s.marcherId));
    for (const skip of out.skipped)
        result.skipped.push({
            marcherId: skip.marcherId,
            reason:
                skip.reason === "followTheLeader"
                    ? "followLeader"
                    : skip.reason === "followTheLeaderOrder"
                      ? "followLeaderOrder"
                      : "shape",
        });
    for (const marcherId of eligible) {
        if (stayed.has(marcherId)) continue;
        // A move crossing the start flag was cut there (a move crossing a count always is), so
        // its first part arrives at the flag; a marcher standing still reaches back
        await writeJoinedHeldMarkInTransaction(
            tx,
            marks.filter((m) => m.marcherId === marcherId),
            {
                marcherId,
                start: starts.get(marcherId)!,
                end: window.end,
            },
        );
        result.held.push(marcherId);
    }
    return sorted(result);
}

const isArrivalRow = (
    source: PlannedSource,
): source is Exclude<
    HoldGrowth["source"],
    typeof HOME_ARRIVAL | "joined" | null
> => typeof source === "object" && source !== null;

/** Why a hold growing out of `source` can't be made, or null when it can. */
function startSkipReason(
    source: PlannedSource,
    shapeHome: boolean,
    inRecipe: boolean,
): HoldOverWindowSkipReason | null {
    if (source === "cut" || source === "joined") return null;
    if (source === HOME_ARRIVAL) return shapeHome ? "homeShape" : null;
    if (source === null) return "endsWithoutArriving";
    const reason = arrivalSkipReason(source, inRecipe);
    if (reason === "followTheLeader") return "arrivalFollowLeader";
    if (reason === "shape") return "arrivalShape";
    return null;
}

const sorted = <R extends string>(result: {
    held: number[];
    skipped: HoldSkip<R>[];
}) => {
    result.held.sort((x, y) => x - y);
    result.skipped.sort((x, y) => x.marcherId - y.marcherId);
    return result;
};

/**
 * Writes one Held mark over `[start, end)` for its marcher, joined with each of `own` (that
 * marcher's marks before the edit) it overlaps or touches, which are replaced by it (touching
 * holds are one hold, 04-anchors; no two of a marcher's marks overlap, H-3).
 */
export async function writeJoinedHeldMarkInTransaction(
    tx: DbTransaction,
    own: readonly HeldMark[],
    mark: { marcherId: number; start: number; end: number },
): Promise<void> {
    const joined = own.filter(
        (m) => m.start <= mark.end && mark.start <= m.end,
    );
    const start = Math.min(mark.start, ...joined.map((m) => m.start));
    const end = Math.max(mark.end, ...joined.map((m) => m.end));
    const h = schema.timeline_held_marks;
    if (joined.length > 0)
        await tx.delete(h).where(
            inArray(
                h.id,
                joined.map((m) => m.id),
            ),
        );
    await tx.insert(h).values({
        marcher_id: mark.marcherId,
        start_beat: start,
        end_beat: end,
    });
}
