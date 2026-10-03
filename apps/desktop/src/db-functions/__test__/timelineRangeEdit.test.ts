import { describe, expect } from "vitest";
import { eq, getTableName } from "drizzle-orm";
import type { ChangeBatch } from "@openmarch/core";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import type { DbTransaction } from "../types";
import { getTestWithHistory } from "@/test/history";
import { performRedo, performUndo, transactionWithHistory } from "../history";
import {
    TimelineCommitViolationError,
    TimelineWriteError,
    createTimelineAssignmentsInTransaction,
    createTimelineShapesInTransaction,
    createTimelineTransitionsInTransaction,
    createTimelinesInTransaction,
    deleteTimelineTransitionsInTransaction,
    mapDbErrors,
    setTimelineTransitionDestinationInTransaction,
    setTimelineTransitionRangeInTransaction,
    subscribeTimelineChanges,
    updateTimelineShapesInTransaction,
    updateTimelineTransitionsInTransaction,
} from "../index";

/**
 * The R-E1 range procedure and the write-path storage tests (docs/timeline/phases/
 * 04-write-path-undo.md P4.5, P4.7): QA-DB-11, -12, -13, -24, -25 and -29 through the db-functions
 * and the write wrapper, QA-UNDO-2a to -2g on the app's real undo, and the follow-ups from the
 * PR #10 review (E-T3/E-T4, E-A2, a row-trigger E-T6 and duplicate ids).
 *
 * QA-DB-26 (a label update and an invalid insert in one edit roll back together) is in
 * `timelineChanges.test.ts`; QA-DB-13b (a plain range update that strands a row) is in
 * `timelineWrites.test.ts`.
 */

const tablesToCheck = [
    schema.marchers,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

/** The data tables, plus the history tables that a rejected edit must also leave alone. */
const snapshot = async (db: DbConnection) => {
    const data: Record<string, unknown[]> = {};
    for (const table of tablesToCheck)
        data[getTableName(table)] = await db.select().from(table).all();
    return {
        data,
        undo: await db.select().from(schema.history_undo).all(),
        redo: await db.select().from(schema.history_redo).all(),
        stats: await db.select().from(schema.history_stats).all(),
    };
};

/** The data tables only, for round trips (undo and redo change the history tables). */
const dataOf = async (db: DbConnection) => (await snapshot(db)).data;

/** `[start, end)` of every assignment, by id. */
const ranges = async (db: DbConnection) =>
    Object.fromEntries(
        (
            await db
                .select()
                .from(schema.timeline_assignments)
                .orderBy(schema.timeline_assignments.id)
                .all()
        ).map((a) => [a.id, [a.start_beat, a.end_beat]]),
    );

const transitionRange = async (db: DbConnection, id: number) => {
    const row = await db
        .select()
        .from(schema.timeline_transitions)
        .where(eq(schema.timeline_transitions.id, id))
        .get();
    return [row!.start_beat, row!.end_beat];
};

/** Runs `write`, expects a `TimelineWriteError` with `code`, and that nothing changed. */
const expectRejected = async (
    db: DbConnection,
    code: string,
    write: () => Promise<unknown>,
): Promise<TimelineWriteError> => {
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
    return error as TimelineWriteError;
};

/** Records every batch delivered while `run` executes. */
const recordBatches = async (run: () => Promise<unknown>) => {
    const batches: ChangeBatch[] = [];
    const unsubscribe = subscribeTimelineChanges((event) => {
        if (event.kind === "batch") batches.push(event.batch);
    });
    try {
        await run();
    } finally {
        unsubscribe();
    }
    return batches;
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

const block = (rows: number, cols: number) =>
    ({
        kind: "block",
        geometry: { origin: [0, 0], rows, cols, spacing: [2, 2] },
    }) as const;

/**
 * One edit: 4 marchers, a timeline [8, 24), a line shape, and transition T spanning it (C-11) with
 * 4 slots on the line. Its assignments (ids 1 to 4):
 *
 * - 1: marcher 1, `[8, 24)`, anchored at both ends;
 * - 2: marcher 2, `[12, 20)`, unanchored;
 * - 3: marcher 3, `[8, 14)`, anchored at the start;
 * - 4: marcher 4, `[16, 24)`, anchored at the end, in slot 3.
 */
const seed = (db: DbConnection) =>
    transactionWithHistory(db, "seed", async (tx) => {
        await tx.insert(schema.marchers).values(
            [1, 2, 3, 4].map((id) => ({
                id,
                section: "Brass",
                drill_prefix: "B",
                drill_order: id,
            })),
        );
        const [timeline] = await createTimelinesInTransaction({
            newTimelines: [{ name: "Opener", startBeat: 8, endBeat: 24 }],
            tx,
        });
        const [shape] = await createTimelineShapesInTransaction({
            newShapes: [LINE],
            tx,
        });
        const [t] = await createTimelineTransitionsInTransaction({
            newTransitions: [
                {
                    timelineId: timeline!.id,
                    startBeat: 8,
                    endBeat: 24,
                    slotCount: 4,
                    destination: { kind: "shape", shapeId: shape!.id },
                },
            ],
            tx,
        });
        const rows: [number, number, number][] = [
            [1, 8, 24],
            [2, 12, 20],
            [3, 8, 14],
            [4, 16, 24],
        ];
        await createTimelineAssignmentsInTransaction({
            newAssignments: rows.map(([marcher, start, end], slot) => ({
                marcherId: marcher,
                transitionId: t!.id,
                slotIndex: slot,
                startBeat: start,
                endBeat: end,
            })),
            tx,
        });
        return { timelineId: timeline!.id, shapeId: shape!.id, t: t!.id };
    });

/** A new timeline over `[start, end)`, for a transition that spans it (C-11). */
const timelineOver = async (tx: DbTransaction, start: number, end: number) =>
    (
        await createTimelinesInTransaction({
            newTimelines: [{ startBeat: start, endBeat: end }],
            tx,
        })
    )[0]!.id;

/** One edit: the R-E1 procedure on transition `id`. */
const rangeEdit = (db: DbConnection, id: number, start: number, end: number) =>
    transactionWithHistory(db, "setTimelineTransitionRange", (tx) =>
        setTimelineTransitionRangeInTransaction({
            tx,
            transitionId: id,
            start,
            end,
        }),
    );

describeDbTests("timeline range edit (R-E1) and write-path storage", (it) => {
    const testWithHistory = getTestWithHistory(it, tablesToCheck);

    describe("the R-E1 procedure (QA-DB-11, -12, -13, -24)", () => {
        testWithHistory(
            "QA-DB-11: stretching moves the anchored rows and leaves the others",
            async ({ db }) => {
                const { t } = await seed(db);
                const row = await rangeEdit(db, t, 0, 24);
                expect(row).toMatchObject({ start_beat: 0, end_beat: 24 });
                expect(await transitionRange(db, t)).toEqual([0, 24]);
                expect(await ranges(db)).toEqual({
                    1: [0, 24],
                    2: [12, 20],
                    3: [0, 14],
                    4: [16, 24],
                });
            },
        );

        testWithHistory(
            "QA-DB-12: a shrink that leaves an unanchored row outside is rejected with E-A1",
            async ({ db }) => {
                const { t } = await seed(db);
                // Rows 1 and 4 move to end at 18; row 2 [12, 20) is stranded at step 3
                const error = await expectRejected(db, "E-A1", () =>
                    rangeEdit(db, t, 8, 18),
                );
                expect(error.message).toMatch(/strands an assignment/);
            },
        );

        testWithHistory(
            "QA-DB-13: moving the start past an anchored row's end is rejected (empty range)",
            async ({ db }) => {
                const { t } = await seed(db);
                // Row 3 [8, 14) would become [16, 14): the I-A6 CHECK, which has no spec code
                const error = await expectRejected(db, "E-DB", () =>
                    rangeEdit(db, t, 16, 24),
                );
                expect(error.message).toMatch(/CHECK constraint failed/);
            },
        );

        testWithHistory(
            "QA-DB-24: stretching into a same-layer neighbor is rejected with E-A3",
            async ({ db }) => {
                const { shapeId, t } = await seed(db);
                await transactionWithHistory(db, "neighbor", async (tx) => {
                    const [u] = await createTimelineTransitionsInTransaction({
                        newTransitions: [
                            {
                                timelineId: await timelineOver(tx, 24, 40),
                                startBeat: 24,
                                endBeat: 40,
                                slotCount: 1,
                                destination: { kind: "shape", shapeId },
                            },
                        ],
                        tx,
                    });
                    await createTimelineAssignmentsInTransaction({
                        newAssignments: [
                            {
                                marcherId: 1,
                                transitionId: u!.id,
                                slotIndex: 0,
                                startBeat: 24,
                                endBeat: 40,
                            },
                        ],
                        tx,
                    });
                });
                await expectRejected(db, "E-A3", () => rangeEdit(db, t, 8, 32));
            },
        );

        testWithHistory(
            "the timeline and every transition in it move together (C-11)",
            async ({ db }) => {
                const { timelineId, shapeId, t } = await seed(db);
                const [sibling] = await transactionWithHistory(
                    db,
                    "sibling",
                    (tx) =>
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
                await rangeEdit(db, t, 4, 30);
                expect(await transitionRange(db, t)).toEqual([4, 30]);
                expect(await transitionRange(db, sibling!.id)).toEqual([4, 30]);
                const timeline = await db
                    .select()
                    .from(schema.timelines)
                    .where(eq(schema.timelines.id, timelineId))
                    .get();
                expect([timeline!.start_beat, timeline!.end_beat]).toEqual([
                    4, 30,
                ]);
            },
        );

        testWithHistory(
            "an edit that leaves a transition off its timeline's range is refused at commit (E-T1, C-11), and a missing transition with E-ARGS",
            async ({ db }) => {
                const { shapeId } = await seed(db);
                const before = await snapshot(db);
                // The row triggers allow a transition inside its timeline, so write one past the
                // write functions' check; the commit check refuses the whole edit
                const error = await transactionWithHistory(
                    db,
                    "partial",
                    async (tx) => {
                        const timelineId = await timelineOver(tx, 32, 64);
                        await tx
                            .insert(schema.timeline_transitions)
                            .values({
                                timeline_id: timelineId,
                                dest_shape_id: shapeId,
                                path_style: "direct",
                                order_mode: "inherit",
                                slot_count: 1,
                                start_beat: 32,
                                end_beat: 48,
                            })
                            .run();
                    },
                ).then(
                    () => undefined,
                    (e: unknown) => e,
                );
                expect(error).toBeInstanceOf(TimelineCommitViolationError);
                const violation = error as TimelineCommitViolationError;
                expect(violation.code).toBe("E-T1");
                expect(violation.message).toMatch(
                    /E-T1: transition \d+: transition spans \[32, 48\) but its timeline spans \[32, 64\)/,
                );
                expect(await snapshot(db)).toEqual(before);
                await expectRejected(db, "E-ARGS", () =>
                    rangeEdit(db, 999, 0, 8),
                );
            },
        );

        it("a shrink logs the rows first and then the transition (spec 6.1)", async ({
            db,
        }) => {
            const { t } = await seed(db);
            // The union is the old range, so step 1 is skipped
            const [batch] = await recordBatches(() => rangeEdit(db, t, 8, 20));
            expect(
                batch!.changes.map((c) => [c.table, c.rowId, c.after?.end]),
            ).toEqual([
                ["assignments", 1, 20],
                ["assignments", 4, 20],
                ["transitions", t, 20],
            ]);
        });

        it("a stretch at both ends goes straight to the union and skips step 3", async ({
            db,
        }) => {
            const { t } = await seed(db);
            const [batch] = await recordBatches(() => rangeEdit(db, t, 4, 32));
            expect(batch!.changes.map((c) => [c.table, c.rowId])).toEqual([
                ["transitions", t],
                ["assignments", 1],
                ["assignments", 3],
                ["assignments", 4],
            ]);
        });
    });

    describe("QA-DB-29: the change log of a range edit and a delete", () => {
        it("holds the moved rows with both images and every child-first delete", async ({
            db,
        }) => {
            const { t } = await seed(db);
            const before = await db
                .select()
                .from(schema.timeline_assignments)
                .all();
            const batches = await recordBatches(() =>
                transactionWithHistory(db, "stretchThenDelete", async (tx) => {
                    await setTimelineTransitionRangeInTransaction({
                        tx,
                        transitionId: t,
                        start: 8,
                        end: 32,
                    });
                    await deleteTimelineTransitionsInTransaction({
                        transitionIds: new Set([t]),
                        tx,
                    });
                }),
            );
            expect(batches).toHaveLength(1);
            const changes = batches[0]!.changes;
            const image = (a: (typeof before)[number], end = a.end_beat) => ({
                id: a.id,
                marcher: a.marcher_id,
                transition: a.transition_id,
                slot: a.slot_index,
                start: a.start_beat,
                end,
                layer: a.layer,
            });
            const [a1, , , a4] = before;

            // The stretch: the union is the target, so T once, then the rows anchored at the end
            expect(changes.slice(0, 3)).toEqual([
                {
                    table: "transitions",
                    rowId: t,
                    before: expect.objectContaining({ start: 8, end: 24 }),
                    after: expect.objectContaining({ start: 8, end: 32 }),
                },
                {
                    table: "assignments",
                    rowId: a1!.id,
                    before: image(a1!),
                    after: image(a1!, 32),
                },
                {
                    table: "assignments",
                    rowId: a4!.id,
                    before: image(a4!),
                    after: image(a4!, 32),
                },
            ]);

            // The delete: every assignment explicitly, then the transition (C-1)
            const deletes = changes.slice(3);
            expect(deletes.every((c) => c.after === null)).toBe(true);
            expect(
                deletes
                    .filter((c) => c.table === "assignments")
                    .map((c) => c.rowId)
                    .sort((a, b) => a - b),
            ).toEqual(before.map((a) => a.id).sort((a, b) => a - b));
            expect(deletes.at(-1)).toEqual({
                table: "transitions",
                rowId: t,
                before: expect.objectContaining({ start: 8, end: 32 }),
                after: null,
            });
            expect(deletes).toHaveLength(before.length + 1);
            expect(
                await db.select().from(schema.timeline_assignments).all(),
            ).toEqual([]);
        });
    });

    describe("QA-UNDO-2: the procedure on the app's real undo", () => {
        // [id, case, target, expected assignment ranges]. Row 2 [12, 20) is unanchored and stays
        // inside every target.
        const cases: [
            string,
            string,
            [number, number],
            Record<number, number[]>,
        ][] = [
            [
                "2a",
                "shrink the end",
                [8, 20],
                { 1: [8, 20], 2: [12, 20], 3: [8, 14], 4: [16, 20] },
            ],
            [
                "2b",
                "grow the end",
                [8, 32],
                { 1: [8, 32], 2: [12, 20], 3: [8, 14], 4: [16, 32] },
            ],
            [
                "2c",
                "grow the start",
                [4, 24],
                { 1: [4, 24], 2: [12, 20], 3: [4, 14], 4: [16, 24] },
            ],
            [
                "2d",
                "shrink the start",
                [12, 24],
                { 1: [12, 24], 2: [12, 20], 3: [12, 14], 4: [16, 24] },
            ],
            [
                "2e",
                "shift right",
                [12, 28],
                { 1: [12, 28], 2: [12, 20], 3: [12, 14], 4: [16, 28] },
            ],
            [
                "2f",
                "shift left",
                [4, 20],
                { 1: [4, 20], 2: [12, 20], 3: [4, 14], 4: [16, 20] },
            ],
        ];

        for (const [id, name, [start, end], expected] of cases) {
            it(`QA-UNDO-${id}: ${name} round-trips (edit, undo, redo, undo)`, async ({
                db,
            }) => {
                const { t } = await seed(db);
                const original = await dataOf(db);

                await rangeEdit(db, t, start, end);
                const edited = await dataOf(db);
                expect(await transitionRange(db, t)).toEqual([start, end]);
                expect(await ranges(db)).toEqual(expected);

                const undo1 = await performUndo(db);
                expect(undo1.success, undo1.error?.message).toBe(true);
                expect(await dataOf(db)).toEqual(original);

                const redo = await performRedo(db);
                expect(redo.success, redo.error?.message).toBe(true);
                expect(await dataOf(db)).toEqual(edited);

                const undo2 = await performUndo(db);
                expect(undo2.success, undo2.error?.message).toBe(true);
                expect(await dataOf(db)).toEqual(original);
            });
        }

        it("QA-UNDO-2 (disjoint): a target that doesn't overlap the old range round-trips", async ({
            db,
        }) => {
            // Only the row anchored at both ends stays: the union [8, 40) contains both ranges,
            // and the row moves whole from [8, 24) to [30, 40).
            const { t } = await seed(db);
            await transactionWithHistory(db, "keepOneRow", async (tx) => {
                for (const marcher of [2, 3, 4])
                    await tx
                        .delete(schema.timeline_assignments)
                        .where(
                            eq(schema.timeline_assignments.marcher_id, marcher),
                        );
            });
            const original = await dataOf(db);

            await rangeEdit(db, t, 30, 40);
            const edited = await dataOf(db);
            expect(await transitionRange(db, t)).toEqual([30, 40]);
            expect(Object.values(await ranges(db))).toEqual([[30, 40]]);

            const undo1 = await performUndo(db);
            expect(undo1.success, undo1.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(original);

            const redo = await performRedo(db);
            expect(redo.success, redo.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(edited);

            const undo2 = await performUndo(db);
            expect(undo2.success, undo2.error?.message).toBe(true);
            expect(await dataOf(db)).toEqual(original);
        });

        it("QA-UNDO-2g: a target that strands the unanchored row is rejected; data and history are unchanged", async ({
            db,
        }) => {
            const { t } = await seed(db);
            // Rows 1, 3 and 4 fit [4, 18); row 2 [12, 20) doesn't
            const batches = await recordBatches(() =>
                expectRejected(db, "E-A1", () => rangeEdit(db, t, 4, 18)),
            );
            expect(batches).toEqual([]);

            // The previous edit (the seed) is still the one undo reverts
            const undo = await performUndo(db);
            expect(undo.success, undo.error?.message).toBe(true);
            expect(
                await db.select().from(schema.timeline_transitions).all(),
            ).toEqual([]);
        });
    });

    describe("QA-DB-25: I-S1 and I-T2 in the app write path", () => {
        testWithHistory(
            "geometry that doesn't fit its kind and params that don't fit the style are rejected",
            async ({ db }) => {
                const { timelineId, shapeId, t } = await seed(db);
                // A line's geometry under the circle kind
                await expectRejected(db, "E-S1", () =>
                    transactionWithHistory(db, "c", (tx) =>
                        createTimelineShapesInTransaction({
                            newShapes: [
                                {
                                    kind: "circle",
                                    geometry: LINE.geometry as never,
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                // A block without spacing
                await expectRejected(db, "E-S1", () =>
                    transactionWithHistory(db, "u", (tx) =>
                        updateTimelineShapesInTransaction({
                            modifiedShapes: [
                                {
                                    id: shapeId,
                                    kind: "block",
                                    geometry: {
                                        origin: [0, 0],
                                        rows: 2,
                                        cols: 2,
                                    } as never,
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                // Waypoints on an arc
                await expectRejected(db, "E-P1", () =>
                    transactionWithHistory(db, "c", (tx) =>
                        createTimelineTransitionsInTransaction({
                            newTransitions: [
                                {
                                    timelineId,
                                    slotCount: 1,
                                    pathStyle: "arc",
                                    pathParams: { waypoints: [[1, 1]] },
                                    destination: { kind: "shape", shapeId },
                                },
                            ],
                            tx,
                        }),
                    ),
                );
                // A bulge on follow_the_leader
                await expectRejected(db, "E-P1", () =>
                    transactionWithHistory(db, "u", (tx) =>
                        updateTimelineTransitionsInTransaction({
                            modifiedTransitions: [
                                {
                                    id: t,
                                    pathStyle: "follow_the_leader",
                                    pathParams: { bulge: 0.2 },
                                },
                            ],
                            tx,
                        }),
                    ),
                );
            },
        );
    });

    describe("block shapes: E-T3/E-T4 (PR #10 follow-up)", () => {
        /**
         * The seed, plus a 2x2 block (capacity 4), a shapeless 2-slot transition spanning a new
         * timeline [32, 48), and an empty timeline [48, 64) (`timelineId` now names it).
         */
        const seedBlocks = async (db: DbConnection) => {
            const seeded = await seed(db);
            return await transactionWithHistory(db, "blocks", async (tx) => {
                const [blockShape] = await createTimelineShapesInTransaction({
                    newShapes: [block(2, 2)],
                    tx,
                });
                const [individual] =
                    await createTimelineTransitionsInTransaction({
                        newTransitions: [
                            {
                                timelineId: await timelineOver(tx, 32, 48),
                                startBeat: 32,
                                endBeat: 48,
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
                return {
                    ...seeded,
                    timelineId: await timelineOver(tx, 48, 64),
                    blockId: blockShape!.id,
                    individualId: individual!.id,
                };
            });
        };

        testWithHistory("on create", async ({ db }) => {
            const { timelineId, blockId } = await seedBlocks(db);
            const base = {
                timelineId,
                startBeat: 48,
                endBeat: 64,
                destination: { kind: "shape", shapeId: blockId } as const,
            };
            await expectRejected(db, "E-T3/E-T4", () =>
                transactionWithHistory(db, "ftl", (tx) =>
                    createTimelineTransitionsInTransaction({
                        newTransitions: [
                            {
                                ...base,
                                slotCount: 2,
                                pathStyle: "follow_the_leader",
                                pathParams: { waypoints: [] },
                            },
                        ],
                        tx,
                    }),
                ),
            );
            await expectRejected(db, "E-T3/E-T4", () =>
                transactionWithHistory(db, "over", (tx) =>
                    createTimelineTransitionsInTransaction({
                        newTransitions: [{ ...base, slotCount: 5 }],
                        tx,
                    }),
                ),
            );
            // Exactly at capacity is fine (QA-DB-16)
            await transactionWithHistory(db, "full", (tx) =>
                createTimelineTransitionsInTransaction({
                    newTransitions: [{ ...base, slotCount: 4 }],
                    tx,
                }),
            );
        });

        testWithHistory("on a switch to the block", async ({ db }) => {
            const { t, blockId, individualId } = await seedBlocks(db);
            // Individual points to a block too small for 2 slots
            const [small] = await transactionWithHistory(db, "small", (tx) =>
                createTimelineShapesInTransaction({
                    newShapes: [block(1, 1)],
                    tx,
                }),
            );
            await expectRejected(db, "E-T3/E-T4", () =>
                transactionWithHistory(db, "switch", (tx) =>
                    setTimelineTransitionDestinationInTransaction({
                        transitionId: individualId,
                        destination: { kind: "shape", shapeId: small!.id },
                        tx,
                    }),
                ),
            );
            // A follow-the-leader transition from its line to the block
            await transactionWithHistory(db, "ftl", (tx) =>
                updateTimelineTransitionsInTransaction({
                    modifiedTransitions: [
                        {
                            id: t,
                            pathStyle: "follow_the_leader",
                            pathParams: { waypoints: [] },
                        },
                    ],
                    tx,
                }),
            );
            await expectRejected(db, "E-T3/E-T4", () =>
                transactionWithHistory(db, "switch", (tx) =>
                    setTimelineTransitionDestinationInTransaction({
                        transitionId: t,
                        destination: { kind: "shape", shapeId: blockId },
                        tx,
                    }),
                ),
            );
        });

        testWithHistory("on a shape or transition update", async ({ db }) => {
            const { blockId, individualId } = await seedBlocks(db);
            await transactionWithHistory(db, "use", (tx) =>
                setTimelineTransitionDestinationInTransaction({
                    transitionId: individualId,
                    destination: { kind: "shape", shapeId: blockId },
                    tx,
                }),
            );
            // QA-DB-21: the block shrinks below the transition's 2 slots
            await expectRejected(db, "E-T3/E-T4", () =>
                transactionWithHistory(db, "reshape", (tx) =>
                    updateTimelineShapesInTransaction({
                        modifiedShapes: [
                            { id: blockId, geometry: block(1, 1).geometry },
                        ],
                        tx,
                    }),
                ),
            );
            // The transition grows past the block's 4 slots
            await expectRejected(db, "E-T3/E-T4", () =>
                transactionWithHistory(db, "grow", (tx) =>
                    updateTimelineTransitionsInTransaction({
                        modifiedTransitions: [
                            { id: individualId, slotCount: 5 },
                        ],
                        tx,
                    }),
                ),
            );
            // The transition becomes follow-the-leader on the block
            await expectRejected(db, "E-T3/E-T4", () =>
                transactionWithHistory(db, "ftl", (tx) =>
                    updateTimelineTransitionsInTransaction({
                        modifiedTransitions: [
                            {
                                id: individualId,
                                pathStyle: "follow_the_leader",
                                pathParams: { waypoints: [] },
                            },
                        ],
                        tx,
                    }),
                ),
            );
        });
    });

    describe("other trigger rejections and duplicate ids (PR #10 follow-ups)", () => {
        testWithHistory(
            "E-A2: shrinking slot_count below an occupied slot",
            async ({ db }) => {
                const { t } = await seed(db);
                // Row 4 is in slot 3
                await expectRejected(db, "E-A2", () =>
                    transactionWithHistory(db, "shrink", (tx) =>
                        updateTimelineTransitionsInTransaction({
                            modifiedTransitions: [{ id: t, slotCount: 3 }],
                            tx,
                        }),
                    ),
                );
            },
        );

        testWithHistory(
            "E-T6 from a row trigger is a TimelineWriteError, not a commit violation",
            async ({ db }) => {
                const { t } = await seed(db);
                const error = await expectRejected(db, "E-T6", () =>
                    transactionWithHistory(db, "pointOnShaped", (tx) =>
                        mapDbErrors(() =>
                            tx
                                .insert(schema.timeline_slot_destinations)
                                .values({
                                    transition_id: t,
                                    slot_index: 0,
                                    x: 1,
                                    y: 1,
                                }),
                        ),
                    ),
                );
                expect(error).not.toBeInstanceOf(TimelineCommitViolationError);
                expect(error.message).toMatch(/^E-T6: destination row/);
            },
        );

        testWithHistory(
            "an update that names one row twice is refused with E-ARGS",
            async ({ db }) => {
                const { t, shapeId } = await seed(db);
                await expectRejected(db, "E-ARGS", () =>
                    transactionWithHistory(db, "dup", (tx) =>
                        updateTimelineTransitionsInTransaction({
                            modifiedTransitions: [
                                { id: t, orderMode: "slot" },
                                { id: t, slotCount: 5 },
                            ],
                            tx,
                        }),
                    ),
                );
                await expectRejected(db, "E-ARGS", () =>
                    transactionWithHistory(db, "dup", (tx) =>
                        updateTimelineShapesInTransaction({
                            modifiedShapes: [
                                { id: shapeId, name: "A" },
                                { id: shapeId, name: "B" },
                            ],
                            tx,
                        }),
                    ),
                );
            },
        );
    });
});
