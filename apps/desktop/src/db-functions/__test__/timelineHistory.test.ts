import { describe, expect } from "vitest";
import { asc, eq, getTableName, inArray, sql } from "drizzle-orm";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import {
    buildHistoryTriggerSql,
    createAllUndoTriggers,
    dropUndoTriggers,
    performRedo,
    performUndo,
    transactionWithHistory,
} from "../history";

/**
 * Undo and redo for the timeline tables (docs/timeline/phases/03-storage.md P3.5, spec §6.1,
 * implementation plan C-1 and C-2). The timeline db-functions arrive in Phase 4, so these tests
 * write rows with drizzle inside `transactionWithHistory`. The history fixture undoes and redoes
 * every change and compares whole rows of the tables below.
 */

const tablesToCheck = [
    schema.marchers,
    schema.timelines,
    schema.timeline_shapes,
    schema.timeline_transitions,
    schema.timeline_assignments,
    schema.timeline_slot_destinations,
];

/**
 * One edit: two marchers, a timeline over [0, 64), a line shape, a 2-slot transition on the line
 * over [0, 16) (id 1), and a shapeless 2-slot transition over [16, 32) (id 2) with its two
 * destinations (ids 1 and 2).
 */
const seed = (db: DbConnection) =>
    transactionWithHistory(db, "seedTimeline", async (tx) => {
        await tx.insert(schema.marchers).values([
            { id: 1, section: "Brass", drill_prefix: "B", drill_order: 1 },
            { id: 2, section: "Brass", drill_prefix: "B", drill_order: 2 },
        ]);
        await tx
            .insert(schema.timelines)
            .values({ id: 1, name: "Opener", start_beat: 0, end_beat: 64 });
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
                timeline_id: 1,
                dest_shape_id: null,
                slot_count: 2,
                start_beat: 16,
                end_beat: 32,
            },
        ]);
        // A shapeless transition needs every destination by commit (I-T6)
        await tx.insert(schema.timeline_slot_destinations).values([
            { id: 1, transition_id: 2, slot_index: 0, x: 0, y: 0 },
            { id: 2, transition_id: 2, slot_index: 1, x: 2, y: 0 },
        ]);
    });

/** The stored `CREATE TRIGGER` text of a trigger, or undefined if it doesn't exist. */
const triggerSql = async (db: DbConnection, name: string) => {
    const rows = (await db.all(
        sql`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ${name}`,
    )) as unknown[];
    const row = rows[0];
    if (row === undefined) return undefined;
    return String(Array.isArray(row) ? row[0] : (row as { sql: string }).sql);
};

const tableColumns = async (db: DbConnection, tableName: string) => {
    const rows = (await db.all(
        sql`SELECT name FROM pragma_table_info(${tableName})`,
    )) as unknown[];
    return rows.map((row) =>
        String(Array.isArray(row) ? row[0] : (row as { name: string }).name),
    );
};

/** Asserts that a statement fails on a foreign key; SQLite's message may be in a `cause`. */
const expectForeignKeyError = async (statement: Promise<unknown>) => {
    const error = await statement.then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(error, "expected the edit to be rejected").toBeInstanceOf(Error);
    const messages: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = e.cause)
        messages.push(e.message);
    expect(messages.join("\n")).toMatch(/FOREIGN KEY constraint failed/);
};

/** Replaces a table's history triggers with ones built from `columnNames`. */
const installHistoryTriggers = async (
    db: DbConnection,
    tableName: string,
    columnNames: string[],
    type: "undo" | "redo",
) => {
    await dropUndoTriggers(db, tableName);
    const triggers = buildHistoryTriggerSql(tableName, columnNames, type);
    for (const statement of [triggers.insert, triggers.update, triggers.delete])
        await db.run(sql.raw(statement));
};

describeDbTests("timeline history", (it) => {
    const testWithHistory = getTestWithHistory(it, tablesToCheck);

    describe("insert, update and delete round-trip through undo and redo", () => {
        testWithHistory("timelines", async ({ db, expectNumberOfChanges }) => {
            await seed(db);
            const state = await expectNumberOfChanges.getDatabaseState(db);

            await transactionWithHistory(db, "insert", async (tx) => {
                await tx
                    .insert(schema.timelines)
                    .values({ id: 2, start_beat: 64, end_beat: 96 });
            });
            await transactionWithHistory(db, "update", async (tx) => {
                await tx
                    .update(schema.timelines)
                    .set({ name: "Closer", end_beat: 128 })
                    .where(eq(schema.timelines.id, 2));
            });
            await transactionWithHistory(db, "delete", async (tx) => {
                await tx
                    .delete(schema.timelines)
                    .where(eq(schema.timelines.id, 2));
            });
            await transactionWithHistory(db, "rename", async (tx) => {
                await tx
                    .update(schema.timelines)
                    .set({ name: "Renamed" })
                    .where(eq(schema.timelines.id, 1));
            });

            await expectNumberOfChanges.test(db, 4, state);
        });

        testWithHistory(
            "timeline_shapes",
            async ({ db, expectNumberOfChanges }) => {
                await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);

                await transactionWithHistory(db, "insert", async (tx) => {
                    await tx.insert(schema.timeline_shapes).values({
                        id: 2,
                        name: "Ring",
                        kind: "circle",
                        geometry: '{"center":[0,0],"radius":5,"start_angle":0}',
                    });
                });
                await transactionWithHistory(db, "update", async (tx) => {
                    await tx
                        .update(schema.timeline_shapes)
                        .set({
                            geometry:
                                '{"center":[1,1],"radius":8,"start_angle":1.5}',
                        })
                        .where(eq(schema.timeline_shapes.id, 2));
                });
                await transactionWithHistory(db, "delete", async (tx) => {
                    await tx
                        .delete(schema.timeline_shapes)
                        .where(eq(schema.timeline_shapes.id, 2));
                });
                await transactionWithHistory(db, "rename", async (tx) => {
                    await tx
                        .update(schema.timeline_shapes)
                        .set({ name: "Front line" })
                        .where(eq(schema.timeline_shapes.id, 1));
                });

                await expectNumberOfChanges.test(db, 4, state);
            },
        );

        testWithHistory(
            "timeline_transitions",
            async ({ db, expectNumberOfChanges }) => {
                await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);

                await transactionWithHistory(db, "insert", async (tx) => {
                    await tx.insert(schema.timeline_transitions).values({
                        id: 3,
                        timeline_id: 1,
                        dest_shape_id: 1,
                        slot_count: 2,
                        start_beat: 32,
                        end_beat: 48,
                    });
                });
                await transactionWithHistory(db, "update", async (tx) => {
                    await tx
                        .update(schema.timeline_transitions)
                        .set({
                            path_style: "arc",
                            path_params: '{"bulge":0.25}',
                            slot_count: 4,
                            end_beat: 56,
                        })
                        .where(eq(schema.timeline_transitions.id, 3));
                });
                await transactionWithHistory(db, "delete", async (tx) => {
                    await tx
                        .delete(schema.timeline_transitions)
                        .where(eq(schema.timeline_transitions.id, 3));
                });
                await transactionWithHistory(db, "reorder", async (tx) => {
                    await tx
                        .update(schema.timeline_transitions)
                        .set({ order_mode: "slot" })
                        .where(eq(schema.timeline_transitions.id, 1));
                });

                await expectNumberOfChanges.test(db, 4, state);
            },
        );

        testWithHistory(
            "timeline_assignments",
            async ({ db, expectNumberOfChanges }) => {
                await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);

                await transactionWithHistory(db, "insert", async (tx) => {
                    await tx.insert(schema.timeline_assignments).values([
                        {
                            id: 1,
                            marcher_id: 1,
                            transition_id: 1,
                            slot_index: 0,
                            start_beat: 0,
                            end_beat: 16,
                        },
                        {
                            id: 2,
                            marcher_id: 2,
                            transition_id: 1,
                            slot_index: 1,
                            start_beat: 0,
                            end_beat: 16,
                        },
                    ]);
                });
                await transactionWithHistory(db, "update", async (tx) => {
                    await tx
                        .update(schema.timeline_assignments)
                        .set({ start_beat: 4, end_beat: 12, layer: 1 })
                        .where(eq(schema.timeline_assignments.id, 2));
                });
                await transactionWithHistory(db, "delete", async (tx) => {
                    await tx
                        .delete(schema.timeline_assignments)
                        .where(eq(schema.timeline_assignments.id, 1));
                });

                await expectNumberOfChanges.test(db, 3, state);
            },
        );

        testWithHistory(
            "timeline_slot_destinations",
            async ({ db, expectNumberOfChanges }) => {
                await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);

                // Every edit leaves each shapeless transition with all its destinations (I-T6)
                await transactionWithHistory(db, "insert", async (tx) => {
                    await tx.insert(schema.timeline_transitions).values({
                        id: 3,
                        timeline_id: 1,
                        dest_shape_id: null,
                        slot_count: 3,
                        start_beat: 32,
                        end_beat: 48,
                    });
                    await tx.insert(schema.timeline_slot_destinations).values([
                        { transition_id: 3, slot_index: 0, x: 0, y: 0 },
                        { transition_id: 3, slot_index: 1, x: 2, y: 0 },
                        { transition_id: 3, slot_index: 2, x: 4, y: 0 },
                    ]);
                });
                await transactionWithHistory(db, "update", async (tx) => {
                    await tx
                        .update(schema.timeline_slot_destinations)
                        .set({ x: 12.5, y: -3.25 })
                        .where(
                            eq(schema.timeline_slot_destinations.slot_index, 1),
                        );
                });
                await transactionWithHistory(db, "delete", async (tx) => {
                    await tx
                        .delete(schema.timeline_slot_destinations)
                        .where(
                            eq(schema.timeline_slot_destinations.slot_index, 2),
                        );
                    await tx
                        .update(schema.timeline_transitions)
                        .set({ slot_count: 2 })
                        .where(eq(schema.timeline_transitions.id, 3));
                });

                await expectNumberOfChanges.test(db, 3, state);
            },
        );
    });

    describe("C-1: RESTRICT with child-first deletes", () => {
        testWithHistory(
            "deleting children, then the transition, then the timeline, undoes and redoes as one edit",
            async ({ db, expectNumberOfChanges }) => {
                await seed(db);
                await transactionWithHistory(db, "populate", async (tx) => {
                    await tx.insert(schema.timeline_assignments).values([
                        {
                            id: 1,
                            marcher_id: 1,
                            transition_id: 1,
                            slot_index: 0,
                            start_beat: 0,
                            end_beat: 16,
                        },
                        {
                            id: 2,
                            marcher_id: 2,
                            transition_id: 2,
                            slot_index: 1,
                            start_beat: 16,
                            end_beat: 32,
                        },
                    ]);
                });
                const state = await expectNumberOfChanges.getDatabaseState(db);

                // RESTRICT: a parent can't go while its children remain, and the rejected
                // edit leaves no history.
                await expectForeignKeyError(
                    transactionWithHistory(db, "parentFirst", async (tx) => {
                        await tx
                            .delete(schema.timeline_transitions)
                            .where(eq(schema.timeline_transitions.id, 2));
                    }),
                );
                await expectForeignKeyError(
                    transactionWithHistory(db, "timelineFirst", async (tx) => {
                        await tx
                            .delete(schema.timelines)
                            .where(eq(schema.timelines.id, 1));
                    }),
                );
                expect(
                    await expectNumberOfChanges.getDatabaseState(db),
                ).toEqual(state);

                await transactionWithHistory(
                    db,
                    "deleteTimeline",
                    async (tx) => {
                        const transitionIds = [1, 2];
                        await tx
                            .delete(schema.timeline_assignments)
                            .where(
                                inArray(
                                    schema.timeline_assignments.transition_id,
                                    transitionIds,
                                ),
                            );
                        await tx
                            .delete(schema.timeline_slot_destinations)
                            .where(
                                inArray(
                                    schema.timeline_slot_destinations
                                        .transition_id,
                                    transitionIds,
                                ),
                            );
                        await tx
                            .delete(schema.timeline_transitions)
                            .where(
                                inArray(
                                    schema.timeline_transitions.id,
                                    transitionIds,
                                ),
                            );
                        await tx
                            .delete(schema.timelines)
                            .where(eq(schema.timelines.id, 1));
                    },
                );

                expect(await db.select().from(schema.timelines)).toEqual([]);
                expect(
                    await db.select().from(schema.timeline_assignments),
                ).toEqual([]);

                // Undo re-inserts the timeline, then the transitions, then their children, so
                // every step passes the invariant triggers.
                const undo = await performUndo(db);
                expect(undo.success, undo.error?.message).toBe(true);
                expect(
                    await expectNumberOfChanges.getDatabaseState(db),
                ).toMatchObject({ expectedData: state.expectedData });
                const redo = await performRedo(db);
                expect(redo.success, redo.error?.message).toBe(true);
                expect(await db.select().from(schema.timelines)).toEqual([]);

                await expectNumberOfChanges.test(db, 1, state);
            },
        );
    });

    describe("C-2: surrogate id on slot destinations", () => {
        testWithHistory(
            "undoing a destination delete restores its id, so an older undo still finds the row",
            async ({ db, expectNumberOfChanges }) => {
                await seed(db);
                const state = await expectNumberOfChanges.getDatabaseState(db);
                const destinations = () =>
                    db
                        .select()
                        .from(schema.timeline_slot_destinations)
                        .orderBy(asc(schema.timeline_slot_destinations.id));

                const seeded = await destinations();

                // A new shapeless transition with its destinations (ids 3 and 4)
                await transactionWithHistory(db, "place", async (tx) => {
                    await tx.insert(schema.timeline_transitions).values({
                        id: 3,
                        timeline_id: 1,
                        dest_shape_id: null,
                        slot_count: 2,
                        start_beat: 32,
                        end_beat: 48,
                    });
                    await tx.insert(schema.timeline_slot_destinations).values([
                        { transition_id: 3, slot_index: 0, x: 0, y: 0 },
                        { transition_id: 3, slot_index: 1, x: 2, y: 0 },
                    ]);
                });
                const placed = await destinations();
                expect(placed).toHaveLength(4);

                // Switch it to the shape: its destinations must go in the same edit (I-T6)
                await transactionWithHistory(db, "remove", async (tx) => {
                    await tx
                        .delete(schema.timeline_slot_destinations)
                        .where(
                            eq(
                                schema.timeline_slot_destinations.transition_id,
                                3,
                            ),
                        );
                    await tx
                        .update(schema.timeline_transitions)
                        .set({ dest_shape_id: 1 })
                        .where(eq(schema.timeline_transitions.id, 3));
                });
                expect(await destinations()).toEqual(seeded);

                // Undo the delete: the rows come back with their old ids, which are their row ids.
                expect((await performUndo(db)).success).toBe(true);
                expect(await destinations()).toEqual(placed);

                // The older undo's `DELETE … WHERE rowid=` inverses find both rows.
                expect((await performUndo(db)).success).toBe(true);
                expect(await destinations()).toEqual(seeded);

                expect((await performRedo(db)).success).toBe(true);
                expect(await destinations()).toEqual(placed);
                expect((await performRedo(db)).success).toBe(true);
                expect(await destinations()).toEqual(seeded);

                await expectNumberOfChanges.test(db, 2, state);
            },
        );
    });

    describe("history triggers from before a column was added", () => {
        testWithHistory(
            "are recreated with the new columns, so undo restores a home change",
            async ({ db, expectNumberOfChanges }) => {
                const marchersTable = getTableName(schema.marchers);
                const columns = await tableColumns(db, marchersTable);
                expect(columns).toEqual(
                    expect.arrayContaining(["home_x", "home_y"]),
                );

                // A file opened before migration 0017 holds marchers triggers without the
                // home columns.
                await installHistoryTriggers(
                    db,
                    marchersTable,
                    columns.filter((c) => c !== "home_x" && c !== "home_y"),
                    "undo",
                );
                expect(await triggerSql(db, "marchers_ut")).not.toContain(
                    'old."home_x"',
                );

                await createAllUndoTriggers(db);

                for (const name of ["marchers_ut", "marchers_dt"]) {
                    const stored = await triggerSql(db, name);
                    expect(stored).toContain('old."home_x"');
                    expect(stored).toContain('old."home_y"');
                }
                expect(await triggerSql(db, "marchers_it")).toBeDefined();

                await transactionWithHistory(db, "addMarcher", async (tx) => {
                    await tx.insert(schema.marchers).values({
                        id: 1,
                        section: "Brass",
                        drill_prefix: "B",
                        drill_order: 1,
                    });
                });
                const state = await expectNumberOfChanges.getDatabaseState(db);

                await transactionWithHistory(db, "moveHome", async (tx) => {
                    await tx
                        .update(schema.marchers)
                        .set({ home_x: 12.5, home_y: -3 })
                        .where(eq(schema.marchers.id, 1));
                });

                expect((await performUndo(db)).success).toBe(true);
                expect(
                    await db
                        .select({
                            home_x: schema.marchers.home_x,
                            home_y: schema.marchers.home_y,
                        })
                        .from(schema.marchers),
                ).toEqual([{ home_x: 0, home_y: 0 }]);
                expect((await performRedo(db)).success).toBe(true);

                await expectNumberOfChanges.test(db, 1, state);
            },
        );

        it("leaves triggers whose columns match alone, in whichever mode they are", async ({
            db,
        }) => {
            const marchersTable = getTableName(schema.marchers);
            await installHistoryTriggers(
                db,
                marchersTable,
                await tableColumns(db, marchersTable),
                "redo",
            );
            const before = await triggerSql(db, "marchers_ut");
            expect(before).toContain("history_redo");

            await createAllUndoTriggers(db);

            expect(await triggerSql(db, "marchers_ut")).toBe(before);
        });
    });
});
