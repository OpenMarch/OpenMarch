import { and, eq, inArray } from "drizzle-orm";
import {
    createResolver,
    type AssignmentRow,
    type Resolver,
    type XY,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import {
    castDistance,
    castSlots,
    castsByNearestSlot,
    MAX_CAST_SLOTS,
    nearestSlots,
    transitionSlotPoints,
    type CastMarcher,
} from "@/timeline/timelineCasting";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { mapDbErrors, refuse, TimelineWriteError } from "./timelineErrors";
import {
    createTimelineAssignmentsInTransaction,
    type DatabaseTimelineAssignment,
} from "./timelineAssignments";
import { stealLayer } from "./timelineCommands";

/**
 * The inspector's assignment edits (docs/timeline/phases/08-authoring-ui.md P8.4): casting
 * marchers into a transition's slots, recasting them by nearest slot, moving one to another slot,
 * changing an assignment's layer or beats, and removing it. Each is one undoable edit.
 *
 * Casting reads where the marchers are from a resolver over the rows this edit's transaction sees,
 * not from the running resolver store, so it can't be planned from positions an earlier,
 * still-committing edit is about to change. Every refusal is decided before the first write.
 */

/** The largest layer a row may hold (spec I-N2). */
const MAX_LAYER = 1000;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const getAssignment = async (tx: DbTransaction, id: number) => {
    const row = await tx
        .select()
        .from(schema.timeline_assignments)
        .where(eq(schema.timeline_assignments.id, id))
        .get();
    if (!row) refuse(`assignment ${id} does not exist`);
    return row;
};

const getTransition = async (tx: DbTransaction, id: number) => {
    const row = await tx
        .select()
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.id, id))
        .get();
    if (!row) refuse(`transition ${id} does not exist`);
    return row;
};

/** Refuses a transition too big for the casting solve. */
const refuseTooManySlots = (slots: number) => {
    if (slots > MAX_CAST_SLOTS)
        refuse(
            `this transition has ${slots} slots; automatic casting handles up to ${MAX_CAST_SLOTS}. Assign its slots one at a time instead`,
        );
};

/** Deletes `rows` and inserts each again with its new slot, keeping its marcher, beats and layer. */
const reinsertWithSlots = async (
    tx: DbTransaction,
    rows: readonly DatabaseTimelineAssignment[],
    slotOf: (row: DatabaseTimelineAssignment) => number,
): Promise<DatabaseTimelineAssignment[]> => {
    // Deleting first frees the slots (UNIQUE (transition_id, slot_index)), and each insert is a
    // valid state on its own, so undo replays the edit backwards through valid states too.
    await mapDbErrors(() =>
        tx.delete(schema.timeline_assignments).where(
            inArray(
                schema.timeline_assignments.id,
                rows.map((r) => r.id),
            ),
        ),
    );
    return await createTimelineAssignmentsInTransaction({
        tx,
        newAssignments: rows.map((r) => ({
            marcherId: r.marcher_id,
            transitionId: r.transition_id,
            slotIndex: slotOf(r),
            startBeat: r.start_beat,
            endBeat: r.end_beat,
            layer: r.layer,
        })),
    });
};

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

/** A cast marcher whose new assignment steals beats from its moves in other transitions (R-2). */
export interface CastSteal {
    marcherId: number;
    /** The transitions it now overrides over some of the beats, in id order */
    transitionIds: number[];
}

export interface CastResult {
    assignments: DatabaseTimelineAssignment[];
    /** Only the marchers that steal something */
    steals: CastSteal[];
}

/**
 * Casts `marcherIds` into transition `transitionId` (D-4), each with an assignment over the whole
 * transition:
 *
 * - **Slots:** for direct and arc, each takes a vacant slot by nearest-slot casting from where it
 *   stands at the transition's start beat. For follow the leader, slots don't decide where
 *   founders go (R-9, R-12), so they take the lowest vacant slots, in id order.
 * - **Layer:** one above the highest layer the marcher already has over those beats, or 0 where it
 *   has none, so it steals them (R-2, decision UI-7 in ui.md) instead of colliding (E-A3). The
 *   result names the transitions each marcher steals from.
 *
 * Refused before anything is written (`E-ARGS`): no marchers, a marcher named twice, a missing
 * marcher or transition, a marcher already in the transition, too few vacant slots, or more than
 * `MAX_CAST_SLOTS` slots for nearest-slot casting.
 */
// eslint-disable-next-line max-lines-per-function
export const castMarchersIntoTransitionInTransaction = async ({
    tx,
    transitionId,
    marcherIds,
}: {
    tx: DbTransaction;
    transitionId: number;
    marcherIds: readonly number[];
}): Promise<CastResult> => {
    if (marcherIds.length === 0) refuse("select the marchers to cast");
    if (new Set(marcherIds).size !== marcherIds.length)
        refuse("a marcher appears more than once");
    const { snapshot } = await readTimelineTables(tx);
    const transition = snapshot.transitions[transitionId];
    if (!transition) refuse(`transition ${transitionId} does not exist`);
    const known = new Set(snapshot.marchers.map((m) => m.id));
    const missing = marcherIds.find((id) => !known.has(id));
    if (missing !== undefined) refuse(`marcher ${missing} does not exist`);
    const members = snapshot.assignments.filter(
        (a) => a.transition === transitionId,
    );
    const already = marcherIds.filter((id) =>
        members.some((a) => a.marcher === id),
    );
    if (already.length > 0)
        refuse(
            `${already.length === 1 ? "a selected marcher is" : "some selected marchers are"} already in this transition`,
        );
    const nearest = castsByNearestSlot(transition.style);
    if (nearest) refuseTooManySlots(transition.slots);
    const taken = new Set(members.map((a) => a.slot));
    const vacant: number[] = [];
    for (let slot = 0; slot < transition.slots; slot++)
        if (!taken.has(slot)) vacant.push(slot);
    if (vacant.length < marcherIds.length)
        refuse(
            `the transition has ${plural(vacant.length, "vacant slot")} for ${plural(marcherIds.length, "marcher")}. Raise its slot count first`,
        );

    const ids = [...marcherIds].sort((a, b) => a - b);
    let cast: Map<number, number>;
    if (nearest) {
        const resolver = createResolver(snapshot);
        const points = transitionSlotPoints(transition, snapshot.shapes);
        cast = castSlots(
            transition.style,
            ids.map((id) => ({
                id,
                xy: resolver.positionAt(id, transition.start),
            })),
            vacant.map((slot) => ({ slot, xy: points[slot]! })),
        );
    } else
        cast = castSlots(
            transition.style,
            ids.map((id) => ({ id, xy: null })),
            vacant.map((slot) => ({ slot, xy: [0, 0] })),
        );

    const newAssignments = [];
    const steals: CastSteal[] = [];
    for (const marcherId of ids) {
        const overlapping = snapshot.assignments.filter(
            (a) =>
                a.marcher === marcherId &&
                a.start < transition.end &&
                transition.start < a.end,
        );
        if (overlapping.length > 0)
            steals.push({
                marcherId,
                transitionIds: [
                    ...new Set(overlapping.map((a) => a.transition)),
                ].sort((a, b) => a - b),
            });
        newAssignments.push({
            marcherId,
            transitionId,
            slotIndex: cast.get(marcherId)!,
            startBeat: transition.start,
            endBeat: transition.end,
            layer: await stealLayer(
                tx,
                [marcherId],
                transition.start,
                transition.end,
                "so the marcher can't be cast over them",
            ),
        });
    }
    const assignments = await createTimelineAssignmentsInTransaction({
        tx,
        newAssignments,
    });
    return { assignments, steals };
};

/** `castMarchersIntoTransitionInTransaction` as one undoable edit. */
export const castMarchersIntoTransition = async ({
    db,
    transitionId,
    marcherIds,
}: {
    db: DbConnection;
    transitionId: number;
    marcherIds: readonly number[];
}): Promise<CastResult> =>
    await transactionWithHistory(db, "castMarchersIntoTransition", (tx) =>
        castMarchersIntoTransitionInTransaction({
            tx,
            transitionId,
            marcherIds,
        }),
    );

/**
 * Where marcher `marcherId` stands when assignment `assignmentId` first wins (R-2): the start of
 * its first winning span, which isn't the row's own start when a higher layer steals that
 * (a breakaway at the start). Null when the row never wins, so its slot costs nothing.
 */
const firstWinningPosition = (
    resolver: Resolver,
    marcherId: number,
    assignmentId: number,
): XY | null => {
    const span = resolver
        .spanInfos(marcherId)
        .find((s) => s.assignmentId === assignmentId);
    return span ? resolver.positionAt(marcherId, span.start) : null;
};

/**
 * Recasts transition `transitionId`'s marchers by nearest slot: each marcher's slot is chosen again
 * among all the slots, from where it stands when its assignment first wins (a row that never wins
 * can take any slot), so that the total distance is as small as it can be. Beats and layers don't
 * change. A marcher whose slot changes has its assignment deleted and inserted again with the new
 * slot, so that two marchers can trade slots without a moment where both hold one
 * (UNIQUE (transition_id, slot_index)).
 *
 * Refused before anything is written (`E-ARGS`): a missing transition, a follow-the-leader one
 * (its founders' targets come from trail order, not slots: R-9, R-12), no marchers in it, more
 * than `MAX_CAST_SLOTS` slots, or a cast that wouldn't shorten the total distance (so a tie never
 * reshuffles anybody).
 */
export const recastTransitionInTransaction = async ({
    tx,
    transitionId,
}: {
    tx: DbTransaction;
    transitionId: number;
}): Promise<DatabaseTimelineAssignment[]> => {
    const { snapshot } = await readTimelineTables(tx);
    const transition = snapshot.transitions[transitionId];
    if (!transition) refuse(`transition ${transitionId} does not exist`);
    if (!castsByNearestSlot(transition.style))
        refuse(
            "follow the leader places its marchers by their order on the trail, not by slot, so it can't be recast by nearest slot",
        );
    const members: AssignmentRow[] = snapshot.assignments
        .filter((a) => a.transition === transitionId)
        .sort((a, b) => a.marcher - b.marcher);
    if (members.length === 0) refuse("this transition has no marchers to cast");
    refuseTooManySlots(transition.slots);

    const resolver = createResolver(snapshot);
    const points = transitionSlotPoints(transition, snapshot.shapes);
    const marchers: CastMarcher[] = members.map((a) => ({
        id: a.marcher,
        xy: firstWinningPosition(resolver, a.marcher, a.id),
    }));
    const cast = nearestSlots(
        marchers,
        points.map((xy, slot) => ({ slot, xy })),
    );
    const current = new Map(members.map((a) => [a.marcher, a.slot]));
    // Compare with a tolerance, so rounding never reshuffles an equally good cast
    const before = castDistance(marchers, points, current);
    const after = castDistance(marchers, points, cast);
    if (after >= before - 1e-9 * Math.max(1, before))
        refuse("every marcher is already in its nearest slot");

    const changed = new Set(
        members.filter((a) => cast.get(a.marcher) !== a.slot).map((a) => a.id),
    );
    const rows = await tx
        .select()
        .from(schema.timeline_assignments)
        .where(inArray(schema.timeline_assignments.id, [...changed]))
        .all();
    return await reinsertWithSlots(tx, rows, (r) => cast.get(r.marcher_id)!);
};

/** `recastTransitionInTransaction` as one undoable edit. */
export const recastTransition = async ({
    db,
    transitionId,
}: {
    db: DbConnection;
    transitionId: number;
}): Promise<DatabaseTimelineAssignment[]> =>
    await transactionWithHistory(db, "recastTransition", (tx) =>
        recastTransitionInTransaction({ tx, transitionId }),
    );

// ---------------------------------------------------------------------------
// One assignment
// ---------------------------------------------------------------------------

/**
 * Moves assignment `assignmentId` to slot `slot` of its transition. A vacant slot is simply
 * taken; an occupied one is traded with its marcher (both rows are deleted and inserted again with
 * each other's slot).
 *
 * Refused before anything is written (`E-ARGS`): a missing assignment, a slot that isn't a whole
 * number from 0 to the slot count − 1, or the slot it already has.
 */
export const setAssignmentSlotInTransaction = async ({
    tx,
    assignmentId,
    slot,
}: {
    tx: DbTransaction;
    assignmentId: number;
    slot: number;
}): Promise<DatabaseTimelineAssignment[]> => {
    const row = await getAssignment(tx, assignmentId);
    const transition = await getTransition(tx, row.transition_id);
    if (!Number.isInteger(slot) || slot < 0 || slot >= transition.slot_count)
        throw new TimelineWriteError(
            "E-A2",
            `slot ${slot} doesn't exist; the transition has slots 0 to ${transition.slot_count - 1}`,
        );
    if (slot === row.slot_index)
        refuse(`the marcher is already in slot ${slot}`);
    const occupant = await tx
        .select()
        .from(schema.timeline_assignments)
        .where(
            and(
                eq(
                    schema.timeline_assignments.transition_id,
                    row.transition_id,
                ),
                eq(schema.timeline_assignments.slot_index, slot),
            ),
        )
        .get();
    if (!occupant)
        return [
            await mapDbErrors(() =>
                tx
                    .update(schema.timeline_assignments)
                    .set({ slot_index: slot })
                    .where(eq(schema.timeline_assignments.id, assignmentId))
                    .returning()
                    .get(),
            ),
        ];
    return await reinsertWithSlots(tx, [row, occupant], (r) =>
        r.id === row.id ? slot : row.slot_index,
    );
};

/** `setAssignmentSlotInTransaction` as one undoable edit. */
export const setAssignmentSlot = async ({
    db,
    assignmentId,
    slot,
}: {
    db: DbConnection;
    assignmentId: number;
    slot: number;
}): Promise<DatabaseTimelineAssignment[]> =>
    await transactionWithHistory(db, "setAssignmentSlot", (tx) =>
        setAssignmentSlotInTransaction({ tx, assignmentId, slot }),
    );

export interface AssignmentChange {
    /** A whole number from -1000 to 1000 (I-N2): higher layers steal from lower ones (R-2) */
    layer?: number;
    /** Whole beats inside the transition, with the end after the start (I-A1) */
    startBeat?: number;
    endBeat?: number;
}

/**
 * Changes an assignment's layer or beats. A layer or beats that would overlap the same marcher's
 * assignment at the same layer is refused by the database (`E-A3`); beats outside the transition
 * are refused before writing (`E-A1`), and so is a layer outside -1000 to 1000, beats that aren't
 * whole numbers with the end after the start, a missing assignment, or a change that changes
 * nothing (`E-ARGS`).
 */
export const updateAssignmentInTransaction = async ({
    tx,
    assignmentId,
    change,
}: {
    tx: DbTransaction;
    assignmentId: number;
    change: AssignmentChange;
}): Promise<DatabaseTimelineAssignment> => {
    const row = await getAssignment(tx, assignmentId);
    const layer = change.layer ?? row.layer;
    const start = change.startBeat ?? row.start_beat;
    const end = change.endBeat ?? row.end_beat;
    if (!Number.isInteger(layer) || Math.abs(layer) > MAX_LAYER)
        refuse(
            `a layer is a whole number from -${MAX_LAYER} to ${MAX_LAYER}, not ${layer}`,
        );
    if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start)
        refuse(
            `a move needs whole beats with its end after its start, not [${start}, ${end})`,
        );
    const transition = await getTransition(tx, row.transition_id);
    if (start < transition.start_beat || end > transition.end_beat)
        throw new TimelineWriteError(
            "E-A1",
            `the move [${start}, ${end}) must stay inside its transition [${transition.start_beat}, ${transition.end_beat})`,
        );
    if (layer === row.layer && start === row.start_beat && end === row.end_beat)
        refuse("that changes nothing");
    return await mapDbErrors(() =>
        tx
            .update(schema.timeline_assignments)
            .set({ layer, start_beat: start, end_beat: end })
            .where(eq(schema.timeline_assignments.id, assignmentId))
            .returning()
            .get(),
    );
};

/** `updateAssignmentInTransaction` as one undoable edit. */
export const updateAssignment = async ({
    db,
    assignmentId,
    change,
}: {
    db: DbConnection;
    assignmentId: number;
    change: AssignmentChange;
}): Promise<DatabaseTimelineAssignment> =>
    await transactionWithHistory(db, "updateAssignment", (tx) =>
        updateAssignmentInTransaction({ tx, assignmentId, change }),
    );

/**
 * Removes an assignment, leaving its slot vacant (D-13). Refused (`E-ARGS`) for a missing
 * assignment.
 */
export const removeAssignmentInTransaction = async ({
    tx,
    assignmentId,
}: {
    tx: DbTransaction;
    assignmentId: number;
}): Promise<DatabaseTimelineAssignment> => {
    const row = await getAssignment(tx, assignmentId);
    await mapDbErrors(() =>
        tx
            .delete(schema.timeline_assignments)
            .where(eq(schema.timeline_assignments.id, assignmentId)),
    );
    return row;
};

/** `removeAssignmentInTransaction` as one undoable edit. */
export const removeAssignment = async ({
    db,
    assignmentId,
}: {
    db: DbConnection;
    assignmentId: number;
}): Promise<DatabaseTimelineAssignment> =>
    await transactionWithHistory(db, "removeAssignment", (tx) =>
        removeAssignmentInTransaction({ tx, assignmentId }),
    );
