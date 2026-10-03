import { describe, expect } from "vitest";
import { count, eq, getTableName, sql } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import {
    performRedo,
    performUndo,
    resetTimelineChangeLog,
    transactionWithHistory,
} from "../history";
import {
    subscribeTimelineChanges,
    TimelineChangeEvent,
    TimelineCommitViolationError,
} from "../timelineChanges";

/**
 * The spec §6 write wrapper and the change-log listener contract (ADR 0001 §5): P4.1 to P4.3.
 * The timeline db-functions arrive in P4.4, so these tests write rows with drizzle inside
 * `transactionWithHistory`.
 */

const tablesToCheck = [
    schema.beats,
    schema.marchers,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

/**
 * One edit: two marchers, timelines over [0, 16), [16, 32) and [32, 48), a line shape, a 2-slot
 * transition on the line spanning the first (id 1), and a shapeless 2-slot transition spanning the
 * second (id 2) with both of its destinations.
 */
const seed = (db: DbConnection) =>
    transactionWithHistory(db, "seedTimeline", async (tx) => {
        await tx.insert(schema.marchers).values([
            { id: 1, section: "Brass", drill_prefix: "B", drill_order: 1 },
            { id: 2, section: "Brass", drill_prefix: "B", drill_order: 2 },
        ]);
        // One timeline per transition, which spans it (C-11); timeline 3 is for transition 3
        await tx.insert(schema.timelines).values([
            { id: 1, name: "Opener", start_beat: 0, end_beat: 16 },
            { id: 2, start_beat: 16, end_beat: 32 },
            { id: 3, start_beat: 32, end_beat: 48 },
        ]);
        await tx.insert(schema.timeline_shapes).values({
            id: 1,
            kind: "line",
            geometry: '{"points":[[0,0],[10,0]]}',
        });
        await tx.insert(schema.timeline_transitions).values([
            {
                id: 1,
                timeline_id: 1,
                dest_shape_id: 1,
                slot_count: 2,
                start_beat: 0,
                end_beat: 16,
            },
            {
                id: 2,
                timeline_id: 2,
                dest_shape_id: null,
                slot_count: 2,
                start_beat: 16,
                end_beat: 32,
            },
        ]);
        await tx.insert(schema.timeline_slot_destinations).values([
            { id: 1, transition_id: 2, slot_index: 0, x: 0, y: 0 },
            { id: 2, transition_id: 2, slot_index: 1, x: 2, y: 0 },
        ]);
    });

/** Records every event delivered while `run` executes. */
const recordEvents = async (run: () => Promise<unknown>) => {
    const events: TimelineChangeEvent[] = [];
    const unsubscribe = subscribeTimelineChanges((event) => {
        events.push(event);
    });
    try {
        await run();
    } finally {
        unsubscribe();
    }
    return events;
};

/** Records the events of an edit that must be rejected, and returns them with its error. */
const recordRejectedEdit = async (run: () => Promise<unknown>) => {
    let error: unknown;
    const events = await recordEvents(() =>
        run().then(
            () => undefined,
            (e: unknown) => {
                error = e;
            },
        ),
    );
    expect(error, "expected the edit to be rejected").toBeInstanceOf(Error);
    return { events, error: error as Error };
};

/** The messages of an error and its causes; SQLite's message may be in a `cause`. */
const errorMessages = (error: unknown) => {
    const messages: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = e.cause)
        messages.push(e.message);
    return messages.join("\n");
};

const changeLogCount = async (db: DbConnection) =>
    (await db.select({ count: count() }).from(schema.timeline_change_log).get())
        ?.count ?? 0;

/** Everything a rejected edit must leave untouched: the data, the log and the history. */
const snapshot = async (db: DbConnection) => {
    const data: Record<string, unknown[]> = {};
    for (const table of tablesToCheck)
        data[getTableName(table)] = await db.select().from(table).all();
    return {
        data,
        changeLog: await changeLogCount(db),
        undo: await db.select().from(schema.history_undo).all(),
        redo: await db.select().from(schema.history_redo).all(),
        stats: await db.select().from(schema.history_stats).all(),
    };
};

const batches = (events: TimelineChangeEvent[]) =>
    events.flatMap((event) => (event.kind === "batch" ? [event.batch] : []));

describeDbTests("timeline change-log wrapper", (it) => {
    const testWithHistory = getTestWithHistory(it, tablesToCheck);

    describe("committed edits", () => {
        it("a timeline edit delivers exactly one batch, in log order, after commit", async ({
            db,
        }) => {
            const events = await recordEvents(() => seed(db));

            expect(events).toHaveLength(1);
            const [batch] = batches(events);
            expect(
                batch.changes.map((c) => [c.table, c.rowId, c.before]),
            ).toEqual([
                ["marchers", 1, null],
                ["marchers", 2, null],
                ["shapes", 1, null],
                ["transitions", 1, null],
                ["transitions", 2, null],
                // Destinations are logged under their transition's id (spec §10.2)
                ["slot_destinations", 2, null],
                ["slot_destinations", 2, null],
            ]);
            // Timelines aren't logged (R-1); the JSON images arrive parsed
            expect(batch.changes.map((c) => c.after)).toEqual([
                { id: 1, home: [0, 0] },
                { id: 2, home: [0, 0] },
                {
                    id: 1,
                    kind: "line",
                    geometry: {
                        points: [
                            [0, 0],
                            [10, 0],
                        ],
                    },
                },
                {
                    id: 1,
                    dest: 1,
                    style: "direct",
                    params: null,
                    order: "inherit",
                    slots: 2,
                    start: 0,
                    end: 16,
                },
                expect.objectContaining({ id: 2, dest: null, slots: 2 }),
                { transition: 2, slot: 0, x: 0, y: 0 },
                { transition: 2, slot: 1, x: 2, y: 0 },
            ]);
            expect(await changeLogCount(db)).toBe(0);
        });

        it("keeps every row change, so the resolver can coalesce them (spec §10.2)", async ({
            db,
        }) => {
            await seed(db);

            const events = await recordEvents(() =>
                transactionWithHistory(db, "moveTwice", async (tx) => {
                    for (const home_x of [3, 7])
                        await tx
                            .update(schema.marchers)
                            .set({ home_x })
                            .where(eq(schema.marchers.id, 1));
                    await tx.insert(schema.timeline_shapes).values({
                        id: 2,
                        kind: "line",
                        geometry: '{"points":[[0,0],[0,10]]}',
                    });
                    await tx
                        .delete(schema.timeline_shapes)
                        .where(eq(schema.timeline_shapes.id, 2));
                }),
            );

            expect(
                batches(events).map((b) =>
                    b.changes.map((c) => [
                        c.table,
                        c.rowId,
                        c.before === null ? null : "before",
                        c.after === null ? null : "after",
                    ]),
                ),
            ).toEqual([
                [
                    ["marchers", 1, "before", "after"],
                    ["marchers", 1, "before", "after"],
                    ["shapes", 2, null, "after"],
                    ["shapes", 2, "before", null],
                ],
            ]);
            const [first, second] = batches(events)[0].changes;
            expect(first.before).toEqual({ id: 1, home: [0, 0] });
            expect(second.after).toEqual({ id: 1, home: [7, 0] });
        });

        it("an edit on non-timeline tables delivers nothing", async ({
            db,
        }) => {
            await seed(db);

            const events = await recordEvents(async () => {
                await transactionWithHistory(db, "addBeat", async (tx) => {
                    await tx
                        .insert(schema.beats)
                        .values({ duration: 0.5, position: 1 });
                });
                // Only a marcher's home affects resolution, so a rename isn't logged
                await transactionWithHistory(db, "rename", async (tx) => {
                    await tx
                        .update(schema.marchers)
                        .set({ name: "Alex" })
                        .where(eq(schema.marchers.id, 1));
                });
                // Timelines aren't logged (spec §10.2)
                await transactionWithHistory(
                    db,
                    "renameTimeline",
                    async (tx) => {
                        await tx
                            .update(schema.timelines)
                            .set({ name: "Closer" })
                            .where(eq(schema.timelines.id, 1));
                    },
                );
            });

            expect(events).toEqual([]);
            expect(await changeLogCount(db)).toBe(0);
        });

        it("a listener that throws doesn't stop the others, and the commit stands", async ({
            db,
        }) => {
            const received: TimelineChangeEvent[] = [];
            const unsubscribeThrowing = subscribeTimelineChanges(() => {
                throw new Error("listener failure");
            });
            const unsubscribe = subscribeTimelineChanges((event) => {
                received.push(event);
            });
            try {
                await seed(db);
            } finally {
                unsubscribeThrowing();
                unsubscribe();
            }

            expect(batches(received)).toHaveLength(1);
            expect(await db.select().from(schema.timeline_shapes)).toHaveLength(
                1,
            );

            // Unsubscribed listeners hear nothing more
            await transactionWithHistory(db, "move", async (tx) => {
                await tx
                    .update(schema.marchers)
                    .set({ home_x: 5 })
                    .where(eq(schema.marchers.id, 1));
            });
            expect(received).toHaveLength(1);
        });
    });

    describe("rejected edits deliver nothing and leave no trace (QA-DB-26, QA-DB-30, QA-UNDO-5)", () => {
        it("QA-DB-26: a label update, then an invalid insert, rolls the whole edit back", async ({
            db,
        }) => {
            await seed(db);
            const before = await snapshot(db);

            const { events, error } = await recordRejectedEdit(() =>
                transactionWithHistory(db, "renameThenBreak", async (tx) => {
                    await tx
                        .update(schema.timeline_shapes)
                        .set({ name: "Front line" })
                        .where(eq(schema.timeline_shapes.id, 1));
                    // Outside its transition's range [0, 16): the trigger RAISEs E-A1
                    await tx.insert(schema.timeline_assignments).values({
                        marcher_id: 1,
                        transition_id: 1,
                        slot_index: 0,
                        start_beat: 8,
                        end_beat: 24,
                    });
                }),
            );

            expect(errorMessages(error)).toMatch(/E-A1/);
            expect(events).toEqual([]);
            expect(await snapshot(db)).toEqual(before);
        });

        it("a shapeless transition missing a destination fails at commit with E-T6", async ({
            db,
        }) => {
            await seed(db);
            const before = await snapshot(db);

            const { events, error } = await recordRejectedEdit(() =>
                transactionWithHistory(db, "incomplete", async (tx) => {
                    await tx.insert(schema.timeline_transitions).values({
                        id: 3,
                        timeline_id: 3,
                        dest_shape_id: null,
                        slot_count: 2,
                        start_beat: 32,
                        end_beat: 48,
                    });
                    await tx.insert(schema.timeline_slot_destinations).values({
                        transition_id: 3,
                        slot_index: 0,
                        x: 1,
                        y: 1,
                    });
                }),
            );

            expect(error).toBeInstanceOf(TimelineCommitViolationError);
            const violation = error as TimelineCommitViolationError;
            expect(violation.code).toBe("E-T6");
            expect(violation.violations).toEqual([
                {
                    code: "E-T6",
                    transitionId: 3,
                    detail: "shapeless transition has 1 of 2 destinations",
                },
            ]);
            expect(violation.message).toMatch(/^E-T6: transition 3: /);
            expect(events).toEqual([]);
            expect(await snapshot(db)).toEqual(before);
        });

        it("removing a destination from a complete transition fails at commit", async ({
            db,
        }) => {
            await seed(db);
            const before = await snapshot(db);

            const { events, error } = await recordRejectedEdit(() =>
                transactionWithHistory(db, "removeDestination", async (tx) => {
                    await tx
                        .delete(schema.timeline_slot_destinations)
                        .where(eq(schema.timeline_slot_destinations.id, 2));
                }),
            );

            expect(error).toBeInstanceOf(TimelineCommitViolationError);
            expect(events).toEqual([]);
            expect(await snapshot(db)).toEqual(before);
        });
    });

    describe("undo and redo deliver batches (QA-UNDO-7, C-6)", () => {
        testWithHistory(
            "undo and redo each deliver one batch naming the rows they touched",
            async ({ db, expectNumberOfChanges }) => {
                await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);

                await transactionWithHistory(db, "assign", async (tx) => {
                    await tx.insert(schema.timeline_assignments).values({
                        id: 1,
                        marcher_id: 1,
                        transition_id: 1,
                        slot_index: 0,
                        start_beat: 0,
                        end_beat: 16,
                    });
                    await tx
                        .update(schema.timeline_slot_destinations)
                        .set({ x: 5 })
                        .where(eq(schema.timeline_slot_destinations.id, 1));
                });
                const assignment = {
                    id: 1,
                    marcher: 1,
                    transition: 1,
                    slot: 0,
                    start: 0,
                    end: 16,
                    layer: 0,
                };
                const moved = { transition: 2, slot: 0, x: 5, y: 0 };
                const placed = { transition: 2, slot: 0, x: 0, y: 0 };

                const undoEvents = await recordEvents(async () => {
                    const undo = await performUndo(db);
                    expect(undo.success, undo.error?.message).toBe(true);
                });
                // Undo replays the inverses newest first
                expect(batches(undoEvents)).toEqual([
                    {
                        changes: [
                            {
                                table: "slot_destinations",
                                rowId: 2,
                                before: moved,
                                after: placed,
                            },
                            {
                                table: "assignments",
                                rowId: 1,
                                before: assignment,
                                after: null,
                            },
                        ],
                    },
                ]);
                expect(undoEvents).toHaveLength(1);
                expect(await changeLogCount(db)).toBe(0);

                const redoEvents = await recordEvents(async () => {
                    const redo = await performRedo(db);
                    expect(redo.success, redo.error?.message).toBe(true);
                });
                expect(batches(redoEvents)).toEqual([
                    {
                        changes: [
                            {
                                table: "assignments",
                                rowId: 1,
                                before: null,
                                after: assignment,
                            },
                            {
                                table: "slot_destinations",
                                rowId: 2,
                                before: placed,
                                after: moved,
                            },
                        ],
                    },
                ]);
                expect(redoEvents).toHaveLength(1);
                expect(await changeLogCount(db)).toBe(0);

                await expectNumberOfChanges.test(db, 1, state);
            },
        );

        testWithHistory(
            "undoing and redoing a non-timeline edit delivers nothing",
            async ({ db, expectNumberOfChanges }) => {
                await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await transactionWithHistory(db, "addBeat", async (tx) => {
                    await tx
                        .insert(schema.beats)
                        .values({ duration: 0.5, position: 1 });
                });

                const events = await recordEvents(async () => {
                    expect((await performUndo(db)).success).toBe(true);
                    expect((await performRedo(db)).success).toBe(true);
                });

                expect(events).toEqual([]);
                await expectNumberOfChanges.test(db, 1, state);
            },
        );

        testWithHistory(
            "undoing a marcher rename rewrites its home unchanged, which is logged as a no-op",
            async ({ db, expectNumberOfChanges }) => {
                await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                await transactionWithHistory(db, "rename", async (tx) => {
                    await tx
                        .update(schema.marchers)
                        .set({ name: "Alex" })
                        .where(eq(schema.marchers.id, 1));
                });

                // The history inverse is an UPDATE of every column, home included, so the
                // `OF home_x, home_y` log trigger fires with equal before and after images.
                // The resolver's coalescing treats it as no change.
                const events = await recordEvents(async () => {
                    expect((await performUndo(db)).success).toBe(true);
                    expect((await performRedo(db)).success).toBe(true);
                });

                const home = { id: 1, home: [0, 0] };
                expect(batches(events)).toEqual([
                    {
                        changes: [
                            {
                                table: "marchers",
                                rowId: 1,
                                before: home,
                                after: home,
                            },
                        ],
                    },
                    {
                        changes: [
                            {
                                table: "marchers",
                                rowId: 1,
                                before: home,
                                after: home,
                            },
                        ],
                    },
                ]);
                await expectNumberOfChanges.test(db, 1, state);
            },
        );
    });

    describe("drain on open (P4.3)", () => {
        it("clears rows left by writes outside the wrapper and delivers reset", async ({
            db,
        }) => {
            await seed(db);
            // A write that bypasses the wrapper, like a migration or repair
            await db.run(sql`UPDATE marchers SET home_x = 9 WHERE id = 2`);
            expect(await changeLogCount(db)).toBe(1);

            const events = await recordEvents(() => resetTimelineChangeLog(db));

            expect(events).toEqual([{ kind: "reset" }]);
            expect(await changeLogCount(db)).toBe(0);

            // The next edit's batch holds only its own rows
            const next = await recordEvents(() =>
                transactionWithHistory(db, "move", async (tx) => {
                    await tx
                        .update(schema.marchers)
                        .set({ home_x: 1 })
                        .where(eq(schema.marchers.id, 1));
                }),
            );
            expect(
                batches(next).map((b) => b.changes.map((c) => c.rowId)),
            ).toEqual([[1]]);
        });
    });
});
