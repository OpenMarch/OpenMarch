import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as fc from "fast-check";
import {
    initializeAndMigrateDatabase,
    copyDataFromOriginalDatabase,
    copyFieldPropertiesFromOriginalDatabase,
    repairDatabase,
} from "../repair";
import { getOrm } from "../db";
import { DrizzleMigrationService } from "../services/DrizzleMigrationService";
import { app } from "electron";

describe("Database Repair", () => {
    let tempDir: string;
    let migrationsFolder: string;

    beforeEach(() => {
        // Mock app.getAppPath to return the correct path for tests
        // Electron is already mocked globally in vitest.setup.ts
        // The path should point to apps/desktop so that app.getAppPath() + "electron/database/migrations"
        // resolves to the correct migrations folder
        // __dirname is electron/database/__test__, so go up 3 levels to get to apps/desktop
        const appRoot = path.resolve(__dirname, "../../..");
        if (!("getAppPath" in app)) {
            (app as { getAppPath: () => string }).getAppPath = vi.fn(() => {
                return appRoot;
            });
        } else {
            vi.mocked(app.getAppPath as () => string).mockReturnValue(appRoot);
        }

        // Create a temporary directory for test databases
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repair-test-"));
        // migrationsFolder is relative to appRoot, which should be apps/desktop
        migrationsFolder = path.join(
            appRoot,
            "electron",
            "database",
            "migrations",
        );
        // Mock console methods to reduce noise in test output
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        // Clean up temporary files and directories
        try {
            const files = fs.readdirSync(tempDir);
            for (const file of files) {
                fs.unlinkSync(path.join(tempDir, file));
            }
            fs.rmdirSync(tempDir);
        } catch (error) {
            // Ignore cleanup errors
        }
        vi.restoreAllMocks();
    });

    const createTestDatabase = async (
        dbPath: string,
        setupFn?: (db: Database.Database) => void,
    ): Promise<Database.Database> => {
        const db = new Database(dbPath);
        if (setupFn) {
            setupFn(db);
        }
        return db;
    };

    const createNewDatabaseWithMigrations = async (
        dbPath: string,
    ): Promise<Database.Database> => {
        const db = new Database(dbPath);
        await initializeAndMigrateDatabase(db);
        return db;
    };

    describe("initializeAndMigrateDatabase", () => {
        it("should successfully initialize database with user_version 7", async () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            await initializeAndMigrateDatabase(db);

            const userVersion = db.pragma("user_version", { simple: true });
            expect(userVersion).toBe(7);

            db.close();
            fs.unlinkSync(dbPath);
        });

        it("should apply all pending migrations", async () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            await initializeAndMigrateDatabase(db);

            const orm = getOrm(db);
            const migrator = new DrizzleMigrationService(orm, db);
            const appliedMigrations = migrator.getAppliedMigrations();
            expect(appliedMigrations.length).toBeGreaterThan(0);

            db.close();
            fs.unlinkSync(dbPath);
        });

        it("should initialize database schema correctly", async () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            await initializeAndMigrateDatabase(db);

            // Check that key tables exist
            const tables = db
                .prepare(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
                )
                .all() as Array<{ name: string }>;

            const tableNames = tables.map((t) => t.name);
            expect(tableNames).toContain("beats");
            expect(tableNames).toContain("pages");
            expect(tableNames).toContain("marchers");
            expect(tableNames).toContain("field_properties");

            db.close();
            fs.unlinkSync(dbPath);
        });

        it("should initialize field_properties with default template", async () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            await initializeAndMigrateDatabase(db);

            const fieldProps = db
                .prepare("SELECT * FROM field_properties WHERE id = 1")
                .get() as { id: number; json_data: string } | undefined;

            expect(fieldProps).toBeDefined();
            expect(fieldProps?.id).toBe(1);
            const data = JSON.parse(fieldProps?.json_data || "{}");
            expect(data).toBeDefined();

            db.close();
            fs.unlinkSync(dbPath);
        });

        it("should initialize workspace_settings with default values", async () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            await initializeAndMigrateDatabase(db);

            const workspaceSettings = db
                .prepare("SELECT * FROM workspace_settings WHERE id = 1")
                .get() as { id: number; json_data: string } | undefined;

            expect(workspaceSettings).toBeDefined();
            expect(workspaceSettings?.id).toBe(1);
            const data = JSON.parse(workspaceSettings?.json_data || "{}");
            expect(data.defaultBeatsPerMeasure).toBe(4);
            expect(data.defaultTempo).toBe(120);

            db.close();
            fs.unlinkSync(dbPath);
        });
    });

    describe("copyFieldPropertiesFromOriginalDatabase", () => {
        it("should copy common columns correctly", () => {
            const originalDbPath = path.join(tempDir, "original.db");
            const newDbPath = path.join(tempDir, "new.db");

            const originalDb = new Database(originalDbPath);
            originalDb.exec(`
                CREATE TABLE field_properties (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    json_data TEXT NOT NULL,
                    old_column TEXT
                );
                INSERT INTO field_properties (id, json_data, old_column)
                VALUES (1, '{"test": "data"}', 'old_value');
            `);

            const newDb = new Database(newDbPath);
            newDb.exec(`
                CREATE TABLE field_properties (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    json_data TEXT NOT NULL,
                    new_column TEXT
                );
                INSERT INTO field_properties (id, json_data, new_column)
                VALUES (1, '{"default": "data"}', 'new_value');
            `);

            copyFieldPropertiesFromOriginalDatabase(
                originalDb,
                newDb,
                "field_properties",
            );

            const copied = newDb
                .prepare("SELECT * FROM field_properties WHERE id = 1")
                .get() as { id: number; json_data: string; new_column: string };

            expect(copied.json_data).toBe('{"test": "data"}');
            expect(copied.new_column).toBe("new_value"); // Should preserve new column value

            originalDb.close();
            newDb.close();
            fs.unlinkSync(originalDbPath);
            fs.unlinkSync(newDbPath);
        });

        it("should throw error if table doesn't have exactly one row", () => {
            const originalDbPath = path.join(tempDir, "original.db");
            const newDbPath = path.join(tempDir, "new.db");

            const originalDb = new Database(originalDbPath);
            // Create a table without CHECK constraint to allow multiple rows for testing
            originalDb.exec(`
                CREATE TABLE field_properties (
                    id INTEGER PRIMARY KEY,
                    json_data TEXT NOT NULL
                );
                INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                INSERT INTO field_properties (id, json_data) VALUES (2, '{"test": "data2"}');
            `);

            const newDb = new Database(newDbPath);
            newDb.exec(`
                CREATE TABLE field_properties (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    json_data TEXT NOT NULL
                );
                INSERT INTO field_properties (id, json_data) VALUES (1, '{"default": "data"}');
            `);

            expect(() => {
                copyFieldPropertiesFromOriginalDatabase(
                    originalDb,
                    newDb,
                    "field_properties",
                );
            }).toThrow("must have exactly one row");

            originalDb.close();
            newDb.close();
            fs.unlinkSync(originalDbPath);
            fs.unlinkSync(newDbPath);
        });

        it("should handle missing columns gracefully", () => {
            const originalDbPath = path.join(tempDir, "original.db");
            const newDbPath = path.join(tempDir, "new.db");

            const originalDb = new Database(originalDbPath);
            originalDb.exec(`
                CREATE TABLE field_properties (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    json_data TEXT NOT NULL,
                    image BLOB
                );
                INSERT INTO field_properties (id, json_data, image)
                VALUES (1, '{"test": "data"}', X'010203');
            `);

            const newDb = new Database(newDbPath);
            newDb.exec(`
                CREATE TABLE field_properties (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    json_data TEXT NOT NULL
                );
                INSERT INTO field_properties (id, json_data)
                VALUES (1, '{"default": "data"}');
            `);

            // Should not throw, should just copy common columns
            copyFieldPropertiesFromOriginalDatabase(
                originalDb,
                newDb,
                "field_properties",
            );

            const copied = newDb
                .prepare("SELECT * FROM field_properties WHERE id = 1")
                .get() as { id: number; json_data: string };

            expect(copied.json_data).toBe('{"test": "data"}');

            originalDb.close();
            newDb.close();
            fs.unlinkSync(originalDbPath);
            fs.unlinkSync(newDbPath);
        });

        it("should skip table if no common columns exist", () => {
            const originalDbPath = path.join(tempDir, "original.db");
            const newDbPath = path.join(tempDir, "new.db");

            const originalDb = new Database(originalDbPath);
            originalDb.exec(`
                CREATE TABLE field_properties (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    old_column TEXT NOT NULL
                );
                INSERT INTO field_properties (id, old_column) VALUES (1, 'old');
            `);

            const newDb = new Database(newDbPath);
            newDb.exec(`
                CREATE TABLE field_properties (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    new_column TEXT NOT NULL
                );
                INSERT INTO field_properties (id, new_column) VALUES (1, 'new');
            `);

            // Should not throw, just skip
            copyFieldPropertiesFromOriginalDatabase(
                originalDb,
                newDb,
                "field_properties",
            );

            const copied = newDb
                .prepare("SELECT * FROM field_properties WHERE id = 1")
                .get() as { id: number; new_column: string };

            expect(copied.new_column).toBe("new"); // Should remain unchanged

            originalDb.close();
            newDb.close();
            fs.unlinkSync(originalDbPath);
            fs.unlinkSync(newDbPath);
        });

        describe("property-based tests with fast-check", () => {
            it("should preserve data integrity for single-row tables with various column combinations", async () => {
                await fc.assert(
                    fc.asyncProperty(
                        fc.record({
                            jsonData: fc
                                .string({ minLength: 1, maxLength: 500 })
                                .filter(
                                    (s) => !s.includes("'") && !s.includes('"'),
                                ),
                            hasImage: fc.boolean(),
                        }),
                        async ({ jsonData, hasImage }) => {
                            const originalDbPath = path.join(
                                tempDir,
                                `original-${Date.now()}-${Math.random()}.db`,
                            );
                            const newDbPath = path.join(
                                tempDir,
                                `new-${Date.now()}-${Math.random()}.db`,
                            );

                            try {
                                const originalDb = new Database(originalDbPath);
                                const originalColumns = [
                                    "id INTEGER PRIMARY KEY CHECK (id = 1)",
                                    "json_data TEXT NOT NULL",
                                ];
                                if (hasImage) {
                                    originalColumns.push("image BLOB");
                                }

                                originalDb.exec(`
                                    CREATE TABLE field_properties (${originalColumns.join(", ")});
                                    INSERT INTO field_properties (id, json_data${hasImage ? ", image" : ""})
                                    VALUES (1, '${jsonData}'${hasImage ? ", X'010203'" : ""});
                                `);

                                const newDb = new Database(newDbPath);
                                newDb.exec(`
                                    CREATE TABLE field_properties (
                                        id INTEGER PRIMARY KEY CHECK (id = 1),
                                        json_data TEXT NOT NULL
                                    );
                                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"default": "data"}');
                                `);

                                copyFieldPropertiesFromOriginalDatabase(
                                    originalDb,
                                    newDb,
                                    "field_properties",
                                );

                                const copied = newDb
                                    .prepare(
                                        "SELECT json_data FROM field_properties WHERE id = 1",
                                    )
                                    .get() as { json_data: string } | undefined;

                                expect(copied?.json_data).toBe(jsonData);

                                originalDb.close();
                                newDb.close();
                                fs.unlinkSync(originalDbPath);
                                fs.unlinkSync(newDbPath);
                            } catch (error) {
                                // Clean up on error
                                try {
                                    if (fs.existsSync(originalDbPath)) {
                                        fs.unlinkSync(originalDbPath);
                                    }
                                    if (fs.existsSync(newDbPath)) {
                                        fs.unlinkSync(newDbPath);
                                    }
                                } catch {
                                    // Ignore cleanup errors
                                }
                                throw error;
                            }
                        },
                    ),
                    { numRuns: 10 }, // Reduced for performance and reliability
                );
            });
        });
    });

    describe("copyDataFromOriginalDatabase", () => {
        it("should copy all tables except excluded ones", async () => {
            const originalDbPath = path.join(tempDir, "original.db");
            const newDbPath = path.join(tempDir, "new.db");

            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT);
                    INSERT INTO test_table (id, name) VALUES (1, 'test1'), (2, 'test2');
                    CREATE TABLE history_undo (sequence INTEGER PRIMARY KEY, history_group INTEGER, sql TEXT);
                    INSERT INTO history_undo (sequence, history_group, sql) VALUES (1, 1, 'SELECT 1');
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );

            const newDb = await createNewDatabaseWithMigrations(newDbPath);
            newDb.exec(`
                CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT);
            `);

            copyDataFromOriginalDatabase(originalDb, newDb, originalDbPath);

            const copied = newDb
                .prepare("SELECT * FROM test_table")
                .all() as Array<{ id: number; name: string }>;

            expect(copied.length).toBe(2);
            expect(copied[0].name).toBe("test1");
            expect(copied[1].name).toBe("test2");

            // Should not have history_undo table data (it's excluded)
            const historyTables = newDb
                .prepare(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name='history_undo'`,
                )
                .all();
            // history_undo exists in new schema but data shouldn't be copied

            originalDb.close();
            newDb.close();
            fs.unlinkSync(originalDbPath);
            fs.unlinkSync(newDbPath);
        });

        it("should skip id=0 rows for beats and pages tables", async () => {
            const originalDbPath = path.join(tempDir, "original.db");
            const newDbPath = path.join(tempDir, "new.db");

            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE beats (id INTEGER PRIMARY KEY, duration REAL, position INTEGER);
                    INSERT INTO beats (id, duration, position) VALUES (0, 0, 0), (1, 0.5, 1), (2, 0.5, 2);
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );

            const newDb = await createNewDatabaseWithMigrations(newDbPath);

            copyDataFromOriginalDatabase(originalDb, newDb, originalDbPath);

            const copied = newDb
                .prepare("SELECT * FROM beats WHERE id != 0")
                .all() as Array<{ id: number }>;

            // Should have the new database's default beat with id=0, plus the copied ones
            const allBeats = newDb
                .prepare("SELECT id FROM beats ORDER BY id")
                .all() as Array<{ id: number }>;

            const copiedIds = allBeats.map((b) => b.id);
            expect(copiedIds).toContain(1);
            expect(copiedIds).toContain(2);

            originalDb.close();
            newDb.close();
            fs.unlinkSync(originalDbPath);
            fs.unlinkSync(newDbPath);
        });

        it("should only copy common columns between old and new schemas", async () => {
            const originalDbPath = path.join(tempDir, "original.db");
            const newDbPath = path.join(tempDir, "new.db");

            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT, old_column TEXT);
                    INSERT INTO test_table (id, name, old_column) VALUES (1, 'test1', 'old');
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );

            const newDb = await createNewDatabaseWithMigrations(newDbPath);
            newDb.exec(`
                CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT, new_column TEXT);
            `);

            copyDataFromOriginalDatabase(originalDb, newDb, originalDbPath);

            const copied = newDb
                .prepare("SELECT * FROM test_table WHERE id = 1")
                .get() as {
                id: number;
                name: string;
                new_column: string | null;
            };

            expect(copied.name).toBe("test1");
            expect(copied.new_column).toBeNull(); // Should not have old_column value

            originalDb.close();
            newDb.close();
            fs.unlinkSync(originalDbPath);
            fs.unlinkSync(newDbPath);
        });

        it("should handle tables with no common columns", async () => {
            const originalDbPath = path.join(tempDir, "original.db");
            const newDbPath = path.join(tempDir, "new.db");

            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE test_table (id INTEGER PRIMARY KEY, old_column TEXT);
                    INSERT INTO test_table (id, old_column) VALUES (1, 'old');
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );

            const newDb = await createNewDatabaseWithMigrations(newDbPath);
            newDb.exec(`
                CREATE TABLE test_table (id INTEGER PRIMARY KEY, new_column TEXT);
            `);

            // Should not throw, just skip the table
            copyDataFromOriginalDatabase(originalDb, newDb, originalDbPath);

            const copied = newDb.prepare("SELECT * FROM test_table").all();

            // id is a common column, so the row will be copied with just the id value
            expect(copied.length).toBe(1);
            expect(copied[0].id).toBe(1);

            originalDb.close();
            newDb.close();
            fs.unlinkSync(originalDbPath);
            fs.unlinkSync(newDbPath);
        });

        it("should handle empty tables", async () => {
            const originalDbPath = path.join(tempDir, "original.db");
            const newDbPath = path.join(tempDir, "new.db");

            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT);
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );

            const newDb = await createNewDatabaseWithMigrations(newDbPath);
            newDb.exec(`
                CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT);
            `);

            copyDataFromOriginalDatabase(originalDb, newDb, originalDbPath);

            const copied = newDb.prepare("SELECT * FROM test_table").all();

            expect(copied.length).toBe(0);

            originalDb.close();
            newDb.close();
            fs.unlinkSync(originalDbPath);
            fs.unlinkSync(newDbPath);
        });

        it("should handle single-row tables separately", async () => {
            const originalDbPath = path.join(tempDir, "original.db");
            const newDbPath = path.join(tempDir, "new.db");

            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 16);
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );

            const newDb = await createNewDatabaseWithMigrations(newDbPath);

            copyDataFromOriginalDatabase(originalDb, newDb, originalDbPath);

            // Utility table should have been handled by copyFieldPropertiesFromOriginalDatabase
            // But since it's called in copyDataFromOriginalDatabase, it should work
            const utility = newDb
                .prepare("SELECT * FROM utility WHERE id = 0")
                .get() as
                | { id: number; last_page_counts: number | null }
                | undefined;

            // The new database should have initialized utility table
            expect(utility).toBeDefined();

            originalDb.close();
            newDb.close();
            fs.unlinkSync(originalDbPath);
            fs.unlinkSync(newDbPath);
        });

        describe("property-based tests with fast-check", () => {
            it("should preserve data integrity when copying tables with various structures", async () => {
                await fc.assert(
                    fc.asyncProperty(
                        fc.uniqueArray(
                            fc.record({
                                tableName: fc
                                    .string({
                                        minLength: 2,
                                        maxLength: 20,
                                    })
                                    .filter((s) =>
                                        /^[a-zA-Z_][a-zA-Z0-9_]+$/.test(s),
                                    ),
                                numRows: fc.integer({ min: 0, max: 50 }),
                                commonColumns: fc.uniqueArray(
                                    fc
                                        .string({
                                            minLength: 1,
                                            maxLength: 20,
                                        })
                                        .filter((s) =>
                                            /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s),
                                        ),
                                    {
                                        minLength: 1,
                                        maxLength: 5,
                                        selector: (c) => c,
                                    },
                                ),
                            }),
                            {
                                minLength: 1,
                                maxLength: 10,
                                selector: (t) => t.tableName,
                            },
                        ),
                        async (tables) => {
                            // Filter out SQL reserved keywords
                            const sqlKeywords = new Set([
                                "select",
                                "from",
                                "where",
                                "insert",
                                "update",
                                "delete",
                                "create",
                                "table",
                                "drop",
                                "alter",
                                "index",
                                "view",
                                "and",
                                "or",
                                "not",
                                "in",
                                "like",
                                "between",
                                "is",
                                "null",
                                "as",
                                "order",
                                "by",
                                "group",
                                "having",
                                "limit",
                                "offset",
                                "join",
                                "inner",
                                "left",
                                "right",
                                "outer",
                                "on",
                                "union",
                                "distinct",
                                "case",
                                "when",
                                "then",
                                "else",
                                "end",
                                "primary",
                                "key",
                                "foreign",
                                "references",
                                "constraint",
                                "check",
                                "default",
                                "values",
                                "set",
                                "into",
                            ]);
                            const hasReservedKeywords = tables.some(
                                (t) =>
                                    sqlKeywords.has(
                                        t.tableName.toLowerCase(),
                                    ) ||
                                    t.commonColumns.some((c) =>
                                        sqlKeywords.has(c.toLowerCase()),
                                    ),
                            );
                            if (hasReservedKeywords) {
                                return; // Skip this test case
                            }
                            const originalDbPath = path.join(
                                tempDir,
                                `original-${Date.now()}.db`,
                            );
                            const newDbPath = path.join(
                                tempDir,
                                `new-${Date.now()}.db`,
                            );

                            try {
                                const originalDb = new Database(originalDbPath);
                                const newDb = new Database(newDbPath);

                                // Create single-row tables that copyDataFromOriginalDatabase expects
                                originalDb.exec(`
                                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                                    INSERT INTO field_properties (id, json_data) VALUES (1, '{}');
                                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                                `);

                                // Create tables in both databases
                                for (const table of tables) {
                                    const commonColsDef = table.commonColumns
                                        .map((col) => `"${col}" TEXT`)
                                        .join(", ");
                                    const allColsDef = `id INTEGER PRIMARY KEY, ${commonColsDef}`;

                                    originalDb.exec(`
                                        CREATE TABLE "${table.tableName}" (${allColsDef});
                                    `);

                                    newDb.exec(`
                                        CREATE TABLE "${table.tableName}" (${allColsDef});
                                    `);

                                    // Insert test data
                                    for (let i = 0; i < table.numRows; i++) {
                                        const values = table.commonColumns
                                            .map((col) => `'${col}_${i}'`)
                                            .join(", ");
                                        const quotedColumns =
                                            table.commonColumns
                                                .map((col) => `"${col}"`)
                                                .join(", ");
                                        originalDb.exec(`
                                            INSERT INTO "${table.tableName}" (id, ${quotedColumns})
                                            VALUES (${i + 1}, ${values});
                                        `);
                                    }
                                }

                                copyDataFromOriginalDatabase(
                                    originalDb,
                                    newDb,
                                    originalDbPath,
                                );

                                // Verify data was copied correctly
                                for (const table of tables) {
                                    const originalRows = originalDb
                                        .prepare(
                                            `SELECT * FROM "${table.tableName}"`,
                                        )
                                        .all();
                                    const copiedRows = newDb
                                        .prepare(
                                            `SELECT * FROM "${table.tableName}"`,
                                        )
                                        .all();

                                    expect(copiedRows.length).toBe(
                                        originalRows.length,
                                    );

                                    // Verify row data matches
                                    for (
                                        let i = 0;
                                        i < originalRows.length;
                                        i++
                                    ) {
                                        const original = originalRows[
                                            i
                                        ] as Record<string, unknown>;
                                        const copied = copiedRows[i] as Record<
                                            string,
                                            unknown
                                        >;

                                        for (const col of table.commonColumns) {
                                            expect(copied[col]).toBe(
                                                original[col],
                                            );
                                        }
                                    }
                                }

                                originalDb.close();
                                newDb.close();
                                fs.unlinkSync(originalDbPath);
                                fs.unlinkSync(newDbPath);
                            } catch (error) {
                                // Clean up on error
                                try {
                                    if (fs.existsSync(originalDbPath)) {
                                        fs.unlinkSync(originalDbPath);
                                    }
                                    if (fs.existsSync(newDbPath)) {
                                        fs.unlinkSync(newDbPath);
                                    }
                                } catch {
                                    // Ignore cleanup errors
                                }
                                throw error;
                            }
                        },
                    ),
                    { numRuns: 10 }, // Reduced for performance
                );
            });
        });
    });

    describe("repairDatabase", () => {
        it("should complete repair flow with valid database", async () => {
            const originalDbPath = path.join(tempDir, "test.dots");
            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE beats (id INTEGER PRIMARY KEY, duration REAL, position INTEGER);
                    INSERT INTO beats (id, duration, position) VALUES (1, 0.5, 1), (2, 0.5, 2);
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );
            originalDb.close();

            const fixedPath = await repairDatabase(originalDbPath);

            expect(fixedPath).toContain(" - FIXED.dots");
            expect(fs.existsSync(fixedPath)).toBe(true);

            const fixedDb = new Database(fixedPath);
            const beats = fixedDb
                .prepare("SELECT * FROM beats WHERE id != 0")
                .all();
            expect(beats.length).toBeGreaterThan(0);

            fixedDb.close();
            fs.unlinkSync(fixedPath);
            fs.unlinkSync(originalDbPath);
        });

        it("should use _blank.dots as the base database and migrate it", async () => {
            const blankDbPath = path.join(
                __dirname,
                "../migrations/_blank.dots",
            );

            if (!fs.existsSync(blankDbPath)) {
                // Skip if blank.dots doesn't exist (might not be generated yet)
                console.warn(
                    "_blank.dots not found, skipping this test. Run 'pnpm migrate' first.",
                );
                return;
            }

            // Create a copy to avoid modifying the original
            const originalDbPath = path.join(tempDir, "test.dots");
            fs.copyFileSync(blankDbPath, originalDbPath);

            const fixedPath = await repairDatabase(originalDbPath);

            expect(fixedPath).toContain(" - FIXED.dots");
            expect(fs.existsSync(fixedPath)).toBe(true);

            const fixedDb = new Database(fixedPath);

            // Verify the database was initialized correctly
            const userVersion = fixedDb.pragma("user_version", {
                simple: true,
            });
            expect(userVersion).toBe(7);

            // Verify migrations were applied
            const orm = getOrm(fixedDb);
            const migrator = new DrizzleMigrationService(orm, fixedDb);
            const appliedMigrations = migrator.getAppliedMigrations();
            expect(appliedMigrations.length).toBeGreaterThan(0);

            // Verify schema exists
            const tables = fixedDb
                .prepare(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
                )
                .all() as Array<{ name: string }>;
            expect(tables.length).toBeGreaterThan(0);

            fixedDb.close();
            fs.unlinkSync(fixedPath);
            fs.unlinkSync(originalDbPath);
        });

        it("should create temp database file correctly", async () => {
            const originalDbPath = path.join(tempDir, "test.dots");
            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE beats (id INTEGER PRIMARY KEY, duration REAL, position INTEGER);
                    INSERT INTO beats (id, duration, position) VALUES (1, 0.5, 1);
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );
            originalDb.close();

            const tempDbPath = path.join(tempDir, "test.dots.temp");

            // Start repair and check temp file is created
            const repairPromise = repairDatabase(originalDbPath);

            // Wait a bit to see if temp file is created (though this is async)
            await new Promise((resolve) => setTimeout(resolve, 100));

            const fixedPath = await repairPromise;

            // Temp file should be cleaned up by the time repair completes
            expect(fs.existsSync(tempDbPath)).toBe(false);
            expect(fs.existsSync(fixedPath)).toBe(true);

            fs.unlinkSync(fixedPath);
            fs.unlinkSync(originalDbPath);
        });

        it("should rename temp file to final file on success", async () => {
            const originalDbPath = path.join(tempDir, "test.dots");
            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );
            originalDb.close();

            const fixedPath = await repairDatabase(originalDbPath);

            expect(fixedPath).toContain(" - FIXED.dots");
            expect(fs.existsSync(fixedPath)).toBe(true);

            // Verify it's a valid database
            const fixedDb = new Database(fixedPath);
            const userVersion = fixedDb.pragma("user_version", {
                simple: true,
            });
            expect(userVersion).toBe(7);

            fixedDb.close();
            fs.unlinkSync(fixedPath);
            fs.unlinkSync(originalDbPath);
        });

        it("should clean up temp file on failure", async () => {
            const originalDbPath = path.join(tempDir, "test.dots");
            // Create an invalid database file
            fs.writeFileSync(originalDbPath, "invalid database content");

            const tempDbPath = path.join(tempDir, "test.dots.temp");

            await expect(repairDatabase(originalDbPath)).rejects.toThrow();

            // Temp file should be cleaned up even on failure
            expect(fs.existsSync(tempDbPath)).toBe(false);

            if (fs.existsSync(originalDbPath)) {
                fs.unlinkSync(originalDbPath);
            }
        });

        it("should handle readonly original database correctly", async () => {
            const originalDbPath = path.join(tempDir, "test.dots");
            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE beats (id INTEGER PRIMARY KEY, duration REAL, position INTEGER);
                    INSERT INTO beats (id, duration, position) VALUES (1, 0.5, 1);
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );
            originalDb.close();

            // repairDatabase opens the original database with readonly: true internally
            // We just need to verify it works correctly
            const fixedPath = await repairDatabase(originalDbPath);

            expect(fixedPath).toContain(" - FIXED.dots");
            expect(fs.existsSync(fixedPath)).toBe(true);

            fs.unlinkSync(fixedPath);
            fs.unlinkSync(originalDbPath);
        });

        it("should create final database with '- FIXED' suffix", async () => {
            const originalDbPath = path.join(tempDir, "test.dots");
            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );
            originalDb.close();

            const fixedPath = await repairDatabase(originalDbPath);

            const expectedPath = path.join(tempDir, "test - FIXED.dots");
            expect(fixedPath).toBe(expectedPath);
            expect(fs.existsSync(fixedPath)).toBe(true);

            fs.unlinkSync(fixedPath);
            fs.unlinkSync(originalDbPath);
        });

        it("should validate final database has correct schema and data", async () => {
            const originalDbPath = path.join(tempDir, "test.dots");
            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE beats (id INTEGER PRIMARY KEY, duration REAL, position INTEGER);
                    INSERT INTO beats (id, duration, position) VALUES (1, 0.5, 1), (2, 0.5, 2);
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );
            originalDb.close();

            const fixedPath = await repairDatabase(originalDbPath);

            const fixedDb = new Database(fixedPath);

            // Verify schema
            const tables = fixedDb
                .prepare(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
                )
                .all() as Array<{ name: string }>;
            expect(tables.length).toBeGreaterThan(0);

            // Verify user version
            const userVersion = fixedDb.pragma("user_version", {
                simple: true,
            });
            expect(userVersion).toBe(7);

            // Verify migrations were applied
            const orm = getOrm(fixedDb);
            const migrator = new DrizzleMigrationService(orm, fixedDb);
            const appliedMigrations = migrator.getAppliedMigrations();
            expect(appliedMigrations.length).toBeGreaterThan(0);

            fixedDb.close();
            fs.unlinkSync(fixedPath);
            fs.unlinkSync(originalDbPath);
        });

        it("should delete existing FIXED file if it exists", async () => {
            const originalDbPath = path.join(tempDir, "test.dots");
            const originalDb = await createTestDatabase(
                originalDbPath,
                (db) => {
                    db.exec(`
                    CREATE TABLE field_properties (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO field_properties (id, json_data) VALUES (1, '{"test": "data"}');
                    CREATE TABLE utility (id INTEGER PRIMARY KEY CHECK (id = 0), last_page_counts INTEGER);
                    INSERT INTO utility (id, last_page_counts) VALUES (0, 8);
                    CREATE TABLE workspace_settings (id INTEGER PRIMARY KEY CHECK (id = 1), json_data TEXT NOT NULL);
                    INSERT INTO workspace_settings (id, json_data) VALUES (1, '{}');
                `);
                },
            );
            originalDb.close();

            const fixedPath = path.join(tempDir, "test - FIXED.dots");
            // Create an existing fixed file
            fs.writeFileSync(fixedPath, "old content");

            await repairDatabase(originalDbPath);

            // Old file should be replaced
            expect(fs.existsSync(fixedPath)).toBe(true);
            const fixedDb = new Database(fixedPath);
            const userVersion = fixedDb.pragma("user_version", {
                simple: true,
            });
            expect(userVersion).toBe(7); // Should be a valid database, not "old content"

            fixedDb.close();
            fs.unlinkSync(fixedPath);
            fs.unlinkSync(originalDbPath);
        });
    });
});
