import { afterEach, describe, expect } from "vitest";
import { asc, eq, getTableName } from "drizzle-orm";
import { createResolver, type Resolver } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { convertPagesToTimeline } from "@/timeline/convert/writePageConversion";
import { readTimelineTables } from "@/timeline/timelineRows";
import {
    startTimelineResolver,
    stopTimelineResolver,
    timelineResolverSettled,
    useTimelineResolverStore,
} from "@/timeline/timelineStore";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import { TimelineWriteError } from "../timelineErrors";
import { createTimelinesInTransaction } from "../timelines";
import {
    createTimelineShapesInTransaction,
    type NewTimelineShapeArgs,
} from "../timelineShapes";
import { createTimelineTransitionsInTransaction } from "../timelineTransitions";
import { createTimelineAssignmentsInTransaction } from "../timelineAssignments";
import { createTrack, shiftTimeline } from "../timelineCommands";

/**
 * The timeline's commands (docs/timeline/phases/08-authoring-ui.md P8.9) on a converted
 * `marchersAndPages` show: one timeline from beat 0 with one shapeless transition per page.
 */

afterEach(() => stopTimelineResolver());

const TABLES = [
    schema.marchers,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

/** The data tables. */
const dataOf = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

/** The data tables and the history tables, which a refused edit must also leave alone. */
const snapshot = async (db: DbConnection) => ({
    data: await dataOf(db),
    undo: await db.select().from(schema.history_undo).all(),
    redo: await db.select().from(schema.history_redo).all(),
    stats: await db.select().from(schema.history_stats).all(),
});

const expectRefused = async (
    db: DbConnection,
    code: string,
    write: () => Promise<unknown>,
) => {
    const before = await snapshot(db);
    const error = await write().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimelineWriteError);
    expect((error as TimelineWriteError).code).toBe(code);
    expect(await snapshot(db)).toEqual(before);
    return error as TimelineWriteError;
};

/** A cold resolver over the committed rows. */
const resolverOf = async (db: DbConnection): Promise<Resolver> =>
    createResolver((await readTimelineTables(db)).snapshot);

const converted = async (db: DbConnection) => {
    await convertPagesToTimeline(db);
    const timeline = await db.select().from(schema.timelines).get();
    expect(timeline).toBeDefined();
    return timeline!;
};

/** Every marcher's position at each of `beats`. */
const positions = (r: Resolver, beats: readonly number[]) =>
    r.marcherIds().map((id) => beats.map((b) => r.positionAt(id, b)));

/** Whole and half beats from 0 to `end`, inclusive. */
const beatsTo = (end: number) =>
    Array.from({ length: 2 * end + 1 }, (_, i) => i / 2);

const rangesOf = async (db: DbConnection) => ({
    transitions: (
        await db
            .select()
            .from(schema.timeline_transitions)
            .orderBy(asc(schema.timeline_transitions.id))
            .all()
    ).map((t) => [t.id, t.start_beat, t.end_beat]),
    assignments: (
        await db
            .select()
            .from(schema.timeline_assignments)
            .orderBy(asc(schema.timeline_assignments.id))
            .all()
    ).map((a) => [a.id, a.start_beat, a.end_beat]),
});

const shifted = (ranges: Awaited<ReturnType<typeof rangesOf>>, k: number) => ({
    transitions: ranges.transitions.map(([id, s, e]) => [id, s! + k, e! + k]),
    assignments: ranges.assignments.map(([id, s, e]) => [id, s! + k, e! + k]),
});

/** One edit: a second timeline over [start, end) moving `marcherId` at `layer`. */
const addTimeline = (
    db: DbConnection,
    {
        marcherId,
        start,
        end,
        layer,
    }: { marcherId: number; start: number; end: number; layer: number },
) =>
    transactionWithHistory(db, "addTimeline", async (tx) => {
        const [timeline] = await createTimelinesInTransaction({
            tx,
            newTimelines: [{ startBeat: start, endBeat: end }],
        });
        const [transition] = await createTimelineTransitionsInTransaction({
            tx,
            newTransitions: [
                {
                    timelineId: timeline!.id,
                    startBeat: start,
                    endBeat: end,
                    slotCount: 1,
                    destination: { kind: "individual", points: [[5, 5]] },
                },
            ],
        });
        await createTimelineAssignmentsInTransaction({
            tx,
            newAssignments: [
                {
                    marcherId,
                    transitionId: transition!.id,
                    slotIndex: 0,
                    startBeat: start,
                    endBeat: end,
                    layer,
                },
            ],
        });
        return timeline!.id;
    });

const addShape = (db: DbConnection, shape: NewTimelineShapeArgs) =>
    transactionWithHistory(db, "addShape", async (tx) => {
        const [row] = await createTimelineShapesInTransaction({
            tx,
            newShapes: [shape],
        });
        return row!.id;
    });

describeDbTests("timeline commands", (it) => {
    describe("shifting a timeline", () => {
        it("moves every transition and assignment right by k, and every position in time exactly", async ({
            db,
            marchersAndPages: _,
        }) => {
            const timeline = await converted(db);
            const k = 3;
            const end = timeline.end_beat;
            const before = await dataOf(db);
            const rangesBefore = await rangesOf(db);
            const positionsBefore = positions(
                await resolverOf(db),
                beatsTo(end + 2),
            );

            const result = await shiftTimeline({
                db,
                timelineId: timeline.id,
                delta: k,
            });
            expect(result).toEqual({
                timelineId: timeline.id,
                delta: k,
                startBeat: timeline.start_beat + k,
                endBeat: end + k,
            });
            const after = await dataOf(db);
            expect(await rangesOf(db)).toEqual(shifted(rangesBefore, k));
            expect(after.timelines).toEqual([
                { ...timeline, start_beat: k, end_beat: end + k },
            ]);
            // Nothing else changed
            expect(after.timeline_slot_destinations).toEqual(
                before.timeline_slot_destinations,
            );
            expect(after.marchers).toEqual(before.marchers);

            // The resolver at b + k answers what it answered at b
            const r = await resolverOf(db);
            expect(
                positions(
                    r,
                    beatsTo(end + 2).map((b) => b + k),
                ),
            ).toEqual(positionsBefore);
            // Before the shifted start, everyone holds where they started
            expect(positions(r, [0, k / 2, k])).toEqual(
                positionsBefore.map((p) => [p[0], p[0], p[0]]),
            );

            // Undo and redo round-trip exactly
            const undo = await performUndo(db);
            expect(undo.success, undo.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(before);
            const redo = await performRedo(db);
            expect(redo.success, redo.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(after);
        });

        it("moves left by k, and its undo and redo round-trip", async ({
            db,
            marchersAndPages: _,
        }) => {
            const timeline = await converted(db);
            await shiftTimeline({ db, timelineId: timeline.id, delta: 5 });
            const before = await dataOf(db);
            const rangesBefore = await rangesOf(db);
            const end = timeline.end_beat + 5;
            const positionsBefore = positions(
                await resolverOf(db),
                beatsTo(end + 2).filter((b) => b >= 2),
            );

            await shiftTimeline({ db, timelineId: timeline.id, delta: -2 });
            const after = await dataOf(db);
            expect(await rangesOf(db)).toEqual(shifted(rangesBefore, -2));
            expect(after.timelines).toEqual([
                { ...timeline, start_beat: 3, end_beat: timeline.end_beat + 3 },
            ]);
            expect(
                positions(
                    await resolverOf(db),
                    beatsTo(end + 2)
                        .filter((b) => b >= 2)
                        .map((b) => b - 2),
                ),
            ).toEqual(positionsBefore);

            const undo = await performUndo(db);
            expect(undo.success, undo.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(before);
            const redo = await performRedo(db);
            expect(redo.success, redo.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(after);

            // Back to where the show started, and both edits undo
            await shiftTimeline({ db, timelineId: timeline.id, delta: -3 });
            const original = await rangesOf(db);
            expect((await dataOf(db)).timelines).toEqual([timeline]);
            for (let i = 0; i < 3; i++)
                expect((await performUndo(db)).success).toBe(true);
            expect(shifted(await rangesOf(db), 0)).toEqual(original);
        });

        it("refuses to move before beat 0, and writes nothing", async ({
            db,
            marchersAndPages: _,
        }) => {
            const timeline = await converted(db);
            const error = await expectRefused(db, "E-ARGS", () =>
                shiftTimeline({ db, timelineId: timeline.id, delta: -1 }),
            );
            expect(error.message).toContain("beat 0");
            await expectRefused(db, "E-ARGS", () =>
                shiftTimeline({ db, timelineId: 9999, delta: 1 }),
            );
            await expectRefused(db, "E-ARGS", () =>
                shiftTimeline({ db, timelineId: timeline.id, delta: 0.5 }),
            );
        });

        it("refuses an overlap with the same marcher's row at the same layer in another timeline (E-A3)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const timeline = await converted(db);
            const marcherId = (await db.select().from(schema.marchers).get())!
                .id;
            const end = timeline.end_beat;
            await addTimeline(db, {
                marcherId,
                start: end + 2,
                end: end + 6,
                layer: 0,
            });
            const error = await expectRefused(db, "E-A3", () =>
                shiftTimeline({ db, timelineId: timeline.id, delta: 3 }),
            );
            expect(error.message).toContain(`marcher ${marcherId}`);
            // Up to the other timeline is fine
            await shiftTimeline({ db, timelineId: timeline.id, delta: 2 });
            expect(
                (
                    await db
                        .select()
                        .from(schema.timelines)
                        .where(eq(schema.timelines.id, timeline.id))
                        .get()
                )?.end_beat,
            ).toBe(end + 2);
        });

        it("writes nothing for a zero shift (a clip dropped where it started)", async ({
            db,
            marchersAndPages: _,
        }) => {
            const timeline = await converted(db);
            const before = await snapshot(db);
            expect(
                await shiftTimeline({ db, timelineId: timeline.id, delta: 0 }),
            ).toBeNull();
            expect(await snapshot(db)).toEqual(before);
        });

        it("the running resolver store follows a shift and its undo", async ({
            db,
            marchersAndPages: _,
        }) => {
            const timeline = await converted(db);
            await startTimelineResolver(db);
            const store = () => useTimelineResolverStore.getState().resolver!;
            const beats = beatsTo(timeline.end_beat);
            const before = positions(store(), beats);
            await shiftTimeline({ db, timelineId: timeline.id, delta: 4 });
            await timelineResolverSettled();
            expect(
                positions(
                    store(),
                    beats.map((b) => b + 4),
                ),
            ).toEqual(before);
            expect((await performUndo(db)).success).toBe(true);
            await timelineResolverSettled();
            expect(positions(store(), beats)).toEqual(before);
        });
    });

    describe("Create Track", () => {
        it("for a marcher: a shapeless one-slot transition at its position at the range start, stealing the range", async ({
            db,
            marchersAndPages: _,
        }) => {
            const timeline = await converted(db);
            const marcherId = (await db.select().from(schema.marchers).get())!
                .id;
            const start = 3;
            const end = Math.min(start + 6, timeline.end_beat);
            const r0 = await resolverOf(db);
            const at = r0.positionAt(marcherId, start);
            const others = r0.marcherIds().filter((id) => id !== marcherId);
            const beats = beatsTo(timeline.end_beat + 1);
            const othersBefore = others.map((id) =>
                beats.map((b) => r0.positionAt(id, b)),
            );
            const before = await dataOf(db);

            const result = await createTrack({
                db,
                target: { kind: "marcher", marcherId },
                startBeat: start,
                endBeat: end,
            });
            // Over a converted page move at layer 0, the track steals at layer 1
            expect(result.layer).toBe(1);
            const after = await dataOf(db);
            expect(
                after.timelines.find(
                    (t) => (t as { id: number }).id === result.timelineId,
                ),
            ).toMatchObject({ start_beat: start, end_beat: end });
            const transition = await db
                .select()
                .from(schema.timeline_transitions)
                .where(eq(schema.timeline_transitions.id, result.transitionId))
                .get();
            expect(transition).toMatchObject({
                timeline_id: result.timelineId,
                dest_shape_id: null,
                path_style: "direct",
                slot_count: 1,
                start_beat: start,
                end_beat: end,
            });
            expect(
                await db
                    .select()
                    .from(schema.timeline_slot_destinations)
                    .where(
                        eq(
                            schema.timeline_slot_destinations.transition_id,
                            result.transitionId,
                        ),
                    )
                    .all(),
            ).toEqual([
                expect.objectContaining({
                    transition_id: result.transitionId,
                    slot_index: 0,
                    x: at[0],
                    y: at[1],
                }),
            ]);
            expect(
                await db
                    .select()
                    .from(schema.timeline_assignments)
                    .where(
                        eq(
                            schema.timeline_assignments.transition_id,
                            result.transitionId,
                        ),
                    )
                    .all(),
            ).toEqual([
                expect.objectContaining({
                    marcher_id: marcherId,
                    slot_index: 0,
                    start_beat: start,
                    end_beat: end,
                    layer: 1,
                }),
            ]);

            // Nothing jumps: the marcher holds where it was at the range start, and is where it
            // was up to then; nobody else moves
            const r = await resolverOf(db);
            for (let b = 0; b <= start; b += 0.5)
                expect(r.positionAt(marcherId, b)).toEqual(
                    r0.positionAt(marcherId, b),
                );
            for (let b = start; b <= end; b += 0.5)
                expect(r.positionAt(marcherId, b)).toEqual(at);
            expect(
                others.map((id) => beats.map((b) => r.positionAt(id, b))),
            ).toEqual(othersBefore);

            const undo = await performUndo(db);
            expect(undo.success, undo.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(before);
            const redo = await performRedo(db);
            expect(redo.success, redo.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(after);
        });

        it("for a marcher where it has no assignment: layer 0", async ({
            db,
            marchersAndPages: _,
        }) => {
            const timeline = await converted(db);
            const marcherId = (await db.select().from(schema.marchers).get())!
                .id;
            const result = await createTrack({
                db,
                target: { kind: "marcher", marcherId },
                startBeat: timeline.end_beat,
                endBeat: timeline.end_beat + 4,
            });
            expect(result.layer).toBe(0);
            // And a second track over it steals at layer 1
            const second = await createTrack({
                db,
                target: { kind: "marcher", marcherId },
                startBeat: timeline.end_beat + 1,
                endBeat: timeline.end_beat + 2,
            });
            expect(second.layer).toBe(1);
        });

        it("for a shape: the selected marchers fill its slots in id order", async ({
            db,
            marchersAndPages: _,
        }) => {
            const timeline = await converted(db);
            const shapeId = await addShape(db, {
                kind: "line",
                geometry: {
                    points: [
                        [0, 0],
                        [40, 0],
                    ],
                },
            });
            const ids = (
                await db
                    .select({ id: schema.marchers.id })
                    .from(schema.marchers)
                    .orderBy(asc(schema.marchers.id))
                    .all()
            )
                .map((m) => m.id)
                .slice(0, 3);
            const before = await dataOf(db);
            const start = 2;
            const end = timeline.end_beat + 2;
            const result = await createTrack({
                db,
                target: {
                    kind: "shape",
                    shapeId,
                    marcherIds: [ids[2]!, ids[0]!, ids[1]!],
                },
                startBeat: start,
                endBeat: end,
            });
            expect(result.layer).toBe(1);
            expect(
                await db
                    .select()
                    .from(schema.timeline_transitions)
                    .where(
                        eq(schema.timeline_transitions.id, result.transitionId),
                    )
                    .get(),
            ).toMatchObject({
                timeline_id: result.timelineId,
                dest_shape_id: shapeId,
                path_style: "direct",
                slot_count: 3,
                start_beat: start,
                end_beat: end,
            });
            const assigned = await db
                .select()
                .from(schema.timeline_assignments)
                .where(
                    eq(
                        schema.timeline_assignments.transition_id,
                        result.transitionId,
                    ),
                )
                .orderBy(asc(schema.timeline_assignments.slot_index))
                .all();
            expect(assigned.map((a) => [a.marcher_id, a.slot_index])).toEqual([
                [ids[0], 0],
                [ids[1], 1],
                [ids[2], 2],
            ]);
            // They arrive on the line, in slot order
            const r = await resolverOf(db);
            expect(r.positionAt(ids[0]!, end)).toEqual([0, 0]);
            expect(r.positionAt(ids[2]!, end)).toEqual([40, 0]);

            const after = await dataOf(db);
            expect((await performUndo(db)).success).toBe(true);
            expect(await dataOf(db)).toEqual(before);
            expect((await performRedo(db)).success).toBe(true);
            expect(await dataOf(db)).toEqual(after);
        });

        it("refuses more marchers than a block holds (E-T4), a bad range, and an empty shape selection", async ({
            db,
            marchersAndPages: _,
        }) => {
            await converted(db);
            const shapeId = await addShape(db, {
                kind: "block",
                geometry: {
                    origin: [0, 0],
                    rows: 1,
                    cols: 2,
                    spacing: [2, 2],
                },
            });
            const ids = (
                await db
                    .select({ id: schema.marchers.id })
                    .from(schema.marchers)
            ).map((m) => m.id);
            const error = await expectRefused(db, "E-T4", () =>
                createTrack({
                    db,
                    target: {
                        kind: "shape",
                        shapeId,
                        marcherIds: ids.slice(0, 3),
                    },
                    startBeat: 1,
                    endBeat: 5,
                }),
            );
            expect(error.message).toContain("room for 2");
            await expectRefused(db, "E-ARGS", () =>
                createTrack({
                    db,
                    target: { kind: "shape", shapeId, marcherIds: [] },
                    startBeat: 1,
                    endBeat: 5,
                }),
            );
            await expectRefused(db, "E-ARGS", () =>
                createTrack({
                    db,
                    target: { kind: "marcher", marcherId: ids[0]! },
                    startBeat: 5,
                    endBeat: 5,
                }),
            );
            await expectRefused(db, "E-ARGS", () =>
                createTrack({
                    db,
                    target: { kind: "marcher", marcherId: 99999 },
                    startBeat: 1,
                    endBeat: 5,
                }),
            );
            // Two fit
            await createTrack({
                db,
                target: { kind: "shape", shapeId, marcherIds: ids.slice(0, 2) },
                startBeat: 1,
                endBeat: 5,
            });
        });
    });

    describe("history", () => {
        const testWithHistory = getTestWithHistory(it, TABLES);
        testWithHistory(
            "a shift and a Create Track are one undo group each",
            async ({ db, marchersAndPages: _, expectNumberOfChanges }) => {
                await convertPagesToTimeline(db);
                const timeline = (await db
                    .select()
                    .from(schema.timelines)
                    .get())!;
                const marcherId = (await db
                    .select()
                    .from(schema.marchers)
                    .get())!.id;
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await shiftTimeline({ db, timelineId: timeline.id, delta: 2 });
                await createTrack({
                    db,
                    target: { kind: "marcher", marcherId },
                    startBeat: 4,
                    endBeat: 8,
                });
                await shiftTimeline({ db, timelineId: timeline.id, delta: -1 });
                await expectNumberOfChanges.test(db, 3, state);
            },
        );
    });
});
