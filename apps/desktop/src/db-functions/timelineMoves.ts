import { and, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { createResolver, validateDestination, type XY } from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { ensureCountsInTransaction } from "./endlessCounts";
import { updateMarcherHomesInTransaction } from "./marcherHome";
import {
    setTimelineTransitionDestinationInTransaction,
    updateTimelineSlotDestinationInTransaction,
} from "./timelineTransitions";
import { assertValid, refuse, TimelineWriteError } from "./timelineErrors";
import {
    addMarchersToTimelineInTransaction,
    removeMarchersFromTimelineInTransaction,
    type BeatRange,
} from "./timelineMembership";
import { deleteTimelinesInTransaction, timelinesWithRange } from "./timelines";
import { readPageGrid, type PageGrid } from "./timelineRipple";
import { readBasicRows } from "./basicRows";
import { marcherSimpleOnBox } from "@/timeline/basicSimple";
import { TimelineEditRefusedError } from "@/timeline/timelineEditRefusals";
import {
    beatWhere,
    moveInSentence,
    moveName,
} from "@/timeline/timelineRangeWords";
import { readMoveWords } from "./timelineMoveNames";
import {
    text,
    type TimelineTextArg,
    timelineTextForLog,
} from "@/timeline/timelineText";
import { FIRST_PAGE_ID } from "./rowMappers";
import type { DatabaseTimelineAssignment } from "./timelineAssignments";
// A cycle (it imports helpers from here), safe because neither module uses the other at load time
import { setPositionsAtBeatInTransaction } from "./timelinePointMoves";
import {
    clearHeldMarksOverInTransaction,
    dropShapeHomeHoldsInTransaction,
    nameHeldConflict,
    splitHeldEditsInTransaction,
    trimHeldMarksUnderRowsInTransaction,
    type HeldConflict,
    type HeldArrivalEdit,
    type HeldEditSkip,
    type HeldHomeEdit,
} from "./timelineHeldMarks";
import {
    arrivalHoldsLostInTransaction,
    readHeldArrivalsBefore,
} from "./timelineHeldUpkeep";
import {
    rowsIn,
    skippedRefusal,
    takeMarchersOutOfRangeInTransaction,
} from "./timelineMoveCuts";
import { sampleShape } from "./timelineMoveHelpers";
import {
    keepNextPageInTransaction,
    readNextPageSpots,
} from "./timelineNextPageStays";

/** A move result that wrote nothing. */
const emptyMoveResult = (): TimelineMoveResult => ({
    homes: [],
    slots: [],
    convertedTransitionIds: [],
});

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
     * A range move over a page's box: marchers taken out of every move over it, so the page is
     * Not set for them, because the edit left them where the box starts (a drag back) or cleared
     * it (Clear this page)
     */
    cleared?: number[];
    /**
     * Clear this page on the first page of a Held hold that runs on, or on the page a Held hold
     * arrives from: the marchers whose hold on the later pages went too (its arrival went), and
     * those pages, for the toast
     */
    clearedLaterHolds?: HeldConflict;
    /**
     * Clear this page: the shape and follow-the-leader members it left in their move, named in
     * the refusal's message (`skippedRefusal`), for the toast after the rest was written
     */
    skipped?: TimelineEditRefusedError;
    /**
     * Clear Page N (`keepLaterPages`): the marchers given a move of their own over the next page,
     * so it stays where it was
     */
    keptLaterPages?: number[];
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
    page.name !== undefined
        ? text.t("timeline.where.page", { page: page.name })
        : text.t("timeline.where.thisPage");

/**
 * How refusal messages name a marcher: its drill number (`drill_prefix` + `drill_order`), as the
 * rest of the UI shows it, or its id if the row can't be read.
 */
export const marcherLabel = async (
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
export const refuseDuplicateMarchers = (
    moves: readonly TimelineMarcherMove[],
) => {
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
        refuse(
            `${timelineTextForLog(pageLabel(page))} has no beats, so it has no end beat`,
        );
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
                text.t("timeline.refusals.positions.noMoveEndsAtPage", {
                    marcher: await marcherLabel(tx, move.marcherId),
                    page: pageLabel(page),
                }),
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
 * every shape before the first write, so a refusal writes nothing.
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
    where: TimelineTextArg | (() => Promise<TimelineTextArg>);
    result: TimelineMoveResult;
}): Promise<void> => {
    for (const { move, row } of plans)
        if (row.shapeId !== null && row.pathStyle === "follow_the_leader")
            throw new TimelineWriteError(
                "E-T5",
                `marcher ${await marcherLabel(tx, move.marcherId)} follows the leader into a shape on ${timelineTextForLog(typeof where === "function" ? await where() : where)}; move the shape instead`,
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
    if (moves.length === 0) return emptyMoveResult();
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
    | {
          readonly kind: "range";
          readonly start: number;
          readonly end: number;
          /**
           * UI-25: the selected move over the window when several share its range, which the
           * marchers the edit adds join (`addMarchersToTimelineInTransaction`'s `into`)
           */
          readonly timelineId?: number;
      }
    /**
     * Basic mode (UI-19): the marchers' positions at `beat` on the page box `box` holding it
     * (`box.start < beat <= box.end`), splitting their moves there as needed
     * (`setPositionsAtBeatInTransaction`)
     */
    | {
          readonly kind: "point";
          readonly beat: number;
          readonly box: { readonly start: number; readonly end: number };
      };

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
        beatWhere(beat, (await moveWords()).boxes) ??
        text.t("timeline.where.home");
    const plans: SlotMovePlan[] = [];
    for (const move of moves) {
        const own = byMarcher.get(move.marcherId) ?? [];
        if (own.length === 0)
            refuse(
                text.t("timeline.refusals.positions.notInMove", {
                    marcher: await marcherLabel(tx, move.marcherId),
                }),
            );
        if (own.length > 1)
            refuse(
                text.t("timeline.refusals.positions.severalMoves", {
                    marcher: await marcherLabel(tx, move.marcherId),
                }),
            );
        const row = own[0]!;
        if (row.end !== endBeat)
            refuse(
                text.t("timeline.refusals.positions.stopsEarly", {
                    marcher: await marcherLabel(tx, move.marcherId),
                    stop: await at(row.end),
                    end: await at(endBeat),
                }),
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
                text.t("timeline.refusals.positions.fromOtherMove", {
                    marcher: await marcherLabel(tx, move.marcherId),
                    end: await at(endBeat),
                    move: other,
                }),
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
 * shapeless transition (C-11) in the page's own timeline (the oldest over exactly the box, UI-25),
 * assigned over the whole box, and
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
    // UI-25: only the page's own timeline (the oldest over the box); a move split off it keeps
    // the range but is a move of its own. A drag back or Clear this page takes the marchers out
    // of it too (`takeMarchersOutOfRangeInTransaction`), deleting it when that leaves it empty
    // (holds decision 16, owner 2026-10-30)
    const pageTimeline = (await timelinesWithRange(tx, range))[0];
    if (!pageTimeline) return out;
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
            timelineId: l.id,
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
            r.timelineId === pageTimeline.id &&
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
 * - **Drag back:** on a page's box, a marcher with a move over it that is moved back to where the
 *   box starts is taken out of every move over the box instead of keeping one that goes nowhere
 *   (holds decision 16, storage M6): its own page move is deleted, and a shared or longer move is
 *   cut in time at the box's flags and the marcher removed from that part, its slot compacted
 *   (`takeMarchersOutOfRangeInTransaction`). Where others share a move whose path a cut would
 *   change (one that isn't direct), the marcher is first taken into a move of its own and only
 *   that is cut, so the others keep their motion; where split by marcher refuses (an inheriting
 *   follow-the-leader order), it keeps its moves and is named. So the page is Not set and follows
 *   earlier pages again; a timeline left empty goes. A zero-motion ending in a window that isn't a
 *   page's box is kept. A shape's write (`keepUnchanged`) only deletes a marcher's own page move this way
 *   (`ownPageMoves`), so a shape placed where its members start stays in a shared move (#485).
 * - **`clearPage`** (Clear this page, which was Set to previous page): every moved marcher is
 *   taken out of every move over the box the same way, whatever the move says, and nothing else
 *   is written.
 *
 * In both, a shape or follow-the-leader member keeps its move, untouched, and is named in
 * `skipped` (the holds commands' rule, owner 2026-10-30).
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
    clearPage = false,
    into,
    keepUnchanged = false,
    alsoSkipped = [],
}: {
    tx: DbTransaction;
    range: BeatRange;
    moves: readonly TimelineMarcherMove[];
    /** Take the marchers out of every move over the page box `range` (Clear this page) */
    clearPage?: boolean;
    /**
     * Add a marcher left where it is to the range's move too, as a stay, rather than skip it: a
     * shape's members are all set where it's edited, the one at the pivot included
     */
    keepUnchanged?: boolean;
    /** The selected move over `range` that added marchers join (UI-25) */
    into?: number;
    /** Marchers the caller left alone, named in `skipped` with this edit's own */
    alsoSkipped?: readonly HeldEditSkip[];
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
    // A move past the show's end stores the counts it lands on first (endless counts)
    await ensureCountsInTransaction({ tx, through: range.end });
    const marcherIds = moves.map((m) => m.marcherId);
    // Membership by range, not by one timeline: a file from before C-12 may hold two over it
    const sameRange = (await timelinesWithRange(tx, range)).map((t) => t.id);
    const timelineOf = await timelineOfMarchers(tx, sameRange, marcherIds);
    const grid = await readPageGrid(tx);
    const box = isPageBox(grid, range);

    // Where the marchers are now, read once and only when needed, before anything is written
    let resolver: ReturnType<typeof createResolver> | undefined;
    const positionAt = async (marcherId: number, beat: number): Promise<XY> => {
        resolver ??= createResolver((await readTimelineTables(tx)).snapshot);
        return resolver.positionAt(marcherId, beat);
    };
    // Each marcher's rows over the box: one with any there may be taken out of them
    const overBox = new Set(
        box
            ? (await rowsIn(tx, null, { marcherIds, range })).map(
                  (r) => r.row.marcher_id,
              )
            : [],
    );
    // A shape's write sets every member where the shape is, so its recipe has a move holding
    // them: a drag back there only deletes a marcher's own page move, as before holds decision
    // 16, and never takes it out of a shared one (#485)
    const own = keepUnchanged
        ? await ownPageMoves(tx, grid, range, marcherIds)
        : null;
    const takeOut: TimelineMarcherMove[] = [];
    const toMove: TimelineMarcherMove[] = [];
    for (const move of moves) {
        const point: XY = [move.x, move.y];
        const hasRows = overBox.has(move.marcherId);
        if (box && clearPage) {
            // Clear this page: nothing over the box stays the marcher's own; Not set already
            // when it has nothing there
            if (hasRows) takeOut.push(move);
            continue;
        }
        if (
            (own ? own.has(move.marcherId) : hasRows) &&
            !samePosition(point, await positionAt(move.marcherId, range.end)) &&
            samePosition(point, await positionAt(move.marcherId, range.start))
        ) {
            takeOut.push(move);
            continue;
        }
        // In the range's timeline already: `skipUnchanged` below drops a move that changes nothing
        if (
            !keepUnchanged &&
            !timelineOf.has(move.marcherId) &&
            samePosition(point, await positionAt(move.marcherId, range.end))
        )
            continue;
        toMove.push(move);
    }

    // Holds decision 16: out of every move over the box, cut in time where it runs past the box
    const out = await takeMarchersOutOfRangeInTransaction({
        tx,
        marcherIds: takeOut.map((m) => m.marcherId),
        range,
    });
    if (out.removed.length > 0) result.cleared = out.removed;
    // Shape and follow-the-leader members keep their move, and the toast names them
    const skipped = await skippedRefusal(tx, [...alsoSkipped, ...out.skipped]);
    if (skipped) result.skipped = skipped;
    // A cut may have taken a timeline over the range out of `timelineOf`'s reach: read it again
    if (out.cuts.length > 0) {
        const fresh = await timelineOfMarchers(
            tx,
            (await timelinesWithRange(tx, range)).map((t) => t.id),
            marcherIds,
        );
        timelineOf.clear();
        for (const [id, t] of fresh) timelineOf.set(id, t);
    }

    const toAdd = toMove
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
                ...(into === undefined ? {} : { into }),
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
        toMove.map((m) => timelineOf.get(m.marcherId)!),
    )) {
        const part = await moveMarchersInTimelineInTransaction({
            tx,
            timelineId,
            moves: toMove.filter(
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
 * preserved. One undoable edit, decided from the rows as they are now, so it is safe after other edits.
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
                refuse(text.t("timeline.refusals.positions.leftMove"));
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

/**
 * Held marchers' edits (`splitHeldEditsInTransaction`): each sets its ending in the move that
 * arrives at its hold's start, as a drag at that count would, so the arrival and the whole hold
 * move together (holds decision 4). Adds what it wrote to `result`.
 *
 * With `basic`, the arrival must be one Basic edits: simple on the page box it ends (Basic's lock,
 * `marcherSimpleOnBox`), else the edit is refused (`notSimple`), naming the marchers. With
 * `keepUnchanged`, a marcher left where it is is still written (a shape's members).
 */
async function moveHeldArrivalsInTransaction(
    tx: DbTransaction,
    held: readonly HeldArrivalEdit<TimelineMarcherMove>[],
    result: TimelineMoveResult,
    { basic, keepUnchanged }: { basic: boolean; keepUnchanged: boolean },
): Promise<void> {
    if (held.length === 0) return;
    if (basic) await refuseLockedArrivals(tx, held);
    const byTimeline = new Map<number, TimelineMarcherMove[]>();
    for (const { move, timelineId } of held)
        byTimeline.set(timelineId, [
            ...(byTimeline.get(timelineId) ?? []),
            move,
        ]);
    for (const [timelineId, moves] of byTimeline) {
        const written = await moveMarchersInTimelineInTransaction({
            tx,
            timelineId,
            moves,
            skipUnchanged: !keepUnchanged,
        });
        result.slots.push(...written.slots);
        result.convertedTransitionIds.push(...written.convertedTransitionIds);
    }
}

/**
 * Held marchers' edits whose hold grows out of the starting spot (`HeldHomeEdit`, #619): each sets
 * the marcher's starting spot, as a drag at the start of the show would, so the whole hold moves
 * with it. Adds the marchers to `result.homes`.
 */
async function moveHeldHomesInTransaction(
    tx: DbTransaction,
    homes: readonly HeldHomeEdit<TimelineMarcherMove>[],
    result: TimelineMoveResult,
): Promise<void> {
    if (homes.length === 0) return;
    for (const { move } of homes)
        assertValid(validateDestination([move.x, move.y]), "position");
    await updateMarcherHomesInTransaction({
        tx,
        modifiedHomes: homes.map(({ move }) => ({
            marcherId: move.marcherId,
            home: [move.x, move.y],
        })),
    });
    result.homes.push(...homes.map(({ move }) => move.marcherId));
}

/**
 * Refuses (`notSimple`) a Basic edit of Held marchers whose arrival Basic can't edit: one not
 * simple on the page box it ends (a move across a flag, a shape's, or another path).
 */
async function refuseLockedArrivals(
    tx: DbTransaction,
    held: readonly HeldArrivalEdit<TimelineMarcherMove>[],
): Promise<void> {
    const grid = await readPageGrid(tx);
    const rows = await readBasicRows(tx, {
        marcherIds: held.map((h) => h.move.marcherId),
    });
    const locked: number[] = [];
    for (const { move, mark } of held) {
        // The page its arrival ends on, a mid-page end included
        const box = grid.pages.find(
            (p) =>
                p.id !== FIRST_PAGE_ID &&
                p.start < mark.start &&
                mark.start <= p.end,
        );
        const own = rows.filter((r) => r.marcherId === move.marcherId);
        if (box && !marcherSimpleOnBox(own, box).simple)
            locked.push(move.marcherId);
    }
    if (locked.length === 0) return;
    locked.sort((x, y) => x - y);
    const labels: string[] = [];
    for (const id of locked) labels.push(await marcherLabel(tx, id));
    throw new TimelineEditRefusedError("notSimple", {
        marcherIds: locked,
        message:
            labels.length === 1
                ? `Marcher ${labels[0]} is Held from an Expert move. Switch to Expert to edit it.`
                : `Marchers ${labels.join(", ")} are Held from Expert moves. Switch to Expert to edit them.`,
    });
}

/** The value occurring most often in `ids` (the smallest of a tie), or null when empty. */
const mostCommon = (ids: readonly number[]): number | null => {
    const counts = new Map<number, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    let best: number | null = null;
    for (const [id, n] of counts)
        if (
            best === null ||
            n > counts.get(best)! ||
            (n === counts.get(best)! && id < best)
        )
            best = id;
    return best;
};

const wroteSomething = (r: TimelineMoveResult): boolean =>
    r.homes.length > 0 ||
    r.slots.length > 0 ||
    r.convertedTransitionIds.length > 0 ||
    (r.cleared?.length ?? 0) > 0;

/** The move whose beat range is exactly `range`, if there is one */
async function timelineWithRange(
    tx: DbTransaction,
    range: { readonly start: number; readonly end: number },
): Promise<number | null> {
    const row = await tx
        .select({ id: schema.timelines.id })
        .from(schema.timelines)
        .where(
            and(
                eq(schema.timelines.start_beat, range.start),
                eq(schema.timelines.end_beat, range.end),
            ),
        )
        .get();
    return row?.id ?? null;
}

/**
 * The move, among those ending at `endBeat` (and starting at `startBeat` when given), that most
 * of `marcherIds` are in (the lowest id on a tie), or null for none: where an edit's positions
 * belong when several moves share its counts (UI-25)
 */
async function timelineHoldingMost(
    tx: DbTransaction,
    marcherIds: readonly number[],
    endBeat: number,
    startBeat?: number,
): Promise<number | null> {
    const t = schema.timelines;
    const tr = schema.timeline_transitions;
    const a = schema.timeline_assignments;
    const rows = await tx
        .selectDistinct({ timelineId: t.id, marcherId: a.marcher_id })
        .from(a)
        .innerJoin(tr, eq(tr.id, a.transition_id))
        .innerJoin(t, eq(t.id, tr.timeline_id))
        .where(
            and(
                inArray(a.marcher_id, [...new Set(marcherIds)]),
                eq(t.end_beat, endBeat),
                startBeat === undefined
                    ? undefined
                    : eq(t.start_beat, startBeat),
            ),
        )
        .all();
    const counts = new Map<number, number>();
    for (const r of rows)
        counts.set(r.timelineId, (counts.get(r.timelineId) ?? 0) + 1);
    let best: number | null = null;
    for (const [id, n] of counts)
        if (
            best === null ||
            n > counts.get(best)! ||
            (n === counts.get(best)! && id < best)
        )
            best = id;
    return best;
}

/** The move that ends at `beat`, if there is one (where a point edit's positions belong) */
async function timelineEndingAt(
    tx: DbTransaction,
    beat: number,
): Promise<number | null> {
    const row = await tx
        .select({ id: schema.timelines.id })
        .from(schema.timelines)
        .where(eq(schema.timelines.end_beat, beat))
        .get();
    return row?.id ?? null;
}

/**
 * A canvas move as one undoable edit (UI-9 Editing, Home; UI-10): the homes for `{kind: "home"}`,
 * the endings in the timeline for `{kind: "timeline"}` (`moveMarchersInTimelineInTransaction`),
 * the window's timeline, joined as needed, for `{kind: "range"}`
 * (`moveMarchersInRangeInTransaction`, which `clearPage` is passed to), and Basic's positions at a
 * beat for `{kind: "point"}` (`setPositionsAtBeatInTransaction`, `clearPage` too). Nothing to move,
 * or a range or point move that moves nobody, opens no edit.
 */
export const moveMarchersInTarget = async ({
    db,
    target,
    moves,
    clearPage = false,
    keepLaterPages = false,
    keepUnchanged = false,
    onStart,
    afterWrite,
}: {
    db: DbConnection;
    target: TimelineEditTarget;
    moves: readonly TimelineMarcherMove[];
    /**
     * Range and point moves only: delete the marchers' own moves over the page box (set to
     * previous page; a point move only when its beat is the box's flag)
     */
    clearPage?: boolean;
    /**
     * With `clearPage` (**Clear Page N**, #573): the next page keeps where it was, with a move of
     * its own for each marcher that would otherwise follow back (`keepNextPageInTransaction`), as
     * Remove keyframe does. Without it the later pages follow back (**…, Pages N–M follow back**).
     * A marcher whose later Held hold went with the page follows back either way (holds 17).
     */
    keepLaterPages?: boolean;
    /**
     * Range and point moves only: write a marcher left where it is as a stay in the move, not
     * nothing (a shape's members)
     */
    keepUnchanged?: boolean;
    /**
     * Called inside the edit before it writes, when every earlier write has reached the resolver,
     * so it can read the positions the edit starts from (**Move them too**)
     */
    onStart?: () => void;
    /**
     * Called inside the edit after the positions are written, with the move they belong to
     * (`null` for homes, and for a drag inside holds from the starting spots only), so app data about them (a shape recipe, ADR 0006) is part of the same
     * undo step. Not called for a range with no move to hold the positions. Resolving to `false`
     * says it wrote nothing, so an edit that changed no positions either is still no undo step.
     */
    afterWrite?: (
        tx: DbTransaction,
        timelineId: number | null,
    ) => Promise<void | boolean>;
}): Promise<TimelineMoveResult> => {
    if (moves.length === 0) return emptyMoveResult();
    try {
        return await transactionWithHistory(db, "moveMarchers", async (tx) => {
            onStart?.();
            // Clear this page names a later hold whose arrival it takes away
            const heldBefore =
                clearPage && target.kind !== "home"
                    ? await readHeldArrivalsBefore(tx)
                    : null;
            if (target.kind === "timeline") {
                const result = await moveMarchersInTimelineInTransaction({
                    tx,
                    timelineId: target.timelineId,
                    moves,
                    ghosts: target.ghosts ?? false,
                });
                await afterWrite?.(tx, target.timelineId);
                return result;
            }
            if (target.kind === "range" || target.kind === "point") {
                const pageBox = target.kind === "range" ? target : target.box;
                // Clear Page N keeps the next page: where everyone stands there before the clear
                const later =
                    clearPage && keepLaterPages
                        ? await readNextPageSpots(
                              tx,
                              pageBox.end,
                              moves.map((m) => m.marcherId),
                          )
                        : null;
                // A marcher Held at the edited count edits the move arriving at its hold
                // instead, so the whole hold moves (holds decision 4); one whose arrival is a
                // shape's or follow-the-leader move is skipped and named. An Expert window that
                // starts inside the hold wins instead (R2, #476): the window becomes a move
                const { held, homes, skipped, rest } = clearPage
                    ? { held: [], homes: [], skipped: [], rest: [...moves] }
                    : await splitHeldEditsInTransaction(
                          tx,
                          target.kind === "range" ? target.end : target.beat,
                          moves,
                          target.kind === "range"
                              ? { windowStart: target.start }
                              : {},
                      );
                const result =
                    rest.length === 0
                        ? emptyMoveResult()
                        : target.kind === "range"
                          ? await moveMarchersInRangeInTransaction({
                                tx,
                                range: { start: target.start, end: target.end },
                                moves: rest,
                                clearPage,
                                keepUnchanged,
                                alsoSkipped: skipped,
                                ...(target.timelineId === undefined
                                    ? {}
                                    : { into: target.timelineId }),
                            })
                          : await setPositionsAtBeatInTransaction({
                                tx,
                                beat: target.beat,
                                box: target.box,
                                moves: rest,
                                clearPage,
                                keepUnchanged,
                            });
                // The window's move ends a hold it starts inside at the start flag, and takes
                // away one whose start it covers (holds R2, 01-edit-rules E2; #476)
                if (target.kind === "range" && !clearPage)
                    await trimHeldMarksUnderRowsInTransaction(
                        tx,
                        rest.map((m) => m.marcherId),
                    );
                // The range writer names them with its own skips; otherwise they're named here
                if (
                    skipped.length > 0 &&
                    !(target.kind === "range" && rest.length > 0)
                ) {
                    const refusal = await skippedRefusal(tx, skipped);
                    if (refusal) result.skipped = refusal;
                }
                // Clear this page clears a Held hold too: the page becomes Not set (#472)
                if (clearPage) {
                    const clearedHolds = await clearHeldMarksOverInTransaction(
                        tx,
                        moves.map((m) => m.marcherId),
                        pageBox,
                    );
                    // A hold on a later page whose arrival the clear took away goes too (holds
                    // decision 17, at the step after the edit): named with the rest (#566 review)
                    const laterHolds = [
                        ...clearedHolds.later,
                        ...(heldBefore
                            ? await arrivalHoldsLostInTransaction(
                                  tx,
                                  heldBefore,
                              )
                            : []),
                    ];
                    if (clearedHolds.marchers.length > 0)
                        result.cleared = [
                            ...new Set([
                                ...(result.cleared ?? []),
                                ...clearedHolds.marchers,
                            ]),
                        ].sort((x, y) => x - y);
                    if (laterHolds.length > 0)
                        result.clearedLaterHolds = await nameHeldConflict(
                            tx,
                            laterHolds,
                        );
                    // Only the marchers taken out of the page: a skipped one still has its move
                    const kept = await keepNextPageInTransaction(
                        tx,
                        later,
                        new Set([
                            ...laterHolds.map((h) => h.marcherId),
                            ...moves
                                .map((m) => m.marcherId)
                                .filter((id) => !result.cleared?.includes(id)),
                        ]),
                        // A move left over from the cut that runs through the next page's
                        // flag is cut there too, so the page keeps its spot
                        { cutMovesAcross: true },
                    );
                    if (kept.length > 0) result.keptLaterPages = kept;
                }
                await moveHeldArrivalsInTransaction(tx, held, result, {
                    basic: target.kind === "point",
                    keepUnchanged,
                });
                await moveHeldHomesInTransaction(tx, homes, result);
                // The selected move, else the one the marchers are in, since a move split off
                // the page's shares its counts (UI-25). With only Held marchers, the move their
                // edit went to (the most of them arrive in), so app data about their positions (a
                // shape recipe) is saved with it; with only marchers Held from their starting
                // spots, the homes (`null`), where their edit went
                const marcherIds = rest.map((m) => m.marcherId);
                const onlyHomes =
                    marcherIds.length === 0 &&
                    held.length === 0 &&
                    homes.length > 0;
                const timelineId = !afterWrite
                    ? null
                    : marcherIds.length === 0
                      ? mostCommon(held.map((h) => h.timelineId))
                      : target.kind === "range"
                        ? (target.timelineId ??
                          (await timelineHoldingMost(
                              tx,
                              marcherIds,
                              target.end,
                              target.start,
                          )) ??
                          (await timelineWithRange(tx, target)))
                        : // Basic edits only moves over the page box (an Expert move is
                          // refused), so those first, should a file hold others
                          ((await timelineHoldingMost(
                              tx,
                              marcherIds,
                              target.beat,
                              target.box.start,
                          )) ??
                          (await timelineHoldingMost(
                              tx,
                              marcherIds,
                              target.beat,
                          )) ??
                          (await timelineEndingAt(tx, target.beat)));
                const wroteAppData =
                    afterWrite && (timelineId !== null || onlyHomes)
                        ? (await afterWrite(
                              tx,
                              onlyHomes ? null : timelineId,
                          )) !== false
                        : false;
                // A shape placed at the starting spots is those marchers' hold: their Held
                // holds from the starting spots go, in the same edit (owner, 2026-11-01)
                if (onlyHomes && wroteAppData)
                    await dropShapeHomeHoldsInTransaction(
                        tx,
                        homes.map((h) => h.move.marcherId),
                    );
                // An edit that writes nothing (and no app data beside it) can't be an undo step
                if (!wroteAppData && !wroteSomething(result))
                    throw new NothingWritten(result);
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
            const placed =
                afterWrite !== undefined &&
                (await afterWrite(tx, null)) !== false;
            // A shape placed at the starting spots is those marchers' hold, as when it's placed
            // through a hold (above): their Held holds from the starting spots go, in this edit
            if (placed)
                await dropShapeHomeHoldsInTransaction(
                    tx,
                    moves.map((m) => m.marcherId),
                );
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

/** Whether `shift`'s marcher still holds its slot (a compaction may have moved another in). */
const holdsSlot = async (tx: DbTransaction, shift: SlotShift) => {
    const a = schema.timeline_assignments;
    const row = await tx
        .select({ id: a.id })
        .from(a)
        .where(
            and(
                eq(a.transition_id, shift.transitionId),
                eq(a.slot_index, shift.slotIndex),
                eq(a.marcher_id, shift.marcherId),
            ),
        )
        .get();
    return row !== undefined;
};

class NothingShifted extends Error {
    constructor() {
        super("nothing to shift");
    }
}

/**
 * **Move them too** (timeline mode, defined-coordinates 09): moves each slot's destination by its
 * offset, as one undoable edit. Shape-backed transitions are skipped (their slots have no point of
 * their own), as are slots that are gone and slots no longer held by the shift's marcher (a shared
 * transition compacted since the shift was planned moves another marcher into it). Later pages that
 * hold from the moved destinations follow.
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
                    if (!(await holdsSlot(tx, shift))) continue;
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
                return written;
            },
        );
    } catch (e) {
        if (e instanceof NothingShifted) return [];
        throw e;
    }
};
