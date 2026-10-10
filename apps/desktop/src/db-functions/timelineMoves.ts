import { and, eq, gt, gte, inArray, lt } from "drizzle-orm";
import {
    createResolver,
    validateDestination,
    type TimelineSnapshot,
    type XY,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables, shapeFromRow } from "@/timeline/timelineRows";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { updateMarcherHomesInTransaction } from "./marcherHome";
import {
    setTimelineTransitionDestinationInTransaction,
    updateTimelineSlotDestinationInTransaction,
} from "./timelineTransitions";
import { assertValid, refuse, TimelineWriteError } from "./timelineErrors";
import {
    addMarchersToTimelineInTransaction,
    removeAssignmentRowsInTransaction,
    removeMarchersFromTimelineInTransaction,
    type BeatRange,
} from "./timelineMembership";
import { deleteTimelinesInTransaction, timelinesWithRange } from "./timelines";
import { readPageGrid, type PageGrid } from "./timelineRipple";
import {
    beatWhere,
    moveInSentence,
    moveName,
} from "@/timeline/timelineRangeWords";
import { readMoveWords } from "./timelineMoveNames";
import { FIRST_PAGE_ID } from "./rowMappers";
import type { DatabaseTimelineAssignment } from "./timelineAssignments";
import {
    clearKeptMarkersInTransaction,
    keptAmong,
} from "./timelineKeptMarkers";

/**
 * "Move a marcher on page N" in timeline mode (docs/timeline/phases/07-page-parity.md P7.2, spec
 * D-16): every canvas drag, nudge, alignment and line tool ends here.
 *
 * - **Page 0** (the first page, `previousPageId === null`): marchers stand on their homes until
 *   their first move, so the move sets `marchers.home_x`/`home_y`.
 * - **Page N ≥ 1**: the marcher's position at N's end beat B (`pageEndBeat`) is the destination of
 *   the slot it arrives in at B. The move finds the assignment that wins the marcher's last span
 *   before B (R-2: the highest layer among its rows with `start < B ≤ end`), requires that both the
 *   assignment and its transition end at B, and sets that slot's destination. Because assignments
 *   are unique per (transition, slot), no other marcher moves with it.
 *
 * Decisions, recorded in the Phase 7 log:
 *
 * - **A shape-backed transition** is switched to individual destinations in the same edit, copying
 *   every slot's point from the shape's samples, and then the moved slots are updated (the Q-14
 *   workaround). The copies stop following later edits to the shape; the shape row itself is
 *   untouched. A follow-the-leader transition needs its shape (I-T5), so it is refused (`E-T5`).
 * - **No assignment ending at B** (the marcher holds through B, is in the middle of a longer move at
 *   B, or its move's transition doesn't end at B) is refused (`E-ARGS`) with a message naming the
 *   marcher by its drill number. Creating a transition or assignment for it is left to the timeline UI
 *   (P8.9).
 *
 * Every refusal is decided before the first write: the rows, shapes and shape samples are all read
 * and checked first, so a refused move writes nothing. A database rejection during the writes
 * (not expected once those checks pass) rolls back the whole edit.
 */

/** One marcher's new position on a page, in canvas pixels (the same space as `marcher_pages`). */
export interface TimelineMarcherMove {
    marcherId: number;
    x: number;
    y: number;
}

/** The parts of a `Page` this needs. */
export interface TimelineMovePage {
    readonly id?: number;
    readonly name?: string;
    readonly previousPageId: number | null;
    readonly beats: readonly { readonly index: number }[];
}

export interface TimelineMoveResult {
    /** Marchers whose home was set (page 0) */
    homes: number[];
    /** Slot destinations set, one per moved marcher on page N ≥ 1 */
    slots: { marcherId: number; transitionId: number; slotIndex: number }[];
    /** Shape-backed transitions switched to individual destinations first */
    convertedTransitionIds: number[];
    /** A range move that passed through or ran into other moves (`TimelinePassThrough`) */
    passThrough?: TimelinePassThrough;
    /**
     * A range move over a page's box: marchers whose own move there was deleted, because the edit
     * left them where the box starts (a drag back) or cleared it (set to previous page)
     */
    cleared?: number[];
}

/**
 * What a range move (UI-10 drag) did to the moved marchers' other moves
 * (research/ownership/10-cross-page-windows.md): the moves inside the range it overrides, the
 * moves it runs into partway, which catch up after it, and the page flags inside the range, which
 * they now pass through whether or not a stored move ended there (sparse rows, defined-coordinates
 * README). Only marchers it added are listed: one already in the range's timeline changes nothing
 * else.
 */
export interface TimelinePassThrough {
    /** The range moved over */
    range: BeatRange;
    /** The marchers whose other moves were passed through or run into, in marcher id order */
    marcherIds: number[];
    /** Their drill numbers ("T3"), in the same order */
    labels: string[];
    /** The distinct ranges of the moves overridden, by start */
    overridden: BeatRange[];
    /** The distinct ranges of the moves that now catch up, by start */
    caughtUp: BeatRange[];
    /** The page flags strictly inside the range, by beat */
    flags: number[];
    /** The timeline over the range, when this move created it */
    createdTimelineId?: number;
}

/** The distinct ranges among `moves`, by start then end. */
const distinctRanges = (moves: readonly BeatRange[]): BeatRange[] =>
    [
        ...new Map(
            moves.map(({ start, end }) => [`${start}:${end}`, { start, end }]),
        ).values(),
    ].sort((a, b) => a.start - b.start || a.end - b.end);

/**
 * How far apart (in canvas units, per axis) two positions may be and still count as the same, when
 * deciding that a write would move nobody (defined-coordinates README, Recommendation 2).
 */
export const SAME_POSITION_TOLERANCE = 1e-6;

export const samePosition = (a: XY, b: XY): boolean =>
    Math.abs(a[0] - b[0]) <= SAME_POSITION_TOLERANCE &&
    Math.abs(a[1] - b[1]) <= SAME_POSITION_TOLERANCE;

const pageLabel = (page: TimelineMovePage) =>
    page.name !== undefined ? `page ${page.name}` : "this page";

/**
 * The exact sample points of `shapeId` for `slotCount` slots (R-13), through the public resolver:
 * a throwaway show where marcher `i + 1` fills slot `i` of one direct transition. Arrivals are the
 * shape's own samples, bit for bit (spec R-13, P-7).
 */
const sampleShape = (
    shape: typeof schema.timeline_shapes.$inferSelect,
    slotCount: number,
): XY[] => {
    const ids = Array.from({ length: slotCount }, (_, i) => i + 1);
    const snapshot: TimelineSnapshot = {
        marchers: ids.map((id) => ({ id, home: [0, 0] })),
        shapes: { [shape.id]: shapeFromRow(shape) },
        transitions: {
            1: {
                id: 1,
                start: 0,
                end: 1,
                dest: shape.id,
                slots: slotCount,
                style: "direct",
                order: "slot",
                params: null,
            },
        },
        assignments: ids.map((id) => ({
            id,
            marcher: id,
            transition: 1,
            slot: id - 1,
            start: 0,
            end: 1,
            layer: 0,
        })),
    };
    const resolver = createResolver(snapshot);
    return ids.map((id) => resolver.positionAt(id, 1));
};

/**
 * How refusal messages name a marcher: its drill number (`drill_prefix` + `drill_order`), as the
 * rest of the UI shows it, or its id if the row can't be read.
 */
const marcherLabel = async (
    tx: DbTransaction,
    marcherId: number,
): Promise<string> => {
    const marcher = await tx
        .select({
            prefix: schema.marchers.drill_prefix,
            order: schema.marchers.drill_order,
        })
        .from(schema.marchers)
        .where(eq(schema.marchers.id, marcherId))
        .get();
    return marcher ? `${marcher.prefix}${marcher.order}` : `${marcherId}`;
};

/** Refuses a batch that names a marcher twice. */
const refuseDuplicateMarchers = (moves: readonly TimelineMarcherMove[]) => {
    const seen = new Set<number>();
    for (const { marcherId } of moves) {
        if (seen.has(marcherId))
            refuse(`marcher ${marcherId} appears more than once`);
        seen.add(marcherId);
    }
};

/**
 * Moves marchers on one page, as timeline writes (see the module comment). Run it inside
 * `transactionWithHistory`; `moveMarchersOnPage` does.
 */
// eslint-disable-next-line max-lines-per-function
export const moveMarchersOnPageInTransaction = async ({
    tx,
    page,
    moves,
}: {
    tx: DbTransaction;
    page: TimelineMovePage;
    moves: readonly TimelineMarcherMove[];
}): Promise<TimelineMoveResult> => {
    const result: TimelineMoveResult = {
        homes: [],
        slots: [],
        convertedTransitionIds: [],
    };
    if (moves.length === 0) return result;
    refuseDuplicateMarchers(moves);
    for (const m of moves)
        assertValid(validateDestination([m.x, m.y]), "position");

    if (page.previousPageId === null) {
        await updateMarcherHomesInTransaction({
            tx,
            modifiedHomes: moves.map((m) => ({
                marcherId: m.marcherId,
                home: [m.x, m.y],
            })),
        });
        result.homes = moves.map((m) => m.marcherId);
        return result;
    }

    if (page.beats.length === 0)
        refuse(`${pageLabel(page)} has no beats, so it has no end beat`);
    const endBeat = pageEndBeat(page);

    // Every row of the moved marchers that covers the last moment before the end beat
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const rows = await tx
        .select({
            assignmentId: a.id,
            marcherId: a.marcher_id,
            transitionId: a.transition_id,
            slotIndex: a.slot_index,
            end: a.end_beat,
            layer: a.layer,
            transitionEnd: t.end_beat,
            shapeId: t.dest_shape_id,
            pathStyle: t.path_style,
            slotCount: t.slot_count,
        })
        .from(a)
        .innerJoin(t, eq(a.transition_id, t.id))
        .where(
            and(
                inArray(
                    a.marcher_id,
                    moves.map((m) => m.marcherId),
                ),
                lt(a.start_beat, endBeat),
                gte(a.end_beat, endBeat),
            ),
        )
        .all();

    // R-2: the winner is the highest layer (E-A3 keeps layers distinct where rows overlap)
    const winners = new Map<number, (typeof rows)[number]>();
    for (const row of rows) {
        const best = winners.get(row.marcherId);
        if (!best || row.layer > best.layer) winners.set(row.marcherId, row);
    }

    const plans: SlotMovePlan[] = [];
    for (const move of moves) {
        const row = winners.get(move.marcherId);
        if (!row || row.end !== endBeat || row.transitionEnd !== endBeat)
            refuse(
                `marcher ${await marcherLabel(tx, move.marcherId)} has no move that ends at the end of ${pageLabel(
                    page,
                )}, so there is no destination to change there`,
            );
        plans.push({ move, row });
    }
    await writeSlotMoves({ tx, plans, where: pageLabel(page), result });
    return result;
};

/** A moved marcher and the slot it arrives in. */
interface SlotMovePlan {
    move: TimelineMarcherMove;
    row: {
        transitionId: number;
        slotIndex: number;
        shapeId: number | null;
        pathStyle: string;
        slotCount: number;
    };
}

/**
 * Sets each planned slot's destination. Refuses follow-the-leader into a shape (`E-T5`), and
 * switches a shape-backed transition to individual points first (Q-14), reading and sampling
 * every shape before the first write, so a refusal writes nothing. A kept spot whose ending moves
 * loses its kept marker (`keptAssignmentsMovedBy`).
 */
const writeSlotMoves = async ({
    tx,
    plans,
    where,
    result,
}: {
    tx: DbTransaction;
    plans: readonly SlotMovePlan[];
    /** Names the page or move in refusals; a function when naming it needs a read */
    where: string | (() => Promise<string>);
    result: TimelineMoveResult;
}): Promise<void> => {
    for (const { move, row } of plans)
        if (row.shapeId !== null && row.pathStyle === "follow_the_leader")
            throw new TimelineWriteError(
                "E-T5",
                `marcher ${await marcherLabel(tx, move.marcherId)} follows the leader into a shape on ${typeof where === "string" ? where : await where()}; move the shape instead`,
            );

    // Shape-backed transitions switch to individual points (Q-14), copying the shape's samples.
    // Read and sample every shape before the first write.
    const toConvert = new Map<number, XY[]>();
    for (const { row } of plans) {
        if (row.shapeId === null || toConvert.has(row.transitionId)) continue;
        const shape = await tx
            .select()
            .from(schema.timeline_shapes)
            .where(eq(schema.timeline_shapes.id, row.shapeId))
            .get();
        if (!shape) refuse(`shape ${row.shapeId} does not exist`);
        toConvert.set(row.transitionId, sampleShape(shape, row.slotCount));
    }

    const unkept = await keptAssignmentsMovedBy(tx, plans);

    // Writes
    for (const [transitionId, points] of toConvert) {
        await setTimelineTransitionDestinationInTransaction({
            tx,
            transitionId,
            destination: { kind: "individual", points },
        });
        result.convertedTransitionIds.push(transitionId);
    }

    for (const { move, row } of plans) {
        await updateTimelineSlotDestinationInTransaction({
            tx,
            transitionId: row.transitionId,
            slotIndex: row.slotIndex,
            point: [move.x, move.y],
        });
        result.slots.push({
            marcherId: move.marcherId,
            transitionId: row.transitionId,
            slotIndex: row.slotIndex,
        });
    }
    // An edited kept spot is the marcher's own move from now on (keep later pages, 2026-10-09)
    await clearKeptMarkersInTransaction(tx, unkept);
};

/**
 * The kept assignments (`timeline_kept_assignments`) whose slot `plans` move somewhere else: a
 * kept move whose ending is edited becomes an ordinary own move. A plan that leaves a kept spot
 * where it is (within `SAME_POSITION_TOLERANCE`) keeps it.
 */
const keptAssignmentsMovedBy = async (
    tx: DbTransaction,
    plans: readonly SlotMovePlan[],
): Promise<number[]> => {
    if (plans.length === 0) return [];
    const a = schema.timeline_assignments;
    const k = schema.timeline_kept_assignments;
    const d = schema.timeline_slot_destinations;
    const transitionIds = [...new Set(plans.map((p) => p.row.transitionId))];
    const kept = await tx
        .select({
            id: a.id,
            transitionId: a.transition_id,
            slotIndex: a.slot_index,
        })
        .from(a)
        .innerJoin(k, eq(k.assignment_id, a.id))
        .where(inArray(a.transition_id, transitionIds))
        .all();
    if (kept.length === 0) return [];
    const key = (transitionId: number, slotIndex: number) =>
        `${transitionId}:${slotIndex}`;
    const points = new Map(
        (
            await tx
                .select()
                .from(d)
                .where(
                    inArray(
                        d.transition_id,
                        kept.map((r) => r.transitionId),
                    ),
                )
                .all()
        ).map((r) => [key(r.transition_id, r.slot_index), [r.x, r.y] as XY]),
    );
    const planned = new Map(
        plans.map((p) => [key(p.row.transitionId, p.row.slotIndex), p.move]),
    );
    return kept
        .filter((r) => {
            const move = planned.get(key(r.transitionId, r.slotIndex));
            if (!move) return false;
            const stored = points.get(key(r.transitionId, r.slotIndex));
            return !stored || !samePosition(stored, [move.x, move.y]);
        })
        .map((r) => r.id);
};

/** `moveMarchersOnPageInTransaction` as one undoable edit. */
export const moveMarchersOnPage = async ({
    db,
    page,
    moves,
}: {
    db: DbConnection;
    page: TimelineMovePage;
    moves: readonly TimelineMarcherMove[];
}): Promise<TimelineMoveResult> => {
    // Nothing to move: don't open an edit (it would be an empty undo step)
    if (moves.length === 0)
        return { homes: [], slots: [], convertedTransitionIds: [] };
    return await transactionWithHistory(db, "moveMarchersOnPage", (tx) =>
        moveMarchersOnPageInTransaction({ tx, page, moves }),
    );
};

/**
 * What a canvas move edits (docs/timeline/ui.md UI-9, UI-10; P8.15, P8.17): the marchers' homes
 * (home, at beat 0), the endings of their transitions in one stored timeline, or the endings in
 * the timeline over an edit window `[start, end)`, which the move creates and joins as needed.
 */
export type TimelineEditTarget =
    | { readonly kind: "home" }
    | {
          readonly kind: "timeline";
          readonly timelineId: number;
          /**
           * An isolated timeline's edit: its members' endings in it, stolen members too (see
           * `moveMarchersInTimelineInTransaction`)
           */
          readonly ghosts?: boolean;
      }
    | { readonly kind: "range"; readonly start: number; readonly end: number };

/**
 * UI-9 Editing: sets the **ending** of each moved marcher's transition in timeline `timelineId`,
 * found by the timeline, not by an end beat. Its start is wherever the marcher is at the
 * timeline's start (R-4), so only the slot destination changes.
 *
 * Refused (`E-ARGS`), before any write, for a marcher that:
 * - has no assignment in the timeline (it isn't in it; the canvas dims it);
 * - has more than one (a converted or shape-cast show; UI-9 "More than one row", _lead default_):
 *   the inspector edits those;
 * - has one that doesn't end at the timeline's end, or that a higher layer steals at the end
 *   (R-2), since then its destination isn't where the marcher is drawn there.
 *
 * Shape-backed and follow-the-leader transitions are handled as in `moveMarchersOnPage`.
 *
 * With `ghosts`, the edit comes from an isolated timeline
 * (docs/timeline/research/ownership/09-isolation.md), which draws its members where its plan puts
 * them: a member another move has at the timeline's end is drawn at its planned destination, so
 * the higher-layer refusal is skipped and the edit sets that planned destination.
 */
// eslint-disable-next-line max-lines-per-function
export const moveMarchersInTimelineInTransaction = async ({
    tx,
    timelineId,
    moves,
    ghosts = false,
    skipUnchanged = false,
}: {
    tx: DbTransaction;
    timelineId: number;
    moves: readonly TimelineMarcherMove[];
    ghosts?: boolean;
    /** Write nothing for a marcher whose ending is already where it is moved (range moves) */
    skipUnchanged?: boolean;
}): Promise<TimelineMoveResult> => {
    const result: TimelineMoveResult = {
        homes: [],
        slots: [],
        convertedTransitionIds: [],
    };
    if (moves.length === 0) return result;
    refuseDuplicateMarchers(moves);
    for (const m of moves)
        assertValid(validateDestination([m.x, m.y]), "position");

    const timeline = await tx
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.id, timelineId))
        .get();
    if (!timeline) refuse(`timeline ${timelineId} does not exist`);
    const endBeat = timeline.end_beat;
    const marcherIds = moves.map((m) => m.marcherId);

    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const rows = await tx
        .select({
            marcherId: a.marcher_id,
            transitionId: a.transition_id,
            slotIndex: a.slot_index,
            end: a.end_beat,
            layer: a.layer,
            shapeId: t.dest_shape_id,
            pathStyle: t.path_style,
            slotCount: t.slot_count,
        })
        .from(a)
        .innerJoin(t, eq(a.transition_id, t.id))
        .where(
            and(
                inArray(a.marcher_id, marcherIds),
                eq(t.timeline_id, timelineId),
            ),
        )
        .all();
    const byMarcher = new Map<number, (typeof rows)[number][]>();
    for (const row of rows)
        byMarcher.set(row.marcherId, [
            ...(byMarcher.get(row.marcherId) ?? []),
            row,
        ]);

    // R-2: the highest layer among each marcher's rows covering the last moment before the end
    const covering = await tx
        .select({
            marcherId: a.marcher_id,
            layer: a.layer,
            start: a.start_beat,
            end: a.end_beat,
        })
        .from(a)
        .where(
            and(
                inArray(a.marcher_id, marcherIds),
                lt(a.start_beat, endBeat),
                gte(a.end_beat, endBeat),
            ),
        )
        .all();
    // The winning row at the end, per marcher, so a refusal can name the move in the way
    const top = new Map<number, (typeof covering)[number]>();
    for (const row of covering) {
        const best = top.get(row.marcherId);
        if (!best || row.layer > best.layer) top.set(row.marcherId, row);
    }

    // Read only when a refusal needs them
    let words: Awaited<ReturnType<typeof readMoveWords>> | undefined;
    const moveWords = async () => (words ??= await readMoveWords(tx));
    const at = async (beat: number) =>
        beatWhere(beat, (await moveWords()).boxes) ?? "home";
    const plans: SlotMovePlan[] = [];
    for (const move of moves) {
        const own = byMarcher.get(move.marcherId) ?? [];
        if (own.length === 0)
            refuse(
                `marcher ${await marcherLabel(tx, move.marcherId)} isn't in this timeline.`,
            );
        if (own.length > 1)
            refuse(
                `marcher ${await marcherLabel(tx, move.marcherId)} has more than one move in this timeline. Edit its moves in the inspector.`,
            );
        const row = own[0]!;
        if (row.end !== endBeat)
            refuse(
                `marcher ${await marcherLabel(tx, move.marcherId)} stops at ${await at(row.end)}, before this move ends (${await at(endBeat)}). Edit it in the inspector.`,
            );
        const winner = top.get(move.marcherId);
        if (!ghosts && winner && winner.layer > row.layer) {
            const { boxes, moves: stored } = await moveWords();
            const other = moveInSentence(
                { start: winner.start, end: winner.end },
                boxes,
                stored,
            );
            refuse(
                `marcher ${await marcherLabel(tx, move.marcherId)}'s position at ${await at(endBeat)} comes from ${other}, not this move. Put the start flag and playhead on that move's edges to edit it.`,
            );
        }
        plans.push({ move, row });
    }
    await writeSlotMoves({
        tx,
        plans: skipUnchanged ? await changedPlans(tx, plans) : plans,
        where: async () => {
            const { boxes, moves: stored } = await moveWords();
            return moveName(
                { start: timeline.start_beat, end: endBeat },
                boxes,
                stored,
            );
        },
        result,
    });
    return result;
};

/**
 * `plans` without the ones that would leave a shapeless slot where it is (within
 * `SAME_POSITION_TOLERANCE`), so an align or distribute that keeps a marcher still writes nothing
 * for it.
 */
const changedPlans = async (
    tx: DbTransaction,
    plans: readonly SlotMovePlan[],
): Promise<SlotMovePlan[]> => {
    const shapeless = plans.filter((p) => p.row.shapeId === null);
    if (shapeless.length === 0) return [...plans];
    const d = schema.timeline_slot_destinations;
    const points = await tx
        .select()
        .from(d)
        .where(
            inArray(d.transition_id, [
                ...new Set(shapeless.map((p) => p.row.transitionId)),
            ]),
        )
        .all();
    const pointOf = new Map(
        points.map((r) => [`${r.transition_id}:${r.slot_index}`, r]),
    );
    return plans.filter(({ move, row }) => {
        if (row.shapeId !== null) return true;
        const stored = pointOf.get(`${row.transitionId}:${row.slotIndex}`);
        return !stored || !samePosition([stored.x, stored.y], [move.x, move.y]);
    });
};

/**
 * Which of the timelines `timelineIds` each of `marcherIds` has an assignment in (the first, by
 * id, when a file from before C-12 holds two over one range).
 */
const timelineOfMarchers = async (
    tx: DbTransaction,
    timelineIds: readonly number[],
    marcherIds: readonly number[],
): Promise<Map<number, number>> => {
    const out = new Map<number, number>();
    if (timelineIds.length === 0) return out;
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const rows = await tx
        .selectDistinct({ marcherId: a.marcher_id, timelineId: t.timeline_id })
        .from(a)
        .innerJoin(t, eq(a.transition_id, t.id))
        .where(
            and(
                inArray(t.timeline_id, [...timelineIds]),
                inArray(a.marcher_id, [...marcherIds]),
            ),
        )
        .all();
    rows.sort((x, y) => x.timelineId - y.timelineId);
    for (const { marcherId, timelineId } of rows)
        if (!out.has(marcherId)) out.set(marcherId, timelineId);
    return out;
};

/** Whether `range` is exactly the box of a page after home in `grid`. */
export const isPageBox = (grid: PageGrid, range: BeatRange): boolean =>
    grid.pages.some(
        (p) =>
            p.id !== FIRST_PAGE_ID &&
            p.start === range.start &&
            p.end === range.end,
    );

/**
 * Each of `marcherIds`' **own move over the page box** `range`, where it has one: its one-slot
 * shapeless transition (C-11) in a timeline over exactly the box, assigned over the whole box, and
 * the marcher's only row over any of the box's beats. Deleting that row changes nothing before the
 * box, and leaves the marcher holding through the box where the box starts. Empty when `range`
 * isn't a page's box.
 */
export const ownPageMoves = async (
    tx: DbTransaction,
    grid: PageGrid,
    range: BeatRange,
    marcherIds: readonly number[],
): Promise<Map<number, DatabaseTimelineAssignment>> => {
    const out = new Map<number, DatabaseTimelineAssignment>();
    if (marcherIds.length === 0 || !isPageBox(grid, range)) return out;
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const l = schema.timelines;
    const rows = await tx
        .select({
            row: a,
            slotCount: t.slot_count,
            shapeId: t.dest_shape_id,
            transitionStart: t.start_beat,
            transitionEnd: t.end_beat,
            timelineStart: l.start_beat,
            timelineEnd: l.end_beat,
        })
        .from(a)
        .innerJoin(t, eq(t.id, a.transition_id))
        .innerJoin(l, eq(l.id, t.timeline_id))
        .where(
            and(
                inArray(a.marcher_id, [...marcherIds]),
                lt(a.start_beat, range.end),
                gt(a.end_beat, range.start),
            ),
        )
        .all();
    const byMarcher = new Map<number, (typeof rows)[number][]>();
    for (const r of rows)
        byMarcher.set(r.row.marcher_id, [
            ...(byMarcher.get(r.row.marcher_id) ?? []),
            r,
        ]);
    const exact = (s: number, e: number) =>
        s === range.start && e === range.end;
    for (const [marcherId, list] of byMarcher) {
        if (list.length !== 1) continue;
        const r = list[0]!;
        if (
            r.slotCount === 1 &&
            r.shapeId === null &&
            exact(r.row.start_beat, r.row.end_beat) &&
            exact(r.transitionStart, r.transitionEnd) &&
            exact(r.timelineStart, r.timelineEnd)
        )
            out.set(marcherId, r.row);
    }
    return out;
};

/**
 * Deletes `rows` (marchers' own page moves, `ownPageMoves`) with their kept markers and one-slot
 * transitions, and then each of their timelines that has no transition left, children first.
 */
export const clearOwnPageMoves = async (
    tx: DbTransaction,
    rows: readonly DatabaseTimelineAssignment[],
): Promise<void> => {
    if (rows.length === 0) return;
    // A kept spot's marker goes first (children first, as C-1)
    await clearKeptMarkersInTransaction(
        tx,
        rows.map((r) => r.id),
    );
    const t = schema.timeline_transitions;
    const timelineIds = (
        await tx
            .selectDistinct({ id: t.timeline_id })
            .from(t)
            .where(
                inArray(
                    t.id,
                    rows.map((r) => r.transition_id),
                ),
            )
            .all()
    ).map((r) => r.id);
    await removeAssignmentRowsInTransaction({
        tx,
        removed: rows,
        compact: false,
    });
    const left = new Set(
        (
            await tx
                .selectDistinct({ id: t.timeline_id })
                .from(t)
                .where(inArray(t.timeline_id, timelineIds))
                .all()
        ).map((r) => r.id),
    );
    await deleteTimelinesInTransaction({
        tx,
        timelineIds: new Set(timelineIds.filter((id) => !left.has(id))),
    });
};

/**
 * UI-10 Dragging adds: sets where each moved marcher arrives at `range.end`, leaving
 * `range.start`. Creates the timeline over `range` when none has it (one per range, C-12), adds
 * every moved marcher that isn't in it (`addMarchersToTimelineInTransaction`: its own one-slot
 * transition, one layer above its highest layer over the range), then sets their endings
 * (`moveMarchersInTimelineInTransaction`). Refusals are the add's and the move's, decided before
 * they write; inside one transaction, a refused move rolls back the add too.
 *
 * Only real moves are written (defined-coordinates README, Recommendation 2; positions compared
 * within `SAME_POSITION_TOLERANCE`):
 *
 * - **No-op:** a marcher moved to where it already is at `range.end` gets no row and no write, so
 *   an align or distribute that keeps a marcher still plants nothing there. When nobody moves, no
 *   timeline is created.
 * - **Drag back:** on a page's box, a marcher whose own move there (`ownPageMoves`) is moved back to
 *   where the box starts loses that move instead of keeping one that goes nowhere, so the page
 *   follows earlier pages again. Its timeline goes when that leaves it empty. A zero-motion ending
 *   in a shared transition, or in a window that isn't a page's box, is kept. So is a **kept** spot
 *   (`timeline_kept_assignments`): the drag writes its new ending instead, and like any edit that
 *   moves a kept spot's ending, makes it an ordinary own move (`writeSlotMoves`).
 * - **`clearOwn`** (set to previous page): every moved marcher's own move over the box is deleted
 *   the same way, whatever the move says; the others are moved as usual.
 *
 * The add passes through (research/ownership/10-cross-page-windows.md): the drag overrides the
 * moved marchers' moves inside the range, a move the range runs into partway catches up after it,
 * and every page flag inside the range is passed. The result's `passThrough` names them, so the
 * app can say so.
 */
// eslint-disable-next-line max-lines-per-function
export const moveMarchersInRangeInTransaction = async ({
    tx,
    range,
    moves,
    clearOwn = false,
}: {
    tx: DbTransaction;
    range: BeatRange;
    moves: readonly TimelineMarcherMove[];
    /** Delete the marchers' own moves over the page box `range` (set to previous page) */
    clearOwn?: boolean;
}): Promise<TimelineMoveResult> => {
    const result: TimelineMoveResult = {
        homes: [],
        slots: [],
        convertedTransitionIds: [],
    };
    if (moves.length === 0) return result;
    refuseDuplicateMarchers(moves);
    for (const m of moves)
        assertValid(validateDestination([m.x, m.y]), "position");
    const marcherIds = moves.map((m) => m.marcherId);
    // Membership by range, not by one timeline: a file from before C-12 may hold two over it
    const sameRange = (await timelinesWithRange(tx, range)).map((t) => t.id);
    const timelineOf = await timelineOfMarchers(tx, sameRange, marcherIds);
    const grid = await readPageGrid(tx);
    const own = await ownPageMoves(tx, grid, range, marcherIds);

    // Where the marchers are now, read once and only when needed, before anything is written
    let resolver: ReturnType<typeof createResolver> | undefined;
    const positionAt = async (marcherId: number, beat: number): Promise<XY> => {
        resolver ??= createResolver((await readTimelineTables(tx)).snapshot);
        return resolver.positionAt(marcherId, beat);
    };
    // A kept spot is the designer's: dragging it back never clears it (only `clearOwn` does)
    const keptOwn = await keptAmong(
        tx,
        [...own.values()].map((r) => r.id),
    );
    const toClear: DatabaseTimelineAssignment[] = [];
    const kept: TimelineMarcherMove[] = [];
    for (const move of moves) {
        const point: XY = [move.x, move.y];
        const ownMove = own.get(move.marcherId);
        if (ownMove) {
            const arrival = await positionAt(move.marcherId, range.end);
            const back =
                !samePosition(point, arrival) &&
                samePosition(
                    point,
                    await positionAt(move.marcherId, range.start),
                );
            if (clearOwn || (back && !keptOwn.has(ownMove.id)))
                toClear.push(ownMove);
            else kept.push(move);
            continue;
        }
        // In the range's timeline already: `skipUnchanged` below drops a move that changes nothing
        if (
            !timelineOf.has(move.marcherId) &&
            samePosition(point, await positionAt(move.marcherId, range.end))
        )
            continue;
        kept.push(move);
    }

    await clearOwnPageMoves(tx, toClear);
    if (toClear.length > 0)
        result.cleared = toClear.map((r) => r.marcher_id).sort((x, y) => x - y);

    const toAdd = kept
        .map((m) => m.marcherId)
        .filter((id) => !timelineOf.has(id));
    let passThrough: TimelinePassThrough | undefined;
    if (toAdd.length > 0) {
        const { timelineId, createdTimeline, overridden, caughtUp } =
            await addMarchersToTimelineInTransaction({
                tx,
                range,
                marcherIds: toAdd,
                passThrough: true,
            });
        for (const id of toAdd) timelineOf.set(id, timelineId);
        const flags = [
            ...new Set(
                grid.pages
                    .map((p) => p.end)
                    .filter((beat) => range.start < beat && beat < range.end),
            ),
        ].sort((x, y) => x - y);
        // Every added marcher passes the flags inside the range, stored moves or not
        const passed =
            flags.length > 0
                ? [...toAdd].sort((x, y) => x - y)
                : [
                      ...new Set(
                          [...overridden, ...caughtUp].map((m) => m.marcherId),
                      ),
                  ].sort((x, y) => x - y);
        if (passed.length > 0) {
            const labels: string[] = [];
            for (const id of passed) labels.push(await marcherLabel(tx, id));
            passThrough = {
                range: { start: range.start, end: range.end },
                marcherIds: passed,
                labels,
                overridden: distinctRanges(overridden),
                caughtUp: distinctRanges(caughtUp),
                flags,
                ...(createdTimeline ? { createdTimelineId: timelineId } : {}),
            };
        }
    }
    // One move per timeline the marchers are in (one, except in a file from before C-12)
    for (const timelineId of new Set(
        kept.map((m) => timelineOf.get(m.marcherId)!),
    )) {
        const part = await moveMarchersInTimelineInTransaction({
            tx,
            timelineId,
            moves: kept.filter(
                (m) => timelineOf.get(m.marcherId) === timelineId,
            ),
            skipUnchanged: true,
        });
        result.slots.push(...part.slots);
        result.convertedTransitionIds.push(...part.convertedTransitionIds);
    }
    if (passThrough) result.passThrough = passThrough;
    return result;
};

/**
 * **Keep Page N as a stop** (research/ownership/10-cross-page-windows.md §4.1, named "Only change
 * Page N" there, then "Start from Page N" by defined-coordinates 07c §2, and named for what it
 * restores by 08): the toast's way back from a drag that passed through pages. Takes `marcherIds` out of the timeline over `range` (the
 * drag's), deletes that timeline when the drag created it (`deleteIfEmpty`) and nobody is left in
 * it, then moves them over `[from, range.end)` instead, `from` being the last flag inside the
 * range. Each marcher keeps where it is at the range's end now, so later nudges in the window are
 * kept. One undoable edit, decided from the rows as they are now, so it is safe after other edits.
 *
 * Refused (E-ARGS) when `from` isn't strictly inside the range, or none of the marchers is in the
 * timeline over the range any more.
 */
export const moveMarchersFromFlagInstead = async ({
    db,
    range,
    from,
    marcherIds,
    deleteIfEmpty,
}: {
    db: DbConnection;
    range: BeatRange;
    from: number;
    marcherIds: readonly number[];
    /** The timeline over `range` that the drag created, deleted if this edit empties it */
    deleteIfEmpty?: number;
}): Promise<TimelineMoveResult> =>
    await transactionWithHistory(
        db,
        "moveMarchersFromFlagInstead",
        async (tx) => {
            if (!(range.start < from && from < range.end))
                refuse(
                    `beat ${from} isn't inside [${range.start}, ${range.end}), so there's nothing to narrow`,
                );
            const timelineIds = (await timelinesWithRange(tx, range)).map(
                (t) => t.id,
            );
            const timelineOf = await timelineOfMarchers(
                tx,
                timelineIds,
                marcherIds,
            );
            const kept = marcherIds.filter((id) => timelineOf.has(id));
            if (kept.length === 0)
                refuse(
                    "the marchers aren't in that move any more, so there's nothing to change",
                );
            // Where they are at the range's end now, before they leave the long move
            const { snapshot } = await readTimelineTables(tx);
            const resolver = createResolver(snapshot);
            const moves: TimelineMarcherMove[] = kept.map((marcherId) => {
                const [x, y] = resolver.positionAt(marcherId, range.end);
                return { marcherId, x, y };
            });
            const touched = new Set(kept.map((id) => timelineOf.get(id)!));
            for (const timelineId of touched)
                await removeMarchersFromTimelineInTransaction({
                    tx,
                    timelineId,
                    marcherIds: kept.filter(
                        (id) => timelineOf.get(id) === timelineId,
                    ),
                });
            // Only the timeline the drag created; one the user kept empty stays (UI-9 Remove)
            if (deleteIfEmpty !== undefined && touched.has(deleteIfEmpty)) {
                const left = await tx
                    .select({ id: schema.timeline_transitions.id })
                    .from(schema.timeline_transitions)
                    .where(
                        eq(
                            schema.timeline_transitions.timeline_id,
                            deleteIfEmpty,
                        ),
                    )
                    .limit(1)
                    .all();
                if (left.length === 0)
                    await deleteTimelinesInTransaction({
                        tx,
                        timelineIds: new Set([deleteIfEmpty]),
                    });
            }
            return await moveMarchersInRangeInTransaction({
                tx,
                range: { start: from, end: range.end },
                moves,
            });
        },
    );

/** Thrown inside an edit that turned out to write nothing, so it rolls back instead of failing. */
class NothingWritten extends Error {
    constructor(readonly result: TimelineMoveResult) {
        super("nothing to write");
    }
}

const wroteSomething = (r: TimelineMoveResult): boolean =>
    r.homes.length > 0 ||
    r.slots.length > 0 ||
    r.convertedTransitionIds.length > 0 ||
    (r.cleared?.length ?? 0) > 0;

/**
 * A canvas move as one undoable edit (UI-9 Editing, Home; UI-10): the homes for `{kind: "home"}`,
 * the endings in the timeline for `{kind: "timeline"}` (`moveMarchersInTimelineInTransaction`),
 * and the window's timeline, joined as needed, for `{kind: "range"}`
 * (`moveMarchersInRangeInTransaction`, which `clearOwn` is passed to). Nothing to move, or a range
 * move that moves nobody, opens no edit.
 */
export const moveMarchersInTarget = async ({
    db,
    target,
    moves,
    clearOwn = false,
    onStart,
}: {
    db: DbConnection;
    target: TimelineEditTarget;
    moves: readonly TimelineMarcherMove[];
    /** Range moves only: delete the marchers' own moves over the page box (set to previous page) */
    clearOwn?: boolean;
    /**
     * Called inside the edit before it writes, when every earlier write has reached the resolver,
     * so it can read the positions the edit starts from (**Move them too**)
     */
    onStart?: () => void;
}): Promise<TimelineMoveResult> => {
    if (moves.length === 0)
        return { homes: [], slots: [], convertedTransitionIds: [] };
    try {
        return await transactionWithHistory(db, "moveMarchers", async (tx) => {
            onStart?.();
            if (target.kind === "timeline")
                return await moveMarchersInTimelineInTransaction({
                    tx,
                    timelineId: target.timelineId,
                    moves,
                    ghosts: target.ghosts ?? false,
                });
            if (target.kind === "range") {
                const result = await moveMarchersInRangeInTransaction({
                    tx,
                    range: { start: target.start, end: target.end },
                    moves,
                    clearOwn,
                });
                // An edit that writes nothing can't be an undo step
                if (!wroteSomething(result)) throw new NothingWritten(result);
                return result;
            }
            refuseDuplicateMarchers(moves);
            for (const m of moves)
                assertValid(validateDestination([m.x, m.y]), "position");
            await updateMarcherHomesInTransaction({
                tx,
                modifiedHomes: moves.map((m) => ({
                    marcherId: m.marcherId,
                    home: [m.x, m.y],
                })),
            });
            return {
                homes: moves.map((m) => m.marcherId),
                slots: [],
                convertedTransitionIds: [],
            };
        });
    } catch (e) {
        if (e instanceof NothingWritten) return e.result;
        throw e;
    }
};

/** One marcher's later move that **Move them too** shifts: the slot it arrives in, and by how much. */
export interface SlotShift {
    marcherId: number;
    transitionId: number;
    slotIndex: number;
    dx: number;
    dy: number;
}

/** The transitions among `transitionIds` whose destination is a shape. */
export const shapeBackedTransitionIds = async ({
    db,
    transitionIds,
}: {
    db: DbConnection;
    transitionIds: readonly number[];
}): Promise<Set<number>> => {
    if (transitionIds.length === 0) return new Set();
    const t = schema.timeline_transitions;
    const rows = await db
        .select({ id: t.id, shapeId: t.dest_shape_id })
        .from(t)
        .where(inArray(t.id, [...new Set(transitionIds)]))
        .all();
    return new Set(rows.filter((r) => r.shapeId !== null).map((r) => r.id));
};

class NothingShifted extends Error {
    constructor() {
        super("nothing to shift");
    }
}

/**
 * **Move them too** (timeline mode, defined-coordinates 09): moves each slot's destination by its
 * offset, as one undoable edit. Shape-backed transitions are skipped (their slots have no point of
 * their own), as are slots that are gone. Later pages that hold from the moved destinations follow.
 *
 * @returns the shifts written (empty, with no edit, when none could be)
 */
export const shiftSlotDestinations = async ({
    db,
    shifts,
}: {
    db: DbConnection;
    shifts: readonly SlotShift[];
}): Promise<SlotShift[]> => {
    if (shifts.length === 0) return [];
    try {
        return await transactionWithHistory(
            db,
            "shiftSlotDestinations",
            async (tx) => {
                const t = schema.timeline_transitions;
                const d = schema.timeline_slot_destinations;
                const shapeless = new Set(
                    (
                        await tx
                            .select({ id: t.id, shapeId: t.dest_shape_id })
                            .from(t)
                            .where(
                                inArray(
                                    t.id,
                                    shifts.map((s) => s.transitionId),
                                ),
                            )
                            .all()
                    )
                        .filter((r) => r.shapeId === null)
                        .map((r) => r.id),
                );
                const written: SlotShift[] = [];
                for (const shift of shifts) {
                    if (!shapeless.has(shift.transitionId)) continue;
                    const point = await tx
                        .select({ x: d.x, y: d.y })
                        .from(d)
                        .where(
                            and(
                                eq(d.transition_id, shift.transitionId),
                                eq(d.slot_index, shift.slotIndex),
                            ),
                        )
                        .get();
                    if (!point) continue;
                    await updateTimelineSlotDestinationInTransaction({
                        tx,
                        transitionId: shift.transitionId,
                        slotIndex: shift.slotIndex,
                        point: [point.x + shift.dx, point.y + shift.dy],
                    });
                    written.push(shift);
                }
                // An edit that writes nothing can't be an undo step
                if (written.length === 0) throw new NothingShifted();
                // A moved kept spot is its marcher's own move from now on (as writeSlotMoves)
                const a = schema.timeline_assignments;
                const moved: number[] = [];
                for (const shift of written) {
                    const rows = await tx
                        .select({ id: a.id })
                        .from(a)
                        .where(
                            and(
                                eq(a.transition_id, shift.transitionId),
                                eq(a.slot_index, shift.slotIndex),
                            ),
                        )
                        .all();
                    moved.push(...rows.map((r) => r.id));
                }
                await clearKeptMarkersInTransaction(tx, moved);
                return written;
            },
        );
    } catch (e) {
        if (e instanceof NothingShifted) return [];
        throw e;
    }
};
