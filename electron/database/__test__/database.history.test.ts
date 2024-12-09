import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { Constants } from "../../../src/global/Constants";
import {
    createHistoryTables,
    createUndoTriggers,
    HistoryStatsRow,
    HistoryTableRow,
    incrementUndoGroup,
    performRedo,
    performUndo,
} from "../database.history";

// TODO - fix these tests. new Database() is failing due to an issue with better_sqlite3.node being compiled with a different node version
// https://github.com/OpenMarch/OpenMarch/issues/253
describe.skip("History Tables and Triggers", () => {
    let db: Database.Database;
    type HistoryRow = { sequence: number; group: number; sql: string };

    beforeEach(() => {
        // Create an in-memory SQLite database for each test
        db = new Database(":memory:");
        createHistoryTables(db);
    });

    describe("basic tests", () => {
        it("should create the history tables", () => {
            // Check if the undo, redo, and history stats tables were created
            const tables = db
                .prepare(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name IN (?, ?, ?);`,
                )
                .all(
                    Constants.UndoHistoryTableName,
                    Constants.RedoHistoryTableName,
                    Constants.HistoryStatsTableName,
                );

            expect(tables.length).toBe(3); // All three tables should be created
        });

        it("should create the triggers for a given table", () => {
            // Create a test table to attach triggers to
            db.prepare(
                "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
            ).run();

            // Create the undo triggers for the test table
            createUndoTriggers(db, "test_table");

            // Check if the triggers were created
            const triggers = db
                .prepare(
                    `SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name = 'test_table';`,
                )
                .all();

            expect(triggers.length).toBe(3); // Should have 3 triggers: insert, update, delete
        });

        describe("undo history", () => {
            const allUndoRowsByGroup = () =>
                db
                    .prepare(
                        `SELECT * FROM ${Constants.UndoHistoryTableName} GROUP BY "history_group";`,
                    )
                    .all() as HistoryRow[];
            const allUndoRows = () =>
                db
                    .prepare(`SELECT * FROM ${Constants.UndoHistoryTableName};`)
                    .all() as HistoryRow[];

            describe("empty undo", () => {
                it("should do nothing if there are no changes to undo", () => {
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    const undoRows = () =>
                        db.prepare("SELECT * FROM history_undo;").all();
                    expect(undoRows()).toEqual([]); // There should be no rows in the undo history

                    // Execute the undo action
                    performUndo(db);
                    expect(undoRows()).toEqual([]); // There should still be no rows in the undo history
                });
                it("should do nothing if it runs out of changes to undo", () => {
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    const undoRows = () =>
                        db.prepare("SELECT * FROM history_undo;").all();
                    expect(undoRows()).toEqual([]);

                    // Insert a value into the test table
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("test value");
                    incrementUndoGroup(db);
                    expect(undoRows().length).toBe(1);

                    // Execute the undo action
                    performUndo(db);
                    expect(undoRows()).toEqual([]);

                    // Execute the undo action again with no changes to undo
                    performUndo(db);
                    expect(undoRows()).toEqual([]);
                });
            });

            describe("INSERT trigger", () => {
                it("should execute an undo correctly from an insert action", () => {
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("test value");

                    // Simulate an action that will be logged in the undo history
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("another value");

                    // Execute the undo action
                    performUndo(db);

                    // Verify that the last insert was undone
                    const row = db
                        .prepare("SELECT * FROM test_table WHERE value = ?")
                        .get("another value");
                    expect(row).toBeUndefined(); // The undo should have deleted the last inserted value

                    // Expect there to be no undo actions left
                    expect(allUndoRows().length).toBe(0);
                });

                it("should undo groups of inserts correctly", () => {
                    type Row = { id: number; value: string };
                    // Create history tables and test table
                    createHistoryTables(db);
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table in three groups
                    // group 1
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g1-0 - test value");
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g1-1 - test value");
                    incrementUndoGroup(db);
                    const groupOneObjects = db
                        .prepare("SELECT * FROM test_table WHERE value LIKE ?")
                        .all("g1%") as Row[];
                    // group 2
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g2-0 - test value");
                    incrementUndoGroup(db);
                    const groupTwoObjects = db
                        .prepare("SELECT * FROM test_table WHERE value LIKE ?")
                        .all("g2%") as Row[];
                    // group 3
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g3-0 - test value");
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g3-1 - test value");
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g3-2 - test value");
                    incrementUndoGroup(db);
                    const groupThreeObjects = db
                        .prepare("SELECT * FROM test_table WHERE value LIKE ?")
                        .all("g3%") as Row[];

                    // expect all the objects to be in the table
                    const allObjects = () =>
                        db.prepare("SELECT * FROM test_table").all() as Row[];
                    expect(allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                        ...groupThreeObjects,
                    ]);

                    // Execute the undo action
                    let response = performUndo(db);
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

                    expect(allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                    ]);
                    performUndo(db);
                    expect(allObjects()).toEqual([...groupOneObjects]);
                    performUndo(db);
                    expect(allObjects()).toEqual([]);

                    // Expect there to be no undo actions left
                    expect(allUndoRows().length).toBe(0);
                });
            });

            describe("UPDATE trigger", () => {
                it("should execute an undo correctly from an update action", () => {
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                    ).run();

                    const currentValue = () =>
                        (
                            db
                                .prepare(
                                    "SELECT test_value FROM test_table WHERE id = 1;",
                                )
                                .get() as {
                                test_value: string;
                            }
                        ).test_value;

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("test value");
                    expect(currentValue()).toBe("test value");
                    incrementUndoGroup(db);

                    // Update the value in the test table
                    db.prepare(
                        "UPDATE test_table SET test_value = ? WHERE id = 1;",
                    ).run("updated value");
                    expect(currentValue()).toBe("updated value"); // The value should be updated
                    incrementUndoGroup(db);

                    // Simulate an action that will be logged in the undo history
                    db.prepare(
                        "UPDATE test_table SET test_value = ? WHERE id = 1;",
                    ).run("another updated value");
                    expect(currentValue()).toBe("another updated value"); // The value should be updated
                    incrementUndoGroup(db);

                    // Execute the undo action
                    performUndo(db);
                    // Verify that the last update was undone
                    expect(currentValue()).toBe("updated value"); // The undo should have reverted the last update

                    // Execute the undo action again
                    performUndo(db);
                    // Verify that the first update was undone
                    expect(currentValue()).toBe("test value"); // The undo should have reverted the first update

                    // Expect there to be one undo actions left
                    expect(allUndoRows().length).toBe(1);
                });

                it("should undo groups of updates correctly", () => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-0 - initial value");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-1 - initial value");
                    // group 2
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g2-0 - initial value");
                    // group 3
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-0 - initial value");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-1 - initial value");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-2 - initial value");
                    incrementUndoGroup(db);

                    // Update the value in the test table in two groups
                    const updateSql =
                        "UPDATE test_table SET test_value = (?) WHERE test_value = (?);";
                    // group 1
                    db.prepare(updateSql).run(
                        "g1-0 - updated value",
                        "g1-0 - initial value",
                    );
                    db.prepare(updateSql).run(
                        "g1-1 - updated value",
                        "g1-1 - initial value",
                    );
                    incrementUndoGroup(db);
                    // group 2
                    db.prepare(updateSql).run(
                        "g2-0 - updated value",
                        "g2-0 - initial value",
                    );
                    incrementUndoGroup(db);
                    // group 3
                    db.prepare(updateSql).run(
                        "g3-0 - updated value",
                        "g3-0 - initial value",
                    );
                    db.prepare(updateSql).run(
                        "g3-1 - updated value",
                        "g3-1 - initial value",
                    );
                    db.prepare(updateSql).run(
                        "g3-2 - updated value",
                        "g3-2 - initial value",
                    );
                    incrementUndoGroup(db);
                    // group 1 (again)
                    db.prepare(updateSql).run(
                        "g1-0 - second updated value",
                        "g1-0 - updated value",
                    );
                    db.prepare(updateSql).run(
                        "g1-1 - second updated value",
                        "g1-1 - updated value",
                    );

                    const allRows = () =>
                        db
                            .prepare("SELECT * FROM test_table ORDER BY id")
                            .all() as Row[];
                    let expectedValues: Row[] = [
                        { id: 1, test_value: "g1-0 - second updated value" },
                        { id: 2, test_value: "g1-1 - second updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - updated value" },
                        { id: 5, test_value: "g3-1 - updated value" },
                        { id: 6, test_value: "g3-2 - updated value" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    // Execute the undo action
                    let response = performUndo(db);
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
                    expect(allRows()).toEqual(expectedValues);

                    // Execute the undo action again
                    performUndo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - updated value" },
                        { id: 2, test_value: "g1-1 - updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - initial value" },
                        { id: 5, test_value: "g3-1 - initial value" },
                        { id: 6, test_value: "g3-2 - initial value" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    // Execute the undo action again
                    performUndo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - updated value" },
                        { id: 2, test_value: "g1-1 - updated value" },
                        { id: 3, test_value: "g2-0 - initial value" },
                        { id: 4, test_value: "g3-0 - initial value" },
                        { id: 5, test_value: "g3-1 - initial value" },
                        { id: 6, test_value: "g3-2 - initial value" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    // Execute the undo action again
                    performUndo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - initial value" },
                        { id: 2, test_value: "g1-1 - initial value" },
                        { id: 3, test_value: "g2-0 - initial value" },
                        { id: 4, test_value: "g3-0 - initial value" },
                        { id: 5, test_value: "g3-1 - initial value" },
                        { id: 6, test_value: "g3-2 - initial value" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    // Expect there to be one undo actions left
                    expect(allUndoRowsByGroup().length).toBe(1);
                });
            });

            describe("DELETE trigger", () => {
                it("should execute an undo correctly from a delete action", () => {
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                    ).run();

                    const currentValue = () => {
                        try {
                            return (
                                db
                                    .prepare(
                                        "SELECT test_value FROM test_table WHERE id = 1;",
                                    )
                                    .get() as {
                                    test_value: string;
                                }
                            ).test_value;
                        } catch (e) {
                            return undefined;
                        }
                    };

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("test value");
                    expect(currentValue()).toBe("test value");
                    incrementUndoGroup(db);

                    // Simulate an action that will be logged in the undo history
                    db.prepare("DELETE FROM test_table WHERE id = 1;").run();
                    expect(currentValue()).toBeUndefined(); // The value should be deleted
                    incrementUndoGroup(db);

                    // Execute the undo action
                    performUndo(db);
                    // Verify that the last delete was undone
                    expect(currentValue()).toBe("test value"); // The undo should have restored the last deleted value

                    // Expect there to be one undo actions left
                    expect(allUndoRows().length).toBe(1);
                });

                it("should undo groups of deletes correctly", () => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-0");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-1");
                    // group 2
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g2-0");
                    // group 3
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-0");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-1");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-2");
                    incrementUndoGroup(db);

                    // Update the value in the test table in two groups
                    const updateSql =
                        "DELETE FROM test_table WHERE test_value = (?);";
                    // group 1
                    db.prepare(updateSql).run("g1-0");
                    db.prepare(updateSql).run("g1-1");
                    incrementUndoGroup(db);
                    // group 2
                    db.prepare(updateSql).run("g2-0");
                    incrementUndoGroup(db);
                    // group 3
                    db.prepare(updateSql).run("g3-0");
                    db.prepare(updateSql).run("g3-1");
                    db.prepare(updateSql).run("g3-2");
                    incrementUndoGroup(db);

                    const allRows = () =>
                        db
                            .prepare("SELECT * FROM test_table ORDER BY id")
                            .all() as Row[];
                    expect(allRows()).toEqual([]);

                    // Execute the undo action
                    let response = performUndo(db);
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
                    expect(allRows()).toEqual(expectedValues);

                    // Execute the undo action again
                    performUndo(db);
                    expectedValues = [
                        { id: 3, test_value: "g2-0" },
                        { id: 4, test_value: "g3-0" },
                        { id: 5, test_value: "g3-1" },
                        { id: 6, test_value: "g3-2" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    // Execute the undo action again
                    performUndo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0" },
                        { id: 2, test_value: "g1-1" },
                        { id: 3, test_value: "g2-0" },
                        { id: 4, test_value: "g3-0" },
                        { id: 5, test_value: "g3-1" },
                        { id: 6, test_value: "g3-2" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    // Expect there to be one undo actions left
                    expect(allUndoRowsByGroup().length).toBe(1);
                });
            });
        });

        describe("redo history", () => {
            const allRedoRowsByGroup = () =>
                db
                    .prepare(
                        `SELECT * FROM ${Constants.RedoHistoryTableName} GROUP BY "history_group";`,
                    )
                    .all() as HistoryRow[];
            const allRedoRows = () =>
                db
                    .prepare(`SELECT * FROM ${Constants.RedoHistoryTableName};`)
                    .all() as HistoryRow[];

            describe("empty redo", () => {
                it("should do nothing if there are no changes to redo", () => {
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    expect(allRedoRows()).toEqual([]); // There should be no rows in the redo history

                    // Execute the redo action
                    performRedo(db);
                    expect(allRedoRows()).toEqual([]); // There should still be no rows in the redo history
                });
                it("should do nothing if it runs out of changes to redo", () => {
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    expect(allRedoRows()).toEqual([]);

                    // Insert a value into the test table
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("test value");
                    // Execute an undo action to add a change to the redo history
                    performUndo(db);
                    expect(allRedoRows().length).toBe(1);

                    // Execute the redo action
                    performRedo(db);
                    expect(allRedoRows()).toEqual([]);

                    // Execute the redo action again with no changes to redo
                    performRedo(db);
                    expect(allRedoRows()).toEqual([]);
                });
            });

            describe("INSERT trigger", () => {
                it("should execute a redo correctly from undoing an insert action", () => {
                    type Row = { id: number; value: string };
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("test value");
                    incrementUndoGroup(db);

                    // Simulate an action that will be logged in the undo history
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("another value");

                    const allRows = () =>
                        db.prepare("SELECT * FROM test_table").all() as Row[];
                    const completeRows = [
                        { id: 1, value: "test value" },
                        { id: 2, value: "another value" },
                    ];
                    expect(allRows()).toEqual(completeRows);

                    // Execute the undo action
                    performUndo(db);
                    expect(allRows()).toEqual([completeRows[0]]);

                    // Execute the redo action
                    performRedo(db);
                    expect(allRows()).toEqual(completeRows);

                    // Expect there to be no redos left
                    expect(allRedoRows().length).toBe(0);
                });

                it("should undo groups of inserts correctly", () => {
                    type Row = { id: number; value: string };
                    // Create history tables and test table
                    createHistoryTables(db);
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table in three groups
                    // group 1
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g1-0 - test value");
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g1-1 - test value");
                    incrementUndoGroup(db);
                    const groupOneObjects = db
                        .prepare("SELECT * FROM test_table WHERE value LIKE ?")
                        .all("g1%") as Row[];
                    // group 2
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g2-0 - test value");
                    incrementUndoGroup(db);
                    const groupTwoObjects = db
                        .prepare("SELECT * FROM test_table WHERE value LIKE ?")
                        .all("g2%") as Row[];
                    // group 3
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g3-0 - test value");
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g3-1 - test value");
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g3-2 - test value");
                    incrementUndoGroup(db);
                    const groupThreeObjects = db
                        .prepare("SELECT * FROM test_table WHERE value LIKE ?")
                        .all("g3%") as Row[];

                    // expect all the objects to be in the table
                    const allObjects = () =>
                        db.prepare("SELECT * FROM test_table").all() as Row[];
                    expect(allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                        ...groupThreeObjects,
                    ]);

                    // Execute the undo action
                    performUndo(db);
                    expect(allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                    ]);
                    performUndo(db);
                    expect(allObjects()).toEqual([...groupOneObjects]);
                    performUndo(db);
                    expect(allObjects()).toEqual([]);

                    // Execute the redo action
                    performRedo(db);
                    expect(allObjects()).toEqual([...groupOneObjects]);
                    performRedo(db);
                    expect(allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                    ]);
                    performRedo(db);
                    expect(allObjects()).toEqual([
                        ...groupOneObjects,
                        ...groupTwoObjects,
                        ...groupThreeObjects,
                    ]);

                    // Expect there to be no redos left
                    expect(allRedoRows().length).toBe(0);
                });

                it("should have no redo operations after inserting a new undo entry after INSERT", () => {
                    createHistoryTables(db);
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table in three groups
                    // group 1
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g1-0 - test value");
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g1-1 - test value");
                    incrementUndoGroup(db);
                    // group 2
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g2-0 - test value");
                    incrementUndoGroup(db);
                    // group 3
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g3-0 - test value");
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g3-1 - test value");
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g3-2 - test value");
                    incrementUndoGroup(db);

                    // Execute the undo action
                    performUndo(db);
                    performUndo(db);
                    performUndo(db);

                    expect(allRedoRowsByGroup().length).toBe(3);

                    // Do another action to clear the redo stack
                    db.prepare(
                        "INSERT INTO test_table (value) VALUES (?);",
                    ).run("g1-0 - another value");

                    expect(allRedoRowsByGroup().length).toBe(0);
                });
            });

            describe("UPDATE trigger", () => {
                it("should execute an undo correctly from an update action", () => {
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                    ).run();

                    const currentValue = () =>
                        (
                            db
                                .prepare(
                                    "SELECT test_value FROM test_table WHERE id = 1;",
                                )
                                .get() as {
                                test_value: string;
                            }
                        ).test_value;

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("test value");
                    incrementUndoGroup(db);

                    // Update the values in the test table
                    db.prepare(
                        "UPDATE test_table SET test_value = ? WHERE id = 1;",
                    ).run("updated value");
                    incrementUndoGroup(db);
                    db.prepare(
                        "UPDATE test_table SET test_value = ? WHERE id = 1;",
                    ).run("another updated value");
                    incrementUndoGroup(db);

                    // Execute two undo actions
                    performUndo(db);
                    performUndo(db);
                    expect(currentValue()).toBe("test value");

                    performRedo(db);
                    expect(currentValue()).toBe("updated value");

                    performRedo(db);
                    expect(currentValue()).toBe("another updated value");

                    // Expect there to be no redos left
                    expect(allRedoRows().length).toBe(0);
                });

                it("should undo groups of updates correctly", () => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-0 - initial value");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-1 - initial value");
                    // group 2
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g2-0 - initial value");
                    // group 3
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-0 - initial value");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-1 - initial value");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-2 - initial value");
                    incrementUndoGroup(db);

                    // Update the value in the test table in two groups
                    const updateSql =
                        "UPDATE test_table SET test_value = (?) WHERE test_value = (?);";
                    // group 1
                    db.prepare(updateSql).run(
                        "g1-0 - updated value",
                        "g1-0 - initial value",
                    );
                    db.prepare(updateSql).run(
                        "g1-1 - updated value",
                        "g1-1 - initial value",
                    );
                    incrementUndoGroup(db);
                    // group 2
                    db.prepare(updateSql).run(
                        "g2-0 - updated value",
                        "g2-0 - initial value",
                    );
                    incrementUndoGroup(db);
                    // group 3
                    db.prepare(updateSql).run(
                        "g3-0 - updated value",
                        "g3-0 - initial value",
                    );
                    db.prepare(updateSql).run(
                        "g3-1 - updated value",
                        "g3-1 - initial value",
                    );
                    db.prepare(updateSql).run(
                        "g3-2 - updated value",
                        "g3-2 - initial value",
                    );
                    incrementUndoGroup(db);
                    // group 1 (again)
                    db.prepare(updateSql).run(
                        "g1-0 - second updated value",
                        "g1-0 - updated value",
                    );
                    db.prepare(updateSql).run(
                        "g1-1 - second updated value",
                        "g1-1 - updated value",
                    );

                    const allRows = () =>
                        db
                            .prepare("SELECT * FROM test_table ORDER BY id")
                            .all() as Row[];
                    let expectedValues: Row[] = [
                        { id: 1, test_value: "g1-0 - second updated value" },
                        { id: 2, test_value: "g1-1 - second updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - updated value" },
                        { id: 5, test_value: "g3-1 - updated value" },
                        { id: 6, test_value: "g3-2 - updated value" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    // Execute four undo actions
                    performUndo(db);
                    performUndo(db);
                    performUndo(db);
                    performUndo(db);

                    // Execute a redo action
                    performRedo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - updated value" },
                        { id: 2, test_value: "g1-1 - updated value" },
                        { id: 3, test_value: "g2-0 - initial value" },
                        { id: 4, test_value: "g3-0 - initial value" },
                        { id: 5, test_value: "g3-1 - initial value" },
                        { id: 6, test_value: "g3-2 - initial value" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    performRedo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - updated value" },
                        { id: 2, test_value: "g1-1 - updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - initial value" },
                        { id: 5, test_value: "g3-1 - initial value" },
                        { id: 6, test_value: "g3-2 - initial value" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    performRedo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - updated value" },
                        { id: 2, test_value: "g1-1 - updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - updated value" },
                        { id: 5, test_value: "g3-1 - updated value" },
                        { id: 6, test_value: "g3-2 - updated value" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    performRedo(db);
                    expectedValues = [
                        { id: 1, test_value: "g1-0 - second updated value" },
                        { id: 2, test_value: "g1-1 - second updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - updated value" },
                        { id: 5, test_value: "g3-1 - updated value" },
                        { id: 6, test_value: "g3-2 - updated value" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    // Expect there to be no redos left
                    expect(allRedoRows().length).toBe(0);
                });

                it("should have no redo operations after inserting a new undo entry after UPDATE", () => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-0 - initial value");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-1 - initial value");
                    // group 2
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g2-0 - initial value");
                    // group 3
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-0 - initial value");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-1 - initial value");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-2 - initial value");
                    incrementUndoGroup(db);

                    // Update the value in the test table in two groups
                    const updateSql =
                        "UPDATE test_table SET test_value = (?) WHERE test_value = (?);";
                    // group 1
                    db.prepare(updateSql).run(
                        "g1-0 - updated value",
                        "g1-0 - initial value",
                    );
                    db.prepare(updateSql).run(
                        "g1-1 - updated value",
                        "g1-1 - initial value",
                    );
                    incrementUndoGroup(db);
                    // group 2
                    db.prepare(updateSql).run(
                        "g2-0 - updated value",
                        "g2-0 - initial value",
                    );
                    incrementUndoGroup(db);
                    // group 3
                    db.prepare(updateSql).run(
                        "g3-0 - updated value",
                        "g3-0 - initial value",
                    );
                    db.prepare(updateSql).run(
                        "g3-1 - updated value",
                        "g3-1 - initial value",
                    );
                    db.prepare(updateSql).run(
                        "g3-2 - updated value",
                        "g3-2 - initial value",
                    );
                    incrementUndoGroup(db);
                    // group 1 (again)
                    db.prepare(updateSql).run(
                        "g1-0 - second updated value",
                        "g1-0 - updated value",
                    );
                    db.prepare(updateSql).run(
                        "g1-1 - second updated value",
                        "g1-1 - updated value",
                    );

                    const allRows = () =>
                        db
                            .prepare("SELECT * FROM test_table ORDER BY id")
                            .all() as Row[];
                    let expectedValues: Row[] = [
                        { id: 1, test_value: "g1-0 - second updated value" },
                        { id: 2, test_value: "g1-1 - second updated value" },
                        { id: 3, test_value: "g2-0 - updated value" },
                        { id: 4, test_value: "g3-0 - updated value" },
                        { id: 5, test_value: "g3-1 - updated value" },
                        { id: 6, test_value: "g3-2 - updated value" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    // Execute four undo actions
                    performUndo(db);
                    performUndo(db);
                    performUndo(db);
                    performUndo(db);

                    expect(allRedoRowsByGroup().length).toBe(4);

                    // Do another action to clear the redo stack
                    db.prepare(
                        "UPDATE test_table SET test_value = (?) WHERE id = 1;",
                    ).run("updated value!");
                    expect(allRedoRowsByGroup().length).toBe(0);
                });
            });

            describe("DELETE trigger", () => {
                it("should execute an undo correctly from a delete action", () => {
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                    ).run();

                    const currentValue = () => {
                        try {
                            return (
                                db
                                    .prepare(
                                        "SELECT test_value FROM test_table WHERE id = 1;",
                                    )
                                    .get() as {
                                    test_value: string;
                                }
                            ).test_value;
                        } catch (e) {
                            return undefined;
                        }
                    };

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("test value");
                    incrementUndoGroup(db);

                    // Simulate an action that will be logged in the undo history
                    db.prepare("DELETE FROM test_table WHERE id = 1;").run();
                    incrementUndoGroup(db);

                    // Execute the undo action
                    performUndo(db);
                    expect(currentValue()).toBeDefined();

                    // Execute the redo action
                    performRedo(db);
                    expect(currentValue()).toBeUndefined();

                    // Expect there to be no redos left
                    expect(allRedoRows().length).toBe(0);
                });

                it("should undo groups of deletes correctly", () => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-0");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-1");
                    // group 2
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g2-0");
                    // group 3
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-0");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-1");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-2");
                    incrementUndoGroup(db);

                    // Update the value in the test table in two groups
                    const deleteSql =
                        "DELETE FROM test_table WHERE test_value = (?);";
                    // group 1
                    db.prepare(deleteSql).run("g1-0");
                    db.prepare(deleteSql).run("g1-1");
                    incrementUndoGroup(db);
                    // group 2
                    db.prepare(deleteSql).run("g2-0");
                    incrementUndoGroup(db);
                    // group 3
                    db.prepare(deleteSql).run("g3-0");
                    db.prepare(deleteSql).run("g3-1");
                    db.prepare(deleteSql).run("g3-2");
                    incrementUndoGroup(db);

                    const allRows = () =>
                        db
                            .prepare("SELECT * FROM test_table ORDER BY id")
                            .all() as Row[];
                    expect(allRows()).toEqual([]);

                    // Execute three undo actions
                    performUndo(db);
                    performUndo(db);
                    performUndo(db);
                    let expectedValues = [
                        { id: 1, test_value: "g1-0" },
                        { id: 2, test_value: "g1-1" },
                        { id: 3, test_value: "g2-0" },
                        { id: 4, test_value: "g3-0" },
                        { id: 5, test_value: "g3-1" },
                        { id: 6, test_value: "g3-2" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    // Execute three redo actions
                    performRedo(db);
                    expectedValues = [
                        { id: 3, test_value: "g2-0" },
                        { id: 4, test_value: "g3-0" },
                        { id: 5, test_value: "g3-1" },
                        { id: 6, test_value: "g3-2" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    performRedo(db);
                    expectedValues = [
                        { id: 4, test_value: "g3-0" },
                        { id: 5, test_value: "g3-1" },
                        { id: 6, test_value: "g3-2" },
                    ];
                    expect(allRows()).toEqual(expectedValues);

                    performRedo(db);
                    expect(allRows()).toEqual([]);

                    // Expect there to be no redos left
                    expect(allRedoRows().length).toBe(0);
                });

                it("should have no redo operations after inserting a new undo entry after DELETE", () => {
                    type Row = { id: number; test_value: string };
                    // Create history tables and test table
                    db.prepare(
                        "CREATE TABLE test_table (id INTEGER PRIMARY KEY, test_value TEXT);",
                    ).run();

                    // Create undo triggers for the test table
                    createUndoTriggers(db, "test_table");

                    // Insert a value into the test table
                    // group 1
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-0");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g1-1");
                    // group 2
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g2-0");
                    // group 3
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-0");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-1");
                    db.prepare(
                        "INSERT INTO test_table (test_value) VALUES (?);",
                    ).run("g3-2");
                    incrementUndoGroup(db);

                    // Update the value in the test table in two groups
                    const deleteSql =
                        "DELETE FROM test_table WHERE test_value = (?);";
                    // group 1
                    db.prepare(deleteSql).run("g1-0");
                    db.prepare(deleteSql).run("g1-1");
                    incrementUndoGroup(db);
                    // group 2
                    db.prepare(deleteSql).run("g2-0");
                    incrementUndoGroup(db);
                    // group 3
                    db.prepare(deleteSql).run("g3-0");
                    db.prepare(deleteSql).run("g3-1");
                    db.prepare(deleteSql).run("g3-2");
                    incrementUndoGroup(db);

                    const allRows = () =>
                        db
                            .prepare("SELECT * FROM test_table ORDER BY id")
                            .all() as Row[];
                    expect(allRows()).toEqual([]);

                    // Execute three undo actions
                    performUndo(db);
                    performUndo(db);

                    expect(allRedoRowsByGroup().length).toBe(2);

                    // Do another action to clear the redo stack
                    db.prepare("DELETE FROM test_table").run();
                    expect(allRedoRowsByGroup().length).toBe(0);
                });
            });
        });
    });

    describe("Advanced Undo/Redo Stress Tests", () => {
        function setupComplexTables() {
            db.exec(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                age INTEGER,
                email TEXT UNIQUE
            );
            CREATE TABLE orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                product TEXT,
                quantity INTEGER,
                total_price REAL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE TABLE payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER,
                amount REAL,
                payment_date TEXT,
                FOREIGN KEY(order_id) REFERENCES orders(id)
            );
        `);

            createUndoTriggers(db, "users");
            createUndoTriggers(db, "orders");
            createUndoTriggers(db, "payments");
        }

        it("Complex data with foreign keys and multiple undo/redo intervals", () => {
            setupComplexTables();

            // Insert user data
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("John Doe", 30, "john@example.com");
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Jane Doe", 25, "jane@example.com");
            incrementUndoGroup(db);

            // Insert orders linked to users
            db.prepare(
                "INSERT INTO orders (user_id, product, quantity, total_price) VALUES (?, ?, ?, ?)",
            ).run(1, "Laptop", 1, 1000.0);
            db.prepare(
                "INSERT INTO orders (user_id, product, quantity, total_price) VALUES (?, ?, ?, ?)",
            ).run(2, "Phone", 2, 500.0);
            incrementUndoGroup(db);

            // Insert payments linked to orders
            db.prepare(
                "INSERT INTO payments (order_id, amount, payment_date) VALUES (?, ?, ?)",
            ).run(1, 1000.0, "2024-10-08");
            db.prepare(
                "INSERT INTO payments (order_id, amount, payment_date) VALUES (?, ?, ?)",
            ).run(2, 500.0, "2024-10-09");
            incrementUndoGroup(db);

            // Perform undo in random intervals
            performUndo(db); // Undo payments
            let payments = db.prepare("SELECT * FROM payments").all();
            expect(payments.length).toBe(0);

            performUndo(db); // Undo orders
            let orders = db.prepare("SELECT * FROM orders").all();
            expect(orders.length).toBe(0);

            // Redo orders and payments
            performRedo(db);
            orders = db.prepare("SELECT * FROM orders").all();
            expect(orders.length).toBe(2);

            performRedo(db);
            payments = db.prepare("SELECT * FROM payments").all();
            expect(payments.length).toBe(2);

            // Undo back to the users table
            performUndo(db);
            performUndo(db);
            performUndo(db);
            let users = db.prepare("SELECT * FROM users").all();
            expect(users.length).toBe(0);
        });

        it("Undo/Redo with random intervals, updates, and WHERE clauses", () => {
            setupComplexTables();

            // Insert initial users
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Alice", 28, "alice@example.com");
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Bob", 35, "bob@example.com");
            incrementUndoGroup(db);

            // Insert orders with complex WHERE clauses
            db.prepare(
                "INSERT INTO orders (user_id, product, quantity, total_price) VALUES (?, ?, ?, ?)",
            ).run(1, "Tablet", 2, 600.0);
            db.prepare(
                "INSERT INTO orders (user_id, product, quantity, total_price) VALUES (?, ?, ?, ?)",
            ).run(2, "Monitor", 1, 300.0);
            incrementUndoGroup(db);

            // Perform an update with WHERE
            db.prepare("UPDATE users SET age = age + 1 WHERE name = ?").run(
                "Alice",
            );
            incrementUndoGroup(db);

            // Undo the age update and verify the value
            performUndo(db);
            let result = db
                .prepare("SELECT age FROM users WHERE name = ?")
                .get("Alice") as { age: number };
            expect(result.age).toBe(28);

            // Undo order insertion and check if the table is empty
            performUndo(db);
            let orders = db.prepare("SELECT * FROM orders").all();
            expect(orders.length).toBe(0);

            // Redo the order insertion and update
            performRedo(db);
            performRedo(db);
            orders = db.prepare("SELECT * FROM orders").all();
            expect(orders.length).toBe(2);
        });

        it("Randomized undo/redo with interleaved data changes", () => {
            setupComplexTables();

            // Insert several users and orders interleaved with undo/redo
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Chris", 40, "chris@example.com");
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Diana", 22, "diana@example.com");
            incrementUndoGroup(db);

            db.prepare(
                "INSERT INTO orders (user_id, product, quantity, total_price) VALUES (?, ?, ?, ?)",
            ).run(1, "Desk", 1, 150.0);
            db.prepare(
                "INSERT INTO orders (user_id, product, quantity, total_price) VALUES (?, ?, ?, ?)",
            ).run(2, "Chair", 2, 200.0);
            incrementUndoGroup(db);

            // Perform undo of orders, then insert more data
            let expectedOrders = db.prepare("SELECT * FROM orders").all();
            performUndo(db);
            let currentOrders = db.prepare("SELECT * FROM orders").all();
            expect(currentOrders.length).toBe(0);
            performRedo(db);
            currentOrders = db.prepare("SELECT * FROM orders").all();
            expect(currentOrders).toEqual(expectedOrders);
            performUndo(db);

            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Eve", 32, "eve@example.com");
            incrementUndoGroup(db);

            // Perform redo of orders and undo user insertion
            performRedo(db);
            performUndo(db);

            let users = db.prepare("SELECT * FROM users").all();
            expect(users.length).toBe(2); // Should contain only 'Chris' and 'Diana'

            currentOrders = db.prepare("SELECT * FROM orders").all();
            expect(currentOrders.length).toBe(0); // Orders should be restored
        });

        it("Complex updates and deletes with random undo/redo intervals", () => {
            setupComplexTables();

            // Insert users and orders
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Frank", 33, "frank@example.com");
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Grace", 29, "grace@example.com");
            incrementUndoGroup(db);

            db.prepare(
                "INSERT INTO orders (user_id, product, quantity, total_price) VALUES (?, ?, ?, ?)",
            ).run(1, "Headphones", 1, 100.0);
            db.prepare(
                "INSERT INTO orders (user_id, product, quantity, total_price) VALUES (?, ?, ?, ?)",
            ).run(2, "Keyboard", 1, 120.0);
            incrementUndoGroup(db);

            // Update and delete data
            db.prepare("UPDATE users SET email = ? WHERE name = ?").run(
                "frank_updated@example.com",
                "Frank",
            );
            db.prepare("DELETE FROM orders WHERE id = 2");
            incrementUndoGroup(db);

            // Undo deletion and updates
            performUndo(db);
            performUndo(db);

            let user = db
                .prepare("SELECT * FROM users WHERE name = ?")
                .get("Frank") as any;
            expect(user.email).toBe("frank@example.com"); // Should be the original email

            performRedo(db);
            let orders = db.prepare("SELECT * FROM orders").all();
            expect(orders.length).toBe(2); // Order should be restored
        });
    });

    describe("Limit Tests", () => {
        const groupLimit = () =>
            (
                db
                    .prepare(
                        `SELECT group_limit FROM ${Constants.HistoryStatsTableName}`,
                    )
                    .get() as HistoryStatsRow | undefined
            )?.group_limit;

        const undoGroups = () =>
            (
                db
                    .prepare(
                        `SELECT * FROM ${Constants.UndoHistoryTableName} GROUP BY "history_group" ORDER BY "history_group" ASC`,
                    )
                    .all() as HistoryTableRow[]
            ).map((row) => row.history_group);
        it("removes the oldest undo group when the undo limit of 100 is reached", () => {
            createHistoryTables(db);
            db.prepare(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT);",
            ).run();
            createUndoTriggers(db, "users");

            // set the limit to 100
            db.prepare(
                `UPDATE ${Constants.HistoryStatsTableName} SET group_limit = 100`,
            ).run();
            expect(groupLimit()).toBe(100);

            for (let i = 0; i < 99; i++) {
                // Insert users and orders
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Harry_${100 / i}`, i, `email${100 - i}@jeff.com`);
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Josie_${100 / i}`, i + 50, `email${200 - i}@josie.com`);
                incrementUndoGroup(db);
            }
            expect(undoGroups().length).toBe(99);
            let expectedGroups = Array.from(Array(99).keys()).map((i) => i);
            expect(undoGroups()).toEqual(expectedGroups);

            // Insert one more group
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Harry_100", 100, "email@jeff100.com");
            incrementUndoGroup(db);
            expect(undoGroups().length).toBe(100);
            expectedGroups = [...expectedGroups, 99];
            expect(undoGroups()).toEqual(expectedGroups);

            // Insert another group
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Harry_101", 101, "email@jeff101.com");
            incrementUndoGroup(db);
            expect(undoGroups().length).toBe(100);
            expectedGroups = Array.from(Array(100).keys()).map((i) => i + 1);
            expect(undoGroups()).toEqual(expectedGroups);

            // insert 50 more groups
            for (let i = 102; i < 152; i++) {
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Harry_${i}`, i, `email${100 - i}@jeff.com`);
                incrementUndoGroup(db);
            }
            expect(undoGroups().length).toBe(100);
            expectedGroups = Array.from(Array(100).keys()).map((i) => i + 51);
            expect(undoGroups()).toEqual(expectedGroups);

            const allRows = db.prepare("SELECT * FROM users").all();
            expect(allRows.length).toBeGreaterThan(150);
        });

        it("removes the oldest undo group when the undo limit of 2000 is reached", () => {
            createHistoryTables(db);
            db.prepare(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT);",
            ).run();
            createUndoTriggers(db, "users");

            // set the limit to 2000
            db.prepare(
                `UPDATE ${Constants.HistoryStatsTableName} SET group_limit = 2000`,
            ).run();
            expect(groupLimit()).toBe(2000);

            for (let i = 0; i < 1999; i++) {
                // Insert users and orders
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Harry_${2000 / i}`, i, `email${2000 - i}@jeff.com`);
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Josie_${2000 / i}`, i + 50, `email${200 - i}@josie.com`);
                incrementUndoGroup(db);
            }
            expect(undoGroups().length).toBe(1999);
            let expectedGroups = Array.from(Array(1999).keys()).map((i) => i);
            expect(undoGroups()).toEqual(expectedGroups);

            // Insert one more group
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Harry_2000", 2000, "email@jeff2000.com");
            incrementUndoGroup(db);
            expect(undoGroups().length).toBe(2000);
            expectedGroups = [...expectedGroups, 1999];
            expect(undoGroups()).toEqual(expectedGroups);

            // Insert another group
            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run("Harry_101", 101, "email@jeff101.com");
            incrementUndoGroup(db);
            expect(undoGroups().length).toBe(2000);
            expectedGroups = Array.from(Array(2000).keys()).map((i) => i + 1);
            expect(undoGroups()).toEqual(expectedGroups);

            // insert 50 more groups
            for (let i = 102; i < 152; i++) {
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Harry_${i}`, i, `email${2000 - i}@jeff.com`);
                incrementUndoGroup(db);
            }
            expect(undoGroups().length).toBe(2000);
            expectedGroups = Array.from(Array(2000).keys()).map((i) => i + 51);
            expect(undoGroups()).toEqual(expectedGroups);

            const allRows = db.prepare("SELECT * FROM users").all();
            expect(allRows.length).toBeGreaterThan(150);
        });

        it("adds more undo groups when the limit is increased", () => {
            createHistoryTables(db);
            db.prepare(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT);",
            ).run();
            createUndoTriggers(db, "users");

            // set the limit to 100
            db.prepare(
                `UPDATE ${Constants.HistoryStatsTableName} SET group_limit = 100`,
            ).run();
            expect(groupLimit()).toBe(100);

            for (let i = 0; i < 150; i++) {
                // Insert users and orders
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Harry_${100 / i}`, i, `email${100 - i}`);
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Josie_${100 / i}`, i + 50, `email${200 - i}`);
                incrementUndoGroup(db);
            }
            expect(undoGroups().length).toBe(100);
            let expectedGroups = Array.from(Array(100).keys()).map(
                (i) => i + 50,
            );
            expect(undoGroups()).toEqual(expectedGroups);

            // set the limit to 200
            db.prepare(
                `UPDATE ${Constants.HistoryStatsTableName} SET group_limit = 200`,
            ).run();
            expect(groupLimit()).toBe(200);
            expect(undoGroups().length).toBe(100);

            for (let i = 150; i < 300; i++) {
                // Insert users and orders
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Harry_${100 / i}`, i, `email${100 - i}`);
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Josie_${100 / i}`, i + 50, `email${200 - i}`);
                incrementUndoGroup(db);
            }
            expect(undoGroups().length).toBe(200);
            expectedGroups = [
                ...Array.from(Array(50).keys()).map((i) => i + 100),
                ...Array.from(Array(150).keys()).map((i) => i + 150),
            ];
            expect(undoGroups()).toEqual(expectedGroups);
        });

        it("removes groups when the limit is decreased", () => {
            createHistoryTables(db);
            db.prepare(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, email TEXT);",
            ).run();
            createUndoTriggers(db, "users");

            // set the limit to 200
            db.prepare(
                `UPDATE ${Constants.HistoryStatsTableName} SET group_limit = 200`,
            ).run();
            expect(groupLimit()).toBe(200);

            for (let i = 0; i < 250; i++) {
                // Insert users and orders
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Harry_${100 / i}`, i, `email${100 - i}`);
                db.prepare(
                    "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
                ).run(`Josie_${100 / i}`, i + 50, `email${200 - i}`);
                incrementUndoGroup(db);
            }
            expect(undoGroups().length).toBe(200);
            let expectedGroups = Array.from(Array(200).keys()).map(
                (i) => i + 50,
            );
            expect(undoGroups()).toEqual(expectedGroups);

            // set the limit to 100
            db.prepare(
                `UPDATE ${Constants.HistoryStatsTableName} SET group_limit = 50`,
            ).run();
            expect(groupLimit()).toBe(50);
            // Should not change until next group increment
            expect(undoGroups().length).toBe(200);

            db.prepare(
                "INSERT INTO users (name, age, email) VALUES (?, ?, ?)",
            ).run(`Harry_last`, 1234, `email_last`);
            incrementUndoGroup(db);
            expect(undoGroups().length).toBe(50);
            expectedGroups = Array.from(Array(50).keys()).map((i) => i + 201);
            expect(undoGroups()).toEqual(expectedGroups);
        });
    });

    describe("Advanced Undo/Redo Stress Tests with Reserved Words, Special Characters, and DELETE Operations", () => {
        function setupComplexTablesWithReservedWords() {
            db.exec(`
            CREATE TABLE reserved_words_test (
                "order" INTEGER PRIMARY KEY AUTOINCREMENT,
                "group" TEXT,
                "select" TEXT,
                "from" TEXT
            );
            CREATE TABLE special_characters_test (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                description TEXT
            );
        `);

            createUndoTriggers(db, "reserved_words_test");
            createUndoTriggers(db, "special_characters_test");
        }

        it("Undo/Redo with reserved words, special characters, and DELETE operations", () => {
            setupComplexTablesWithReservedWords();

            // Insert into reserved_words_test
            db.prepare(
                'INSERT INTO reserved_words_test ("group", "select", "from") VALUES (?, ?, ?)',
            ).run("Group1", "Select1", "From1");
            db.prepare(
                'INSERT INTO reserved_words_test ("group", "select", "from") VALUES (?, ?, ?)',
            ).run("Group2", "Select2", "From2");
            incrementUndoGroup(db);

            // Insert into special_characters_test
            db.prepare(
                "INSERT INTO special_characters_test (description) VALUES (?)",
            ).run(
                "\"Double quote\", 'Single quote', (Parentheses), [Brackets]",
            );
            db.prepare(
                "INSERT INTO special_characters_test (description) VALUES (?)",
            ).run("Escape \\ backslash");
            incrementUndoGroup(db);

            // Perform DELETE operations
            db.prepare(
                'DELETE FROM reserved_words_test WHERE "order" = 2',
            ).run();
            db.prepare(
                "DELETE FROM special_characters_test WHERE id = 2",
            ).run();
            incrementUndoGroup(db);

            // Undo DELETE operations
            performUndo(db); // Undo the DELETE from special_characters_test
            let specialResult = db
                .prepare("SELECT * FROM special_characters_test")
                .all();
            expect(specialResult.length).toBe(2); // Both rows should be back

            performUndo(db); // Undo the DELETE from reserved_words_test
            let reservedResult = db
                .prepare("SELECT * FROM reserved_words_test")
                .all();
            expect(reservedResult.length).toBe(2); // Both rows should be back

            // Redo DELETE operations
            performUndo(db);
            performRedo(db); // Redo the DELETE from reserved_words_test
            reservedResult = db
                .prepare("SELECT * FROM reserved_words_test")
                .all();
            expect(reservedResult.length).toBe(2); // One row should be deleted
        });

        it("Undo/Redo with random intervals, updates, deletes, and WHERE clauses", () => {
            setupComplexTablesWithReservedWords();

            // Insert into both tables
            db.prepare(
                'INSERT INTO reserved_words_test ("group", "select", "from") VALUES (?, ?, ?)',
            ).run("Group1", "Select1", "From1");
            db.prepare(
                "INSERT INTO special_characters_test (description) VALUES (?)",
            ).run(
                '"Complex value (with) {all} kinds [of] special characters!"',
            );
            incrementUndoGroup(db);

            // Perform updates and DELETEs
            db.prepare(
                'UPDATE reserved_words_test SET "group" = ? WHERE "order" = 1',
            ).run("UpdatedGroup");
            db.prepare(
                "DELETE FROM special_characters_test WHERE id = 1",
            ).run();
            incrementUndoGroup(db);

            // Perform undo/redo in random order
            let response = performUndo(db); // Undo DELETE and update
            expect(response.success).toBe(true);
            expect(response.error).toBeUndefined();
            expect(response.tableNames).toEqual(
                new Set(["reserved_words_test", "special_characters_test"]),
            );
            let reservedResult = db
                .prepare(
                    'SELECT "group" FROM reserved_words_test WHERE "order" = 1',
                )
                .get() as any;
            let specialResult = db
                .prepare(
                    "SELECT description FROM special_characters_test WHERE id = 1",
                )
                .get() as any;
            expect(reservedResult.group).toBe("Group1");
            expect(specialResult.description).toBe(
                '"Complex value (with) {all} kinds [of] special characters!"',
            );

            performRedo(db); // Redo DELETE and update
            reservedResult = db
                .prepare(
                    'SELECT "group" FROM reserved_words_test WHERE "order" = 1',
                )
                .get();
            specialResult = db
                .prepare("SELECT * FROM special_characters_test")
                .all();
            expect(reservedResult.group).toBe("UpdatedGroup");
            expect(specialResult.length).toBe(0); // The row should be deleted
        });

        it("Stress test with multiple DELETEs, special characters, and reserved words", () => {
            setupComplexTablesWithReservedWords();

            // Insert several rows into both tables
            db.prepare(
                'INSERT INTO reserved_words_test ("group", "select", "from") VALUES (?, ?, ?)',
            ).run("GroupA", "SelectA", "FromA");
            db.prepare(
                'INSERT INTO reserved_words_test ("group", "select", "from") VALUES (?, ?, ?)',
            ).run("GroupB", "SelectB", "FromB");
            db.prepare(
                "INSERT INTO special_characters_test (description) VALUES (?)",
            ).run('Some "special" (value)');
            db.prepare(
                "INSERT INTO special_characters_test (description) VALUES (?)",
            ).run('Another "complex" [test] (entry)');
            incrementUndoGroup(db);

            // Perform random DELETEs
            db.prepare(
                'DELETE FROM reserved_words_test WHERE "order" = 1',
            ).run();
            db.prepare(
                "DELETE FROM special_characters_test WHERE id = 2",
            ).run();
            incrementUndoGroup(db);

            // Undo all DELETEs
            performUndo(db);

            let reservedResult = db
                .prepare("SELECT * FROM reserved_words_test")
                .all();
            let specialResult = db
                .prepare("SELECT * FROM special_characters_test")
                .all();
            expect(reservedResult.length).toBe(2); // Both rows should be restored
            expect(specialResult.length).toBe(2); // Both rows should be restored

            // Redo all DELETEs
            performRedo(db);
            performRedo(db);

            reservedResult = db
                .prepare("SELECT * FROM reserved_words_test")
                .all();
            specialResult = db
                .prepare("SELECT * FROM special_characters_test")
                .all();
            expect(reservedResult.length).toBe(1); // One row should be deleted
            expect(specialResult.length).toBe(1); // One row should be deleted
        });
    });
});
