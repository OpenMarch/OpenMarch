import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import {
    FieldProperties,
    validateDestination,
    validateHome,
    type XY,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { DbTransaction } from "./types";
import { updateMarcherHomesInTransaction } from "./marcherHome";
import { createTimelineAssignmentsInTransaction } from "./timelineAssignments";
import { assertValid, mapDbErrors } from "./timelineErrors";

/**
 * Marcher add and delete in timeline mode (docs/timeline/phases/07-page-parity.md P7.3). Both run
 * inside the same `transactionWithHistory` edit as the page-era create or delete
 * (`createMarchers`, `deleteMarchers` with `timelineMode: true`), so each is one undo step.
 *
 * **Add.** A new marcher gets a home (C-5) and holds it across the show, as a new marcher in page
 * mode gets a row on every page at its starting position:
 *
 * - The home is a free spot found the way page mode finds one for page 0 (a column four steps in
 *   from the top left of the field, moved down two steps at a time until no marcher's home is
 *   there), with new marchers side by side two steps apart. Page mode checks page rows; this
 *   checks homes, because page rows are frozen in timeline mode.
 * - **Holding transitions:** every shapeless transition whose assignments are all layer 0 and span
 *   the whole transition (the converter's page moves, P6) grows by one slot per new marcher, the
 *   new slot's destination is the marcher's home, and the marcher gets a layer-0 assignment over
 *   the transition. Its position is therefore its home everywhere. The slot count grows before
 *   the point is inserted, which is the order the triggers allow (I-T6); undo replays it backwards
 *   (delete the point, then shrink), which is valid too. Transitions are taken in start order and
 *   one that overlaps a transition already taken is skipped, so the new layer-0 rows never overlap
 *   (E-A3). A transition at the 10,000-slot limit is skipped.
 * - **Not joined:** shape-backed transitions (a slot added to a shape would move every other
 *   slot's sample point) and transitions with steals or partial rows (not page moves). The marcher
 *   holds through them, which the resolver already does for a marcher without an assignment.
 *
 * **Delete.** The marcher's assignments are deleted explicitly before the marcher, children
 * first (C-1; the cascade would also work, see the P4.8 exception). Then each shapeless transition
 * that lost a slot is compacted when that keeps every other marcher's resolved position:
 *
 * - a vacated slot that is the last slot is removed (its point deleted, then `slot_count` shrunk);
 * - otherwise the marcher in the last slot moves into the vacated slot, with its destination
 *   copied there, and the last slot is removed. A shapeless transition places each slot at its own
 *   point, so the move changes no position.
 *
 * A transition is left with its vacant slots (valid, D-13, raising D-VACANT) when it has a shape
 * (slot count changes the shape's samples), when it is down to its last slot (`slot_count` ≥ 1),
 * when its last slot is already vacant (a vacancy the user made is left alone), or when a
 * follow-the-leader transition that inherits its order shares a marcher with it (R-12 keys that
 * order by slot index in the previous transition, so renumbering could reorder the trail).
 */

const DEFAULT_START = { x: 100, y: 100, spacing: 25 };

/** The first free starting point for new marchers, as page mode picks one for page 0. */
const findStartingPoint = async (
    tx: DbTransaction,
    excludeMarcherIds: readonly number[],
): Promise<{ x: number; y: number; spacing: number }> => {
    const fieldPropertiesRow = await tx.query.field_properties.findFirst();
    let start = { ...DEFAULT_START };
    let stepY = DEFAULT_START.spacing;
    if (fieldPropertiesRow) {
        const pixelsPerStep = new FieldProperties(
            JSON.parse(fieldPropertiesRow.json_data),
        ).pixelsPerStep;
        start = {
            x: 8 * pixelsPerStep,
            y: 8 * pixelsPerStep,
            spacing: 2 * pixelsPerStep,
        };
        stepY = 2 * pixelsPerStep;
    } else {
        console.warn(
            "Field properties not found, using default starting point",
        );
    }
    const m = schema.marchers;
    const homes = await tx
        .select({ x: m.home_x, y: m.home_y })
        .from(m)
        .where(notInArray(m.id, [...excludeMarcherIds]))
        .all();
    const taken = new Set(homes.map((h) => `${h.x},${h.y}`));
    // A zero step size would never find a free row; stop at the first spot then
    while (stepY > 0 && taken.has(`${start.x},${start.y}`)) start.y += stepY;
    return start;
};

/** Where `addMarchersToTimelineInTransaction` put each new marcher. */
export interface TimelineMarcherAddResult {
    homes: { marcherId: number; home: XY }[];
    /** The transitions each new marcher was added to, with its slot */
    slots: { marcherId: number; transitionId: number; slotIndex: number }[];
}

const MAX_SLOTS = 10000;

/**
 * Gives newly created marchers a home and a holding slot in each page move (see the module
 * comment). Call it in the same edit as `createMarchersInTransaction`, after it.
 */
// eslint-disable-next-line max-lines-per-function
export const addMarchersToTimelineInTransaction = async ({
    tx,
    marcherIds,
}: {
    tx: DbTransaction;
    marcherIds: readonly number[];
}): Promise<TimelineMarcherAddResult> => {
    const result: TimelineMarcherAddResult = { homes: [], slots: [] };
    if (marcherIds.length === 0) return result;

    // Homes, side by side from the first free starting spot
    const start = await findStartingPoint(tx, marcherIds);
    marcherIds.forEach((marcherId, i) => {
        const home: XY = [start.x + i * start.spacing, start.y];
        assertValid(validateHome(home), "marcher home");
        assertValid(validateDestination(home), "destination");
        result.homes.push({ marcherId, home });
    });

    // The holding transitions: shapeless, every row layer 0 over the whole transition
    const t = schema.timeline_transitions;
    const a = schema.timeline_assignments;
    const candidates = await tx
        .select()
        .from(t)
        .where(isNull(t.dest_shape_id))
        .orderBy(asc(t.start_beat), asc(t.id))
        .all();
    const rows =
        candidates.length === 0
            ? []
            : await tx
                  .select()
                  .from(a)
                  .where(
                      inArray(
                          a.transition_id,
                          candidates.map((c) => c.id),
                      ),
                  )
                  .all();
    const rowsByTransition = new Map<number, typeof rows>();
    for (const row of rows) {
        const list = rowsByTransition.get(row.transition_id) ?? [];
        list.push(row);
        rowsByTransition.set(row.transition_id, list);
    }
    const chosen: (typeof candidates)[number][] = [];
    let lastEnd = -Infinity;
    for (const tr of candidates) {
        const own = rowsByTransition.get(tr.id) ?? [];
        const pageMove = own.every(
            (r) =>
                r.layer === 0 &&
                r.start_beat === tr.start_beat &&
                r.end_beat === tr.end_beat,
        );
        if (!pageMove) continue;
        if (tr.slot_count + marcherIds.length > MAX_SLOTS) continue;
        if (tr.start_beat < lastEnd) continue;
        chosen.push(tr);
        lastEnd = tr.end_beat;
    }

    // Writes: homes, then per transition grow → points → assignments
    await updateMarcherHomesInTransaction({
        tx,
        modifiedHomes: result.homes.map(({ marcherId, home }) => ({
            marcherId,
            home,
        })),
    });
    for (const tr of chosen) {
        const first = tr.slot_count;
        await mapDbErrors(async () => {
            await tx
                .update(t)
                .set({ slot_count: first + marcherIds.length })
                .where(eq(t.id, tr.id));
            await tx.insert(schema.timeline_slot_destinations).values(
                result.homes.map(({ home }, i) => ({
                    transition_id: tr.id,
                    slot_index: first + i,
                    x: home[0],
                    y: home[1],
                })),
            );
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: result.homes.map(({ marcherId }, i) => ({
                marcherId,
                transitionId: tr.id,
                slotIndex: first + i,
                startBeat: tr.start_beat,
                endBeat: tr.end_beat,
                layer: 0,
            })),
        });
        result.homes.forEach(({ marcherId }, i) =>
            result.slots.push({
                marcherId,
                transitionId: tr.id,
                slotIndex: first + i,
            }),
        );
    }
    return result;
};

/** What `removeMarchersFromTimelineInTransaction` did. */
export interface TimelineMarcherRemoveResult {
    /** The deleted assignments' ids */
    assignmentIds: number[];
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
 * Deletes the marchers' assignments and compacts the shapeless transitions they leave (see the
 * module comment). Call it in the same edit as the marcher delete, before it.
 */
// eslint-disable-next-line max-lines-per-function
export const removeMarchersFromTimelineInTransaction = async ({
    tx,
    marcherIds,
}: {
    tx: DbTransaction;
    marcherIds: readonly number[];
}): Promise<TimelineMarcherRemoveResult> => {
    const result: TimelineMarcherRemoveResult = {
        assignmentIds: [],
        compacted: [],
        movedSlots: [],
        leftVacant: [],
    };
    if (marcherIds.length === 0) return result;
    const a = schema.timeline_assignments;
    const t = schema.timeline_transitions;
    const d = schema.timeline_slot_destinations;

    const removed = await tx
        .select()
        .from(a)
        .where(inArray(a.marcher_id, [...marcherIds]))
        .orderBy(asc(a.id))
        .all();
    if (removed.length === 0) return result;
    const vacatedByTransition = new Map<number, Set<number>>();
    for (const row of removed) {
        const set = vacatedByTransition.get(row.transition_id) ?? new Set();
        set.add(row.slot_index);
        vacatedByTransition.set(row.transition_id, set);
    }

    // Marchers in an inheriting follow-the-leader transition, whose order R-12 may read from the
    // slot indexes of their previous transition. The set includes the marchers being deleted;
    // that is harmless, because it is only checked against the rows that remain after the delete.
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
    const ftlMarchers = new Set<number>();
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

    await mapDbErrors(async () => {
        await tx.delete(a).where(
            inArray(
                a.id,
                removed.map((r) => r.id),
            ),
        );
    });
    result.assignmentIds = removed.map((r) => r.id);

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
        if (!tr || tr.dest_shape_id !== null) {
            leaveAll();
            continue;
        }
        const remaining = await tx
            .select()
            .from(a)
            .where(eq(a.transition_id, transitionId))
            .all();
        if (remaining.some((r) => ftlMarchers.has(r.marcher_id))) {
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
                // The last slot is a vacancy this delete didn't make: leave it, and the rest
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
    return result;
};
