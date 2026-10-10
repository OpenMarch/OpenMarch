import { and, eq, inArray, lt, gt, notInArray, sql } from "drizzle-orm";
import {
    createResolver,
    validateDestination,
    type PathStyle,
} from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables, shapeFromRow } from "@/timeline/timelineRows";
import {
    autoMoveNumber,
    normalizeMoveName,
} from "@/timeline/timelineViewModel";
import { castSlots, transitionSlotPoints } from "@/timeline/timelineCasting";
import { DEFAULT_BULGE } from "@/timeline/timelinePathDefaults";
import { DbConnection, DbTransaction } from "./types";
import {
    createRangeTimelineInTransaction,
    nextMoveNameInTransaction,
} from "./timelineMoveNames";
import { transactionWithHistory } from "./history";
import { changedPagesAround, type NamedPage } from "./pageDelete";
import { mapDbErrors, refuse, TimelineWriteError } from "./timelineErrors";
import {
    deleteTimelinesInTransaction,
    findTimelineByRange,
    updateTimelinesInTransaction,
    type DatabaseTimeline,
} from "./timelines";
import { createTimelineTransitionsInTransaction } from "./timelineTransitions";
import { createTimelineAssignmentsInTransaction } from "./timelineAssignments";
import {
    updateTimelineTransitionsInTransaction,
    type ModifiedTimelineTransitionArgs,
} from "./timelineTransitionsInTransaction";

/**
 * The timeline's commands (docs/timeline/phases/08-authoring-ui.md P8.9, ui.md's mapping table):
 * moving a clip moves its whole spec timeline, and Create Track makes a timeline with one
 * transition and its assignments. Both are one undoable edit, decided before the first write, so
 * a refusal writes nothing. A move (a clip's timeline) can be deleted and renamed (ui.md UI-14).
 */

/** The largest beat a row may hold (spec I-N2). */
const MAX_BEAT = 2147483647;

/** The largest layer a row may hold (spec I-N2). */
const MAX_LAYER = 1000;

const isBeat = (n: number) => Number.isInteger(n) && n >= 0 && n <= MAX_BEAT;

// ---------------------------------------------------------------------------
// Moving a whole timeline
// ---------------------------------------------------------------------------

export interface ShiftTimelineResult {
    timelineId: number;
    delta: number;
    /** The timeline's range after the shift */
    startBeat: number;
    endBeat: number;
}

/**
 * Moves a spec timeline and every transition and assignment in it by `delta` beats (ui.md: a clip
 * move moves its whole timeline). Shapes, destinations and homes don't move, so every position
 * moves in time only: the resolver at `b + delta` answers what it answered at `b`.
 *
 * Refused before anything is written:
 *
 * - `E-ARGS`: a missing timeline, a delta that isn't a whole number, or one that would take the
 *   timeline before beat 0 or past the largest beat;
 * - `E-A3`: a moved assignment that would overlap the same marcher's assignment at the same layer
 *   in another timeline.
 *
 * The statements are ordered so that every intermediate state passes the row triggers (U-3), so
 * undo, which replays them in reverse, lands only on valid states too. For a shift right
 * (`delta > 0`):
 *
 * 1. the timeline grows to the union of its old and new ranges, `[s, e + delta)`;
 * 2. every transition grows the same way, `[ts, te + delta)` (inside the grown timeline, and still
 *    containing its assignments);
 * 3. each assignment moves by `delta`, latest start first, so a marcher's row never lands on one
 *    of its own rows that hasn't moved yet (I-A3); each new range is inside its grown transition;
 * 4. every transition shrinks to `[ts + delta, te + delta)`, which now contains its assignments;
 * 5. the timeline shrinks to `[s + delta, e + delta)`.
 *
 * A shift left mirrors it: the start edges grow first, assignments move earliest start first, then
 * the end edges shrink. `delta` 0 writes nothing; don't make it the only write of an edit
 * (`shiftTimeline` skips it).
 */
// eslint-disable-next-line max-lines-per-function
export const shiftTimelineInTransaction = async ({
    tx,
    timelineId,
    delta,
}: {
    tx: DbTransaction;
    timelineId: number;
    delta: number;
}): Promise<ShiftTimelineResult> => {
    if (!Number.isInteger(delta))
        refuse(`a timeline moves by whole beats, not ${delta}`);
    const timelines = schema.timelines;
    const transitions = schema.timeline_transitions;
    const assignments = schema.timeline_assignments;

    const timeline = await tx
        .select()
        .from(timelines)
        .where(eq(timelines.id, timelineId))
        .get();
    if (!timeline) refuse(`timeline ${timelineId} does not exist`);
    const s = timeline.start_beat;
    const e = timeline.end_beat;
    const result = {
        timelineId,
        delta,
        startBeat: s + delta,
        endBeat: e + delta,
    };
    if (delta === 0) return { ...result, startBeat: s, endBeat: e };
    if (s + delta < 0)
        refuse(
            `the timeline starts at beat ${s}, so it can't move ${-delta} beat${
                delta === -1 ? "" : "s"
            } earlier`,
        );
    if (e + delta > MAX_BEAT)
        refuse(`the timeline can't move past beat ${MAX_BEAT}`);

    // The rows that move
    const transitionIds = (
        await tx
            .select({ id: transitions.id })
            .from(transitions)
            .where(eq(transitions.timeline_id, timelineId))
            .all()
    ).map((t) => t.id);
    const moved =
        transitionIds.length === 0
            ? []
            : await tx
                  .select()
                  .from(assignments)
                  .where(inArray(assignments.transition_id, transitionIds))
                  .all();

    // E-A3: a moved row against the same marcher's rows at its layer in other timelines
    if (moved.length > 0) {
        const marcherIds = [...new Set(moved.map((a) => a.marcher_id))];
        const others = await tx
            .select()
            .from(assignments)
            .where(
                and(
                    inArray(assignments.marcher_id, marcherIds),
                    notInArray(assignments.transition_id, transitionIds),
                ),
            )
            .all();
        for (const a of moved) {
            const start = a.start_beat + delta;
            const end = a.end_beat + delta;
            const hit = others.find(
                (o) =>
                    o.marcher_id === a.marcher_id &&
                    o.layer === a.layer &&
                    o.start_beat < end &&
                    start < o.end_beat,
            );
            if (hit)
                throw new TimelineWriteError(
                    "E-A3",
                    `moving the timeline would overlap marcher ${a.marcher_id}'s assignment over beats [${hit.start_beat}, ${hit.end_beat}) at layer ${hit.layer} in another timeline`,
                );
        }
    }

    const setTimelineRange = (start: number, end: number) =>
        tx
            .update(timelines)
            .set({ start_beat: start, end_beat: end })
            .where(eq(timelines.id, timelineId));
    const right = delta > 0;

    await mapDbErrors(async () => {
        // 1, 2. Grow the timeline, then its transitions, to the union
        if (right) {
            await setTimelineRange(s, e + delta);
            await tx
                .update(transitions)
                .set({ end_beat: sql`${transitions.end_beat} + ${delta}` })
                .where(eq(transitions.timeline_id, timelineId));
        } else {
            await setTimelineRange(s + delta, e);
            await tx
                .update(transitions)
                .set({ start_beat: sql`${transitions.start_beat} + ${delta}` })
                .where(eq(transitions.timeline_id, timelineId));
        }

        // 3. Move each assignment, the ones furthest in the direction of travel first
        const ordered = [...moved].sort((a, b) =>
            right
                ? b.start_beat - a.start_beat || b.id - a.id
                : a.start_beat - b.start_beat || a.id - b.id,
        );
        for (const a of ordered)
            await tx
                .update(assignments)
                .set({
                    start_beat: a.start_beat + delta,
                    end_beat: a.end_beat + delta,
                })
                .where(eq(assignments.id, a.id));

        // 4, 5. Shrink the transitions, then the timeline, to the target
        if (right)
            await tx
                .update(transitions)
                .set({ start_beat: sql`${transitions.start_beat} + ${delta}` })
                .where(eq(transitions.timeline_id, timelineId));
        else
            await tx
                .update(transitions)
                .set({ end_beat: sql`${transitions.end_beat} + ${delta}` })
                .where(eq(transitions.timeline_id, timelineId));
        await setTimelineRange(s + delta, e + delta);
    });
    return result;
};

/**
 * `shiftTimelineInTransaction` as one undoable edit. A zero delta (a clip dropped where it
 * started) opens no edit and returns `null`.
 */
export const shiftTimeline = async ({
    db,
    timelineId,
    delta,
}: {
    db: DbConnection;
    timelineId: number;
    delta: number;
}): Promise<ShiftTimelineResult | null> => {
    if (delta === 0) return null;
    return await transactionWithHistory(db, "shiftTimeline", (tx) =>
        shiftTimelineInTransaction({ tx, timelineId, delta }),
    );
};

// ---------------------------------------------------------------------------
// Create Track
// ---------------------------------------------------------------------------

/** What a new track moves: one marcher, or the given marchers into a shape. */
export type CreateTrackTarget =
    | { kind: "marcher"; marcherId: number }
    | { kind: "shape"; shapeId: number; marcherIds: readonly number[] };

export interface CreateTrackResult {
    timelineId: number;
    transitionId: number;
    assignmentIds: number[];
    /** The layer the assignments were made at (see `createTrackInTransaction`) */
    layer: number;
}

/**
 * The layer for new assignments of `marcherIds` over `[start, end)`: 0 when none of them has an
 * assignment there, otherwise one above the highest layer among the ones that overlap, so the new
 * track steals the range (R-2) instead of colliding with what's there (E-A3).
 */
export const stealLayer = async (
    tx: DbTransaction,
    marcherIds: readonly number[],
    start: number,
    end: number,
    /** Ends the refusal's message, after "the range already has assignments at the highest layer" */
    consequence = "so a new track can't be added over it",
): Promise<number> => {
    const a = schema.timeline_assignments;
    const overlapping = await tx
        .select({ layer: a.layer })
        .from(a)
        .where(
            and(
                inArray(a.marcher_id, [...marcherIds]),
                lt(a.start_beat, end),
                gt(a.end_beat, start),
            ),
        )
        .all();
    if (overlapping.length === 0) return 0;
    const layer = Math.max(...overlapping.map((o) => o.layer)) + 1;
    if (layer > MAX_LAYER)
        throw new TimelineWriteError(
            "E-A3",
            `the range already has assignments at the highest layer (${MAX_LAYER}), ${consequence}`,
        );
    return layer;
};

const requireMarchers = async (
    tx: DbTransaction,
    marcherIds: readonly number[],
) => {
    const found = await tx
        .select({ id: schema.marchers.id })
        .from(schema.marchers)
        .where(inArray(schema.marchers.id, [...marcherIds]))
        .all();
    const ids = new Set(found.map((m) => m.id));
    const missing = marcherIds.find((id) => !ids.has(id));
    if (missing !== undefined) refuse(`marcher ${missing} does not exist`);
};

/** How many slots a shape can take: a block's grid size; any other shape, the slot limit (I-N2). */
const shapeCapacity = (shape: typeof schema.timeline_shapes.$inferSelect) => {
    if (shape.kind !== "block") return 10000;
    const geometry = JSON.parse(shape.geometry) as {
        rows: number;
        cols: number;
    };
    return geometry.rows * geometry.cols;
};

/**
 * Create Track (ui.md's mapping table): one edit that creates a timeline over `[startBeat,
 * endBeat)` with one `direct` transition over the same range, and its assignments. When a stored
 * timeline already has that range, the transition goes into it instead (one timeline per range,
 * C-12).
 *
 * - **A marcher:** the transition has no shape and one slot, whose destination is the marcher's
 *   position at `startBeat` (read from a resolver over the rows this edit sees), so the marcher
 *   doesn't jump at the range start: it holds still there until the destination is edited. That
 *   still changes the show when the track steals a move in progress: the marcher stops for the
 *   range, and since progress is measured against the stolen transition's own end (D-7), that
 *   move resumes afterwards with a catch-up, a visible change of speed.
 * - **A shape:** the transition goes into the shape with one slot per marcher, and each marcher
 *   takes the slot nearest to where it stands at `startBeat` (nearest-slot casting, P8.4, so the
 *   total distance is as small as it can be). A block with fewer cells than marchers is refused
 *   (`E-T4`).
 *
 * **The layer** (decision UI-6 in ui.md): the assignments go one layer above the highest layer the
 * marchers already have in the range, or at 0 where they have none there, so the new track steals
 * the range (R-2) the way a breakaway does (golden vector G2). A layer-0 track over a converted
 * show's page moves would always overlap them (E-A3).
 *
 * Refused before anything is written: a range that isn't whole beats inside `[0, 2³¹ − 1]` with
 * positive length, a missing marcher or shape, no marchers for a shape, or a marcher named twice
 * (`E-ARGS`).
 */
// eslint-disable-next-line max-lines-per-function
export const createTrackInTransaction = async ({
    tx,
    target,
    startBeat,
    endBeat,
}: {
    tx: DbTransaction;
    target: CreateTrackTarget;
    startBeat: number;
    endBeat: number;
}): Promise<CreateTrackResult> => {
    if (!isBeat(startBeat) || !isBeat(endBeat) || endBeat <= startBeat)
        refuse(
            `a track needs a range of whole beats with its end after its start, not [${startBeat}, ${endBeat})`,
        );

    const marcherIds =
        target.kind === "marcher"
            ? [target.marcherId]
            : [...target.marcherIds].sort((a, b) => a - b);
    if (marcherIds.length === 0)
        refuse("select the marchers to move into the shape");
    if (new Set(marcherIds).size !== marcherIds.length)
        refuse("a marcher appears more than once");
    await requireMarchers(tx, marcherIds);

    let destination:
        | { kind: "shape"; shapeId: number }
        | { kind: "individual"; points: [number, number][] };
    let slotOf: ReadonlyMap<number, number> = new Map([[marcherIds[0]!, 0]]);
    if (target.kind === "shape") {
        const shape = await tx
            .select()
            .from(schema.timeline_shapes)
            .where(eq(schema.timeline_shapes.id, target.shapeId))
            .get();
        if (!shape) refuse(`shape ${target.shapeId} does not exist`);
        const capacity = shapeCapacity(shape);
        if (marcherIds.length > capacity)
            throw new TimelineWriteError(
                "E-T4",
                `the shape has room for ${capacity} marcher${
                    capacity === 1 ? "" : "s"
                }, not ${marcherIds.length}`,
            );
        destination = { kind: "shape", shapeId: shape.id };
        const { snapshot } = await readTimelineTables(tx);
        const resolver = createResolver(snapshot);
        const points = transitionSlotPoints(
            {
                id: 0,
                start: startBeat,
                end: endBeat,
                dest: shape.id,
                slots: marcherIds.length,
                style: "direct",
                order: "inherit",
                params: null,
            },
            { [shape.id]: shapeFromRow(shape) },
        );
        // Past MAX_CAST_SLOTS the solve is too slow for one click, so castSlots falls back to id
        // order (marcherIds is sorted)
        slotOf = castSlots(
            "direct",
            marcherIds.map((id) => ({
                id,
                xy: resolver.positionAt(id, startBeat),
            })),
            points.map((xy, slot) => ({ slot, xy })),
        );
    } else {
        const { snapshot } = await readTimelineTables(tx);
        const [x, y] = createResolver(snapshot).positionAt(
            target.marcherId,
            startBeat,
        );
        if (!validateDestination([x, y]).ok)
            refuse(
                `marcher ${target.marcherId} is outside the field's bounds at beat ${startBeat}`,
            );
        destination = { kind: "individual", points: [[x, y]] };
    }
    const layer = await stealLayer(tx, marcherIds, startBeat, endBeat);

    // One timeline per range (C-12): a stored timeline over the range (a converted page's, say)
    // takes the new transition alongside its others (C-11)
    const timeline =
        (await findTimelineByRange(tx, { start: startBeat, end: endBeat })) ??
        (await createRangeTimelineInTransaction(tx, { startBeat, endBeat }));
    const [transition] = await createTimelineTransitionsInTransaction({
        tx,
        newTransitions: [
            {
                timelineId: timeline!.id,
                startBeat,
                endBeat,
                slotCount: marcherIds.length,
                destination,
            },
        ],
    });
    const created = await createTimelineAssignmentsInTransaction({
        tx,
        newAssignments: marcherIds.map((marcherId) => ({
            marcherId,
            transitionId: transition!.id,
            slotIndex: slotOf.get(marcherId)!,
            startBeat,
            endBeat,
            layer,
        })),
    });
    return {
        timelineId: timeline!.id,
        transitionId: transition!.id,
        assignmentIds: created.map((a) => a.id),
        layer,
    };
};

/** `createTrackInTransaction` as one undoable edit. */
export const createTrack = async ({
    db,
    target,
    startBeat,
    endBeat,
}: {
    db: DbConnection;
    target: CreateTrackTarget;
    startBeat: number;
    endBeat: number;
}): Promise<CreateTrackResult> =>
    await transactionWithHistory(db, "createTrack", (tx) =>
        createTrackInTransaction({ tx, target, startBeat, endBeat }),
    );

// ---------------------------------------------------------------------------
// Deleting and renaming a move (ui.md UI-14)
// ---------------------------------------------------------------------------

/** Thrown inside an edit that finds nothing to write, to leave without an (empty, refused) edit */
class NoEdit extends Error {}

/**
 * `transactionWithHistory` for an edit that decides from the stored state whether it writes
 * anything: `func` reads under the write lock, so it sees every committed edit and none can come
 * between its read and its write, and returns `NO_EDIT` to write nothing. That rolls the edit back
 * before it is recorded (an edit that writes nothing is refused) and returns `null`; no history
 * step, no change notice.
 */
const NO_EDIT = Symbol("no edit");
const transactionWithHistoryUnlessUnchanged = async <T>(
    db: DbConnection,
    funcName: string,
    func: (tx: DbTransaction) => Promise<T | typeof NO_EDIT>,
): Promise<T | null> => {
    try {
        return await transactionWithHistory(db, funcName, async (tx) => {
            const result = await func(tx);
            if (result === NO_EDIT) throw new NoEdit(funcName);
            return result;
        });
    } catch (error: unknown) {
        if (error instanceof NoEdit) return null;
        throw error;
    }
};

/**
 * Deletes a move (UI-14): the timeline, its transitions and their assignments, as one undoable
 * edit (`deleteTimelinesInTransaction`, child first). Moves it passed through are stored
 * underneath it (UI-10) and come back. Refused (E-ARGS) for a timeline that doesn't exist.
 */
export const deleteTimeline = async ({
    db,
    timelineId,
}: {
    db: DbConnection;
    timelineId: number;
}): Promise<DatabaseTimeline> =>
    await transactionWithHistory(db, "deleteTimeline", async (tx) => {
        const [deleted] = await deleteTimelinesInTransaction({
            tx,
            timelineIds: new Set([timelineId]),
        });
        if (!deleted) refuse(`timeline ${timelineId} does not exist`);
        return deleted;
    });

/**
 * `deleteTimeline`, also saying which pages now look different (UI-14 with defined coordinates):
 * marchers that held after the move fall back to where they were before it, so later pages can
 * change too. Each page's own flag is compared before and after (`changedPagesAround`).
 */
export const deleteTimelineAndCompare = async ({
    db,
    timelineId,
}: {
    db: DbConnection;
    timelineId: number;
}): Promise<{ deleted: DatabaseTimeline; changedPages: NamedPage[] }> =>
    await transactionWithHistory(db, "deleteTimeline", async (tx) => {
        const { value: deleted, changedPages } = await changedPagesAround(
            tx,
            async () =>
                (
                    await deleteTimelinesInTransaction({
                        tx,
                        timelineIds: new Set([timelineId]),
                    })
                )[0],
        );
        if (!deleted) refuse(`timeline ${timelineId} does not exist`);
        return { deleted, changedPages };
    });

/**
 * Renames a move (UI-14) as one undoable edit; `normalizeMoveName` decides what is stored. A move
 * always has a name since the round-2 review, so its label never shifts: clearing an automatic
 * "Move N" keeps it, and clearing a typed name gives the move the next number
 * (`nextMoveNameInTransaction`), as a new move would get. The stored name is read inside the edit,
 * under the write lock; when it already equals the new one, the edit is rolled back before it is
 * recorded (`transactionWithHistoryUnlessUnchanged`) and it returns `null`: no history step, no
 * change notice, and so a rename sent twice is one edit. Clearing an automatic "Move N" is the
 * same. A timeline that no longer exists (a name field left open while its move was deleted) has
 * nothing to rename: `null` too, not an error.
 */
export const renameTimeline = async ({
    db,
    timelineId,
    name,
}: {
    db: DbConnection;
    timelineId: number;
    name: string | null;
}): Promise<DatabaseTimeline | null> => {
    const next = normalizeMoveName(name);
    return await transactionWithHistoryUnlessUnchanged(
        db,
        "renameTimeline",
        async (tx) => {
            // Read in the edit, so a rename sent twice (or after an undo) compares with what is
            // stored now
            const stored = await tx
                .select({ name: schema.timelines.name })
                .from(schema.timelines)
                .where(eq(schema.timelines.id, timelineId))
                .get();
            if (!stored || stored.name === next) return NO_EDIT;
            if (next === null && autoMoveNumber(stored.name) !== null)
                return NO_EDIT;
            const [renamed] = await updateTimelinesInTransaction({
                tx,
                modifiedTimelines: [
                    {
                        id: timelineId,
                        name: next ?? (await nextMoveNameInTransaction(tx)),
                    },
                ],
            });
            return renamed!;
        },
    );
};

/** The path styles a whole move can take (UI-14): follow the leader needs a shape, which a move's
 * one-slot transitions don't have. */
export type MovePathStyle = Extract<PathStyle, "direct" | "arc">;

/** A move's path as its Move card shows it (UI-14). */
export interface MovePath {
    /** Every transition's style, `"mixed"` when they differ, `null` with no transitions */
    readonly style: PathStyle | "mixed" | null;
    /** The arcs' bulge when every transition is an arc with the same bulge, else `null` */
    readonly bulge: number | null;
    readonly transitions: number;
}

const bulgeOf = (params: string | null): number | null => {
    if (params === null) return null;
    const parsed = JSON.parse(params) as { bulge?: unknown } | null;
    return typeof parsed?.bulge === "number" ? parsed.bulge : null;
};

/** The transitions of a move, with their style and bulge. */
const moveTransitions = async (
    db: DbConnection | DbTransaction,
    timelineId: number,
) =>
    (
        await db
            .select({
                id: schema.timeline_transitions.id,
                style: schema.timeline_transitions.path_style,
                params: schema.timeline_transitions.path_params,
            })
            .from(schema.timeline_transitions)
            .where(eq(schema.timeline_transitions.timeline_id, timelineId))
            .all()
    ).map((t) => ({
        id: t.id,
        style: t.style as PathStyle,
        bulge: bulgeOf(t.params),
    }));

/** What a move's member transitions' paths are, for the Move card (UI-14). */
export const readMovePath = async (
    db: DbConnection | DbTransaction,
    timelineId: number,
): Promise<MovePath> => {
    const rows = await moveTransitions(db, timelineId);
    if (rows.length === 0) return { style: null, bulge: null, transitions: 0 };
    const style = rows.every((r) => r.style === rows[0]!.style)
        ? rows[0]!.style
        : "mixed";
    const bulge =
        style === "arc" && rows.every((r) => r.bulge === rows[0]!.bulge)
            ? rows[0]!.bulge
            : null;
    return { style, bulge, transitions: rows.length };
};

/**
 * Gives every transition of a move the same path (UI-14's Move card): `direct`, or `arc` with
 * `bulge`, as one undoable edit. A move is one one-slot transition per marcher (UI-9), so this is
 * how the move as a whole bends. The paths are read inside the edit, under the write lock.
 * Transitions that already have that path are left alone; when all of them do, the edit is rolled
 * back before it is recorded (`transactionWithHistoryUnlessUnchanged`) and it returns `null`: no
 * history step, no change notice. Otherwise it returns how many changed. The
 * bulge is validated by the write (|bulge| at most 0.5, spec §5.2).
 */
export const setMovePath = async ({
    db,
    timelineId,
    style,
    bulge = DEFAULT_BULGE,
}: {
    db: DbConnection;
    timelineId: number;
    style: MovePathStyle;
    bulge?: number;
}): Promise<number | null> => {
    return await transactionWithHistoryUnlessUnchanged(
        db,
        "setMovePath",
        async (tx) => {
            // Read in the edit: what changes is judged on the committed paths
            const rows = await moveTransitions(tx, timelineId);
            const changed: ModifiedTimelineTransitionArgs[] = rows
                .filter((r) =>
                    style === "arc"
                        ? r.style !== "arc" || r.bulge !== bulge
                        : r.style !== "direct",
                )
                .map((r) => ({
                    id: r.id,
                    pathStyle: style,
                    pathParams: style === "arc" ? { bulge } : null,
                }));
            if (changed.length === 0) return NO_EDIT;
            await updateTimelineTransitionsInTransaction({
                tx,
                modifiedTransitions: changed,
            });
            return changed.length;
        },
    );
};
