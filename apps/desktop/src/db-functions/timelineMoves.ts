import { and, eq, gte, inArray, lt } from "drizzle-orm";
import {
    createResolver,
    validateDestination,
    type TimelineSnapshot,
    type XY,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { shapeFromRow } from "@/timeline/timelineRows";
import { pageEndBeat } from "@/timeline/timelineCanvas";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { updateMarcherHomesInTransaction } from "./marcherHome";
import {
    setTimelineTransitionDestinationInTransaction,
    updateTimelineSlotDestinationInTransaction,
} from "./timelineTransitions";
import { assertValid, refuse, TimelineWriteError } from "./timelineErrors";

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
}

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

    const plans: { move: TimelineMarcherMove; row: (typeof rows)[number] }[] =
        [];
    for (const move of moves) {
        const row = winners.get(move.marcherId);
        if (!row || row.end !== endBeat || row.transitionEnd !== endBeat)
            refuse(
                `marcher ${await marcherLabel(tx, move.marcherId)} has no move that ends at the end of ${pageLabel(
                    page,
                )} (beat ${endBeat}), so there is no destination to change there`,
            );
        if (row.shapeId !== null && row.pathStyle === "follow_the_leader")
            throw new TimelineWriteError(
                "E-T5",
                `marcher ${await marcherLabel(tx, move.marcherId)} follows the leader into a shape on ${pageLabel(
                    page,
                )}; move the shape instead`,
            );
        plans.push({ move, row });
    }

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
    return result;
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
