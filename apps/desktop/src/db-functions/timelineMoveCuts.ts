import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { schema } from "@/global/database/db";
import { TimelineEditRefusedError } from "@/timeline/timelineEditRefusals";
import { joinList } from "@/timeline/timelineRangeWords";
import type { DbTransaction } from "./types";
import type { DatabaseTimelineAssignment } from "./timelineAssignments";
import { marcherLabels, type BeatRange } from "./timelineMembership";
import {
    splitTimelineAtBeatInTransaction,
    type SplitIdKeeper,
    type SplitTimelineResult,
} from "./timelineSplitAtBeat";
import { hasShapeRecipes, shapeRecipesOnly } from "./shapeRecipes";
import { setTimelineTransitionDestinationInTransaction } from "./timelineTransitionsInTransaction";
import { timelinesWithRange } from "./timelines";
import { clearOwnPageMoves, sampleShape } from "./timelineMoveHelpers";
import { memberRowsWhere, readTimeline } from "./timelineMemberRows";
import {
    splitMarchersIntoNewMoveInTransaction,
    splitRefusal,
    type SplitRefusal,
} from "./timelineSplitMoves";

/**
 * Cut and remove: the two move operations the holds commands share (holds spec,
 * docs/timeline/research/holds/, decision 16; ADR 0001, amendment of 2026-10-30). Every holds
 * command that takes a marcher out of some counts goes through them, so they stay one seam.
 * Joining moves back together is #470's `timelineJoinAtBeat.ts`.
 *
 * 1. **Cut a move in time at a count** (`cutMoveAtBeatInTransaction`): Split at playhead's split
 *    (`splitTimelineAtBeatInTransaction`, UI-27), the whole membership in both parts. Motion
 *    before the count is unchanged on a direct or arc path (an arc's first part is an arc of the
 *    same circle, #591), and after it on a direct path; a curved path starts a new curve there. A part may land on a range another move already has, as a split
 *    by marcher may (UI-25), so a cut at a page's flags can make a move over exactly the page box.
 *    The original move keeps its id as the part after the count, unless that part would take over
 *    a page's move (it would be the oldest over a range a newer move has: a page's own move is the
 *    oldest over its box). Then the part before keeps the id, or neither does (the original goes)
 *    when that part would take one over too (`SplitIdKeeper`). The transitions after the count,
 *    and any shape recipe (#363), stay with the part after it. A count not strictly inside the
 *    move, or one with nobody moving on a side of it, needs no cut: nothing is written.
 * 2. **Remove marchers from a move for a range of counts**
 *    (`removeMarchersFromMoveForRangeInTransaction`): the move is cut at the range's ends where one
 *    of the marchers' rows crosses them, then the marchers leave the piece over the range. Their
 *    slots in a shared transition are compacted, a transition they empty is deleted, and so is a
 *    move they empty (`clearOwnPageMoves` with `tidyShared`, as Basic's Set to previous page).
 *    On a direct or arc path their motion before the range is unchanged, at every count (holds
 *    decision 16, #591); after it, they walk from wherever they now are. Follow-the-leader members
 *    stay (below), so no cut of theirs is sampled into straight lines.
 *    A cut restarts the curve after it for everyone on a path that isn't direct, so where others
 *    share the move and one of them has such a row before the last cut, the move isn't cut for
 *    everyone: the marchers are taken into a move of their own first (below), and only that is
 *    cut, so the others keep their rows, move, shape recipe and motion (holds decision 16: other
 *    pages keep their motion). Where split by marcher refuses to take them out (`splitRefusal`: a
 *    shared transition in an inheriting follow-the-leader order), they stay in all their moves and
 *    are named (`followTheLeaderOrder`). A direct path is cut for everyone, as no one's motion
 *    changes.
 *
 * **Shape and follow-the-leader members stay** (owner, 2026-10-30, holds README decisions 6–14,
 * interim until fork #504): a marcher in a shape recipe of the move (#363), or whose row is in a
 * follow-the-leader transition, is left in it and reported in `skipped` with the reason. The
 * others are still removed. `skippedRefusal` words them for the toast. A transition into a stored
 * shape (Q-14, no recipe) is switched to individual points first, as a canvas move switches it,
 * so the marchers who stay keep their spots.
 *
 * **Into a move of their own** (`takeMarchersIntoOwnMoveInTransaction`, R4, #471): a removal over
 * the move's whole counts whose marchers aren't left with nothing there but go, rows and motion as
 * they are, into a new move over the same counts (a split by marcher, UI-25). Remove keyframe pulls
 * part of a group out of both halves of a split this way, so #470's join can make them one move.
 * The same members stay as for a removal.
 *
 * **Preview:** `planRemovalFromRange` changes nothing and says what a removal would do: who would
 * be refused and why, who would leave, and the cuts. The write functions carry out its plan, so a
 * command's preview and its write can't disagree. Each cut's id keeper is worked out against the
 * moves as the plan's earlier writes leave them (`PlannedRanges`), so a part of one move's cut
 * doesn't take over a page move that another move's part makes in the same removal.
 *
 * The writes run inside the caller's edit (`transactionWithHistory`), so the command is one undo
 * step.
 */

/**
 * Why a marcher can't be taken out of its move: it is in a shape or follows the leader, or it
 * shares a move whose path a cut would change with a marcher in an inheriting follow-the-leader
 * order, so it can't be taken into a move of its own (`followTheLeaderOrder`).
 */
export type MoveMemberSkipReason =
    | "shape"
    | "followTheLeader"
    | "followTheLeaderOrder";

/** A marcher left in its move, with why. */
export interface MoveMemberSkip {
    marcherId: number;
    timelineId: number;
    reason: MoveMemberSkipReason;
}

/** A cut a removal makes, as planned before any write. */
export interface PlannedCut {
    /**
     * The stored move the cut's piece comes from (as it is before the removal; with `intoOwnMove`,
     * the piece is of the marchers' own move taken out of it)
     */
    timelineId: number;
    beat: number;
    /** Which part keeps the id of the piece being cut (`SplitIdKeeper`) */
    idStaysWith: SplitIdKeeper;
}

/** What removing marchers from one move over a range would do. */
export interface MoveRemovalPlan {
    timelineId: number;
    /** The marchers that would leave, ascending */
    removed: number[];
    /**
     * Whether they'd be taken into a move of their own first, so the cuts are of that move and the
     * others keep theirs as it is (see the module comment)
     */
    intoOwnMove: boolean;
    /** The cuts, in order: at the range's start, then at its end */
    cuts: PlannedCut[];
}

/** What a removal would do (`planRemovalFromRange`), marcher ids ascending. */
export interface RemovalPlan {
    /** The marchers that would be taken out */
    removed: number[];
    /** The marchers that would be left in, one entry each, with why */
    skipped: MoveMemberSkip[];
    /** Per move they'd leave, by move id */
    moves: MoveRemovalPlan[];
}

/** The piece of a move marchers were removed from. */
export interface RemovedFromPiece {
    /** The stored move the piece comes from (as it was before the removal) */
    timelineId: number;
    /** The piece over the range, the move itself when it needed no cut */
    pieceId: number;
    /** Whether the removal emptied the piece, so it was deleted */
    deleted: boolean;
}

/** What a removal did, marcher ids ascending. */
export interface RemoveFromRangeResult {
    /** The marchers taken out of the range */
    removed: number[];
    /** The marchers left in, one entry each */
    skipped: MoveMemberSkip[];
    /** The cuts made, in order */
    cuts: SplitTimelineResult[];
    /** The pieces they were removed from, one per move, by move id */
    pieces: RemovedFromPiece[];
}

const ascending = (ids: Iterable<number>) =>
    [...new Set(ids)].sort((a, b) => a - b);

/** The id a plan gives the first move a write would make: above every stored move's. */
const FIRST_NEW_ID = 2 ** 52;

/** A stored move's id and range. */
interface MoveSpan {
    id: number;
    start: number;
    end: number;
}

/**
 * The moves' ranges as the writes planned so far would leave them. A removal from several moves
 * writes them one after another, and a part an earlier one makes (a cut's new part, or a marchers'
 * own move) can land on a range that a later cut's part would then take over, so the plan works
 * out each cut's id keeper against what the write will find there. New moves get ids above every
 * stored one, in the order the writes make them, as the database does.
 */
class PlannedRanges {
    /** Stored moves a planned write changes, or deletes (`null`), and the new ones, by id */
    private readonly changed = new Map<number, BeatRange | null>();
    private nextId = FIRST_NEW_ID;

    constructor(private readonly tx: DbTransaction) {}

    /** The ids of the moves over exactly `range`, oldest first. */
    async withRange(range: BeatRange): Promise<number[]> {
        const stored = (await timelinesWithRange(this.tx, range))
            .map((l) => l.id)
            .filter((id) => !this.changed.has(id));
        const planned = [...this.changed]
            .filter(
                ([, r]) => r && r.start === range.start && r.end === range.end,
            )
            .map(([id]) => id);
        return [...stored, ...planned].sort((a, b) => a - b);
    }

    /** A move a write makes over `range`; returns its id. */
    add(range: BeatRange): number {
        const id = this.nextId++;
        this.changed.set(id, range);
        return id;
    }

    /** Move `id` now runs over `range`, or is deleted (`null`). */
    set(id: number, range: BeatRange | null): void {
        this.changed.set(id, range);
    }

    /**
     * Plans cutting `move` at `beat`, as `splitTimelineAtBeatInTransaction` writes it: which part
     * keeps the id (see the module comment), and the parts' ids.
     */
    async cut(
        move: MoveSpan,
        beat: number,
    ): Promise<{
        idStaysWith: SplitIdKeeper;
        before: MoveSpan;
        after: MoveSpan;
    }> {
        const beforeRange = { start: move.start, end: beat };
        const afterRange = { start: beat, end: move.end };
        const idStaysWith: SplitIdKeeper = !(await this.wouldTakeOver(
            move.id,
            afterRange,
        ))
            ? "after"
            : (await this.wouldTakeOver(move.id, beforeRange))
              ? "neither"
              : "before";
        // The split moves a part after the beat out first, then makes the part before
        let afterId = move.id;
        if (idStaysWith === "after") this.set(move.id, afterRange);
        else afterId = this.add(afterRange);
        let beforeId = move.id;
        if (idStaysWith === "before") this.set(move.id, beforeRange);
        else beforeId = this.add(beforeRange);
        if (idStaysWith === "neither") this.set(move.id, null);
        return {
            idStaysWith,
            before: { id: beforeId, ...beforeRange },
            after: { id: afterId, ...afterRange },
        };
    }

    /**
     * Whether move `id` would take over the move of `range` if it ran over it: some other move has
     * the range and all of them are newer, so `id` would be the oldest there, which is what makes
     * a page box's move the page's own (`timelinesWithRange(...)[0]`).
     */
    private async wouldTakeOver(
        id: number,
        range: BeatRange,
    ): Promise<boolean> {
        const oldest = (await this.withRange(range)).find((m) => m !== id);
        return oldest !== undefined && oldest > id;
    }
}

/**
 * **Cut a move in time at a count**: move `timelineId` becomes two meeting at `beat` (see the
 * module comment). Returns the split, or `null` when no cut is needed (`beat` isn't strictly
 * inside the move, or nobody in it moves before or after `beat`). Refused (E-ARGS) for a missing
 * move or a beat that isn't whole.
 */
export async function cutMoveAtBeatInTransaction({
    tx,
    timelineId,
    beat,
}: {
    tx: DbTransaction;
    timelineId: number;
    beat: number;
}): Promise<SplitTimelineResult | null> {
    const move = await readTimeline(tx, timelineId);
    let idStaysWith: SplitIdKeeper = "after";
    if (move && Number.isInteger(beat)) {
        if (!(move.start_beat < beat && beat < move.end_beat)) return null;
        const rows = await rowsIn(tx, timelineId);
        if (
            !rows.some((r) => r.row.start_beat < beat) ||
            !rows.some((r) => r.row.end_beat > beat)
        )
            return null;
        ({ idStaysWith } = await new PlannedRanges(tx).cut(
            { id: move.id, start: move.start_beat, end: move.end_beat },
            beat,
        ));
    }
    // A missing move or a fractional beat: the split's own refusal says so
    return await splitTimelineAtBeatInTransaction({
        tx,
        timelineId,
        beat,
        allowSharedRanges: true,
        idStaysWith,
    });
}

/** A row in a move, with what decides whether its marcher may leave. */
export interface MoveRow {
    row: DatabaseTimelineAssignment;
    timelineId: number;
    shapeId: number | null;
    pathStyle: string;
}

/**
 * The rows of move `timelineId` (or of every move, `null`), optionally only `marcherIds`' and only
 * those over `range`, by row id.
 */
export async function rowsIn(
    tx: DbTransaction,
    timelineId: number | null,
    {
        marcherIds,
        range,
    }: { marcherIds?: readonly number[]; range?: BeatRange } = {},
): Promise<MoveRow[]> {
    if (marcherIds?.length === 0) return [];
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const conditions = [
        ...(timelineId === null ? [] : [eq(t.timeline_id, timelineId)]),
        ...(marcherIds ? [inArray(a.marcher_id, [...marcherIds])] : []),
        ...(range
            ? [lt(a.start_beat, range.end), gt(a.end_beat, range.start)]
            : []),
    ];
    return (await memberRowsWhere(tx, and(...conditions))).map((m) => ({
        row: m.assignment,
        timelineId: m.timeline.id,
        shapeId: m.transition.dest_shape_id,
        pathStyle: m.transition.path_style,
    }));
}

/**
 * Switches the shape-backed transitions among `rows` to individual points first, copying the
 * shape's samples (Q-14, as a canvas move does), so the slots can be compacted and the marchers
 * who stay keep their spots.
 */
async function switchToIndividualPoints(
    tx: DbTransaction,
    rows: readonly MoveRow[],
): Promise<void> {
    const T = schema.timeline_transitions;
    for (const transitionId of ascending(
        rows.filter((r) => r.shapeId !== null).map((r) => r.row.transition_id),
    )) {
        const transition = await tx
            .select()
            .from(T)
            .where(eq(T.id, transitionId))
            .get();
        if (!transition || transition.dest_shape_id === null) continue;
        const shape = await tx
            .select()
            .from(schema.timeline_shapes)
            .where(eq(schema.timeline_shapes.id, transition.dest_shape_id))
            .get();
        if (!shape) continue;
        await setTimelineTransitionDestinationInTransaction({
            tx,
            transitionId,
            destination: {
                kind: "individual",
                points: sampleShape(shape, transition.slot_count),
            },
        });
    }
}

/** Each marcher among `rows` that has to stay in its move, with why (see the module comment). */
async function membersThatStay(
    tx: DbTransaction,
    rows: readonly MoveRow[],
): Promise<Map<number, MoveMemberSkip>> {
    const out = new Map<number, MoveMemberSkip>();
    const note = (r: MoveRow, reason: MoveMemberSkipReason) => {
        if (!out.has(r.row.marcher_id))
            out.set(r.row.marcher_id, {
                marcherId: r.row.marcher_id,
                timelineId: r.timelineId,
                reason,
            });
    };
    for (const r of rows)
        if (r.pathStyle === "follow_the_leader") note(r, "followTheLeader");
    if (rows.length === 0 || !(await hasShapeRecipes(tx))) return out;
    const recipes = schema.timeline_shape_recipes;
    const members = schema.timeline_shape_recipe_marchers;
    const inRecipes = await tx
        .selectDistinct({
            marcherId: members.marcher_id,
            timelineId: recipes.timeline_id,
        })
        .from(members)
        .innerJoin(recipes, eq(recipes.id, members.recipe_id))
        .where(
            and(
                inArray(
                    members.marcher_id,
                    ascending(rows.map((r) => r.row.marcher_id)),
                ),
                inArray(
                    recipes.timeline_id,
                    ascending(rows.map((r) => r.timelineId)),
                ),
                shapeRecipesOnly(),
            ),
        )
        .all();
    const recipeKeys = new Set(
        inRecipes.map((m) => `${m.marcherId}:${m.timelineId}`),
    );
    for (const r of rows)
        if (recipeKeys.has(`${r.row.marcher_id}:${r.timelineId}`))
            note(r, "shape");
    return out;
}

/** The counts of `range`'s ends that `leaving`'s rows cross, so the move is cut there. */
const cutBeats = (leaving: readonly MoveRow[], range: BeatRange): number[] =>
    [range.start, range.end].filter((beat) =>
        leaving.some((r) => r.row.start_beat < beat && beat < r.row.end_beat),
    );

/**
 * Plans the cuts at `beats` removing marchers from `move` over `range` takes (see the module
 * comment), noting them in `ranges`. Returns them with the piece left over the range.
 */
async function planCuts(
    ranges: PlannedRanges,
    move: MoveSpan,
    beats: readonly number[],
    range: BeatRange,
): Promise<{ cuts: PlannedCut[]; piece: MoveSpan }> {
    const cuts: PlannedCut[] = [];
    // The piece holding the range: the move, or a part of it from a cut at the range's start
    let piece = move;
    for (const beat of beats) {
        const cut = await ranges.cut(piece, beat);
        cuts.push({ timelineId: move.id, beat, idStaysWith: cut.idStaysWith });
        piece = beat === range.start ? cut.after : cut.before;
    }
    return { cuts, piece };
}

/**
 * **Preview** (changes nothing): what removing `marcherIds` from move `timelineId` over `range`
 * (`removeMarchersFromMoveForRangeInTransaction`), or with no `timelineId` from every move they
 * have there (`takeMarchersOutOfRangeInTransaction`), would do. With no `timelineId`, a marcher
 * that has to stay in any of those moves (a shape or follow-the-leader member, or one split by
 * marcher won't take out of a move that needs a cut) stays in all of them. Marchers with no row
 * there are ignored.
 */
export async function planRemovalFromRange({
    tx,
    marcherIds,
    range,
    timelineId = null,
}: {
    tx: DbTransaction;
    marcherIds: readonly number[];
    range: BeatRange;
    timelineId?: number | null;
}): Promise<RemovalPlan> {
    const rows = await rowsIn(tx, timelineId, { marcherIds, range });
    const stay = await membersThatStay(tx, rows);
    // A refusal to take some into a move of their own keeps them in every move, so plan again
    for (;;) {
        const moves: MoveRemovalPlan[] = [];
        const ranges = new PlannedRanges(tx);
        let refused = false;
        const leaving = rows.filter((r) => !stay.has(r.row.marcher_id));
        for (const id of ascending(leaving.map((r) => r.timelineId))) {
            const theirs = leaving.filter((r) => r.timelineId === id);
            const removed = ascending(theirs.map((r) => r.row.marcher_id));
            const plan = await planMove(tx, ranges, id, theirs, removed, range);
            if (!("reason" in plan)) {
                moves.push(plan);
                continue;
            }
            const why = plan;
            for (const marcherId of why.leaving)
                if (!stay.has(marcherId))
                    stay.set(marcherId, {
                        marcherId,
                        timelineId: id,
                        reason:
                            why.reason === "followTheLeader"
                                ? "followTheLeaderOrder"
                                : why.reason,
                    });
            refused = true;
        }
        if (refused) continue;
        return {
            removed: ascending(moves.flatMap((m) => m.removed)),
            skipped: [...stay.values()].sort(
                (a, b) => a.marcherId - b.marcherId,
            ),
            moves,
        };
    }
}

/**
 * Plans `removed` (their rows over the range, `theirs`) leaving move `id` over `range`, noting its
 * writes in `ranges`, or returns split by marcher's refusal when they'd have to be taken into a
 * move of their own and can't be. They are taken into one only when cutting the move would change
 * someone else's motion: a marcher who stays has a row on a path that isn't direct, whose curve a
 * cut restarts (`splitTimelineAtBeatInTransaction`), starting before the last cut. A direct path is cut
 * for everyone, which changes nobody's motion.
 */
async function planMove(
    tx: DbTransaction,
    ranges: PlannedRanges,
    id: number,
    theirs: readonly MoveRow[],
    removed: number[],
    range: BeatRange,
): Promise<MoveRemovalPlan | SplitRefusal> {
    const move = (await readTimeline(tx, id))!;
    const going = new Set(removed);
    const rows = await rowsIn(tx, id);
    const beats = cutBeats(theirs, range);
    const lastCut = Math.max(...beats);
    const intoOwnMove = rows.some(
        (r) =>
            !going.has(r.row.marcher_id) &&
            r.pathStyle !== "direct" &&
            r.row.start_beat < lastCut,
    );
    if (intoOwnMove) {
        const why = await splitRefusal(tx, id, removed, {
            storedShapesSwitched: true,
        });
        if (why) return why;
    }
    const counts = { start: move.start_beat, end: move.end_beat };
    const { cuts, piece } = await planCuts(
        ranges,
        intoOwnMove ? { id: ranges.add(counts), ...counts } : { id, ...counts },
        beats,
        range,
    );
    // The piece goes when nobody else is in it and nothing of theirs is left outside the range
    const overlaps = (r: MoveRow, span: BeatRange) =>
        r.row.start_beat < span.end && r.row.end_beat > span.start;
    if (
        rows
            .filter((r) => overlaps(r, piece))
            .filter((r) => !intoOwnMove || going.has(r.row.marcher_id))
            .every((r) => going.has(r.row.marcher_id) && overlaps(r, range))
    )
        ranges.set(piece.id, null);
    return {
        timelineId: id,
        removed,
        intoOwnMove,
        cuts: cuts.map((c) => ({ ...c, timelineId: id })),
    };
}

/** Carries out one move's part of a plan: its cuts, then the removal from the piece over `range`. */
async function removeFromMove(
    tx: DbTransaction,
    plan: MoveRemovalPlan,
    range: BeatRange,
): Promise<{ cuts: SplitTimelineResult[]; piece: RemovedFromPiece }> {
    const cuts: SplitTimelineResult[] = [];
    let pieceId = plan.timelineId;
    if (plan.intoOwnMove)
        pieceId = (
            await takeMarchersIntoOwnMoveInTransaction({
                tx,
                timelineId: plan.timelineId,
                marcherIds: plan.removed,
                // Planned already: every one of them goes
                plan: { removed: plan.removed, skipped: [], moves: [] },
            })
        ).timelineId!;
    for (const cut of plan.cuts) {
        const split = await splitTimelineAtBeatInTransaction({
            tx,
            timelineId: pieceId,
            beat: cut.beat,
            allowSharedRanges: true,
            idStaysWith: cut.idStaysWith,
        });
        cuts.push(split);
        // The range is after a cut at its start, and before one at its end
        pieceId = cut.beat === range.start ? split.after.id : split.before.id;
    }
    const removed = await rowsIn(tx, pieceId, {
        marcherIds: plan.removed,
        range,
    });
    await switchToIndividualPoints(tx, removed);
    await clearOwnPageMoves(
        tx,
        removed.map((r) => r.row),
        { tidyShared: true, dropUngrouped: plan.removed },
    );
    const deleted = !(await readTimeline(tx, pieceId));
    return {
        cuts,
        piece: { timelineId: plan.timelineId, pieceId, deleted },
    };
}

/** Carries out `plan` (`planRemovalFromRange`). */
async function carryOut(
    tx: DbTransaction,
    plan: RemovalPlan,
    range: BeatRange,
): Promise<RemoveFromRangeResult> {
    const result: RemoveFromRangeResult = {
        removed: plan.removed,
        skipped: plan.skipped,
        cuts: [],
        pieces: [],
    };
    for (const move of plan.moves) {
        const done = await removeFromMove(tx, move, range);
        result.cuts.push(...done.cuts);
        result.pieces.push(done.piece);
    }
    return result;
}

/**
 * **Remove marchers from a move for a range of counts**: each of `marcherIds` leaves move
 * `timelineId` over `range`, the move being cut at the range's ends where their rows cross them
 * (see the module comment). Shape and follow-the-leader members stay and are listed in `skipped`.
 * Marchers with no row in the move over the range are ignored.
 */
export async function removeMarchersFromMoveForRangeInTransaction({
    tx,
    timelineId,
    marcherIds,
    range,
}: {
    tx: DbTransaction;
    timelineId: number;
    marcherIds: readonly number[];
    range: BeatRange;
}): Promise<RemoveFromRangeResult> {
    const plan = await planRemovalFromRange({
        tx,
        marcherIds,
        range,
        timelineId,
    });
    return await carryOut(tx, plan, range);
}

/**
 * Takes `marcherIds` out of **every** move they have over `range`
 * (`removeMarchersFromMoveForRangeInTransaction` per move), so they have no row there and the
 * counts are Not set. Where others share a move whose path a cut would change, the marchers are
 * taken into a move of their own first and only that is cut (see the module comment). A marcher
 * that has to stay in any of those moves (a shape or follow-the-leader member, or one split by
 * marcher won't take into a move of its own) is left untouched everywhere and listed once in
 * `skipped`.
 */
export async function takeMarchersOutOfRangeInTransaction({
    tx,
    marcherIds,
    range,
}: {
    tx: DbTransaction;
    marcherIds: readonly number[];
    range: BeatRange;
}): Promise<RemoveFromRangeResult> {
    const plan = await planRemovalFromRange({ tx, marcherIds, range });
    return await carryOut(tx, plan, range);
}

/**
 * What `takeMarchersIntoOwnMoveInTransaction` did, marcher ids ascending. Remove keyframe's take
 * (`takePartOfGroupsApartInTransaction`) reads `timelineId` to tidy a move of their own that its
 * refused join leaves empty.
 */
export interface TakenIntoOwnMove {
    /** The marchers now in a move of their own */
    taken: number[];
    /** The marchers left in the move, one entry each */
    stayed: MoveMemberSkip[];
    /** Their move: the move itself when they were its whole membership, null when nobody went */
    timelineId: number | null;
}

/**
 * **Into a move of their own**: `marcherIds` leave move `timelineId` for a new move over the same
 * counts, with their rows, destinations and paths as they were, so nobody's motion changes (see
 * the module comment). Shape and follow-the-leader members stay and are listed in `stayed`, as
 * `planRemovalFromRange` plans them (a caller that already has that plan for the move's counts
 * passes it as `plan`); a transition into a stored shape that some leave is switched to individual
 * points first. When they are the move's whole membership it already is their own, and nothing is
 * written. Marchers with no row in the move are ignored. Split by marcher's refusal
 * (`splitRefusal`) throws (E-ARGS), so callers that can't have that check it first.
 */
export async function takeMarchersIntoOwnMoveInTransaction({
    tx,
    timelineId,
    marcherIds,
    plan,
}: {
    tx: DbTransaction;
    timelineId: number;
    marcherIds: readonly number[];
    plan?: RemovalPlan;
}): Promise<TakenIntoOwnMove> {
    const move = await readTimeline(tx, timelineId);
    const none = (stayed: MoveMemberSkip[]): TakenIntoOwnMove => ({
        taken: [],
        stayed,
        timelineId: null,
    });
    if (!move) return none([]);
    plan ??= await planRemovalFromRange({
        tx,
        marcherIds,
        range: { start: move.start_beat, end: move.end_beat },
        timelineId,
    });
    const taken = plan.removed;
    if (taken.length === 0) return none(plan.skipped);
    const rows = await rowsIn(tx, timelineId);
    const going = new Set(taken);
    if (rows.every((r) => going.has(r.row.marcher_id)))
        return { taken, stayed: plan.skipped, timelineId };
    // Only transitions shared with someone who stays are switched; a whole one keeps its shape
    const staying = new Set(
        rows
            .filter((r) => !going.has(r.row.marcher_id))
            .map((r) => r.row.transition_id),
    );
    await switchToIndividualPoints(
        tx,
        rows.filter(
            (r) =>
                going.has(r.row.marcher_id) && staying.has(r.row.transition_id),
        ),
    );
    const split = await splitMarchersIntoNewMoveInTransaction({
        tx,
        timelineId,
        marcherIds: taken,
    });
    return { taken, stayed: plan.skipped, timelineId: split.timeline.id };
}

const REASON_WORDS: Record<MoveMemberSkipReason, [string, string]> = {
    shape: ["is in a shape", "are in a shape"],
    followTheLeader: ["follows the leader", "follow the leader"],
    followTheLeaderOrder: [
        "shares a curved move with a follow-the-leader order",
        "share a curved move with a follow-the-leader order",
    ],
};

/**
 * The refusal naming `skipped` (`TimelineEditRefusedError("inShapeOrFollowTheLeader")`, its
 * `marcherIds` the skipped marchers), for the toast after a command that still did the rest, or
 * `null` when nobody was skipped. Its message is the English text; its parameters (`count`, and
 * per reason a count and the names) fill the translated `timeline.edit.inShapeOrFollowTheLeader`.
 */
export async function skippedRefusal(
    tx: DbTransaction,
    skipped: readonly MoveMemberSkip[],
): Promise<TimelineEditRefusedError | null> {
    if (skipped.length === 0) return null;
    const ids = ascending(skipped.map((s) => s.marcherId));
    const labels = await marcherLabels(tx, ids);
    const named = (reason: MoveMemberSkipReason) => {
        const names = skipped
            .filter((s) => s.reason === reason)
            .sort((a, b) => a.marcherId - b.marcherId)
            .map((s) => labels.get(s.marcherId) ?? `Marcher ${s.marcherId}`);
        const shown =
            names.length > 3
                ? [...names.slice(0, 3), `${names.length - 3} more`]
                : names;
        return { count: names.length, names: joinList(shown) };
    };
    const shape = named("shape");
    const leader = named("followTheLeader");
    const order = named("followTheLeaderOrder");
    const parts = (
        [
            ["shape", shape],
            ["followTheLeader", leader],
            ["followTheLeaderOrder", order],
        ] as const
    ).flatMap(([reason, { count, names }]) =>
        count === 0
            ? []
            : [`${names} ${REASON_WORDS[reason][count === 1 ? 0 : 1]}`],
    );
    const them = ids.length === 1 ? "it keeps its" : "they keep their";
    return new TimelineEditRefusedError("inShapeOrFollowTheLeader", {
        marcherIds: ids,
        message: `${parts.join(", and ")}, so ${them} move here.`,
        params: {
            count: ids.length,
            shapeCount: shape.count,
            shapeNames: shape.names,
            leaderCount: leader.count,
            leaderNames: leader.names,
            orderCount: order.count,
            orderNames: order.names,
        },
    });
}
