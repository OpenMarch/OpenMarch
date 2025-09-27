import { describe, expect } from "vitest";
import { DbConnection, describeDbTests, schema } from "@/test/base";
import {
    calculateHistorySize,
    createUndoTriggers,
    flattenUndoGroupsAbove,
    getCurrentUndoGroup,
    HistoryStatsRow,
    HistoryTableRow,
    incrementUndoGroup,
    performRedo,
    performUndo,
    transactionWithHistory,
} from "../history";
import { sql } from "drizzle-orm";

describeDbTests("transactionWithHistory", (baseIt) => {
    // const it = baseIt.extend<{
    //     db: DbConnection;
    // }>({
    //     db: async ({ db }, use) => {
    //         await db
    //             .insert(schema.history_stats)
    //             .values({
    //                 group_limit: 500,
    //                 cur_undo_group: 0,
    //                 cur_redo_group: 0,
    //             })
    //             .run();
    //         await use(db);
    //     },
    // });

    describe.each([0, 1])("when starting undo group at %s", (initialGroup) => {
        baseIt("should increment undo group", async ({ db }) => {
            const startGroup = await db.query.history_stats.findFirst({
                columns: { cur_undo_group: true },
            });
            expect(startGroup?.cur_undo_group).toBe(
                initialGroup === 0 ? 1 : initialGroup,
            );
            const testValue = "test result";
            const result = await transactionWithHistory(
                db,
                "test",
                async (tx) => {
                    await tx
                        .insert(schema.history_undo)
                        .values({
                            sequence: 1,
                            history_group: 1,
                            sql: "SELECT 1",
                        })
                        .run();
                    return testValue;
                },
            );

            expect(result).toBe(testValue);
            const endGroup = await db.query.history_stats.findFirst({
                columns: { cur_undo_group: true },
            });
            expect(endGroup?.cur_undo_group).toBe(
                initialGroup === 0 ? initialGroup + 2 : initialGroup + 1,
            );
        });
    });
});

describeDbTests("History Tables and Triggers", async (baseIt) => {
    const it = baseIt.extend<{
        db: DbConnection;
    }>({
        db: async ({ db }, use) => {
            // const tablesNotToDelete = [
            //     "history_undo",
            //     "history_redo",
            //     "history_stats",
            // ];
            // const getTable = async () =>
            //     (await db.all(
            //         sql.raw(
            //             `SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN (${tablesNotToDelete.map((t) => `'${t}'`).join(",")}) LIMIT 1`,
            //         ),
            //     )) as { name: string }[];

            // while (true) {
            //     const table = await getTable();
            //     if (table.length === 0) {
            //         break;
            //     }
            //     try {
            //         await db.run(`DROP TABLE IF EXISTS "${table[0].name}"`);
            //     } catch (error) {
            //         console.error(
            //             `Error dropping table ${table[0].name}:`,
            //             error,
            //         );
            //         throw error;
            //     }
            // }
            await use(db);
        },
    });

    describe("basic tests", async () => {
        it("should create the triggers for a given table", async ({ db }) => {
            // Create a test table to attach triggers to
            await db.run(
                sql.raw(
                    "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                ),
            );

            // Create the undo triggers for the test table
            await createUndoTriggers(db, "test_table");

            // Check if the triggers were created
            const triggers = await db.all(
                sql.raw(`
                    SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name = 'test_table';
                `),
            );

            expect(triggers.length).toBe(3); // Should have 3 triggers: insert, update, delete
        });

        describe("undo history", async () => {
            const allUndoRowsByGroup = async (db: DbConnection) =>
                await db
                    .select()
                    .from(schema.history_undo)
                    .groupBy(schema.history_undo.history_group);
            const allUndoRows = async (db: DbConnection) =>
                await db.select().from(schema.history_undo);

            describe("empty undo", async () => {
                it("should do nothing if there are no changes to undo", async ({
                    db,
                }) => {
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    const undoRows = async () =>
                        await db.all(sql.raw("SELECT * FROM history_undo;"));
                    expect(await undoRows()).toEqual([]); // There should be no rows in the undo history

                    // Execute the undo action
                    await performUndo(db);
                    expect(await undoRows()).toEqual([]); // There should still be no rows in the undo history
                });
                it("should do nothing if it runs out of changes to undo", async ({
                    db,
                }) => {
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    const undoRows = async () =>
                        await db.all(sql.raw("SELECT * FROM history_undo;"));
                    expect(await undoRows()).toEqual([]); // There should still be no rows in the undo history

                    // Insert a value into the test table
                    await db.run(
                        sql`INSERT INTO test_table (value) VALUES (${"test value"});`,
                    );
                    let curRows = await undoRows();
                    await incrementUndoGroup(db);
                    expect(curRows.length).toBe(1);

                    // Execute the undo action
                    await performUndo(db);
                    expect(await undoRows()).toEqual([]);

                    // Execute the undo action again with no changes to undo
                    await performUndo(db);
                    expect(await undoRows()).toEqual([]);
                });
            });

            describe("INSERT trigger", async () => {
                it("should all an undo correctly from an insert action", async ({
                    db,
                }) => {
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    await db.run(
                        sql`INSERT INTO test_table (value) VALUES (${"test value"});`,
                    );

                    // Simulate an action that will be logged in the undo history
                    await db.run(
                        sql`INSERT INTO test_table (value) VALUES (${"another value"});`,
                    );

                    // Execute the undo action
                    await performUndo(db);

                    // Verify that the last insert was undone
                    const row = (
                        await db.all(
                            sql`SELECT * FROM test_table WHERE value = ${"another value"}`,
                        )
                    )[0];
                    expect(row).toBeUndefined(); // The undo should have deleted the last inserted value

                    // Expect there to be no undo actions left
                    const allUndoRowsResult = await allUndoRows(db);
                    expect(allUndoRowsResult.length).toBe(0);
                });

                it("should undo groups of inserts correctly", async ({
                    db,
                }) => {
                    type Row = { id: number; value: string };
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table in three groups
                    // group 1
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g1-0 - test value');`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g1-1 - test value');`,
                        ),
                    );
                    await incrementUndoGroup(db);
                    const groupOneObjects = (await db.all(
                        sql.raw(
                            `SELECT * FROM test_table WHERE value LIKE 'g1%'`,
                        ),
                    )) as Row[];
                    // group 2
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g2-0 - test value');`,
                        ),
                    );
                    await incrementUndoGroup(db);
                    const groupTwoObjects = (await db.all(
                        sql.raw(
                            `SELECT * FROM test_table WHERE value LIKE 'g2%'`,
                        ),
                    )) as Row[];
                    // group 3
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g3-0 - test value');`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g3-1 - test value');`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g3-2 - test value');`,
                        ),
                    );
                    await incrementUndoGroup(db);
                    const groupThreeObjects = (await db.all(
                        sql.raw(
                            `SELECT * FROM test_table WHERE value LIKE 'g3%'`,
                        ),
                    )) as Row[];

                    // expect all the objects to be in the table
                    const allObjects = async () =>
                        (await db.all(
                            sql.raw("SELECT * FROM test_table"),
                        )) as Row[];
                    expect(await allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                        ...groupThreeObjects,
                    ]);

                    // Execute the undo action
                    let response = await performUndo(db);
                    expect(response.success).toBe(true);
                    expect(response.sqlStatements).toEqual([
                        'DELETE FROM "test_table" WHERE rowid=6',
                        'DELETE FROM "test_table" WHERE rowid=5',
                        'DELETE FROM "test_table" WHERE rowid=4',
                    ]);
                    expect(response.tableNames).toEqual(
                        new Set(["test_table"]),
                    );
                    expect(response.error).toBeUndefined();

                    expect(await allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                    ]);
                    await performUndo(db);
                    expect(await allObjects()).toEqual([...groupOneObjects]);
                    await performUndo(db);
                    expect(await allObjects()).toEqual([]);

                    // Expect there to be no undo actions left'
                    const allUndoRowsResult = await allUndoRows(db);
                    expect(allUndoRowsResult.length).toBe(0);
                });
            });

            describe("UPDATE trigger", async () => {
                it("should all an undo correctly from an update action", async ({
                    db,
                }) => {
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                        ),
                    );

                    const currentValue = async () =>
                        (
                            (await db.get(
                                sql.raw(
                                    "SELECT test_value FROM test_table WHERE id = 1;",
                                ),
                            )) as {
                                test_value: string;
                            }
                        ).test_value;

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('test value');",
                        ),
                    );
                    expect(await currentValue()).toBe("test value");
                    await incrementUndoGroup(db);

                    // Update the value in the test table
                    await db.run(
                        sql.raw(
                            "UPDATE test_table SET test_value = 'updated value' WHERE id = 1;",
                        ),
                    );
                    expect(await currentValue()).toBe("updated value"); // The value should be updated
                    await incrementUndoGroup(db);

                    // Simulate an action that will be logged in the undo history
                    await db.run(
                        sql.raw(
                            "UPDATE test_table SET test_value = 'another updated value' WHERE id = 1;",
                        ),
                    );
                    expect(await currentValue()).toBe("another updated value"); // The value should be updated
                    await incrementUndoGroup(db);

                    // Execute the undo action
                    await performUndo(db);
                    // Verify that the last update was undone
                    expect(await currentValue()).toBe("updated value"); // The undo should have reverted the last update

                    // Execute the undo action again
                    await performUndo(db);
                    // Verify that the first update was undone
                    expect(await currentValue()).toBe("test value"); // The undo should have reverted the first update

                    // Expect there to be one undo actions left
                    const allUndoRowsResult = await allUndoRows(db);
                    expect(allUndoRowsResult.length).toBe(1);
                });

                it("should undo groups of updates correctly", async ({
                    db,
                }) => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-0 - initial value');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-1 - initial value');",
                        ),
                    );
                    // group 2
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g2-0 - initial value');",
                        ),
                    );
                    // group 3
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-0 - initial value');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-1 - initial value');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-2 - initial value');",
                        ),
                    );
                    await incrementUndoGroup(db);

                    // group 1
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g1-0 - updated value"} WHERE test_value = ${"g1-0 - initial value"};`,
                    );
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g1-1 - updated value"} WHERE test_value = ${"g1-1 - initial value"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 2
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g2-0 - updated value"} WHERE test_value = ${"g2-0 - initial value"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 3
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g3-0 - updated value"} WHERE test_value = ${"g3-0 - initial value"};`,
                    );
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g3-1 - updated value"} WHERE test_value = ${"g3-1 - initial value"};`,
                    );
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g3-2 - updated value"} WHERE test_value = ${"g3-2 - initial value"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 1 (again)
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g1-0 - second updated value"} WHERE test_value = ${"g1-0 - updated value"};`,
                    );
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g1-1 - second updated value"} WHERE test_value = ${"g1-1 - updated value"};`,
                    );

                    const allRows = async () =>
                        (await db.all(
                            sql.raw(`SELECT * FROM test_table ORDER BY id`),
                        )) as Row[];
                    let expectedValues: Row[] = [
                        { id: 1, test_value: "g1-0 - second updated value" },
                        { id: 2, test_value: "g1-1 - second updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - updated value" },
                        { id: 5, test_value: "g3-1 - updated value" },
                        { id: 6, test_value: "g3-2 - updated value" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Execute the undo action
                    let response = await performUndo(db);
                    expect(response.success).toBe(true);
                    expect(response.sqlStatements).toEqual([
                        'UPDATE "test_table" SET "id"=2,"test_value"=\'g1-1 - updated value\' WHERE rowid=2',
                        'UPDATE "test_table" SET "id"=1,"test_value"=\'g1-0 - updated value\' WHERE rowid=1',
                    ]);
                    expect(response.tableNames).toEqual(
                        new Set(["test_table"]),
                    );
                    expect(response.error).toBeUndefined();

                    expectedValues = [
                        { id: 1, test_value: "g1-0 - updated value" },
                        { id: 2, test_value: "g1-1 - updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - updated value" },
                        { id: 5, test_value: "g3-1 - updated value" },
                        { id: 6, test_value: "g3-2 - updated value" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Execute the undo action again
                    await performUndo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - updated value" },
                        { id: 2, test_value: "g1-1 - updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - initial value" },
                        { id: 5, test_value: "g3-1 - initial value" },
                        { id: 6, test_value: "g3-2 - initial value" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Execute the undo action again
                    await performUndo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - updated value" },
                        { id: 2, test_value: "g1-1 - updated value" },
                        { id: 3, test_value: "g2-0 - initial value" },
                        { id: 4, test_value: "g3-0 - initial value" },
                        { id: 5, test_value: "g3-1 - initial value" },
                        { id: 6, test_value: "g3-2 - initial value" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Execute the undo action again
                    await performUndo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - initial value" },
                        { id: 2, test_value: "g1-1 - initial value" },
                        { id: 3, test_value: "g2-0 - initial value" },
                        { id: 4, test_value: "g3-0 - initial value" },
                        { id: 5, test_value: "g3-1 - initial value" },
                        { id: 6, test_value: "g3-2 - initial value" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Expect there to be one undo actions left
                    const allUndoRowsByGroupResult =
                        await allUndoRowsByGroup(db);
                    expect(allUndoRowsByGroupResult.length).toBe(1);
                });
            });

            describe("DELETE trigger", async () => {
                it("should all an undo correctly from a delete action", async ({
                    db,
                }) => {
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                        ),
                    );

                    const currentValue = async () => {
                        try {
                            return (
                                (await db.get(
                                    "SELECT test_value FROM test_table WHERE id = 1;",
                                )) as {
                                    test_value: string;
                                }
                            ).test_value;
                        } catch (e) {
                            return undefined;
                        }
                    };

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('test value');",
                        ),
                    );
                    expect(await currentValue()).toBe("test value");
                    await incrementUndoGroup(db);

                    // Simulate an action that will be logged in the undo history
                    await db.run(
                        sql.raw("DELETE FROM test_table WHERE id = 1;"),
                    );
                    expect(await currentValue()).toBeUndefined(); // The value should be deleted
                    await incrementUndoGroup(db);

                    // Execute the undo action
                    await performUndo(db);
                    // Verify that the last delete was undone
                    expect(await currentValue()).toBe("test value"); // The undo should have restored the last deleted value

                    // Expect there to be one undo actions left
                    const allUndoRowsByGroupResult =
                        await allUndoRowsByGroup(db);
                    expect(allUndoRowsByGroupResult.length).toBe(1);
                });

                it("should undo groups of deletes correctly", async ({
                    db,
                }) => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-0');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-1');",
                        ),
                    );
                    // group 2
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g2-0');",
                        ),
                    );
                    // group 3
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-0');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-1');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-2');",
                        ),
                    );
                    await incrementUndoGroup(db);

                    // group 1
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g1-0"};`,
                    );
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g1-1"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 2
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g2-0"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 3
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g3-0"};`,
                    );
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g3-1"};`,
                    );
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g3-2"};`,
                    );
                    await incrementUndoGroup(db);

                    const allRows = async () =>
                        (await db.all(
                            sql.raw(`SELECT * FROM test_table ORDER BY id`),
                        )) as Row[];
                    expect(await allRows()).toEqual([]);

                    // Execute the undo action
                    let response = await performUndo(db);
                    expect(response.success).toBe(true);
                    expect(response.sqlStatements).toEqual([
                        'INSERT INTO "test_table" ("id","test_value") VALUES (6,\'g3-2\')',
                        'INSERT INTO "test_table" ("id","test_value") VALUES (5,\'g3-1\')',
                        'INSERT INTO "test_table" ("id","test_value") VALUES (4,\'g3-0\')',
                    ]);
                    expect(response.tableNames).toEqual(
                        new Set(["test_table"]),
                    );
                    expect(response.error).toBeUndefined();

                    let expectedValues = [
                        { id: 4, test_value: "g3-0" },
                        { id: 5, test_value: "g3-1" },
                        { id: 6, test_value: "g3-2" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Execute the undo action again
                    await performUndo(db);
                    expectedValues = [
                        { id: 3, test_value: "g2-0" },
                        { id: 4, test_value: "g3-0" },
                        { id: 5, test_value: "g3-1" },
                        { id: 6, test_value: "g3-2" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Execute the undo action again
                    await performUndo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0" },
                        { id: 2, test_value: "g1-1" },
                        { id: 3, test_value: "g2-0" },
                        { id: 4, test_value: "g3-0" },
                        { id: 5, test_value: "g3-1" },
                        { id: 6, test_value: "g3-2" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Expect there to be one undo actions left
                    const allUndoRowsByGroupResult =
                        await allUndoRowsByGroup(db);
                    expect(allUndoRowsByGroupResult.length).toBe(1);
                });
            });
        });

        describe("redo history", async () => {
            const allRedoRowsByGroup = async (db: DbConnection) =>
                await db
                    .select()
                    .from(schema.history_redo)
                    .groupBy(schema.history_redo.history_group);
            const allRedoRows = async (db: DbConnection) =>
                await db.select().from(schema.history_redo);

            describe("empty redo", async () => {
                it("should do nothing if there are no changes to redo", async ({
                    db,
                }) => {
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    expect(await allRedoRows(db)).toEqual([]); // There should be no rows in the redo history

                    // Execute the redo action
                    await performRedo(db);
                    expect(await allRedoRows(db)).toEqual([]); // There should still be no rows in the redo history
                });
                it("should do nothing if it runs out of changes to redo", async ({
                    db,
                }) => {
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    expect(await allRedoRows(db)).toEqual([]); // There should be no rows in the redo history

                    // Insert a value into the test table
                    await db.run(
                        sql`INSERT INTO test_table (value) VALUES (${"test value"});`,
                    );
                    // Execute an undo action to add a change to the redo history
                    await performUndo(db);
                    const allRedoRowsByGroupResult =
                        await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(1);

                    // Execute the redo action
                    await performRedo(db);
                    expect(await allRedoRows(db)).toEqual([]); // There should still be no rows in the redo history

                    // Execute the redo action again with no changes to redo
                    await performRedo(db);
                    expect(await allRedoRows(db)).toEqual([]); // There should still be no rows in the redo history
                });
            });

            describe("INSERT trigger", async () => {
                it("should all a redo correctly from undoing an insert action", async ({
                    db,
                }) => {
                    type Row = { id: number; value: string };
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    await db.run(
                        sql`INSERT INTO test_table (value) VALUES (${"test value"});`,
                    );
                    await incrementUndoGroup(db);

                    // Simulate an action that will be logged in the undo history
                    await db.run(
                        sql`INSERT INTO test_table (value) VALUES (${"another value"});`,
                    );

                    const allRows = async () =>
                        (await db.all(
                            sql.raw("SELECT * FROM test_table"),
                        )) as Row[];
                    const completeRows = [
                        { id: 1, value: "test value" },
                        { id: 2, value: "another value" },
                    ];
                    expect(await allRows()).toEqual(completeRows);

                    // Execute the undo action
                    await performUndo(db);
                    expect(await allRows()).toEqual([completeRows[0]]);

                    // Execute the redo action
                    await performRedo(db);
                    expect(await allRows()).toEqual(completeRows);

                    // Expect there to be no redos left
                    const allRedoRowsByGroupResult =
                        await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(0); // There should be no rows in the redo history
                });

                it("should undo groups of inserts correctly", async ({
                    db,
                }) => {
                    type Row = { id: number; value: string };
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table in three groups
                    // group 1
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g1-0 - test value');`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g1-1 - test value');`,
                        ),
                    );
                    await incrementUndoGroup(db);
                    const groupOneObjects = (await db.all(
                        sql.raw(
                            `SELECT * FROM test_table WHERE value LIKE 'g1%'`,
                        ),
                    )) as Row[];
                    // group 2
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g2-0 - test value');`,
                        ),
                    );
                    await incrementUndoGroup(db);
                    const groupTwoObjects = (await db.all(
                        sql.raw(
                            `SELECT * FROM test_table WHERE value LIKE 'g2%'`,
                        ),
                    )) as Row[];
                    // group 3
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g3-0 - test value');`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g3-1 - test value');`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g3-2 - test value');`,
                        ),
                    );
                    await incrementUndoGroup(db);
                    const groupThreeObjects = (await db.all(
                        sql.raw(
                            `SELECT * FROM test_table WHERE value LIKE 'g3%'`,
                        ),
                    )) as Row[];

                    // expect all the objects to be in the table
                    const allObjects = async () =>
                        (await db.all(
                            sql.raw("SELECT * FROM test_table"),
                        )) as Row[];
                    expect(await allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                        ...groupThreeObjects,
                    ]);

                    // Execute the undo action
                    await performUndo(db);
                    expect(await allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                    ]);
                    await performUndo(db);
                    expect(await allObjects()).toEqual([...groupOneObjects]);
                    await performUndo(db);
                    expect(await allObjects()).toEqual([]);

                    // Execute the redo action
                    await performRedo(db);
                    expect(await allObjects()).toEqual([...groupOneObjects]);
                    await performRedo(db);
                    expect(await allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                    ]);
                    await performRedo(db);
                    expect(await allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                        ...groupThreeObjects,
                    ]);

                    // Expect there to be no redos left
                    const allRedoRowsByGroupResult =
                        await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(0);
                });

                it("should have no redo operations after inserting a new undo entry after INSERT", async ({
                    db,
                }) => {
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table in three groups
                    // group 1
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g1-0 - test value');`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g1-1 - test value');`,
                        ),
                    );
                    await incrementUndoGroup(db);
                    // group 2
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g2-0 - test value');`,
                        ),
                    );
                    await incrementUndoGroup(db);
                    // group 3
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g3-0 - test value');`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g3-1 - test value');`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `INSERT INTO test_table (value) VALUES ('g3-2 - test value');`,
                        ),
                    );
                    await incrementUndoGroup(db);

                    // Execute the undo action
                    await performUndo(db);
                    await performUndo(db);
                    await performUndo(db);

                    let allRedoRowsByGroupResult = await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(3);

                    // Do another action to clear the redo stack
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (value) VALUES ('g1-0 - another value');",
                        ),
                    );

                    allRedoRowsByGroupResult = await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(0);
                });
            });

            describe("UPDATE trigger", async () => {
                it("should all an undo correctly from an update action", async ({
                    db,
                }) => {
                    // Create history tables and test table
                    await db.run(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                    );

                    const currentValue = async () =>
                        (
                            (await db.get(
                                sql.raw(
                                    "SELECT test_value FROM test_table WHERE id = 1;",
                                ),
                            )) as {
                                test_value: string;
                            }
                        ).test_value;

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('test value');",
                        ),
                    );
                    await incrementUndoGroup(db);

                    // Update the values in the test table
                    await db.run(
                        sql.raw(
                            "UPDATE test_table SET test_value = 'updated value' WHERE id = 1;",
                        ),
                    );
                    await incrementUndoGroup(db);
                    await db.run(
                        sql.raw(
                            "UPDATE test_table SET test_value = 'another updated value' WHERE id = 1;",
                        ),
                    );
                    await incrementUndoGroup(db);

                    // Execute two undo actions
                    await performUndo(db);
                    await performUndo(db);
                    expect(await currentValue()).toBe("test value");

                    await performRedo(db);
                    expect(await currentValue()).toBe("updated value");

                    await performRedo(db);
                    expect(await currentValue()).toBe("another updated value");

                    // Expect there to be no redos left
                    const allRedoRowsByGroupResult =
                        await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(0);
                });

                it("should undo groups of updates correctly", async ({
                    db,
                }) => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-0 - initial value');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-1 - initial value');",
                        ),
                    );
                    // group 2
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g2-0 - initial value');",
                        ),
                    );
                    // group 3
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-0 - initial value');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-1 - initial value');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-2 - initial value');",
                        ),
                    );
                    await incrementUndoGroup(db);

                    // group 1
                    await db.run(
                        sql.raw(
                            `UPDATE test_table SET test_value = 'g1-0 - updated value' WHERE test_value = 'g1-0 - initial value';`,
                        ),
                    );
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g1-1 - updated value"} WHERE test_value = ${"g1-1 - initial value"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 2
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g2-0 - updated value"} WHERE test_value = ${"g2-0 - initial value"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 3
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g3-0 - updated value"} WHERE test_value = ${"g3-0 - initial value"};`,
                    );
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g3-1 - updated value"} WHERE test_value = ${"g3-1 - initial value"};`,
                    );
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g3-2 - updated value"} WHERE test_value = ${"g3-2 - initial value"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 1 (again)
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g1-0 - second updated value"} WHERE test_value = ${"g1-0 - updated value"};`,
                    );
                    await db.run(
                        sql`UPDATE test_table SET test_value = ${"g1-1 - second updated value"} WHERE test_value = ${"g1-1 - updated value"};`,
                    );

                    const allRows = async () =>
                        (await db.all(
                            sql.raw(`SELECT * FROM test_table ORDER BY id`),
                        )) as Row[];
                    let expectedValues: Row[] = [
                        { id: 1, test_value: "g1-0 - second updated value" },
                        { id: 2, test_value: "g1-1 - second updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - updated value" },
                        { id: 5, test_value: "g3-1 - updated value" },
                        { id: 6, test_value: "g3-2 - updated value" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Execute four undo actions
                    await performUndo(db);
                    await performUndo(db);
                    await performUndo(db);
                    await performUndo(db);

                    // Execute a redo action
                    await performRedo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - updated value" },
                        { id: 2, test_value: "g1-1 - updated value" },
                        { id: 3, test_value: "g2-0 - initial value" },
                        { id: 4, test_value: "g3-0 - initial value" },
                        { id: 5, test_value: "g3-1 - initial value" },
                        { id: 6, test_value: "g3-2 - initial value" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    await performRedo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - updated value" },
                        { id: 2, test_value: "g1-1 - updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - initial value" },
                        { id: 5, test_value: "g3-1 - initial value" },
                        { id: 6, test_value: "g3-2 - initial value" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    await performRedo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - updated value" },
                        { id: 2, test_value: "g1-1 - updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - updated value" },
                        { id: 5, test_value: "g3-1 - updated value" },
                        { id: 6, test_value: "g3-2 - updated value" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    await performRedo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - second updated value" },
                        { id: 2, test_value: "g1-1 - second updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - updated value" },
                        { id: 5, test_value: "g3-1 - updated value" },
                        { id: 6, test_value: "g3-2 - updated value" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Expect there to be no redos left
                    const allRedoRowsByGroupResult =
                        await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(0);
                });

                it("should have no redo operations after inserting a new undo entry after UPDATE", async ({
                    db,
                }) => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-0 - initial value');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-1 - initial value');",
                        ),
                    );
                    // group 2
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g2-0 - initial value');",
                        ),
                    );
                    // group 3
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-0 - initial value');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-1 - initial value');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-2 - initial value');",
                        ),
                    );
                    await incrementUndoGroup(db);

                    // group 1
                    await db.run(
                        sql.raw(
                            `UPDATE test_table SET test_value = 'g1-0 - updated value' WHERE test_value = 'g1-0 - initial value';`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `UPDATE test_table SET test_value = 'g1-1 - updated value' WHERE test_value = 'g1-1 - initial value';`,
                        ),
                    );
                    await incrementUndoGroup(db);
                    // group 2
                    await db.run(
                        sql.raw(
                            `UPDATE test_table SET test_value = 'g2-0 - updated value' WHERE test_value = 'g2-0 - initial value';`,
                        ),
                    );
                    await incrementUndoGroup(db);
                    // group 3
                    await db.run(
                        sql.raw(
                            `UPDATE test_table SET test_value = 'g3-0 - updated value' WHERE test_value = 'g3-0 - initial value';`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `UPDATE test_table SET test_value = 'g3-1 - updated value' WHERE test_value = 'g3-1 - initial value';`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `UPDATE test_table SET test_value = 'g3-2 - updated value' WHERE test_value = 'g3-2 - initial value';`,
                        ),
                    );
                    await incrementUndoGroup(db);
                    // group 1 (again)
                    await db.run(
                        sql.raw(
                            `UPDATE test_table SET test_value = 'g1-0 - second updated value' WHERE test_value = 'g1-0 - updated value';`,
                        ),
                    );
                    await db.run(
                        sql.raw(
                            `UPDATE test_table SET test_value = 'g1-1 - second updated value' WHERE test_value = 'g1-1 - updated value';`,
                        ),
                    );

                    const allRows = async () =>
                        (await db.all(
                            sql.raw(`SELECT * FROM test_table ORDER BY id`),
                        )) as Row[];
                    let expectedValues: Row[] = [
                        { id: 1, test_value: "g1-0 - second updated value" },
                        { id: 2, test_value: "g1-1 - second updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - updated value" },
                        { id: 5, test_value: "g3-1 - updated value" },
                        { id: 6, test_value: "g3-2 - updated value" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Execute four undo actions
                    await performUndo(db);
                    await performUndo(db);
                    await performUndo(db);
                    await performUndo(db);

                    let allRedoRowsByGroupResult = await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(4);

                    // Do another action to clear the redo stack
                    await db.run(
                        sql.raw(
                            "UPDATE test_table SET test_value = 'updated value!' WHERE id = 1;",
                        ),
                    );
                    allRedoRowsByGroupResult = await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(0);
                });
            });

            describe("DELETE trigger", async () => {
                it("should all an undo correctly from a delete action", async ({
                    db,
                }) => {
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                        ),
                    );

                    const currentValue = async () => {
                        try {
                            return (
                                (await db.get(
                                    "SELECT test_value FROM test_table WHERE id = 1;",
                                )) as {
                                    test_value: string;
                                }
                            ).test_value;
                        } catch (e) {
                            return undefined;
                        }
                    };

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('test value');",
                        ),
                    );
                    await incrementUndoGroup(db);

                    // Simulate an action that will be logged in the undo history
                    await db.run(
                        sql.raw("DELETE FROM test_table WHERE id = 1;"),
                    );
                    await incrementUndoGroup(db);

                    // Execute the undo action
                    await performUndo(db);
                    expect(await currentValue()).toBeDefined();

                    // Execute the redo action
                    await performRedo(db);
                    expect(await currentValue()).toBeUndefined();

                    // Expect there to be no redos left
                    const allRedoRowsByGroupResult =
                        await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(0);
                });

                it("should undo groups of deletes correctly", async ({
                    db,
                }) => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-0');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-1');",
                        ),
                    );
                    // group 2
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g2-0');",
                        ),
                    );
                    // group 3
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-0');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-1');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-2');",
                        ),
                    );
                    await incrementUndoGroup(db);

                    // group 1
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g1-0"};`,
                    );
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g1-1"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 2
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g2-0"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 3
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g3-0"};`,
                    );
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g3-1"};`,
                    );
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g3-2"};`,
                    );
                    await incrementUndoGroup(db);

                    const allRows = async () =>
                        (await db.all(
                            sql.raw(`SELECT * FROM test_table ORDER BY id`),
                        )) as Row[];
                    expect(await allRows()).toEqual([]);

                    // Execute three undo actions
                    await performUndo(db);
                    await performUndo(db);
                    await performUndo(db);
                    let expectedValues = [
                        { id: 1, test_value: "g1-0" },
                        { id: 2, test_value: "g1-1" },
                        { id: 3, test_value: "g2-0" },
                        { id: 4, test_value: "g3-0" },
                        { id: 5, test_value: "g3-1" },
                        { id: 6, test_value: "g3-2" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    // Execute three redo actions
                    await performRedo(db);
                    expectedValues = [
                        { id: 3, test_value: "g2-0" },
                        { id: 4, test_value: "g3-0" },
                        { id: 5, test_value: "g3-1" },
                        { id: 6, test_value: "g3-2" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    await performRedo(db);
                    expectedValues = [
                        { id: 4, test_value: "g3-0" },
                        { id: 5, test_value: "g3-1" },
                        { id: 6, test_value: "g3-2" },
                    ];
                    expect(await allRows()).toEqual(expectedValues);

                    await performRedo(db);
                    expect(await allRows()).toEqual([]);

                    // Expect there to be no redos left
                    const allRedoRowsByGroupResult =
                        await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(0);
                });

                it("should have no redo operations after inserting a new undo entry after DELETE", async ({
                    db,
                }) => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    await db.run(
                        sql.raw(
                            "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                        ),
                    );

                    // Create undo triggers for the test table
                    await createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-0');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g1-1');",
                        ),
                    );
                    // group 2
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g2-0');",
                        ),
                    );
                    // group 3
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-0');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-1');",
                        ),
                    );
                    await db.run(
                        sql.raw(
                            "INSERT INTO test_table (test_value) VALUES ('g3-2');",
                        ),
                    );
                    await incrementUndoGroup(db);

                    // group 1
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g1-0"};`,
                    );
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g1-1"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 2
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g2-0"};`,
                    );
                    await incrementUndoGroup(db);
                    // group 3
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g3-0"};`,
                    );
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g3-1"};`,
                    );
                    await db.run(
                        sql`DELETE FROM test_table WHERE test_value = ${"g3-2"};`,
                    );
                    await incrementUndoGroup(db);

                    const allRows = async () =>
                        (await db.all(
                            sql.raw(`SELECT * FROM test_table ORDER BY id`),
                        )) as Row[];
                    expect(await allRows()).toEqual([]);

                    // Execute three undo actions
                    await performUndo(db);
                    await performUndo(db);

                    let allRedoRowsByGroupResult = await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(2);

                    // Do another action to clear the redo stack
                    await db.run(sql.raw("DELETE FROM test_table"));
                    allRedoRowsByGroupResult = await allRedoRowsByGroup(db);
                    expect(allRedoRowsByGroupResult.length).toBe(0);
                });
            });
        });
    });

    describe("Advanced Undo/Redo Stress Tests", async () => {
        async function setupComplexTables(db: DbConnection) {
            // Create users table
            await db.run(
                sql.raw(`
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    age INTEGER,
                    email TEXT UNIQUE
                )
            `),
            );

            // Create orders table
            await db.run(
                sql.raw(`
                CREATE TABLE orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    product TEXT,
                    quantity INTEGER,
                    total_price REAL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
            `),
            );

            // Create payments table
            await db.run(
                sql.raw(`
                CREATE TABLE payments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id INTEGER,
                    amount REAL,
                    payment_date TEXT,
                    FOREIGN KEY(order_id) REFERENCES orders(id)
                )
            `),
            );

            await createUndoTriggers(db, "users");
            await createUndoTriggers(db, "orders");
            await createUndoTriggers(db, "payments");
        }

        it("Complex data with foreign keys and multiple undo/redo intervals", async ({
            db,
        }) => {
            await setupComplexTables(db);

            // Insert user data
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"John Doe"}, ${30}, ${"john@example.com"})`,
            );
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Jane Doe"}, ${25}, ${"jane@example.com"})`,
            );
            await incrementUndoGroup(db);

            // Insert orders linked to users
            await db.run(
                sql`INSERT INTO orders (user_id, product, quantity, total_price) VALUES (${1}, ${"Laptop"}, ${1}, ${1000.0})`,
            );
            await db.run(
                sql`INSERT INTO orders (user_id, product, quantity, total_price) VALUES (${2}, ${"Phone"}, ${2}, ${500.0})`,
            );
            await incrementUndoGroup(db);

            // Insert payments linked to orders
            await db.run(
                sql`INSERT INTO payments (order_id, amount, payment_date) VALUES (${1}, ${1000.0}, ${"2024-10-08"})`,
            );
            await db.run(
                sql`INSERT INTO payments (order_id, amount, payment_date) VALUES (${2}, ${500.0}, ${"2024-10-09"})`,
            );
            await incrementUndoGroup(db);

            // Perform undo in random intervals
            await performUndo(db); // Undo payments
            let payments = await db.all(sql.raw("SELECT * FROM payments"));
            expect(payments.length).toBe(0);

            await performUndo(db); // Undo orders
            let orders = await db.all(sql.raw("SELECT * FROM orders"));
            expect(orders.length).toBe(0);

            // Redo orders and payments
            await performRedo(db);
            orders = await db.all(sql.raw("SELECT * FROM orders"));
            expect(orders.length).toBe(2);

            await performRedo(db);
            payments = await db.all(sql.raw("SELECT * FROM payments"));
            expect(payments.length).toBe(2);

            // Undo back to the users table
            await performUndo(db);
            await performUndo(db);
            await performUndo(db);
            let users = await db.all(sql.raw("SELECT * FROM users"));
            expect(users.length).toBe(0);
        });

        it("Undo/Redo with random intervals, updates, and WHERE clauses", async ({
            db,
        }) => {
            await setupComplexTables(db);

            // Insert initial users
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Alice"}, ${28}, ${"alice@example.com"})`,
            );
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Bob"}, ${35}, ${"bob@example.com"})`,
            );
            await incrementUndoGroup(db);

            // Insert orders with complex WHERE clauses
            await db.run(
                sql`INSERT INTO orders (user_id, product, quantity, total_price) VALUES (${1}, ${"Tablet"}, ${2}, ${600.0})`,
            );
            await db.run(
                sql`INSERT INTO orders (user_id, product, quantity, total_price) VALUES (${2}, ${"Monitor"}, ${1}, ${300.0})`,
            );
            await incrementUndoGroup(db);

            // Perform an update with WHERE
            await db.run(
                sql.raw(`UPDATE users SET age = age + 1 WHERE name = 'Alice'`),
            );
            await incrementUndoGroup(db);

            // Undo the age update and verify the value
            await performUndo(db);
            let result = (await db.get(
                sql`SELECT age FROM users WHERE name = ${"Alice"}`,
            )) as { age: number };
            expect(result.age).toBe(28);

            // Undo order insertion and check if the table is empty
            await performUndo(db);
            let orders = await db.all(sql.raw("SELECT * FROM orders"));
            expect(orders.length).toBe(0);

            // Redo the order insertion and update
            await performRedo(db);
            await performRedo(db);
            orders = await db.all(sql.raw("SELECT * FROM orders"));
            expect(orders.length).toBe(2);
        });

        it("Randomized undo/redo with interleaved data changes", async ({
            db,
        }) => {
            await setupComplexTables(db);

            // Insert several users and orders interleaved with undo/redo
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Chris"}, ${40}, ${"chris@example.com"})`,
            );
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Diana"}, ${22}, ${"diana@example.com"})`,
            );
            await incrementUndoGroup(db);

            await db.run(
                sql`INSERT INTO orders (user_id, product, quantity, total_price) VALUES (${1}, ${"Desk"}, ${1}, ${150.0})`,
            );
            await db.run(
                sql`INSERT INTO orders (user_id, product, quantity, total_price) VALUES (${2}, ${"Chair"}, ${2}, ${200.0})`,
            );
            await incrementUndoGroup(db);

            // Perform undo of orders, then insert more data
            let expectedOrders = await db.all(sql.raw("SELECT * FROM orders"));
            await performUndo(db);
            let currentOrders = await db.all(sql.raw("SELECT * FROM orders"));
            expect(currentOrders.length).toBe(0);
            await performRedo(db);
            currentOrders = await db.all(sql.raw("SELECT * FROM orders"));
            expect(currentOrders).toEqual(expectedOrders);
            await performUndo(db);

            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Eve"}, ${32}, ${"eve@example.com"})`,
            );
            await incrementUndoGroup(db);

            // Perform redo of orders and undo user insertion
            await performRedo(db);
            await performUndo(db);

            let users = await db.all(sql.raw("SELECT * FROM users"));
            expect(users).toHaveLength(2); // Should contain only 'Chris', 'Diana'

            currentOrders = await db.all(sql.raw("SELECT * FROM orders"));
            expect(currentOrders.length).toBe(0); // Orders should be restored
        });

        it("Complex updates and deletes with random undo/redo intervals", async ({
            db,
        }) => {
            await setupComplexTables(db);

            // Insert users and orders
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Frank"}, ${33}, ${"frank@example.com"})`,
            );
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Grace"}, ${29}, ${"grace@example.com"})`,
            );
            await incrementUndoGroup(db);

            await db.run(
                sql`INSERT INTO orders (user_id, product, quantity, total_price) VALUES (${1}, ${"Headphones"}, ${1}, ${100.0})`,
            );
            await db.run(
                sql`INSERT INTO orders (user_id, product, quantity, total_price) VALUES (${2}, ${"Keyboard"}, ${1}, ${120.0})`,
            );
            await incrementUndoGroup(db);

            // Update and delete data
            await db.run(
                sql.raw(
                    `UPDATE users SET email = 'frank_updated@example.com' WHERE name = 'Frank'`,
                ),
            );
            await db.run(sql`DELETE FROM orders WHERE id = ${2}`);
            await incrementUndoGroup(db);

            // Undo deletion and updates
            await performUndo(db);
            await performUndo(db);

            let user = (await db.get(
                sql`SELECT * FROM users WHERE name = ${"Frank"}`,
            )) as any;
            expect(user.email).toBe("frank@example.com"); // Should be the original email

            await performRedo(db);
            let orders = await db.all(sql.raw("SELECT * FROM orders"));
            expect(orders.length).toBe(2); // Order should be restored
        });
    });

    describe("Limit Tests", async () => {
        const groupLimit = async (db: DbConnection) =>
            (
                (await db.get(`SELECT group_limit FROM ${"history_stats"}`)) as
                    | HistoryStatsRow
                    | undefined
            )?.group_limit;

        const undoGroups = async (db: DbConnection) =>
            (
                (await db.all(
                    sql.raw(
                        `SELECT * FROM ${"history_undo"} GROUP BY "history_group" ORDER BY "history_group" ASC`,
                    ),
                )) as HistoryTableRow[]
            ).map((row) => row.history_group);

        it("removes the oldest undo group when the undo limit of 100 is reached", async ({
            db,
        }) => {
            await db.run(
                sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT)`,
            );
            await createUndoTriggers(db, "users");

            // set the limit to 100
            await db.run(
                sql.raw(`UPDATE ${"history_stats"} SET group_limit = 100`),
            );
            expect(await groupLimit(db)).toBe(100);

            for (let i = 0; i < 99; i++) {
                // Insert users and orders
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Harry_${100 / i}`}, ${i}, ${`email${100 - i}@jeff.com`})`,
                );
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Josie_${100 / i}`}, ${i + 50}, ${`email${200 - i}@josie.com`})`,
                );
                await incrementUndoGroup(db);
            }
            expect((await undoGroups(db)).length).toBe(99);
            let expectedGroups = Array.from(Array(99).keys()).map((i) => i + 1);
            expect(await undoGroups(db)).toEqual(expectedGroups);

            // Insert one more group
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Harry_100"}, ${100}, ${"email@jeff100.com"})`,
            );
            await incrementUndoGroup(db);
            expect((await undoGroups(db)).length).toBe(100);
            expectedGroups = [...expectedGroups, 100];
            expect(await undoGroups(db)).toEqual(expectedGroups);

            // Insert another group
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Harry_101"}, ${101}, ${"email@jeff101.com"})`,
            );
            await incrementUndoGroup(db);
            expect((await undoGroups(db)).length).toBe(100);
            expectedGroups = Array.from(Array(100).keys()).map((i) => i + 2);
            expect(await undoGroups(db)).toEqual(expectedGroups);

            // insert 50 more groups
            for (let i = 102; i < 152; i++) {
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Harry_${i}`}, ${i}, ${`email${100 - i}@jeff.com`})`,
                );
                await incrementUndoGroup(db);
            }
            expect((await undoGroups(db)).length).toBe(100);
            expectedGroups = Array.from(Array(100).keys()).map((i) => i + 52);
            expect(await undoGroups(db)).toEqual(expectedGroups);

            const allRows = await db.all(sql.raw("SELECT * FROM users"));
            expect(allRows.length).toBeGreaterThan(150);
        });

        it("removes the oldest undo group when the undo limit of 2000 is reached", async ({
            db,
        }) => {
            await db.run(
                sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT);`,
            );
            await createUndoTriggers(db, "users");

            // set the limit to 2000
            await db.run(
                sql.raw(`UPDATE ${"history_stats"} SET group_limit = 2000`),
            );
            expect(await groupLimit(db)).toBe(2000);

            for (let i = 0; i < 1999; i++) {
                // Insert users and orders
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Harry_${2000 / i}`}, ${i}, ${`email${2000 - i}@jeff.com`})`,
                );
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Josie_${2000 / i}`}, ${i + 50}, ${`email${200 - i}@josie.com`})`,
                );
                await incrementUndoGroup(db);
            }
            expect((await undoGroups(db)).length).toBe(1999);
            let expectedGroups = Array.from(Array(1999).keys()).map(
                (i) => i + 1,
            );
            expect(await undoGroups(db)).toEqual(expectedGroups);

            // Insert one more group
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Harry_2000"}, ${2000}, ${"email@jeff2000.com"})`,
            );
            await incrementUndoGroup(db);
            expect((await undoGroups(db)).length).toBe(2000);
            const undoGroupsResult = await undoGroups(db);
            expect(undoGroupsResult).toEqual([...expectedGroups, 2000]);

            // Insert another group
            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Harry_101"}, ${101}, ${"email@jeff101.com"})`,
            );
            await incrementUndoGroup(db);
            expect((await undoGroups(db)).length).toBe(2000);
            expectedGroups = Array.from(Array(2000).keys()).map((i) => i + 2);
            expect(await undoGroups(db)).toEqual(expectedGroups);

            // insert 50 more groups
            for (let i = 102; i < 152; i++) {
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Harry_${i}`}, ${i}, ${`email${2000 - i}@jeff.com`})`,
                );
                await incrementUndoGroup(db);
            }
            expect((await undoGroups(db)).length).toBe(2000);
            expectedGroups = Array.from(Array(2000).keys()).map((i) => i + 52);
            expect(await undoGroups(db)).toEqual(expectedGroups);

            const allRows = await db.all(sql.raw("SELECT * FROM users"));
            expect(allRows.length).toBeGreaterThan(150);
        });

        it("adds more undo groups when the limit is increased", async ({
            db,
        }) => {
            await db.run(
                sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT);`,
            );
            await createUndoTriggers(db, "users");

            // set the limit to 100
            await db.run(
                sql.raw(`UPDATE ${"history_stats"} SET group_limit = 100`),
            );
            expect(await groupLimit(db)).toBe(100);

            for (let i = 0; i < 150; i++) {
                // Insert users and orders
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Harry_${100 / i}`}, ${i}, ${`email${100 - i}`})`,
                );
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Josie_${100 / i}`}, ${i + 50}, ${`email${200 - i}`})`,
                );
                await incrementUndoGroup(db);
            }
            expect((await undoGroups(db)).length).toBe(100);
            let expectedGroups = Array.from(Array(100).keys()).map(
                (i) => i + 51,
            );
            expect(await undoGroups(db)).toEqual(expectedGroups);

            // set the limit to 200
            await db.run(
                sql.raw(`UPDATE ${"history_stats"} SET group_limit = 200`),
            );
            expect(await groupLimit(db)).toBe(200);
            expect((await undoGroups(db)).length).toBe(100);

            for (let i = 150; i < 300; i++) {
                // Insert users and orders
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Harry_${100 / i}`}, ${i}, ${`email${100 - i}`})`,
                );
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Josie_${100 / i}`}, ${i + 50}, ${`email${200 - i}`})`,
                );
                await incrementUndoGroup(db);
            }
            expect((await undoGroups(db)).length).toBe(200);
            expectedGroups = [
                ...Array.from(Array(50).keys()).map((i) => i + 101),
                ...Array.from(Array(150).keys()).map((i) => i + 151),
            ];
            expect(await undoGroups(db)).toEqual(expectedGroups);
        });

        it("removes groups when the limit is decreased", async ({ db }) => {
            await db.run(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT);",
            );
            await createUndoTriggers(db, "users");

            // set the limit to 200
            await db.run(
                sql.raw(`UPDATE ${"history_stats"} SET group_limit = 200`),
            );
            expect(await groupLimit(db)).toBe(200);

            for (let i = 0; i < 1000; i++) {
                // Insert users and orders
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Harry_${100 / i}`}, ${i}, ${`email${100 - i}`})`,
                );
                await db.run(
                    sql`INSERT INTO users (name, age, email) VALUES (${`Josie_${100 / i}`}, ${i + 50}, ${`email${200 - i}`})`,
                );
                await incrementUndoGroup(db);
            }
            expect(await undoGroups(db)).toHaveLength(200);

            // set the limit to 100
            await db.run(
                sql.raw(`UPDATE ${"history_stats"} SET group_limit = 50`),
            );
            expect(await groupLimit(db)).toBe(50);
            // Should not change until next group increment
            const currentUndoGroups = await undoGroups(db);
            expect(currentUndoGroups).toHaveLength(200);

            await db.run(
                sql`INSERT INTO users (name, age, email) VALUES (${"Harry_last"}, ${1234}, ${"email_last"})`,
            );
            await incrementUndoGroup(db);
            const newUndoGroups = await undoGroups(db);
            expect(newUndoGroups).toHaveLength(50);
            // Expect the groups to be the same as the previous
            expect(newUndoGroups.slice(0, newUndoGroups.length - 1)).toEqual(
                currentUndoGroups.slice(
                    currentUndoGroups.length - 49,
                    currentUndoGroups.length,
                ),
            );
        });
    });

    describe("Advanced Undo/Redo Stress Tests with Reserved Words, Special Characters, and DELETE Operations", async () => {
        async function setupComplexTablesWithReservedWords(db: DbConnection) {
            await db.run(
                sql.raw(`
                CREATE TABLE reserved_words_test (
                    "order" INTEGER PRIMARY KEY AUTOINCREMENT,
                    "group" TEXT,
                    "select" TEXT,
                    "from" TEXT
                );`),
            );
            await db.run(
                sql.raw(`
                CREATE TABLE special_characters_test (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    description TEXT
                );
            `),
            );

            await createUndoTriggers(db, "reserved_words_test");
            await createUndoTriggers(db, "special_characters_test");
        }

        it("Undo/Redo with reserved words, special characters, and DELETE operations", async ({
            db,
        }) => {
            await setupComplexTablesWithReservedWords(db);

            // Insert into reserved_words_test
            await db.run(
                sql`INSERT INTO reserved_words_test ("group", "select", "from") VALUES (${"Group1"}, ${"Select1"}, ${"From1"})`,
            );
            await db.run(
                sql`INSERT INTO reserved_words_test ("group", "select", "from") VALUES (${"Group2"}, ${"Select2"}, ${"From2"})`,
            );
            await incrementUndoGroup(db);

            // Insert into special_characters_test
            await db.run(
                sql`INSERT INTO special_characters_test (description) VALUES (${"\"Double quote\", 'Single quote', (Parentheses), [Brackets]"})`,
            );
            await db.run(
                sql`INSERT INTO special_characters_test (description) VALUES (${"Escape \\ backslash"})`,
            );
            await incrementUndoGroup(db);

            // Perform DELETE operations
            await db.run(
                sql`DELETE FROM reserved_words_test WHERE "order" = 2`,
            );
            await db.run(sql`DELETE FROM special_characters_test WHERE id = 2`);
            await incrementUndoGroup(db);

            // Undo DELETE operations
            await performUndo(db); // Undo the DELETE from special_characters_test
            let specialResult = await db.all(
                "SELECT * FROM special_characters_test",
            );
            expect(specialResult.length).toBe(2); // Both rows should be back

            await performUndo(db); // Undo the DELETE from reserved_words_test
            let reservedResult = await db.all(
                "SELECT * FROM reserved_words_test",
            );
            expect(reservedResult.length).toBe(2); // Both rows should be back

            // Redo DELETE operations
            await performUndo(db);
            await performRedo(db); // Redo the DELETE from reserved_words_test
            reservedResult = await db.all("SELECT * FROM reserved_words_test");
            expect(reservedResult.length).toBe(2); // One row should be deleted
        });

        it("Undo/Redo with random intervals, updates, deletes, and WHERE clauses", async ({
            db,
        }) => {
            await setupComplexTablesWithReservedWords(db);

            // Insert into both tables
            await db.run(
                sql`INSERT INTO reserved_words_test ("group", "select", "from") VALUES (${"Group1"}, ${"Select1"}, ${"From1"})`,
            );
            await db.run(
                sql`INSERT INTO special_characters_test (description) VALUES (${'"Complex value (with) {all} kinds [of] special characters!"'})`,
            );
            await incrementUndoGroup(db);

            // Perform updates and DELETEs
            await db.run(
                sql.raw(
                    `UPDATE reserved_words_test SET "group" = 'UpdatedGroup' WHERE "order" = 1`,
                ),
            );
            await db.run(sql`DELETE FROM special_characters_test WHERE id = 1`);
            await incrementUndoGroup(db);

            // Perform undo/redo in random order
            let response = await performUndo(db); // Undo DELETE and update
            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();
            expect(response.tableNames).toEqual(
                new Set(["reserved_words_test", "special_characters_test"]),
            );
            let reservedResult = (await db.get(
                'SELECT "group" FROM reserved_words_test WHERE "order" = 1',
            )) as any;
            let specialResult = (await db.get(
                "SELECT description FROM special_characters_test WHERE id = 1",
            )) as any;
            expect(reservedResult.group).toBe("Group1");
            expect(specialResult.description).toBe(
                '"Complex value (with) {all} kinds [of] special characters!"',
            );

            await performRedo(db); // Redo DELETE and update
            reservedResult = (
                await db.all(
                    'SELECT "group" FROM reserved_words_test WHERE "order" = 1',
                )
            )[0] as any;
            specialResult = await db.all(
                "SELECT * FROM special_characters_test",
            );
            expect(reservedResult.group).toBe("UpdatedGroup");
            expect(specialResult.length).toBe(0); // The row should be deleted
        });

        it("Stress test with multiple DELETEs, special characters, and reserved words", async ({
            db,
        }) => {
            await setupComplexTablesWithReservedWords(db);

            // Insert several rows into both tables
            await db.run(
                sql`INSERT INTO reserved_words_test ("group", "select", "from") VALUES (${"GroupA"}, ${"SelectA"}, ${"FromA"})`,
            );
            await db.run(
                sql`INSERT INTO reserved_words_test ("group", "select", "from") VALUES (${"GroupB"}, ${"SelectB"}, ${"FromB"})`,
            );
            await db.run(
                sql`INSERT INTO special_characters_test (description) VALUES (${'Some "special" (value)'})`,
            );
            await db.run(
                sql`INSERT INTO special_characters_test (description) VALUES (${'Another "complex" [test] (entry)'})`,
            );
            await incrementUndoGroup(db);

            // Perform random DELETEs
            await db.run('DELETE FROM reserved_words_test WHERE "order" = 1');
            await db.run("DELETE FROM special_characters_test WHERE id = 2");
            await incrementUndoGroup(db);

            // Undo all DELETEs
            await performUndo(db);

            let reservedResult = await db.all(
                "SELECT * FROM reserved_words_test",
            );
            let specialResult = await db.all(
                "SELECT * FROM special_characters_test",
            );
            expect(reservedResult.length).toBe(2); // Both rows should be restored
            expect(specialResult.length).toBe(2); // Both rows should be restored

            // Redo all DELETEs
            await performRedo(db);
            await performRedo(db);

            reservedResult = await db.all("SELECT * FROM reserved_words_test");
            specialResult = await db.all(
                "SELECT * FROM special_characters_test",
            );
            expect(reservedResult.length).toBe(1); // One row should be deleted
            expect(specialResult.length).toBe(1); // One row should be deleted
        });
    });

    describe("flattenUndoGroupsAbove", async () => {
        it("should flatten all undo groups above the specified group", async ({
            db,
        }) => {
            // Insert records with different group numbers
            await db.insert(schema.history_undo).values({
                sequence: 1,
                history_group: 1,
                sql: "SQL 1",
            });
            await db.insert(schema.history_undo).values({
                sequence: 2,
                history_group: 2,
                sql: "SQL 2",
            });
            await db.insert(schema.history_undo).values({
                sequence: 3,
                history_group: 3,
                sql: "SQL 3",
            });
            await db.insert(schema.history_undo).values({
                sequence: 4,
                history_group: 4,
                sql: "SQL 4",
            });
            await db.insert(schema.history_undo).values({
                sequence: 5,
                history_group: 5,
                sql: "SQL 5",
            });

            // Execute the function to flatten groups above 2
            await flattenUndoGroupsAbove(db, 2);

            // Verify: All groups above 2 should now be 2
            const result = await db
                .select({ history_group: schema.history_undo.history_group })
                .from(schema.history_undo)
                .orderBy(schema.history_undo.sequence);

            expect(result).toHaveLength(5);
            expect(result[0].history_group).toBe(1); // Group 1 should remain unchanged
            expect(result[1].history_group).toBe(2); // Group 2 should remain unchanged
            expect(result[2].history_group).toBe(2); // Group 3 should be flattened to 2
            expect(result[3].history_group).toBe(2); // Group 4 should be flattened to 2
            expect(result[4].history_group).toBe(2); // Group 5 should be flattened to 2
        });

        it("should do nothing when there are no groups above the specified group", async ({
            db,
        }) => {
            await db.insert(schema.history_undo).values([
                {
                    sequence: 1,
                    history_group: 1,
                    sql: "SQL 1",
                },
                {
                    sequence: 2,
                    history_group: 2,
                    sql: "SQL 2",
                },
                {
                    sequence: 3,
                    history_group: 3,
                    sql: "SQL 3",
                },
            ]);
            // await db.all(
            //     sql`INSERT INTO ${"history_undo"} (sequence, history_group, sql) VALUES (${2}, ${2}, ${"SQL 2"})`,
            // );
            // await db.all(
            //     sql`INSERT INTO ${"history_undo"} (sequence, history_group, sql) VALUES (${3}, ${3}, ${"SQL 3"})`,
            // );

            // Execute the function to flatten groups above 3
            await flattenUndoGroupsAbove(db, 3);

            // Verify: No groups should change
            const result = await db
                .select({ history_group: schema.history_undo.history_group })
                .from(schema.history_undo)
                .orderBy(schema.history_undo.sequence);

            expect(result).toHaveLength(3);
            expect(result[0].history_group).toBe(1);
            expect(result[1].history_group).toBe(2);
            expect(result[2].history_group).toBe(3);
        });

        it("should work with an empty undo history table", async ({ db }) => {
            // Execute the function on an empty table
            await flattenUndoGroupsAbove(db, 5);

            // Verify: No errors should occur
            const result = await db
                .select({ count: sql`COUNT(*)`.as("count") })
                .from(schema.history_undo);
            expect(result[0].count).toBe(0);
        });

        it("should handle negative group numbers correctly", async ({ db }) => {
            await db.insert(schema.history_undo).values([
                {
                    sequence: 1,
                    history_group: -3,
                    sql: "SQL 1",
                },
                {
                    sequence: 2,
                    history_group: -2,
                    sql: "SQL 2",
                },
                {
                    sequence: 3,
                    history_group: -1,
                    sql: "SQL 3",
                },
                {
                    sequence: 4,
                    history_group: 0,
                    sql: "SQL 4",
                },
                {
                    sequence: 5,
                    history_group: 1,
                    sql: "SQL 5",
                },
            ]);

            // Execute the function to flatten groups above -2
            await flattenUndoGroupsAbove(db, -2);

            // Verify: All groups above -2 should now be -2
            const result = await db
                .select({ history_group: schema.history_undo.history_group })
                .from(schema.history_undo)
                .orderBy(schema.history_undo.sequence);

            expect(result).toHaveLength(5);
            expect(result[0].history_group).toBe(-3); // Group -3 should remain unchanged
            expect(result[1].history_group).toBe(-2); // Group -2 should remain unchanged
            expect(result[2].history_group).toBe(-2); // Group -1 should be flattened to -2
            expect(result[3].history_group).toBe(-2); // Group 0 should be flattened to -2
            expect(result[4].history_group).toBe(-2); // Group 1 should be flattened to -2
        });

        it("should work with await incrementUndoGroup to flatten newly created groups", async ({
            db,
        }) => {
            // Setup: Create initial undo group
            await incrementUndoGroup(db); // Group 1

            await db.insert(schema.history_undo).values({
                sequence: 1,
                history_group: 1,
                sql: "SQL 1",
            });

            // Create more undo groups
            await incrementUndoGroup(db); // Group 2
            await db.insert(schema.history_undo).values({
                sequence: 2,
                history_group: 2,
                sql: "SQL 2",
            });

            await incrementUndoGroup(db); // Group 3
            await db.insert(schema.history_undo).values({
                sequence: 3,
                history_group: 3,
                sql: "SQL 3",
            });

            // Flatten groups above 1
            await flattenUndoGroupsAbove(db, 1);

            // Verify: All groups above 1 should now be 1
            const result = await db
                .select({ history_group: schema.history_undo.history_group })
                .from(schema.history_undo)
                .orderBy(schema.history_undo.sequence);

            expect(result).toHaveLength(3);
            expect(result[0].history_group).toBe(1);
            expect(result[1].history_group).toBe(1); // Group 2 should be flattened to 1
            expect(result[2].history_group).toBe(1); // Group 3 should be flattened to 1

            // Verify the current undo group in stats table is unchanged
            const currentGroup = await getCurrentUndoGroup(db);
            expect(currentGroup).toBe(3); // The current group in stats should still be 3
        });

        it("should handle large group numbers and many records efficiently", async ({
            db,
        }) => {
            // Insert 100 records with increasing group numbers
            for (let i = 1; i <= 100; i++) {
                await db.insert(schema.history_undo).values({
                    sequence: i,
                    history_group: i * 100,
                    sql: `SQL ${i}`,
                });
            }

            // Execute the function to flatten groups above 3000
            await flattenUndoGroupsAbove(db, 3000);

            // Verify: All groups above 3000 should now be 3000
            const result = (await db.all(
                sql.raw(`
          SELECT
            CASE
              WHEN history_group <= 3000 THEN 'below_or_equal'
              ELSE 'above'
            END as group_category,
            COUNT(*) as count
          FROM ${"history_undo"}
          GROUP BY group_category
        `),
            )) as { group_category: string; count: number }[];

            const belowOrEqual = result.find(
                (r) => r.group_category === "below_or_equal",
            );
            const above = result.find((r) => r.group_category === "above");

            expect(belowOrEqual?.count || 0).toBe(100);
            expect(above).toBeUndefined(); // No groups should be above 3000
        });
    });

    describe("calculateHistorySize", async () => {
        it("should return 0 for empty history tables", async ({ db }) => {
            const size = await calculateHistorySize(db);
            expect(size).toBe(0);
        });

        it("should calculate size after adding history entries", async ({
            db,
        }) => {
            // Create a test table to generate history entries
            await db.run(
                "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT)",
            );
            await createUndoTriggers(db, "test_table");

            // Get initial size
            const initialSize = await calculateHistorySize(db);

            // Add some data to generate history entries
            await incrementUndoGroup(db);
            await db.run(
                sql.raw("INSERT INTO test_table (value) VALUES ('test1')"),
            );
            await db.run(
                sql.raw("INSERT INTO test_table (value) VALUES ('test2')"),
            );
            await db.run(
                "UPDATE test_table SET value = 'updated' WHERE id = 1",
            );

            // Get size after adding data
            const sizeAfterAdding = await calculateHistorySize(db);

            // Size should have increased
            expect(sizeAfterAdding).toBeGreaterThan(initialSize);
        });

        it("should handle large amounts of history data", async ({ db }) => {
            // Create a test table to generate history entries
            await db.run(
                "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT)",
            );
            await createUndoTriggers(db, "test_table");

            // Get initial size
            const initialSize = await calculateHistorySize(db);

            // Add a significant amount of data
            for (let i = 0; i < 10; i++) {
                await incrementUndoGroup(db);
                for (let j = 0; j < 10; j++) {
                    await db.run(
                        sql`INSERT INTO test_table (value) VALUES (${`test-${i}-${j}`})`,
                    );
                }
            }

            // Get size after adding data
            const sizeAfterAdding = await calculateHistorySize(db);

            // Size should have increased significantly
            expect(sizeAfterAdding).toBeGreaterThan(initialSize);
            console.log(
                `History size increased from ${initialSize} to ${sizeAfterAdding} bytes`,
            );
        });

        it("should return consistent results when called multiple times", async ({
            db,
        }) => {
            // Create a test table and add some history
            await db.run(
                "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT)",
            );
            await createUndoTriggers(db, "test_table");
            await incrementUndoGroup(db);
            await db.run(
                sql.raw("INSERT INTO test_table (value) VALUES ('test')"),
            );

            // Calculate size multiple times
            const size1 = await calculateHistorySize(db);
            const size2 = await calculateHistorySize(db);
            const size3 = await calculateHistorySize(db);

            // All calculations should return the same value
            expect(size1).toBe(size2);
            expect(size2).toBe(size3);
        });
    });
});
