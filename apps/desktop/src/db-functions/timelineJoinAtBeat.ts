import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbTransaction } from "./types";
import { readPageGrid } from "./timelineRipple";
import {
    fitMoveInTransaction,
    splitRefusal,
    type FitRefusal,
} from "./timelineSplitMoves";
import { deleteTimelinesInTransaction } from "./timelines";
import {
    memberRows,
    memberRowsWhere,
    readTimeline,
} from "./timelineMemberRows";
import {
    planRemovalFromRange,
    takeMarchersIntoOwnMoveInTransaction,
    type MoveMemberSkip,
    type RemovalPlan,
} from "./timelineMoveCuts";

/**
 * **Remove keyframe joins the halves after a split** (holds README decision 14, #470). When
 * Remove keyframe takes away a move's end and the marcher's next move starts on that same count,
 * the two moves become one again, so the marcher walks the original path at even speed instead of
 * standing still and then going at double speed (#362 Repro, question 14). In practice that is
 * right after Split at playhead.
 *
 * Remove keyframe deletes the rows ending on the count as it always has. The join then fits the
 * move after the count back over the removed move's counts, as a merge fits a move (UI-25,
 * `fitMoveInTransaction`): its rows that started on the count start where the removed move did,
 * and its destinations, paths and shape recipes stay. After a split that is the move as it was.
 *
 * It joins only:
 *
 * - at a count that isn't a page flag (review, semantics M1): at a flag Remove behaves as before,
 *   and the page follows the page before;
 * - when the whole membership was removed (#470): nobody is left in the removed move, and every marcher
 *   starting the next move on the count was in it. For part of a group, Remove first takes the
 *   selected marchers out of both halves into moves of their own (`takePartOfGroupsApartInTransaction`,
 *   R4, #471), so this step runs on their own moves;
 * - when the fit is allowed (`fitMoveInTransaction`); otherwise those marchers keep the plain
 *   Remove, and are reported with the reason (`NotJoined`), which the UI shows as a toast.
 *
 * Joining never changes anyone's membership: the move after the count keeps its marchers, so
 * shape and follow-the-leader members (holds ownership, owner 2026-10-30) join like the others.
 */

/** A move end Remove keyframe takes away: a row ending on the count, and its move's counts. */
export interface RemovedMoveEnd {
    readonly marcherId: number;
    /** Where the row started */
    readonly start: number;
    readonly timelineId: number;
    readonly timelineStart: number;
    readonly timelineEnd: number;
}

/**
 * Marchers whose moves around the count weren't joined because the fit was refused, ascending,
 * and why (`FitRefusal`'s kind; `notJoinedMessage` words it). They keep the plain Remove.
 */
export interface NotJoined {
    readonly marcherIds: number[];
    readonly reason: FitRefusal["kind"];
}

/** What a join did (`joinMovesAtInTransaction`). */
export interface JoinResult {
    /** The marchers that walk a joined move, ascending */
    joined: number[];
    /** The marchers whose join was refused, by move after the count */
    notJoined: NotJoined[];
}

const ascending = (ids: Iterable<number>) =>
    [...new Set(ids)].sort((a, b) => a - b);

/** The move ends of assignment rows `assignmentIds`, read before Remove deletes them. */
export async function readMoveEnds(
    tx: DbTransaction,
    assignmentIds: readonly number[],
): Promise<RemovedMoveEnd[]> {
    if (assignmentIds.length === 0) return [];
    const rows = await memberRowsWhere(
        tx,
        inArray(schema.timeline_assignments.id, [...assignmentIds]),
    );
    return rows.map(({ assignment: a, timeline: l }) => ({
        marcherId: a.marcher_id,
        start: a.start_beat,
        timelineId: l.id,
        timelineStart: l.start_beat,
        timelineEnd: l.end_beat,
    }));
}

/**
 * Joins the moves that start on `beat` back over the counts of the removed moves that ended there
 * (see the module comment), once Remove has deleted `ends` (`readMoveEnds`, read before).
 */
export async function joinMovesAtInTransaction({
    tx,
    beat,
    ends,
}: {
    tx: DbTransaction;
    beat: number;
    ends: readonly RemovedMoveEnd[];
}): Promise<JoinResult> {
    const result: JoinResult = { joined: [], notJoined: [] };
    if (ends.length === 0) return result;
    const grid = await readPageGrid(tx);
    if (grid.pages.some((p) => p.start === beat)) return result;

    const byMove = new Map<number, RemovedMoveEnd[]>();
    for (const end of ends) {
        const list = byMove.get(end.timelineId) ?? [];
        list.push(end);
        byMove.set(end.timelineId, list);
    }
    const joined: number[] = [];
    for (const [removedId, its] of byMove) {
        // `its` holds at least the end that made its entry, and all are rows of one move, so
        // they share its counts
        const { timelineStart, timelineEnd } = its[0]!;
        // The removed move ended on the count, every row of it ran from its start, and nobody is
        // left in it (the whole membership was selected), though it may be left empty
        if (timelineEnd !== beat) continue;
        if (its.some((e) => e.start !== timelineStart)) continue;
        if ((await memberRows(tx, removedId)).length > 0) continue;
        const removed = new Set(its.map((e) => e.marcherId));
        let joinedAny = false;
        for (const [nextId, starting] of await movesStartingAt(
            tx,
            beat,
            removed,
        )) {
            if (starting.some((id) => !removed.has(id))) continue;
            // `movesStartingAt` just read the move, in this transaction
            const next = (await readTimeline(tx, nextId))!;
            const why = await fitMoveInTransaction({
                tx,
                sourceId: nextId,
                counts: { start: timelineStart, end: next.end_beat },
            });
            if (why !== null) {
                result.notJoined.push({
                    marcherIds: ascending(starting),
                    reason: why.kind,
                });
                continue;
            }
            joined.push(...starting);
            joinedAny = true;
        }
        // The removed move is one with the next now. Remove may have left it, emptied, with a
        // vacant slot in a shared transition (D-13)
        if (joinedAny)
            await deleteTimelinesInTransaction({
                tx,
                timelineIds: new Set([removedId]),
            });
    }
    result.joined = ascending(joined);
    return result;
}

/** What `takePartOfGroupsApartInTransaction` did. */
export interface TakenApart {
    /**
     * The selected marchers that couldn't be taken out and keep the plain Remove, one entry each,
     * ascending, for the caller to name (`skippedRefusal`)
     */
    leftInGroup: MoveMemberSkip[];
    /**
     * The new moves of their own in the halves before the count. Remove empties them; a join
     * deletes them, and where it's refused the caller does (`deleteEmptiedOwnMoves`)
     */
    ownMovesBefore: number[];
}

/**
 * **Part of a group** (R4, #471): before Remove keyframe at `beat` for `marcherIds`, takes those
 * of them that are only part of the move ending on the count (the move before a split), or of a
 * move they start on the count (the move after), out of both, each into a move of their own
 * (`takeMarchersIntoOwnMoveInTransaction`, motion unchanged). Remove then empties their move
 * before the count, so `joinMovesAtInTransaction` joins it with theirs after. The others keep both
 * halves. Where they are the whole membership of both, nothing is taken: they join as they are
 * (#470).
 *
 * As for the join, only at a count that isn't a page flag, and only for a marcher whose row runs
 * the whole move before the count and who starts a move on it. Every refusal is decided for both
 * halves before anything is written: a shape or follow-the-leader member of either half (holds
 * ownership, owner 2026-10-30; `planRemovalFromRange`) isn't taken out of either, and where split
 * by marcher would refuse to break up a shared transition (`splitRefusal`: a member, staying or
 * not, follows the leader in an inheriting order anywhere in the show), none of that move's
 * marchers are. Those keep the plain Remove.
 */
export async function takePartOfGroupsApartInTransaction({
    tx,
    beat,
    marcherIds,
}: {
    tx: DbTransaction;
    beat: number;
    marcherIds: readonly number[];
}): Promise<TakenApart> {
    const out: TakenApart = { leftInGroup: [], ownMovesBefore: [] };
    if (marcherIds.length === 0) return out;
    const grid = await readPageGrid(tx);
    if (grid.pages.some((p) => p.start === beat)) return out;
    const a = schema.timeline_assignments;
    const l = schema.timelines;
    const ending = await memberRowsWhere(
        tx,
        and(
            inArray(a.marcher_id, [...marcherIds]),
            eq(a.end_beat, beat),
            eq(l.end_beat, beat),
        ),
    );
    // The selected marchers of each move ending on the count whose row runs its whole counts
    const chosenIn = new Map<number, Set<number>>();
    for (const { assignment, timeline } of ending) {
        if (assignment.start_beat !== timeline.start_beat) continue;
        const set = chosenIn.get(timeline.id) ?? new Set<number>();
        set.add(assignment.marcher_id);
        chosenIn.set(timeline.id, set);
    }

    // Plan every move first, so a refusal never leaves half of it written
    const skipped = new Map<number, MoveMemberSkip>();
    const takes: PlannedTake[] = [];
    for (const [beforeId, chosen] of chosenIn) {
        const planned = await planTake(tx, beat, beforeId, chosen);
        for (const s of planned.skips)
            if (!skipped.has(s.marcherId)) skipped.set(s.marcherId, s);
        if (planned.take) takes.push(planned.take);
    }

    for (const take of takes)
        for (const { timelineId, plan } of take.plans) {
            const own = await takeMarchersIntoOwnMoveInTransaction({
                tx,
                timelineId,
                marcherIds: take.marcherIds,
                plan,
            });
            if (
                timelineId === take.beforeId &&
                own.timelineId !== null &&
                own.timelineId !== timelineId
            )
                out.ownMovesBefore.push(own.timelineId);
        }
    out.leftInGroup = [...skipped.values()].sort(
        (x, y) => x.marcherId - y.marcherId,
    );
    return out;
}

/** One move's take, planned (`planTake`). */
interface PlannedTake {
    beforeId: number;
    marcherIds: number[];
    /** The removal plan for each half, the move before the count first */
    plans: { timelineId: number; plan: RemovalPlan }[];
}

/**
 * Plans taking `chosen`, the selected marchers of move `beforeId` ending on `beat`, apart (see
 * `takePartOfGroupsApartInTransaction`), writing nothing: the take, or null when there is none,
 * and the marchers that stay, one entry each.
 */
async function planTake(
    tx: DbTransaction,
    beat: number,
    beforeId: number,
    chosen: ReadonlySet<number>,
): Promise<{ take: PlannedTake | null; skips: MoveMemberSkip[] }> {
    const members = (await memberRows(tx, beforeId)).map(
        (r) => r.assignment.marcher_id,
    );
    const after = await movesStartingAt(tx, beat, chosen);
    // The whole membership of both halves joins as it is (#470)
    if (
        members.every((m) => chosen.has(m)) &&
        [...after.values()].every((list) => list.every((m) => chosen.has(m)))
    )
        return { take: null, skips: [] };
    const starting = new Set([...after.values()].flat());
    const going = ascending([...chosen].filter((m) => starting.has(m)));
    if (going.length === 0) return { take: null, skips: [] };
    const moves = [beforeId, ...after.keys()];
    const planFor = async (ids: readonly number[]) => {
        const plans: PlannedTake["plans"] = [];
        for (const id of moves) {
            // `memberRows` and `movesStartingAt` just read these moves, in this transaction
            const move = (await readTimeline(tx, id))!;
            plans.push({
                timelineId: id,
                plan: await planRemovalFromRange({
                    tx,
                    marcherIds: ids,
                    range: { start: move.start_beat, end: move.end_beat },
                    timelineId: id,
                }),
            });
        }
        return plans;
    };
    let plans = await planFor(going);
    // A marcher staying in either half stays in both
    const skips = new Map<number, MoveMemberSkip>();
    for (const { plan } of plans)
        for (const s of plan.skipped)
            if (!skips.has(s.marcherId)) skips.set(s.marcherId, s);
    const taking = going.filter((m) => !skips.has(m));
    if (taking.length === 0) return { take: null, skips: [...skips.values()] };
    if (skips.size > 0) plans = await planFor(taking);
    // Split by marcher's own refusals: a shared transition into a stored shape is switched to
    // individual points first, so only follow the leader is left, and then none of them go
    for (const id of moves) {
        const why = await splitRefusal(tx, id, taking, {
            storedShapesSwitched: true,
        });
        if (!why) continue;
        for (const marcherId of taking)
            skips.set(marcherId, {
                marcherId,
                timelineId: id,
                reason: why.reason,
            });
        return { take: null, skips: [...skips.values()] };
    }
    return {
        take: { beforeId, marcherIds: taking, plans },
        skips: [...skips.values()],
    };
}

/**
 * Deletes each of `timelineIds` (`TakenApart.ownMovesBefore`) that is still there with nobody in
 * it: a move of their own that Remove emptied and whose join was refused, left with vacant slots
 * (D-13).
 */
export async function deleteEmptiedOwnMoves(
    tx: DbTransaction,
    timelineIds: readonly number[],
): Promise<void> {
    const emptied = new Set<number>();
    for (const id of timelineIds)
        if (
            (await readTimeline(tx, id)) &&
            (await memberRows(tx, id)).length === 0
        )
            emptied.add(id);
    if (emptied.size > 0)
        await deleteTimelinesInTransaction({ tx, timelineIds: emptied });
}

/**
 * The moves starting on `beat` that one of `marcherIds` starts a row of on it, each with every
 * marcher that starts a row of it on `beat`.
 */
async function movesStartingAt(
    tx: DbTransaction,
    beat: number,
    marcherIds: ReadonlySet<number>,
): Promise<Map<number, number[]>> {
    const a = schema.timeline_assignments;
    const l = schema.timelines;
    const rows = await memberRowsWhere(
        tx,
        and(eq(l.start_beat, beat), eq(a.start_beat, beat)),
    );
    const out = new Map<number, number[]>();
    for (const { assignment, timeline } of rows) {
        const list = out.get(timeline.id) ?? [];
        list.push(assignment.marcher_id);
        out.set(timeline.id, list);
    }
    for (const [id, list] of out)
        if (!list.some((m) => marcherIds.has(m))) out.delete(id);
    return out;
}
