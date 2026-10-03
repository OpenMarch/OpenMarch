import { describe, expect } from "vitest";
import { asc, eq, getTableName } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { transactionWithHistory } from "../history";
import {
    BULK_INSERT_ROWS,
    TimelineWriteError,
    chunked,
    createTimelineAssignmentsInTransaction,
    createTimelineShapesInTransaction,
    createTimelineTransitionsInTransaction,
    createTimelinesInTransaction,
    deleteTimelineAssignmentsInTransaction,
    deleteTimelineShapesInTransaction,
    deleteTimelineTransitionsInTransaction,
    deleteTimelinesInTransaction,
    insertTimelineAssignmentsBulkInTransaction,
    setTimelineSlotDestinationsInTransaction,
    setTimelineTransitionDestinationInTransaction,
    updateMarcherHomesInTransaction,
    updateTimelineAssignmentsInTransaction,
    updateTimelineShapesInTransaction,
    updateTimelineSlotDestinationInTransaction,
    updateTimelineTransitionsInTransaction,
    updateTimelinesInTransaction,
} from "../index";

/**
 * The timeline db-functions (docs/timeline/phases/04-write-path-undo.md P4.4, P4.6): happy paths,
 * rejected writes that leave the database unchanged, shape/individual switches in one edit, and
 * child-first deletes (C-1). Each test runs through the history fixture, which undoes and redoes
 * everything the test did and compares whole rows of these tables.
 */

const tablesToCheck = [
    schema.marchers,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

const snapshot = async (db: DbConnection) => {
    const out: Record<string, unknown[]> = {};
    for (const table of tablesToCheck)
        out[getTableName(table)] = await db.select().from(table).all();
    return out;
};

const LINE = {
    kind: "line",
    geometry: {
        points: [
            [0, 0],
            [10, 0],
        ],
    },
} as const;

/** Runs `write` and expects a `TimelineWriteError` with `code`; the database must be unchanged. */
const expectRejected = async (
    db: DbConnection,
    code: string,
    write: () => Promise<unknown>,
) => {
    const before = await snapshot(db);
    const error = await write().then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(error, "expected the write to be rejected").toBeInstanceOf(
        TimelineWriteError,
    );
    expect((error as TimelineWriteError).code).toBe(code);
    expect(await snapshot(db)).toEqual(before);
};

/**
 * One edit: 3 marchers, timelines [0, 16), [16, 32) and an empty [32, 48), a line shape,
 * transition 1 (shape, 2 slots) spanning the first timeline and transition 2 (individual points,
 * 2 slots) spanning the second (C-11). Returns the created ids.
 */
const seed = (db: DbConnection) =>
    transactionWithHistory(db, "seed", async (tx) => {
        await tx.insert(schema.marchers).values([
            { id: 1, section: "Brass", drill_prefix: "B", drill_order: 1 },
            { id: 2, section: "Brass", drill_prefix: "B", drill_order: 2 },
            { id: 3, section: "Brass", drill_prefix: "B", drill_order: 3 },
        ]);
        const [timeline, timeline2, emptyTimeline] =
            await createTimelinesInTransaction({
                newTimelines: [
                    { name: "Opener", startBeat: 0, endBeat: 16 },
                    { startBeat: 16, endBeat: 32 },
                    { startBeat: 32, endBeat: 48 },
                ],
                tx,
            });
        const [shape] = await createTimelineShapesInTransaction({
            newShapes: [LINE],
            tx,
        });
        const [t1, t2] = await createTimelineTransitionsInTransaction({
            newTransitions: [
                {
                    timelineId: timeline!.id,
                    startBeat: 0,
                    endBeat: 16,
                    slotCount: 2,
                    destination: { kind: "shape", shapeId: shape!.id },
                },
                {
                    timelineId: timeline2!.id,
                    startBeat: 16,
                    endBeat: 32,
                    slotCount: 2,
                    destination: {
                        kind: "individual",
                        points: [
                            [1, 1],
                            [2, 2],
                        ],
                    },
                },
            ],
            tx,
        });
        const assignments = await createTimelineAssignmentsInTransaction({
            newAssignments: [
                {
                    marcherId: 1,
                    transitionId: t1!.id,
                    slotIndex: 0,
                    startBeat: 0,
                    endBeat: 16,
                },
                {
                    marcherId: 2,
                    transitionId: t1!.id,
                    slotIndex: 1,
                    startBeat: 4,
                    endBeat: 16,
                },
                {
                    marcherId: 1,
                    transitionId: t2!.id,
                    slotIndex: 0,
                    startBeat: 16,
                    endBeat: 32,
                },
            ],
            tx,
        });
        return {
            timelineId: timeline!.id,
            timeline2Id: timeline2!.id,
            emptyTimelineId: emptyTimeline!.id,
            shapeId: shape!.id,
            t1: t1!.id,
            t2: t2!.id,
            assignmentIds: assignments.map((a) => a.id),
        };
    });

describeDbTests("timeline db-functions", (it) => {
    const testWithHistory = getTestWithHistory(it, tablesToCheck);

    describe("timelines", () => {
        testWithHistory("create, update, delete", async ({ db }) => {
            await seed(db);
            const created = await transactionWithHistory(db, "c", (tx) =>
                createTimelinesInTransaction({
                    newTimelines: [{ startBeat: 64, endBeat: 96 }],
                    tx,
                }),
            );
            expect(created[0]).toMatchObject({ name: null, start_beat: 64 });
            const id = created[0]!.id;
            const updated = await transactionWithHistory(db, "u", (tx) =>
                updateTimelinesInTransaction({
                    modifiedTimelines: [{ id, name: "Closer", endBeat: 128 }],
                    tx,
                }),
            );
            expect(updated[0]).toMatchObject({ name: "Closer", end_beat: 128 });
            const deleted = await transactionWithHistory(db, "d", (tx) =>
                deleteTimelinesInTransaction({
                    timelineIds: new Set([id]),
                    tx,
                }),
            );
            expect(deleted).toHaveLength(1);
        });

        testWithHistory(
            "a new range moves its transitions and their anchored assignments (C-11)",
            async ({ db }) => {
                const { timeline2Id, t2 } = await seed(db);
                await transactionWithHistory(db, "u", (tx) =>
                    updateTimelinesInTransaction({
                        modifiedTimelines: [{ id: timeline2Id, endBeat: 40 }],
                        tx,
                    }),
                );
                const after = await snapshot(db);
                expect(after.timeline_transitions).toContainEqual(
                    expect.objectContaining({
                        id: t2,
                        start_beat: 16,
                        end_beat: 40,
                    }),
                );
                expect(after.timeline_assignments).toContainEqual(
                    expect.objectContaining({
                        transition_id: t2,
                        start_beat: 16,
                        end_beat: 40,
                    }),
                );
            },
        );

        testWithHistory(
            "rejects a range that strands an assignment",
            async ({ db }) => {
                const { timelineId } = await seed(db);
                // Marcher 2's row [4, 16) isn't anchored at the start, so it would be left outside
                await expectRejected(db, "E-A1", () =>
                    transactionWithHistory(db, "u", (tx) =>
                        updateTimelinesInTransaction({
                            modifiedTimelines: [
                                { id: timelineId, startBeat: 8 },
                            ],
                            tx,
                        }),
                    ),
                );
                await expectRejected(db, "E-DB", () =>
                    transactionWithHistory(db, "c", (tx) =>
                        createTimelinesInTransaction({
                            newTimelines: [{ startBeat: 10, endBeat: 10 }],
                            tx,
                        }),
                    ),
                );
            },
        );
    });

    describe("shapes", () => {
        testWithHistory(
            "create normalizes a circle start angle",
            async ({ db }) => {
                await seed(db);
                const [shape] = await transactionWithHistory(db, "c", (tx) =>
                    createTimelineShapesInTransaction({
                        newShapes: [
                            {
                                kind: "circle",
                                geometry: {
                                    center: [0, 0],
                                    radius: 5,
                                    start_angle: 7,
                                    clockwise: true,
                                },
                            },
                        ],
                        tx,
                    }),
                );
                const geometry = JSON.parse(shape!.geometry) as {
                    start_angle: number;
                };
                expect(geometry.start_angle).toBeCloseTo(7 - 2 * Math.PI, 12);
                expect(geometry.start_angle).toBeGreaterThanOrEqual(0);
                expect(geometry.start_angle).toBeLessThan(2 * Math.PI);
            },
        );

        testWithHistory("update and delete", async ({ db }) => {
            await seed(db);
            const [shape] = await transactionWithHistory(db, "c", (tx) =>
                createTimelineShapesInTransaction({
                    newShapes: [
                        {
                            kind: "box",
                            geometry: { origin: [0, 0], width: 4, height: 2 },
                        },
                    ],
                    tx,
                }),
            );
            const [updated] = await transactionWithHistory(db, "u", (tx) =>
                updateTimelineShapesInTransaction({
                    modifiedShapes: [
                        {
                            id: shape!.id,
                            name: "Box",
                            geometry: {
                                origin: [0, 0],
                                width: 8,
                                height: 2,
                            },
                        },
                    ],
                    tx,
                }),
            );
            expect(updated).toMatchObject({ name: "Box" });
            const deleted = await transactionWithHistory(db, "d", (tx) =>
                deleteTimelineShapesInTransaction({
                    shapeIds: new Set([shape!.id]),
                    tx,
                }),
            );
            expect(deleted).toHaveLength(1);
        });

        testWithHistory(
            "rejections leave the database unchanged",
            async ({ db }) => {
                const { shapeId } = await seed(db);
                await expectRejected(db, "E-S1", () =>
                    transactionWithHistory(db, "c", (tx) =>
                        createTimelineShapesInTransaction({
                            newShapes: [
                                LINE,
                                {
                                    kind: "line",
                                    geometry: {
                                        points: [
                                            [0, 0],
                                            [0, 0],
                                        ],
                                    },
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                await expectRejected(db, "E-S1", () =>
                    transactionWithHistory(db, "u", (tx) =>
                        updateTimelineShapesInTransaction({
                            modifiedShapes: [
                                {
                                    id: shapeId,
                                    geometry: {
                                        points: [[0, 0]],
                                    } as never,
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                await expectRejected(db, "E-ARGS", () =>
                    transactionWithHistory(db, "u", (tx) =>
                        updateTimelineShapesInTransaction({
                            modifiedShapes: [{ id: shapeId, kind: "freehand" }],
                            tx,
                        }),
                    ),
                );
                // A shape a transition uses can't be deleted
                await expectRejected(db, "E-DB", () =>
                    transactionWithHistory(db, "d", (tx) =>
                        deleteTimelineShapesInTransaction({
                            shapeIds: new Set([shapeId]),
                            tx,
                        }),
                    ),
                );
            },
        );
    });

    describe("transitions", () => {
        testWithHistory("create, update, delete", async ({ db }) => {
            const { emptyTimelineId, shapeId } = await seed(db);
            const [created] = await transactionWithHistory(db, "c", (tx) =>
                createTimelineTransitionsInTransaction({
                    newTransitions: [
                        {
                            timelineId: emptyTimelineId,
                            startBeat: 32,
                            endBeat: 48,
                            slotCount: 2,
                            pathStyle: "arc",
                            pathParams: { bulge: 0.25 },
                            destination: { kind: "shape", shapeId },
                        },
                    ],
                    tx,
                }),
            );
            expect(created).toMatchObject({
                path_style: "arc",
                path_params: '{"bulge":0.25}',
            });
            const [updated] = await transactionWithHistory(db, "u", (tx) =>
                updateTimelineTransitionsInTransaction({
                    modifiedTransitions: [
                        {
                            id: created!.id,
                            pathStyle: "direct",
                            pathParams: null,
                            orderMode: "slot",
                            slotCount: 4,
                        },
                    ],
                    tx,
                }),
            );
            expect(updated).toMatchObject({
                path_style: "direct",
                path_params: null,
                order_mode: "slot",
                slot_count: 4,
                end_beat: 48,
            });
            const deleted = await transactionWithHistory(db, "d", (tx) =>
                deleteTimelineTransitionsInTransaction({
                    transitionIds: new Set([created!.id]),
                    tx,
                }),
            );
            expect(deleted).toHaveLength(1);
            // Its timeline had no other transition, so it went too (C-11)
            const timelines = await db.select().from(schema.timelines).all();
            expect(timelines.map((t) => t.id)).not.toContain(emptyTimelineId);
        });

        testWithHistory(
            "changing a shapeless slot count replaces its points",
            async ({ db }) => {
                const { t2 } = await seed(db);
                await transactionWithHistory(db, "u", (tx) =>
                    updateTimelineTransitionsInTransaction({
                        modifiedTransitions: [
                            {
                                id: t2,
                                slotCount: 3,
                                points: [
                                    [1, 1],
                                    [2, 2],
                                    [3, 3],
                                ],
                            },
                        ],
                        tx,
                    }),
                );
                const rows = await db
                    .select()
                    .from(schema.timeline_slot_destinations);
                expect(rows.filter((r) => r.transition_id === t2)).toHaveLength(
                    3,
                );
                await expectRejected(db, "E-ARGS", () =>
                    transactionWithHistory(db, "u", (tx) =>
                        updateTimelineTransitionsInTransaction({
                            modifiedTransitions: [{ id: t2, slotCount: 5 }],
                            tx,
                        }),
                    ),
                );
            },
        );

        testWithHistory(
            "a transition spans its timeline: another range is refused, none takes the timeline's (C-11)",
            async ({ db }) => {
                const { timelineId, shapeId } = await seed(db);
                await expectRejected(db, "E-ARGS", () =>
                    transactionWithHistory(db, "c", (tx) =>
                        createTimelineTransitionsInTransaction({
                            newTransitions: [
                                {
                                    timelineId,
                                    startBeat: 0,
                                    endBeat: 8,
                                    slotCount: 1,
                                    destination: { kind: "shape", shapeId },
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                // A second transition in the timeline shares its range
                const [second] = await transactionWithHistory(db, "c", (tx) =>
                    createTimelineTransitionsInTransaction({
                        newTransitions: [
                            {
                                timelineId,
                                slotCount: 1,
                                destination: { kind: "shape", shapeId },
                            },
                        ],
                        tx,
                    }),
                );
                expect(second).toMatchObject({
                    timeline_id: timelineId,
                    start_beat: 0,
                    end_beat: 16,
                });
            },
        );

        testWithHistory(
            "validator rejections leave the database unchanged",
            async ({ db }) => {
                const { emptyTimelineId, shapeId, t1, t2 } = await seed(db);
                const base = {
                    timelineId: emptyTimelineId,
                    startBeat: 32,
                    endBeat: 48,
                    slotCount: 2,
                };
                await expectRejected(db, "E-P1", () =>
                    transactionWithHistory(db, "c", (tx) =>
                        createTimelineTransitionsInTransaction({
                            newTransitions: [
                                {
                                    ...base,
                                    pathStyle: "arc",
                                    pathParams: { bulge: 0.9 },
                                    destination: { kind: "shape", shapeId },
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                await expectRejected(db, "E-D2", () =>
                    transactionWithHistory(db, "c", (tx) =>
                        createTimelineTransitionsInTransaction({
                            newTransitions: [
                                {
                                    ...base,
                                    destination: {
                                        kind: "individual",
                                        points: [[1, 1]],
                                    },
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                await expectRejected(db, "E-T5", () =>
                    transactionWithHistory(db, "c", (tx) =>
                        createTimelineTransitionsInTransaction({
                            newTransitions: [
                                {
                                    ...base,
                                    pathStyle: "follow_the_leader",
                                    pathParams: { waypoints: [] },
                                    destination: {
                                        kind: "individual",
                                        points: [
                                            [1, 1],
                                            [2, 2],
                                        ],
                                    },
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                // Changing the style without its params is an invalid (null) arc
                await expectRejected(db, "E-P1", () =>
                    transactionWithHistory(db, "u", (tx) =>
                        updateTimelineTransitionsInTransaction({
                            modifiedTransitions: [{ id: t1, pathStyle: "arc" }],
                            tx,
                        }),
                    ),
                );
                await expectRejected(db, "E-T5", () =>
                    transactionWithHistory(db, "u", (tx) =>
                        updateTimelineTransitionsInTransaction({
                            modifiedTransitions: [
                                {
                                    id: t2,
                                    pathStyle: "follow_the_leader",
                                    pathParams: { waypoints: [] },
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                await expectRejected(db, "E-ARGS", () =>
                    transactionWithHistory(db, "u", (tx) =>
                        updateTimelineTransitionsInTransaction({
                            modifiedTransitions: [
                                { id: 999, orderMode: "slot" },
                            ],
                            tx,
                        }),
                    ),
                );
            },
        );
    });

    describe("destinations", () => {
        testWithHistory(
            "shape to individual in one edit",
            async ({ db, expectNumberOfChanges }) => {
                const { t1 } = await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                const row = await transactionWithHistory(db, "switch", (tx) =>
                    setTimelineTransitionDestinationInTransaction({
                        transitionId: t1,
                        destination: {
                            kind: "individual",
                            points: [
                                [5, 5],
                                [6, 6],
                            ],
                        },
                        tx,
                    }),
                );
                expect(row.dest_shape_id).toBeNull();
                const rows = await db
                    .select()
                    .from(schema.timeline_slot_destinations);
                expect(rows.filter((d) => d.transition_id === t1)).toHaveLength(
                    2,
                );
                await expectNumberOfChanges.test(db, 1, state);
            },
        );

        testWithHistory(
            "individual to shape in one edit",
            async ({ db, expectNumberOfChanges }) => {
                const { t2, shapeId } = await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                const row = await transactionWithHistory(db, "switch", (tx) =>
                    setTimelineTransitionDestinationInTransaction({
                        transitionId: t2,
                        destination: { kind: "shape", shapeId },
                        tx,
                    }),
                );
                expect(row.dest_shape_id).toBe(shapeId);
                const rows = await db
                    .select()
                    .from(schema.timeline_slot_destinations);
                expect(rows.filter((d) => d.transition_id === t2)).toHaveLength(
                    0,
                );
                await expectNumberOfChanges.test(db, 1, state);
            },
        );

        testWithHistory("set and move individual points", async ({ db }) => {
            const { t1, t2 } = await seed(db);
            const points = await transactionWithHistory(db, "set", (tx) =>
                setTimelineSlotDestinationsInTransaction({
                    transitionId: t2,
                    points: [
                        [7, 7],
                        [8, 8],
                    ],
                    tx,
                }),
            );
            expect(points.map((p) => [p.x, p.y])).toEqual([
                [7, 7],
                [8, 8],
            ]);
            const moved = await transactionWithHistory(db, "move", (tx) =>
                updateTimelineSlotDestinationInTransaction({
                    transitionId: t2,
                    slotIndex: 1,
                    point: [9, 9],
                    tx,
                }),
            );
            expect([moved.x, moved.y]).toEqual([9, 9]);
            await expectRejected(db, "E-D2", () =>
                transactionWithHistory(db, "move", (tx) =>
                    updateTimelineSlotDestinationInTransaction({
                        transitionId: t2,
                        slotIndex: 1,
                        point: [Infinity, 0],
                        tx,
                    }),
                ),
            );
            await expectRejected(db, "E-D2", () =>
                transactionWithHistory(db, "set", (tx) =>
                    setTimelineSlotDestinationsInTransaction({
                        transitionId: t2,
                        points: [
                            [1e7, 0],
                            [0, 0],
                        ],
                        tx,
                    }),
                ),
            );
            // A shaped transition has no points to set
            await expectRejected(db, "E-ARGS", () =>
                transactionWithHistory(db, "set", (tx) =>
                    setTimelineSlotDestinationsInTransaction({
                        transitionId: t1,
                        points: [
                            [1, 1],
                            [2, 2],
                        ],
                        tx,
                    }),
                ),
            );
            await expectRejected(db, "E-D2", () =>
                transactionWithHistory(db, "switch", (tx) =>
                    setTimelineTransitionDestinationInTransaction({
                        transitionId: t1,
                        destination: { kind: "individual", points: [[1, 1]] },
                        tx,
                    }),
                ),
            );
        });
    });

    describe("assignments", () => {
        testWithHistory("create, update, delete", async ({ db }) => {
            const { t2, assignmentIds } = await seed(db);
            const [created] = await transactionWithHistory(db, "c", (tx) =>
                createTimelineAssignmentsInTransaction({
                    newAssignments: [
                        {
                            marcherId: 3,
                            transitionId: t2,
                            slotIndex: 1,
                            startBeat: 16,
                            endBeat: 24,
                            layer: 1,
                        },
                    ],
                    tx,
                }),
            );
            expect(created).toMatchObject({ layer: 1, marcher_id: 3 });
            const [updated] = await transactionWithHistory(db, "u", (tx) =>
                updateTimelineAssignmentsInTransaction({
                    modifiedAssignments: [
                        { id: created!.id, startBeat: 18, endBeat: 26 },
                    ],
                    tx,
                }),
            );
            expect(updated).toMatchObject({ start_beat: 18, end_beat: 26 });
            const deleted = await transactionWithHistory(db, "d", (tx) =>
                deleteTimelineAssignmentsInTransaction({
                    assignmentIds: new Set([created!.id, assignmentIds[0]!]),
                    tx,
                }),
            );
            expect(deleted).toHaveLength(2);
        });

        testWithHistory(
            "rejections leave the database unchanged",
            async ({ db }) => {
                const { t1, assignmentIds } = await seed(db);
                // A slot outside the transition: the trigger's message is "E-A1/E-A2", and the
                // write path reports that combined code rather than guessing one half
                await expectRejected(db, "E-A1/E-A2", () =>
                    transactionWithHistory(db, "c", (tx) =>
                        createTimelineAssignmentsInTransaction({
                            newAssignments: [
                                {
                                    marcherId: 3,
                                    transitionId: t1,
                                    slotIndex: 5,
                                    startBeat: 0,
                                    endBeat: 8,
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                // E-A3: marcher 1 is already assigned over [0, 16) at layer 0
                await expectRejected(db, "E-A3", () =>
                    transactionWithHistory(db, "u", (tx) =>
                        updateTimelineAssignmentsInTransaction({
                            modifiedAssignments: [
                                { id: assignmentIds[1]!, marcherId: 1 },
                            ],
                            tx,
                        }),
                    ),
                );
                await expectRejected(db, "E-ARGS", () =>
                    transactionWithHistory(db, "u", (tx) =>
                        updateTimelineAssignmentsInTransaction({
                            modifiedAssignments: [{ id: 999, layer: 1 }],
                            tx,
                        }),
                    ),
                );
            },
        );

        testWithHistory(
            "bulk insert (P9.8): chunked multi-row inserts, checked row by row",
            async ({ db }) => {
                const { emptyTimelineId, t2 } = await seed(db);
                // More than two chunks, with as many slot destinations.
                const n = BULK_INSERT_ROWS * 2 + 7;
                const ids = Array.from({ length: n }, (_, i) => 100 + i);
                const inserted = await transactionWithHistory(
                    db,
                    "bulk",
                    async (tx) => {
                        for (const chunk of chunked(ids))
                            await tx.insert(schema.marchers).values(
                                chunk.map((id) => ({
                                    id,
                                    section: "Brass",
                                    drill_prefix: "X",
                                    drill_order: id,
                                })),
                            );
                        const [t] =
                            await createTimelineTransitionsInTransaction({
                                newTransitions: [
                                    {
                                        timelineId: emptyTimelineId,
                                        startBeat: 32,
                                        endBeat: 48,
                                        slotCount: n,
                                        destination: {
                                            kind: "individual",
                                            points: ids.map((id) => [id, 0]),
                                        },
                                    },
                                ],
                                tx,
                            });
                        const count =
                            await insertTimelineAssignmentsBulkInTransaction({
                                newAssignments: ids.map((marcherId, slot) => ({
                                    marcherId,
                                    transitionId: t!.id,
                                    slotIndex: slot,
                                    startBeat: 32,
                                    endBeat: 48,
                                })),
                                tx,
                            });
                        return { count, transitionId: t!.id };
                    },
                );
                expect(inserted.count).toBe(n);
                const rows = await db
                    .select()
                    .from(schema.timeline_assignments)
                    .where(
                        eq(
                            schema.timeline_assignments.transition_id,
                            inserted.transitionId,
                        ),
                    )
                    .orderBy(asc(schema.timeline_assignments.id))
                    .all();
                expect(rows.map((r) => [r.marcher_id, r.slot_index])).toEqual(
                    ids.map((id, slot) => [id, slot]),
                );
                const destinations = await db
                    .select()
                    .from(schema.timeline_slot_destinations)
                    .where(
                        eq(
                            schema.timeline_slot_destinations.transition_id,
                            inserted.transitionId,
                        ),
                    )
                    .all();
                expect(destinations).toHaveLength(n);

                // Two rows of one statement that overlap: the row trigger sees the first.
                await expectRejected(db, "E-A3", () =>
                    transactionWithHistory(db, "overlap", (tx) =>
                        insertTimelineAssignmentsBulkInTransaction({
                            newAssignments: [
                                {
                                    marcherId: 3,
                                    transitionId: t2,
                                    slotIndex: 1,
                                    startBeat: 16,
                                    endBeat: 24,
                                },
                                {
                                    marcherId: 3,
                                    transitionId: t2,
                                    slotIndex: 1,
                                    startBeat: 20,
                                    endBeat: 28,
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                await expectRejected(db, "E-A1/E-A2", () =>
                    transactionWithHistory(db, "outside", (tx) =>
                        insertTimelineAssignmentsBulkInTransaction({
                            newAssignments: [
                                {
                                    marcherId: 3,
                                    transitionId: t2,
                                    slotIndex: 9,
                                    startBeat: 16,
                                    endBeat: 24,
                                },
                            ],
                            tx,
                        }),
                    ),
                );
            },
        );
    });

    describe("child-first deletes (C-1)", () => {
        testWithHistory(
            "a timeline with transitions, assignments and destinations",
            async ({ db, expectNumberOfChanges }) => {
                const { timelineId, timeline2Id, emptyTimelineId, shapeId } =
                    await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                const deleted = await transactionWithHistory(
                    db,
                    "delete",
                    (tx) =>
                        deleteTimelinesInTransaction({
                            timelineIds: new Set([timelineId, timeline2Id]),
                            tx,
                        }),
                );
                expect(deleted).toHaveLength(2);
                const after = await snapshot(db);
                expect(after.timelines).toEqual([
                    expect.objectContaining({ id: emptyTimelineId }),
                ]);
                expect(after.timeline_transitions).toHaveLength(0);
                expect(after.timeline_assignments).toHaveLength(0);
                expect(after.timeline_slot_destinations).toHaveLength(0);
                // Shapes are shared and stay
                expect(after.timeline_shapes).toHaveLength(1);
                expect(after.timeline_shapes[0]).toMatchObject({ id: shapeId });
                await expectNumberOfChanges.test(db, 1, state);
            },
        );

        testWithHistory(
            "a transition with assignments and destinations",
            async ({ db, expectNumberOfChanges }) => {
                const { t2 } = await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await transactionWithHistory(db, "delete", (tx) =>
                    deleteTimelineTransitionsInTransaction({
                        transitionIds: new Set([t2]),
                        tx,
                    }),
                );
                const after = await snapshot(db);
                expect(after.timeline_transitions).toHaveLength(1);
                expect(after.timeline_assignments).toHaveLength(2);
                expect(after.timeline_slot_destinations).toHaveLength(0);
                // Its timeline had no other transition, so it went too (C-11)
                expect(after.timelines).toHaveLength(2);
                await expectNumberOfChanges.test(db, 1, state);
            },
        );
    });

    describe("marcher home", () => {
        testWithHistory(
            "update round-trips",
            async ({ db, expectNumberOfChanges }) => {
                await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                const [row] = await transactionWithHistory(db, "home", (tx) =>
                    updateMarcherHomesInTransaction({
                        modifiedHomes: [{ marcherId: 2, home: [12.5, -3] }],
                        tx,
                    }),
                );
                expect(row).toMatchObject({ home_x: 12.5, home_y: -3 });
                await expectNumberOfChanges.test(db, 1, state);
            },
        );

        testWithHistory(
            "rejects a non-finite or out-of-range home",
            async ({ db }) => {
                await seed(db);
                for (const home of [
                    [NaN, 0],
                    [0, 1e6 + 1],
                ] as [number, number][])
                    await expectRejected(db, "E-N2", () =>
                        transactionWithHistory(db, "home", (tx) =>
                            updateMarcherHomesInTransaction({
                                modifiedHomes: [
                                    { marcherId: 1, home: [1, 1] },
                                    { marcherId: 2, home },
                                ],
                                tx,
                            }),
                        ),
                    );
                await expectRejected(db, "E-ARGS", () =>
                    transactionWithHistory(db, "home", (tx) =>
                        updateMarcherHomesInTransaction({
                            modifiedHomes: [{ marcherId: 99, home: [1, 1] }],
                            tx,
                        }),
                    ),
                );
            },
        );
    });
});
