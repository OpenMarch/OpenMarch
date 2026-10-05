import { and, asc, eq, inArray } from "drizzle-orm";
import { createResolver, validateDestination, type XY } from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { mapDbErrors, refuse } from "./timelineErrors";
import {
    createTimelinesInTransaction,
    findTimelineByRange,
    type DatabaseTimeline,
} from "./timelines";
import {
    createTimelineTransitionsInTransaction,
    deleteTimelineTransitionRowsInTransaction,
} from "./timelineTransitionsInTransaction";
import {
    createTimelineAssignmentsInTransaction,
    type DatabaseTimelineAssignment,
} from "./timelineAssignments";
import { stealLayer } from "./timelineCommands";

export { findTimelineByRange };

/**
 * Who is in a timeline (docs/timeline/phases/08-authoring-ui.md P8.14; ui.md UI-9: Adding
 * marchers, Removing marchers, Layers, One timeline per range, One transition per marcher;
 * implementation-plan.md C-12).
 *
 * - **Add selected marchers** gives each marcher its own one-slot shapeless `direct` transition
 *   spanning the timeline (C-11), whose destination is where the marcher is at the timeline's
 *   end, so adding changes no motion on a linear path. The timeline is created the first time
 *   marchers are added to its range; at most one timeline has a given range.
 * - **Layers:** the new assignment goes one layer above the marcher's highest layer over the
 *   range, so it steals those beats (R-2) from the timelines that wholly contain it, and from a
 *   timeline it starts inside and runs past the end of (an exit). A range that runs into one of
 *   the marcher's timelines partway (a join) is refused (E-ARGS) until joins exist.
 * - **Remove** deletes the marcher's assignments in the timeline and the one-slot transitions they
 *   leave empty, but never the timeline: a timeline stays stored, and selectable, with nobody in
 *   it (an exception to P8.10's rule that a timeline goes with its last transition).
 *
 * Every refusal is decided before the first write, so a refused edit writes nothing.
 */

/** A half-open beat range `[start, end)`. */
export interface BeatRange {
    start: number;
    end: number;
}

/** The largest beat a row may hold (spec I-N2). */
const MAX_BEAT = 2147483647;

/** `outer` holds all of `inner` (equal ranges hold each other). */
export const containsRange = (outer: BeatRange, inner: BeatRange): boolean =>
    outer.start <= inner.start && inner.end <= outer.end;

/** The ranges share beats, but neither holds the other (UI-9 Layers). */
export const partlyOverlaps = (a: BeatRange, b: BeatRange): boolean =>
    a.start < b.end &&
    b.start < a.end &&
    !containsRange(a, b) &&
    !containsRange(b, a);

const rangeText = ({ start, end }: BeatRange) => `[${start}, ${end})`;

/** Each marcher's drill number ("T3"), for refusals. */
const marcherLabels = async (
    tx: DbTransaction,
    marcherIds: readonly number[],
): Promise<Map<number, string>> => {
    const rows = await tx
        .select({
            id: schema.marchers.id,
            prefix: schema.marchers.drill_prefix,
            order: schema.marchers.drill_order,
        })
        .from(schema.marchers)
        .where(inArray(schema.marchers.id, [...marcherIds]))
        .all();
    return new Map(rows.map((r) => [r.id, `${r.prefix}${r.order}`]));
};

/** The timelines each marcher has an assignment in, by marcher. */
const timelinesOfMarchers = async (
    tx: DbTransaction,
    marcherIds: readonly number[],
): Promise<Map<number, (BeatRange & { timelineId: number })[]>> => {
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const l = schema.timelines;
    const rows = await tx
        .selectDistinct({
            marcherId: a.marcher_id,
            timelineId: l.id,
            start: l.start_beat,
            end: l.end_beat,
        })
        .from(a)
        .innerJoin(t, eq(t.id, a.transition_id))
        .innerJoin(l, eq(l.id, t.timeline_id))
        .where(inArray(a.marcher_id, [...marcherIds]))
        .orderBy(asc(l.start_beat), asc(l.id))
        .all();
    const out = new Map<number, (BeatRange & { timelineId: number })[]>();
    for (const { marcherId, ...range } of rows) {
        const list = out.get(marcherId) ?? [];
        list.push(range);
        out.set(marcherId, list);
    }
    return out;
};

/** One marcher's own transition and assignment in a timeline. */
export interface OwnTransition {
    marcherId: number;
    timelineId: number;
    transitionId: number;
    assignmentId: number;
    layer: number;
}

/**
 * Gives each marcher its own one-slot shapeless `direct` transition spanning `timeline` (C-11),
 * ending at its `point`, and an assignment over the whole timeline at its `layer`. Everything
 * is validated by the caller; this only writes.
 */
export const createOwnTransitionsInTransaction = async (
    tx: DbTransaction,
    timeline: DatabaseTimeline,
    members: readonly { marcherId: number; point: XY; layer: number }[],
): Promise<OwnTransition[]> => {
    if (members.length === 0) return [];
    const transitions = await createTimelineTransitionsInTransaction({
        tx,
        newTransitions: members.map(({ point }) => ({
            timelineId: timeline.id,
            slotCount: 1,
            destination: { kind: "individual", points: [point] },
        })),
    });
    const assignments = await createTimelineAssignmentsInTransaction({
        tx,
        newAssignments: members.map(({ marcherId, layer }, i) => ({
            marcherId,
            transitionId: transitions[i]!.id,
            slotIndex: 0,
            startBeat: timeline.start_beat,
            endBeat: timeline.end_beat,
            layer,
        })),
    });
    return members.map(({ marcherId, layer }, i) => ({
        marcherId,
        timelineId: timeline.id,
        transitionId: transitions[i]!.id,
        assignmentId: assignments[i]!.id,
        layer,
    }));
};

// ---------------------------------------------------------------------------
// Add selected marchers
// ---------------------------------------------------------------------------

export interface AddMarchersToTimelineResult {
    timelineId: number;
    /** The timeline didn't exist and this edit created it */
    createdTimeline: boolean;
    /** The marchers added, each with its own transition, in marcher id order */
    added: OwnTransition[];
    /** Selected marchers that were already in the timeline and were left alone */
    alreadyIn: number[];
    /**
     * With `passThrough`: each added marcher's moves that lie inside the range, which the new
     * move overrides for all of their beats (their rows stay stored underneath)
     */
    overridden: PassedMove[];
    /**
     * With `passThrough`: each added marcher's move that the range runs into partway, which
     * resumes at the range's end and catches up to its own destination (R-5 rebase)
     */
    caughtUp: PassedMove[];
}

/** One marcher's move that an add over a range passes through or runs into. */
export interface PassedMove extends BeatRange {
    marcherId: number;
    timelineId: number;
}

/**
 * **Add selected marchers** (UI-9) to the timeline over `range`: creates that timeline when no
 * stored timeline has the range, then gives each marcher not already in it its own one-slot
 * shapeless `direct` transition spanning it. The destination is the marcher's position at the
 * range's end (from a resolver over the rows this edit sees), and the assignment goes one layer
 * above the marcher's highest layer over the range (0 where it has none), so it steals the beats
 * of the timelines that contain it (R-2).
 *
 * Refused before anything is written (E-ARGS): a range that isn't whole beats with its end after
 * its start, no marchers, a marcher named twice or missing, every marcher already in the
 * timeline, a marcher in a timeline that the range runs into partway (it starts before that
 * timeline and ends inside it; a range that starts inside a timeline and runs past its end is an
 * exit and is allowed), and a marcher in a
 * timeline that lies inside the range (adding it would steal that whole move, so the add would
 * change its motion). A marcher off the field at the range's end is refused too, and so is a
 * layer past the limit (E-A3).
 *
 * With `passThrough` (a canvas drag, UI-10; research/ownership/10-cross-page-windows.md) neither
 * layer refusal applies: the drag says where the marchers go, so the new move overrides the moves
 * inside the range (they stay stored, and come back when it is deleted), and a move the range runs
 * into partway resumes at the range's end and catches up (R-5). Both are reported.
 */
// eslint-disable-next-line max-lines-per-function
export const addMarchersToTimelineInTransaction = async ({
    tx,
    range,
    marcherIds,
    passThrough = false,
}: {
    tx: DbTransaction;
    range: BeatRange;
    marcherIds: readonly number[];
    passThrough?: boolean;
}): Promise<AddMarchersToTimelineResult> => {
    const { start, end } = range;
    if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end > MAX_BEAT ||
        end <= start
    )
        refuse(
            `a timeline needs whole beats with its end after its start, not ${rangeText(range)}`,
        );
    if (marcherIds.length === 0) refuse("select the marchers to add");
    if (new Set(marcherIds).size !== marcherIds.length)
        refuse("a marcher appears more than once");
    const ids = [...marcherIds].sort((x, y) => x - y);
    const labels = await marcherLabels(tx, ids);
    const missing = ids.find((id) => !labels.has(id));
    if (missing !== undefined) refuse(`marcher ${missing} does not exist`);

    const existing = await findTimelineByRange(tx, range);
    const timelinesOf = await timelinesOfMarchers(tx, ids);
    // In any timeline over exactly this range: a file from before C-12 may hold two, and a
    // marcher in the newer one is in this timeline too (one transition per marcher per range)
    const alreadyIn = ids.filter((id) =>
        (timelinesOf.get(id) ?? []).some(
            (t) => t.start === range.start && t.end === range.end,
        ),
    );
    const toAdd = ids.filter((id) => !alreadyIn.includes(id));
    if (toAdd.length === 0)
        refuse(
            alreadyIn.length === 1
                ? "the selected marcher is already in this timeline"
                : "every selected marcher is already in this timeline",
        );
    const overridden: PassedMove[] = [];
    const caughtUp: PassedMove[] = [];
    for (const id of toAdd) {
        for (const other of timelinesOf.get(id) ?? []) {
            const passed = {
                marcherId: id,
                timelineId: other.timelineId,
                start: other.start,
                end: other.end,
            };
            // Starting inside a move and running past its end is an exit (research/ownership
            // 06 §2 D): the new row steals the rest of it. Running into a later move partway
            // would need a join, which waits for live links (WP-O3): a drag lets it catch up
            // (10 §4.2), and the add on its own refuses it
            if (partlyOverlaps(other, range) && other.start >= range.start) {
                if (passThrough) {
                    caughtUp.push(passed);
                    continue;
                }
                refuse(
                    `${labels.get(id)} is in a timeline over beats ${rangeText(other)}, which only partly overlaps ${rangeText(range)}: joining a move partway isn't supported yet. End the range at beat ${other.start}.`,
                );
            }
            if (!containsRange(other, range) && containsRange(range, other)) {
                if (passThrough) {
                    overridden.push(passed);
                    continue;
                }
                refuse(
                    `${labels.get(id)} is in a timeline over beats ${rangeText(other)}, inside ${rangeText(range)}; adding it would replace that move`,
                );
            }
        }
    }

    // Plan every write first: destinations from the rows this edit sees, and layers
    const { snapshot } = await readTimelineTables(tx);
    const resolver = createResolver(snapshot);
    const members: { marcherId: number; point: XY; layer: number }[] = [];
    for (const marcherId of toAdd) {
        const [x, y] = resolver.positionAt(marcherId, end);
        const point: XY = [x, y];
        if (!validateDestination(point).ok)
            refuse(
                `${labels.get(marcherId)} is outside the field's bounds at beat ${end}`,
            );
        members.push({
            marcherId,
            point,
            layer: await stealLayer(
                tx,
                [marcherId],
                start,
                end,
                "so the marcher can't be added to this timeline",
            ),
        });
    }

    const timeline =
        existing ??
        (
            await createTimelinesInTransaction({
                tx,
                newTimelines: [{ startBeat: start, endBeat: end }],
            })
        )[0]!;
    const added = await createOwnTransitionsInTransaction(
        tx,
        timeline,
        members,
    );
    return {
        timelineId: timeline.id,
        createdTimeline: existing === undefined,
        added,
        alreadyIn,
        overridden,
        caughtUp,
    };
};

/** `addMarchersToTimelineInTransaction` as one undoable edit. */
export const addMarchersToTimeline = async ({
    db,
    range,
    marcherIds,
}: {
    db: DbConnection;
    range: BeatRange;
    marcherIds: readonly number[];
}): Promise<AddMarchersToTimelineResult> =>
    await transactionWithHistory(db, "addMarchersToTimeline", (tx) =>
        addMarchersToTimelineInTransaction({ tx, range, marcherIds }),
    );

// ---------------------------------------------------------------------------
// Removing assignments
// ---------------------------------------------------------------------------

/** What `removeAssignmentRowsInTransaction` did. */
export interface RemoveAssignmentsResult {
    /** The deleted assignments' ids */
    assignmentIds: number[];
    /** One-slot transitions left with nobody in them, deleted with their destination */
    deletedTransitionIds: number[];
    /** Transitions whose slot count shrank, with the old and new counts */
    compacted: { transitionId: number; from: number; to: number }[];
    /** Marchers moved into a vacated slot so the last slot could go */
    movedSlots: {
        transitionId: number;
        marcherId: number;
        from: number;
        to: number;
    }[];
    /** Slots left vacant (D-13), by transition */
    leftVacant: { transitionId: number; slotIndex: number }[];
}

/**
 * Deletes assignment rows and tidies the transitions they leave. Timelines are never deleted.
 *
 * - A one-slot transition left with nobody in it (a marcher's own transition, UI-9) is deleted,
 *   children first (C-1).
 * - With `compact`, a shapeless transition that lost a slot is compacted when that moves nobody
 *   (marcher delete, P7.3): a vacated last slot is removed, otherwise the marcher in the last slot
 *   moves into the vacated slot with its destination, and the last slot goes. Shape-backed
 *   transitions, a last slot that was already vacant, and transitions that share a marcher with an
 *   inheriting follow-the-leader transition (R-12 reads slot order) keep their vacancies.
 * - Otherwise the other slots are left vacant (D-13), as the inspector's remove did (P8.4).
 */
// eslint-disable-next-line max-lines-per-function
export const removeAssignmentRowsInTransaction = async ({
    tx,
    removed,
    compact,
}: {
    tx: DbTransaction;
    removed: readonly DatabaseTimelineAssignment[];
    compact: boolean;
}): Promise<RemoveAssignmentsResult> => {
    const result: RemoveAssignmentsResult = {
        assignmentIds: [],
        deletedTransitionIds: [],
        compacted: [],
        movedSlots: [],
        leftVacant: [],
    };
    if (removed.length === 0) return result;
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const d = schema.timeline_slot_destinations;

    const vacatedByTransition = new Map<number, Set<number>>();
    for (const row of removed) {
        const set = vacatedByTransition.get(row.transition_id) ?? new Set();
        set.add(row.slot_index);
        vacatedByTransition.set(row.transition_id, set);
    }

    // Marchers in an inheriting follow-the-leader transition, whose order R-12 may read from the
    // slot indexes of their previous transition. The set may include the removed marchers; that
    // is harmless, because it is only checked against the rows that remain.
    const ftlMarchers = new Set<number>();
    if (compact) {
        const ftlInherit = await tx
            .select({ id: t.id })
            .from(t)
            .where(
                and(
                    eq(t.path_style, "follow_the_leader"),
                    eq(t.order_mode, "inherit"),
                ),
            )
            .all();
        if (ftlInherit.length > 0) {
            const ftlRows = await tx
                .select({ marcher: a.marcher_id })
                .from(a)
                .where(
                    inArray(
                        a.transition_id,
                        ftlInherit.map((r) => r.id),
                    ),
                )
                .all();
            for (const r of ftlRows) ftlMarchers.add(r.marcher);
        }
    }

    await mapDbErrors(async () => {
        await tx.delete(a).where(
            inArray(
                a.id,
                removed.map((r) => r.id),
            ),
        );
    });
    result.assignmentIds = removed.map((r) => r.id);

    const emptied = new Set<number>();
    for (const [transitionId, vacated] of vacatedByTransition) {
        const tr = await tx
            .select()
            .from(t)
            .where(eq(t.id, transitionId))
            .get();
        const leaveAll = () => {
            for (const slotIndex of [...vacated].sort((x, y) => x - y))
                result.leftVacant.push({ transitionId, slotIndex });
        };
        if (!tr) continue;
        const remaining = await tx
            .select()
            .from(a)
            .where(eq(a.transition_id, transitionId))
            .all();
        if (tr.slot_count === 1 && remaining.length === 0) {
            emptied.add(transitionId);
            continue;
        }
        if (
            !compact ||
            tr.dest_shape_id !== null ||
            remaining.some((r) => ftlMarchers.has(r.marcher_id))
        ) {
            leaveAll();
            continue;
        }
        const occupantOf = new Map(remaining.map((r) => [r.slot_index, r]));

        let n = tr.slot_count;
        const open = new Set(vacated);
        await mapDbErrors(async () => {
            while (open.size > 0 && n > 1) {
                const top = n - 1;
                if (open.has(top)) {
                    await tx
                        .delete(d)
                        .where(
                            and(
                                eq(d.transition_id, transitionId),
                                eq(d.slot_index, top),
                            ),
                        );
                    open.delete(top);
                    n--;
                    continue;
                }
                const occupant = occupantOf.get(top);
                // The last slot is a vacancy this edit didn't make: leave it, and the rest
                if (!occupant) break;
                const to = Math.min(...open);
                const point = await tx
                    .select()
                    .from(d)
                    .where(
                        and(
                            eq(d.transition_id, transitionId),
                            eq(d.slot_index, top),
                        ),
                    )
                    .get();
                // Every slot of a shapeless transition has a point (I-T6), so this only happens
                // in a file that already breaks I-T6; the commit check rejects the edit then
                if (!point) break;
                await tx
                    .update(d)
                    .set({ x: point.x, y: point.y })
                    .where(
                        and(
                            eq(d.transition_id, transitionId),
                            eq(d.slot_index, to),
                        ),
                    );
                await tx
                    .update(a)
                    .set({ slot_index: to })
                    .where(eq(a.id, occupant.id));
                await tx.delete(d).where(eq(d.id, point.id));
                occupantOf.delete(top);
                occupantOf.set(to, { ...occupant, slot_index: to });
                result.movedSlots.push({
                    transitionId,
                    marcherId: occupant.marcher_id,
                    from: top,
                    to,
                });
                open.delete(to);
                n--;
            }
            if (n !== tr.slot_count) {
                await tx
                    .update(t)
                    .set({ slot_count: n })
                    .where(eq(t.id, transitionId));
                result.compacted.push({
                    transitionId,
                    from: tr.slot_count,
                    to: n,
                });
            }
        });
        for (const slotIndex of [...open].sort((x, y) => x - y))
            result.leftVacant.push({ transitionId, slotIndex });
    }

    // The emptied one-slot transitions go, and their timelines stay (UI-9 Removing marchers)
    const deleted = await deleteTimelineTransitionRowsInTransaction({
        transitionIds: emptied,
        tx,
    });
    result.deletedTransitionIds = deleted
        .map((r) => r.id)
        .sort((x, y) => x - y);
    return result;
};

/** The assignments of `marcherIds` in the transitions of timeline `timelineId`. */
const assignmentsInTimeline = async (
    tx: DbTransaction,
    timelineId: number,
    marcherIds: readonly number[],
): Promise<DatabaseTimelineAssignment[]> => {
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const rows = await tx
        .select({ row: a })
        .from(a)
        .innerJoin(t, eq(t.id, a.transition_id))
        .where(
            and(
                eq(t.timeline_id, timelineId),
                inArray(a.marcher_id, [...marcherIds]),
            ),
        )
        .orderBy(asc(a.id))
        .all();
    return rows.map((r) => r.row);
};

/**
 * Removes marchers from timeline `timelineId` (UI-9 Removing marchers): deletes each marcher's
 * assignments in it and the one-slot transitions that leaves empty. Other slots they leave are
 * vacant (D-13). The timeline is never deleted, even with nobody left in it.
 *
 * Refused before anything is written (E-ARGS): a missing timeline, no marchers, or none of the
 * marchers in the timeline.
 */
export const removeMarchersFromTimelineInTransaction = async ({
    tx,
    timelineId,
    marcherIds,
}: {
    tx: DbTransaction;
    timelineId: number;
    marcherIds: readonly number[];
}): Promise<RemoveAssignmentsResult> => {
    const timeline = await tx
        .select()
        .from(schema.timelines)
        .where(eq(schema.timelines.id, timelineId))
        .get();
    if (!timeline) refuse(`timeline ${timelineId} does not exist`);
    if (marcherIds.length === 0) refuse("select the marchers to remove");
    const removed = await assignmentsInTimeline(tx, timelineId, marcherIds);
    if (removed.length === 0)
        refuse(
            marcherIds.length === 1
                ? "the marcher isn't in this timeline"
                : "none of the selected marchers is in this timeline",
        );
    return await removeAssignmentRowsInTransaction({
        tx,
        removed,
        compact: false,
    });
};

/** `removeMarchersFromTimelineInTransaction` as one undoable edit. */
export const removeMarchersFromTimeline = async ({
    db,
    timelineId,
    marcherIds,
}: {
    db: DbConnection;
    timelineId: number;
    marcherIds: readonly number[];
}): Promise<RemoveAssignmentsResult> =>
    await transactionWithHistory(db, "removeMarchersFromTimeline", (tx) =>
        removeMarchersFromTimelineInTransaction({ tx, timelineId, marcherIds }),
    );

/**
 * The inspector's remove (P8.4) under UI-9: deletes one assignment and, when that leaves its
 * one-slot transition empty, the transition, never the timeline. A slot it leaves in a shared
 * transition stays vacant (D-13). Only the one row goes, so a marcher with several moves in one
 * timeline (a converted show before P9.10) keeps the others. Refused (E-ARGS) for a missing
 * assignment.
 */
export const removeAssignmentFromTimelineInTransaction = async ({
    tx,
    assignmentId,
}: {
    tx: DbTransaction;
    assignmentId: number;
}): Promise<RemoveAssignmentsResult> => {
    const row = await tx
        .select()
        .from(schema.timeline_assignments)
        .where(eq(schema.timeline_assignments.id, assignmentId))
        .get();
    if (!row) refuse(`assignment ${assignmentId} does not exist`);
    return await removeAssignmentRowsInTransaction({
        tx,
        removed: [row],
        compact: false,
    });
};

/** `removeAssignmentFromTimelineInTransaction` as one undoable edit. */
export const removeAssignmentFromTimeline = async ({
    db,
    assignmentId,
}: {
    db: DbConnection;
    assignmentId: number;
}): Promise<RemoveAssignmentsResult> =>
    await transactionWithHistory(db, "removeAssignmentFromTimeline", (tx) =>
        removeAssignmentFromTimelineInTransaction({ tx, assignmentId }),
    );
