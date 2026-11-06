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
    type HeldArrival,
    type HeldMark,
} from "./timelineHeldMarks";
import { HOME_ARRIVAL, marchersWithShapeHome } from "./timelineHeldArrival";

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
 * - A hold starts only where it grows out of something at `S`: a move of the marcher's own that
 *   ends at `S` (or the cut's first part), its starting spot (#619), or a hold of its own that
 *   `S` is inside or ends at, which it joins.
 *
 * Left alone and reported, with why (`HoldOverWindowSkipReason`):
 * - `held`: it is Held over the whole window already;
 * - `shape`, `followLeader`, `followLeaderOrder`: a move it would be taken out of is a shape's, or
 *   follows the leader, or it shares a curved move with an inheriting follow-the-leader order
 *   (the holds commands' rule, owner 2026-10-30, until #434 / #504);
 * - `arrivalShape`, `arrivalFollowLeader`, `homeShape`: the hold would grow out of a shape's move,
 *   a follow-the-leader move or a shape's starting spot, which a drag inside it would rewrite (as
 *   Hold from previous page skips it). That includes a move on a higher layer ending at `S` above
 *   a move crossing `S`: after the cut it is the arrival (`arrivalRowSql`), so it is checked
 *   before anything is cut;
 * - `noArrival`: nothing arrives at `S` (it stands still there since an earlier move, or a move
 *   cut short by a higher layer). A hold starting at `S` then is a borrowed hold (04-anchors),
 *   which only #474 stores. Starting it at the earlier arrival instead would make a hold reaching
 *   back before the window, which a later window or page drag would route differently from what
 *   was asked (it would edit the earlier page's arrival, or cut the hold short), so the marcher is
 *   left alone, as Hold from previous page leaves it, until #474.
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
    | "noArrival";

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
 * What a marcher's hold over a window would grow out of at the window's start: the first part of
 * a hold of its own it joins, the first part of a move crossing it (the cut arrives there), its
 * starting spot, or the move arriving there (`null` when nothing does). Where a row on a layer at
 * or above a crossing move's already ends at the start, that row is the arrival after the cut, so
 * it is read as one (and a follow-the-leader or shape move skips the marcher, as without the cut).
 */
type PlannedStart =
    | { from: "joined" }
    | { from: "cut" }
    | { from: "home" }
    | { from: "row"; arrival: HeldArrival | null };

/**
 * What `rows`' marcher's hold over a window starting at `windowStart` would grow out of; `own` are
 * its marks.
 */
async function plannedStart(
    tx: DbTransaction,
    marcherId: number,
    rows: readonly BasicRow[],
    own: readonly HeldMark[],
    windowStart: number,
): Promise<PlannedStart> {
    if (own.some((m) => m.start < windowStart && windowStart <= m.end))
        return { from: "joined" };
    const crossing = rows.filter(
        (r) => r.start < windowStart && windowStart < r.end,
    );
    if (crossing.length > 0) {
        // After the cut its first part ends at the flag, but the arrival is the highest-layer row
        // ending there (`arrivalRowSql`): a row on a layer above the cut's that already ends at
        // the flag wins, and the hold would grow out of it. Read that one now, before any cut,
        // since the takeout can't be undone for one marcher.
        const cutLayer = Math.max(...crossing.map((r) => r.layer));
        if (!rows.some((r) => r.end === windowStart && r.layer >= cutLayer))
            return { from: "cut" };
        const arrival = await readArrival(tx, marcherId, windowStart);
        return {
            from: "row",
            arrival: arrival === HOME_ARRIVAL ? null : arrival,
        };
    }
    if (!rows.some((r) => r.start < windowStart)) return { from: "home" };
    const arrival = await readArrival(tx, marcherId, windowStart);
    return {
        from: "row",
        arrival: arrival === HOME_ARRIVAL ? null : arrival,
    };
}

/** `holdOverWindow` inside the caller's edit. Refused (E-ARGS) for an empty window. */
export async function holdOverWindowInTransaction({
    tx,
    window,
    marcherIds,
}: {
    tx: DbTransaction;
    window: { start: number; end: number };
    marcherIds: readonly number[];
}): Promise<HoldOverWindowResult> {
    if (
        !Number.isInteger(window.start) ||
        !Number.isInteger(window.end) ||
        window.start < 0 ||
        window.end <= window.start
    )
        refuse(
            `Hold over the window needs a window of whole beats, got [${window.start}, ${window.end})`,
        );
    const ids = [...new Set(marcherIds)].sort((x, y) => x - y);
    const rows = await readBasicRows(tx, { marcherIds: ids });
    const marks = await readHeldMarks(tx, ids);
    const result: HoldOverWindowResult = { held: [], skipped: [] };
    const fromHome: number[] = [];
    const planned = new Map<number, PlannedStart>();
    for (const marcherId of ids) {
        const own = marks.filter((m) => m.marcherId === marcherId);
        if (own.some((m) => m.start <= window.start && window.end <= m.end)) {
            result.skipped.push({ marcherId, reason: "held" });
            continue;
        }
        const plan = await plannedStart(
            tx,
            marcherId,
            rows.filter((r) => r.marcherId === marcherId),
            own,
            window.start,
        );
        planned.set(marcherId, plan);
        if (plan.from === "home") fromHome.push(marcherId);
    }
    const shapeHome = await marchersWithShapeHome(tx, fromHome);
    const inRecipe = await marcherRecipeTimelines(tx, [
        ...new Set(
            [...planned.values()].flatMap((p) =>
                p.from === "row" && p.arrival ? [p.arrival.timelineId] : [],
            ),
        ),
    ]);
    const eligible: number[] = [];
    for (const [marcherId, plan] of planned) {
        const reason = startSkipReason(
            plan,
            shapeHome.has(marcherId),
            plan.from === "row" && plan.arrival
                ? (inRecipe.get(plan.arrival.timelineId)?.has(marcherId) ??
                      false)
                : false,
        );
        if (reason) result.skipped.push({ marcherId, reason });
        else eligible.push(marcherId);
    }
    if (eligible.length === 0) return sorted(result);

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
        // its first part arrives at the flag
        await writeJoinedHeldMarkInTransaction(
            tx,
            marks.filter((m) => m.marcherId === marcherId),
            { marcherId, start: window.start, end: window.end },
        );
        result.held.push(marcherId);
    }
    return sorted(result);
}

/** Why a hold starting where `plan` says can't be made, or null when it can. */
function startSkipReason(
    plan: PlannedStart,
    shapeHome: boolean,
    inRecipe: boolean,
): HoldOverWindowSkipReason | null {
    if (plan.from === "cut" || plan.from === "joined") return null;
    if (plan.from === "home") return shapeHome ? "homeShape" : null;
    if (!plan.arrival) return "noArrival";
    const reason = arrivalSkipReason(plan.arrival, inRecipe);
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
