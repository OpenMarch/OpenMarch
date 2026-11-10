import { and, gt, inArray, lt } from "drizzle-orm";
import { createResolver, validateDestination, type XY } from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import { marcherSimpleOnBox, type BasicRow } from "@/timeline/basicSimple";
import { TimelineEditRefusedError } from "@/timeline/timelineEditRefusals";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { assertValid, refuse } from "./timelineErrors";
import { readBasicRows } from "./basicRows";
import {
    createOwnTransitionsInTransaction,
    type BeatRange,
} from "./timelineMembership";
import { createRangeTimelineInTransaction } from "./timelineMoveNames";
import { createTimelinesInTransaction, findTimelineByRange } from "./timelines";
import { readPageGrid } from "./timelineRipple";
import { updateTimelineSlotDestinationInTransaction } from "./timelineTransitions";
import { clearOwnPageMoves } from "./timelineMoveHelpers";
import { hasHeldMarksTable, readHeldMarks } from "./timelineHeldArrival";
import {
    isPageBox,
    marcherLabel,
    refuseDuplicateMarchers,
    samePosition,
    type TimelineMarcherMove,
    type TimelineMoveResult,
} from "./timelineMoves";

/**
 * Basic mode's writes (docs/timeline/research/basic-mode/README.md, "How Basic writes"): every
 * edit is "marcher m is at (x, y) at beat P" on the page box `[a, b)` holding P (`a < P ≤ b`).
 * Per marcher, with R its moves inside the box (simple: shapeless, direct, inside the
 * box, not overlapping; `marcherSimpleOnBox`):
 *
 * | Where P is                                    | What's written                                  |
 * | --------------------------------------------- | ----------------------------------------------- |
 * | On a move r's end (P = r.end, the flag too)   | r's destination is set                          |
 * | Inside a move r (r.start < P < r.end)         | `[r.start, P)` → (x, y), `[P, r.end)` → r's end  |
 * | In a hold `[g0, g1)` (after a move or `a`, up | `[g0, P)` → (x, y), and `[P, g1)` → the held     |
 * | to the next move's start or `b`), g0 < P < g1 | position, so the next point keeps its position  |
 * | At the hold's end (P = g1, on the flag or on  | `[g0, P)` → (x, y)                               |
 * | the next move's start)                        |                                                 |
 * | Nothing changes for the marcher               | nothing (UI-18)                                 |
 *
 * A Held hold bounds the hold `[g0, g1)` too (fork #475): one ending in the box before P moves g0
 * to its end, so the marcher **leaves early**, where its hold now ends (holds decision 6), and one
 * starting after P moves g1 to its start. (P inside a Held hold edits its arrival instead,
 * `splitHeldEditsInTransaction`.)
 *
 * **Drag back:** on a move's end, a position equal to where that move starts removes the point:
 * the move merges with the next move starting at P (`[r.start, next.end)` → next's destination),
 * or, with none (a hold or the flag follows), the move is deleted, as UI-18's "back onto the start
 * clears the move". A merged move arrives where the next move did.
 *
 * **A merge that goes nowhere** (drag back or **Remove this count's position**, arriving where the
 * first move starts) is deleted instead of written: a point set in a hold and then removed leaves
 * the hold as it was, with no move ending at the hold's end (no tick there), and a page it held
 * through follows earlier pages again; moves right after it that go nowhere either go with it,
 * since their only tick was its end. A point set inside a move writes both halves even when the
 * second goes nowhere: it is the user's point, with a tick that Remove takes out. **The sweep
 * stops at a Held hold** (holds 04-anchors; fork #473): a move a hold grows out of stays, and a
 * merge ending where a hold starts is written even though it goes nowhere, so the hold the
 * designer made keeps its arrival.
 *
 * Positions ("r's end", "the held position", "where r starts") are the resolver's, read once
 * from the rows the edit sees before anything is written, and only when an edit reads one. New
 * moves go on the layer of the move they replace or follow (0 when the marcher has none in the
 * box), never `stealLayer`: nothing in a simple box overlaps them. They get their own one-slot
 * `direct` transition (C-11) in the timeline over their range, reused when one is stored (C-12)
 * and created otherwise. A converted page's shared transition the edit leaves is compacted, one it
 * empties is deleted, and a timeline left with no transition is deleted (`clearOwnPageMoves` with
 * `tidyShared`), so Basic makes no vacant slot. (Compaction stops at a last slot that was already
 * vacant, and skips a transition sharing a marcher with an inheriting follow-the-leader one; their
 * vacancies stay.) The simple-defaults timeline's point half and Basic's Split page write here
 * too, so they tidy the same way.
 *
 * Refused before any write: a beat outside `(a, b]` or not whole, a box that isn't a page's box,
 * a marcher named twice, an invalid position (`E-ARGS` or the validator's code), and any listed
 * marcher that isn't simple on the box (`TimelineEditRefusedError("notSimple")`).
 */

type Box = BeatRange;

/** A new move: its own one-slot transition over `[start, end)` ending at `point`. */
interface NewMove {
    marcherId: number;
    start: number;
    end: number;
    point: XY;
    layer: number;
    /**
     * The move (not a page's, UI-25) this is a part of: it goes into a move of its own over its
     * range, never into the timeline a page box there stands for (`splitMovesAtBeatInTransaction`)
     */
    moveOf?: number;
}

/** What one edit writes, decided before the first write. */
interface PointPlan {
    /** Slot destinations to set, at each row's own slot */
    setDestinations: { row: BasicRow; point: XY }[];
    /** Rows deleted, with their transitions and any timeline they leave empty */
    removed: BasicRow[];
    added: NewMove[];
    /** Marchers whose moves were deleted and not replaced (a drag back, or `clearPage`) */
    cleared: number[];
}

const emptyPlan = (): PointPlan => ({
    setDestinations: [],
    removed: [],
    added: [],
    cleared: [],
});

/** What the plans read: each marcher's rows inside the box, and positions before the edit. */
interface BoxState {
    rowsOf: (marcherId: number) => BasicRow[];
    /** The resolver's, built on the first call (most edits read one; some read none) */
    positionAt: (marcherId: number, beat: number) => Promise<XY>;
    /** Each timeline's range, for the rows' timelines */
    timelineRange: Map<number, BeatRange>;
    /** Marchers that aren't simple on the box, when they weren't refused (`refuseLocked` off) */
    locked: Set<number>;
    /** Whether a Held mark of the marcher starts at the count */
    heldFrom: (marcherId: number, beat: number) => boolean;
    /** The marcher's Held marks */
    marksOf: (marcherId: number) => readonly { start: number; end: number }[];
}

const refuseBeat = (beat: number, box: Box, strict: boolean) => {
    if (
        !Number.isInteger(beat) ||
        !Number.isInteger(box.start) ||
        !Number.isInteger(box.end)
    )
        refuse(
            `a position needs whole beats, not beat ${beat} on [${box.start}, ${box.end})`,
        );
    if (!(box.start < beat && (strict ? beat < box.end : beat <= box.end)))
        refuse(
            `beat ${beat} isn't ${strict ? "strictly inside" : "in"} the page [${box.start}, ${box.end})`,
        );
};

/**
 * Reads what the plans need, refusing a box that isn't a page's and marchers that aren't simple
 * on it (`notSimple`, naming them). With `refuseLocked` off, those marchers are listed in
 * `locked` instead, for the caller to leave alone.
 */
const readBoxState = async (
    tx: DbTransaction,
    box: Box,
    marcherIds: readonly number[],
    { refuseLocked = true }: { refuseLocked?: boolean } = {},
): Promise<BoxState> => {
    if (!isPageBox(await readPageGrid(tx), box))
        refuse(`[${box.start}, ${box.end}) isn't a page's box`);
    const rows = await readBasicRows(tx, { marcherIds });
    const inBox = new Map<number, BasicRow[]>();
    for (const row of rows) {
        if (!(row.start < box.end && row.end > box.start)) continue;
        const list = inBox.get(row.marcherId);
        if (list) list.push(row);
        else inBox.set(row.marcherId, [row]);
    }
    const locked = [...new Set(marcherIds)]
        .filter((id) => !marcherSimpleOnBox(inBox.get(id) ?? [], box).simple)
        .sort((x, y) => x - y);
    if (refuseLocked && locked.length > 0) {
        const labels: string[] = [];
        for (const id of locked) labels.push(await marcherLabel(tx, id));
        const message =
            labels.length === 1
                ? `Marcher ${labels[0]} uses Expert moves on this page. Switch to Expert to edit it.`
                : `Marchers ${labels.join(", ")} use Expert moves on this page. Switch to Expert to edit them.`;
        throw new TimelineEditRefusedError("notSimple", {
            marcherIds: locked,
            message,
        });
    }
    const timelineIds = [
        ...new Set([...inBox.values()].flat().map((r) => r.timelineId)),
    ];
    const timelineRange = new Map<number, BeatRange>(
        timelineIds.length === 0
            ? []
            : (
                  await tx
                      .select()
                      .from(schema.timelines)
                      .where(inArray(schema.timelines.id, timelineIds))
                      .all()
              ).map((t) => [t.id, { start: t.start_beat, end: t.end_beat }]),
    );
    // The marchers' Held marks: Basic's sweep stops where one starts, and a point in a hold
    // starts its move where one ends (leaving early)
    const marks = (await hasHeldMarksTable(tx))
        ? await readHeldMarks(tx, [...new Set(marcherIds)])
        : [];
    const heldStarts = new Set(marks.map((m) => `${m.marcherId}:${m.start}`));
    // Where the marchers are now, from the rows this edit sees: read once and only when needed,
    // always before the plan writes anything
    let resolver: ReturnType<typeof createResolver> | undefined;
    return {
        rowsOf: (id) =>
            [...(inBox.get(id) ?? [])].sort((x, y) => x.start - y.start),
        positionAt: async (id, beat) => {
            resolver ??= createResolver(
                (await readTimelineTables(tx)).snapshot,
            );
            return resolver.positionAt(id, beat);
        },
        timelineRange,
        locked: new Set(locked),
        heldFrom: (id, beat) => heldStarts.has(`${id}:${beat}`),
        marksOf: (id) => marks.filter((m) => m.marcherId === id),
    };
};

/** A row spans its timeline, so its destination is the marcher's position at its end (C-11). */
const spansTimeline = (state: BoxState, row: BasicRow): boolean => {
    const range = state.timelineRange.get(row.timelineId);
    return (
        range !== undefined &&
        range.start === row.start &&
        range.end === row.end
    );
};

/** Sets `row`'s ending to `point`: its slot, or, for a row shorter than its timeline, a new move. */
const setEnding = (
    plan: PointPlan,
    state: BoxState,
    row: BasicRow,
    point: XY,
) => {
    if (spansTimeline(state, row)) {
        plan.setDestinations.push({ row, point });
        return;
    }
    plan.removed.push(row);
    plan.added.push({
        marcherId: row.marcherId,
        start: row.start,
        end: row.end,
        point,
        layer: row.layer,
    });
};

/**
 * Plans `first` and `second` (meeting at `first.end`) as one move arriving where `second` did, on
 * `first`'s layer.
 *
 * A merge that would go nowhere (arriving where `first` starts) is deleted instead, so the marcher
 * holds there as it did before the point was set, and the hold's end isn't left as a tick. Moves
 * right after it that go nowhere either are deleted with it: their start was that tick. Never a
 * move a Held hold grows out of: the sweep stops before it, and a merge ending where a hold starts
 * is written, going nowhere, so the hold keeps its arrival (fork #473).
 */
const planMerge = async (
    plan: PointPlan,
    state: BoxState,
    first: BasicRow,
    second: BasicRow,
): Promise<void> => {
    const { marcherId } = first;
    const point = await state.positionAt(marcherId, second.end);
    plan.removed.push(first, second);
    const from = await state.positionAt(marcherId, first.start);
    if (samePosition(point, from) && !state.heldFrom(marcherId, second.end)) {
        // Moves right after it that go nowhere either had their only tick at its end: they go
        // too, so the marcher holds until its next real move (or the flag), or a Held hold
        let end = second.end;
        // Sorted by start and not overlapping, so each next one starts where the last ended
        for (const next of state.rowsOf(marcherId)) {
            if (next.start < end) continue;
            if (
                next.start > end ||
                state.heldFrom(marcherId, next.end) ||
                !samePosition(await state.positionAt(marcherId, next.end), from)
            )
                break;
            plan.removed.push(next);
            end = next.end;
        }
        plan.cleared.push(marcherId);
        return;
    }
    plan.added.push({
        marcherId,
        start: first.start,
        end: second.end,
        point,
        layer: first.layer,
    });
};

/**
 * The hold `[g0, g1)` a point at `beat` is in: from the last move's end (or the page's start) to
 * the next move (or flag). A Held hold ending in it ends it there instead, so the move leaves
 * where the hold ends (leaving early, holds decision 6), and one starting in it stops the stay
 * where it starts. `layer` is the layer of the move before or after it.
 */
const holdAround = (
    rows: readonly BasicRow[],
    marks: readonly { start: number; end: number }[],
    box: Box,
    beat: number,
): { g0: number; g1: number; layer: number } => {
    const before = rows.filter((r) => r.end < beat);
    const previous = before[before.length - 1];
    const next = rows.find((r) => r.start >= beat);
    return {
        g0: Math.max(
            previous?.end ?? box.start,
            ...marks.filter((m) => m.end < beat).map((m) => m.end),
        ),
        g1: Math.min(
            next?.start ?? box.end,
            ...marks.filter((m) => m.start >= beat).map((m) => m.start),
        ),
        layer: previous?.layer ?? next?.layer ?? 0,
    };
};

/** Plans one marcher's position at `beat` (see the module comment). */
const planPoint = async (
    plan: PointPlan,
    state: BoxState,
    box: Box,
    beat: number,
    move: TimelineMarcherMove,
    clearPage: boolean,
    keepUnchanged: boolean,
): Promise<void> => {
    const { marcherId } = move;
    const rows = state.rowsOf(marcherId);
    const point: XY = [move.x, move.y];
    const at = (b: number) => state.positionAt(marcherId, b);

    // Set to previous page: the marcher's moves in the box go, so it holds from the page before
    if (clearPage && beat === box.end) {
        if (rows.length === 0) return;
        plan.removed.push(...rows);
        plan.cleared.push(marcherId);
        return;
    }
    const still = samePosition(point, await at(beat));
    if (still && !keepUnchanged) return;

    const inside = rows.find((r) => r.start < beat && beat < r.end);
    if (inside) {
        plan.removed.push(inside);
        plan.added.push(
            {
                marcherId,
                start: inside.start,
                end: beat,
                point,
                layer: inside.layer,
            },
            {
                marcherId,
                start: beat,
                end: inside.end,
                point: await at(inside.end),
                layer: inside.layer,
            },
        );
        return;
    }

    const ending = rows.find((r) => r.end === beat);
    // Kept still: its own ending here already sets it, a stay included, which the clear below
    // would take for a move back onto its start
    if (ending && still) return;
    if (ending) {
        // Back onto where the move starts: the point goes
        if (samePosition(point, await at(ending.start))) {
            const next = rows.find((r) => r.start === beat);
            if (next) {
                await planMerge(plan, state, ending, next);
                return;
            }
            plan.removed.push(ending);
            plan.cleared.push(marcherId);
            return;
        }
        setEnding(plan, state, ending, point);
        return;
    }

    const { g0, g1, layer } = holdAround(
        rows,
        state.marksOf(marcherId),
        box,
        beat,
    );
    plan.added.push({ marcherId, start: g0, end: beat, point, layer });
    if (beat < g1)
        plan.added.push({
            marcherId,
            start: beat,
            end: g1,
            point: await at(beat),
            layer,
        });
};

/**
 * Writes `plan`: slot destinations first, then the deleted rows (with their
 * one-slot transitions and emptied timelines, as `clearOwnPageMoves`), then the new moves, each
 * in the timeline over its range (one per range, C-12). Deleting before adding keeps every layer
 * free of overlaps at each statement (I-A3).
 */
const writePlan = async (
    tx: DbTransaction,
    plan: PointPlan,
): Promise<TimelineMoveResult> => {
    const result: TimelineMoveResult = {
        homes: [],
        slots: [],
        convertedTransitionIds: [],
    };
    for (const { row, point } of plan.setDestinations) {
        await updateTimelineSlotDestinationInTransaction({
            tx,
            transitionId: row.transitionId,
            slotIndex: row.slotIndex,
            point,
        });
        result.slots.push({
            marcherId: row.marcherId,
            transitionId: row.transitionId,
            slotIndex: row.slotIndex,
        });
    }
    if (plan.removed.length > 0) {
        const a = schema.timeline_assignments;
        const removed = await tx
            .select()
            .from(a)
            .where(
                inArray(
                    a.id,
                    plan.removed.map((r) => r.assignmentId),
                ),
            )
            .all();
        // Only marchers cleared off the page leave its Ungroup; a mid-page point only re-cuts
        await clearOwnPageMoves(tx, removed, {
            tidyShared: true,
            dropUngrouped: plan.cleared,
        });
    }

    // Parts of a move after the rest, so each range's oldest timeline is never one of them
    const byRange = new Map<string, NewMove[]>();
    for (const added of [
        ...plan.added.filter((a) => a.moveOf === undefined),
        ...plan.added.filter((a) => a.moveOf !== undefined),
    ]) {
        const key = `${added.start}:${added.end}:${added.moveOf ?? ""}`;
        byRange.set(key, [...(byRange.get(key) ?? []), added]);
    }
    for (const members of byRange.values()) {
        const { start, end, moveOf } = members[0]!;
        const timeline =
            moveOf === undefined
                ? ((await findTimelineByRange(tx, { start, end })) ??
                  (await createRangeTimelineInTransaction(tx, {
                      startBeat: start,
                      endBeat: end,
                  })))
                : await movePartTimeline(tx, { start, end });
        const own = await createOwnTransitionsInTransaction(
            tx,
            timeline,
            members,
        );
        for (const t of own)
            result.slots.push({
                marcherId: t.marcherId,
                transitionId: t.transitionId,
                slotIndex: 0,
            });
    }
    if (plan.cleared.length > 0)
        result.cleared = [...new Set(plan.cleared)].sort((x, y) => x - y);
    return result;
};

/**
 * A new move over `range` for part of a move (`NewMove.moveOf`). Its range keeps an older
 * timeline, empty if none is stored yet, so the move stays a move (a clip) and the page box there
 * stands for the older one (ADR 0012, UI-25 amendment).
 */
const movePartTimeline = async (tx: DbTransaction, range: BeatRange) => {
    if (!(await findTimelineByRange(tx, range)))
        await createTimelinesInTransaction({
            tx,
            newTimelines: [
                { name: null, startBeat: range.start, endBeat: range.end },
            ],
        });
    return await createRangeTimelineInTransaction(tx, {
        startBeat: range.start,
        endBeat: range.end,
        allowSharedRanges: true,
    });
};

/**
 * Basic's edit: each moved marcher is at its x/y at `beat` on the page box `box` (see the module
 * comment). Run it inside `transactionWithHistory`; `moveMarchersInTarget` does for
 * `{kind: "point"}`.
 *
 * With `clearPage` (set to previous page) and `beat` on the flag, each marcher's moves in the box
 * are deleted instead, whatever its x/y, so it holds from the page before. `clearPage` with `beat`
 * mid-page is ignored.
 */
export async function setPositionsAtBeatInTransaction({
    tx,
    beat,
    box,
    moves,
    clearPage = false,
    keepUnchanged = false,
}: {
    tx: DbTransaction;
    beat: number;
    box: { start: number; end: number };
    moves: readonly TimelineMarcherMove[];
    clearPage?: boolean;
    /**
     * Write a marcher left where it is too, as a stay, rather than nothing: a shape's members
     * are all set where it's edited, the one at the pivot included
     */
    keepUnchanged?: boolean;
}): Promise<TimelineMoveResult> {
    if (moves.length === 0)
        return { homes: [], slots: [], convertedTransitionIds: [] };
    refuseBeat(beat, box, false);
    refuseDuplicateMarchers(moves);
    for (const m of moves)
        assertValid(validateDestination([m.x, m.y]), "position");
    const state = await readBoxState(
        tx,
        box,
        moves.map((m) => m.marcherId),
    );
    const plan = emptyPlan();
    for (const move of moves)
        await planPoint(plan, state, box, beat, move, clearPage, keepUnchanged);
    return await writePlan(tx, plan);
}

/**
 * **Remove this count's position**: for each of `marcherIds` with a move ending at `beat` and
 * another starting there (a split), the two merge into one move from the first's start to the
 * second's end, arriving where the second did; a merge that goes nowhere is deleted instead and
 * the marcher listed in `cleared` (see the module comment). Marchers without a split at `beat`
 * are untouched.
 * `beat` must be strictly inside `box`; non-simple marchers are refused as by
 * `setPositionsAtBeatInTransaction`.
 */
export async function removePositionAtBeatInTransaction({
    tx,
    beat,
    box,
    marcherIds,
}: {
    tx: DbTransaction;
    beat: number;
    box: { start: number; end: number };
    marcherIds: readonly number[];
}): Promise<TimelineMoveResult> {
    if (marcherIds.length === 0)
        return { homes: [], slots: [], convertedTransitionIds: [] };
    refuseBeat(beat, box, true);
    const ids = [...new Set(marcherIds)];
    const state = await readBoxState(tx, box, ids);
    const plan = emptyPlan();
    for (const marcherId of ids) {
        const rows = state.rowsOf(marcherId);
        const first = rows.find((r) => r.end === beat);
        const second = rows.find((r) => r.start === beat);
        if (!first || !second) continue;
        await planMerge(plan, state, first, second);
    }
    return await writePlan(tx, plan);
}

/** Thrown inside an edit that turned out to write nothing, so it rolls back instead of failing. */
class NothingRemoved extends Error {
    constructor(readonly result: TimelineMoveResult) {
        super("nothing to remove");
    }
}

/**
 * `removePositionAtBeatInTransaction` as one undoable edit. When no marcher has a split at
 * `beat`, nothing is written and no undo step is made.
 */
export async function removePositionAtBeat({
    db,
    beat,
    box,
    marcherIds,
}: {
    db: DbConnection;
    beat: number;
    box: { start: number; end: number };
    marcherIds: readonly number[];
}): Promise<TimelineMoveResult> {
    if (marcherIds.length === 0)
        return { homes: [], slots: [], convertedTransitionIds: [] };
    try {
        return await transactionWithHistory(
            db,
            "removePositionAtBeat",
            async (tx) => {
                const result = await removePositionAtBeatInTransaction({
                    tx,
                    beat,
                    box,
                    marcherIds,
                });
                if (result.slots.length === 0 && !result.cleared)
                    throw new NothingRemoved(result);
                return result;
            },
        );
    } catch (e) {
        if (e instanceof NothingRemoved) return e.result;
        throw e;
    }
}

/** What `splitMovesAtBeatInTransaction` did. */
export interface SplitMovesResult {
    /** Marchers whose move was split at the beat, by id */
    split: number[];
    /** Marchers with a move across the beat that isn't simple on the box, left alone, by id */
    leftAlone: number[];
}

/**
 * Splits every marcher's move at `beat`, for a page flag added there in Basic (README, "Basic's
 * panel": **+** and **Split page**), so no move crosses the new flag. Run it inside the page
 * edit's transaction, before the page rows change: `box` is the page box holding `beat` now.
 *
 * For each marcher with a row r where `r.start < beat < r.end`, simple on `box`, r becomes
 * `[r.start, beat)` → the marcher's position at `beat` and `[beat, r.end)` → its position at
 * r.end (r's destination), both on r's layer. Positions are the resolver's, read once before
 * anything is written. A direct move is a straight line at a constant speed per beat (R-7), so
 * the two halves give the same position at every beat as r did. Marchers that aren't simple on the box (moves across its flags,
 * overlapping, shaped or not direct) are left alone and listed in `leftAlone`: they stay Expert
 * moves. Timelines are reused or created per range (C-12), and a timeline left empty is deleted,
 * as the point writer does. The halves of a move over the box that isn't the page's (split off
 * it, UI-25) stay moves: each goes into a new move over its half, which keeps an older timeline
 * (empty if need be) for the new box to stand for, so neither becomes a new page's own move. The
 * page edit then deletes the box's old page timeline if it was left empty across the new flag
 * (`deleteStrayEmptyTimelinesInTransaction`).
 *
 * Refused (`E-ARGS`) before any write: a beat that isn't whole or strictly inside `box`, and a
 * box that isn't a page's.
 */
export async function splitMovesAtBeatInTransaction({
    tx,
    beat,
    box,
}: {
    tx: DbTransaction;
    beat: number;
    box: { start: number; end: number };
}): Promise<SplitMovesResult> {
    refuseBeat(beat, box, true);
    if (!isPageBox(await readPageGrid(tx), box))
        refuse(`[${box.start}, ${box.end}) isn't a page's box`);
    const a = schema.timeline_assignments;
    const across = (
        await tx
            .selectDistinct({ id: a.marcher_id })
            .from(a)
            .where(and(lt(a.start_beat, beat), gt(a.end_beat, beat)))
            .all()
    )
        .map((r) => r.id)
        .sort((x, y) => x - y);
    if (across.length === 0) return { split: [], leftAlone: [] };
    const state = await readBoxState(tx, box, across, {
        refuseLocked: false,
    });
    // A move over the box that isn't the page's (split off it, UI-25) splits into two moves
    const page = await findTimelineByRange(tx, box);
    const moveOf = (timelineId: number) => {
        const range = state.timelineRange.get(timelineId);
        return range?.start === box.start &&
            range.end === box.end &&
            timelineId !== page?.id
            ? { moveOf: timelineId }
            : {};
    };
    const plan = emptyPlan();
    const split: number[] = [];
    for (const marcherId of across) {
        if (state.locked.has(marcherId)) continue;
        const row = state
            .rowsOf(marcherId)
            .find((r) => r.start < beat && beat < r.end);
        if (!row) continue;
        plan.removed.push(row);
        const part = moveOf(row.timelineId);
        plan.added.push(
            {
                marcherId,
                start: row.start,
                end: beat,
                point: await state.positionAt(marcherId, beat),
                layer: row.layer,
                ...part,
            },
            {
                marcherId,
                start: beat,
                end: row.end,
                point: await state.positionAt(marcherId, row.end),
                layer: row.layer,
                ...part,
            },
        );
        split.push(marcherId);
    }
    await writePlan(tx, plan);
    return { split, leftAlone: [...state.locked].sort((x, y) => x - y) };
}
