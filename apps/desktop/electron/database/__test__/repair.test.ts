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
    removeOrphanMarcherPages,
} from "../repair";
import { getOrm } from "../db";
import { DrizzleMigrationService } from "../services/DrizzleMigrationService";
import { app } from "electron";

describe("Database Repair", () => {
    let tempDir: string;

    beforeEach(() => {
        // Mock app.getAppPath to return the correct path for tests
        // Electron is already mocked globally in vitest.setup.ts
        // The path should point to apps/desktop so that app.getAppPath() + "electron/database/migrations"
        // resolves to the correct migrations folder
        // __dirname is electron/database/__test__, so go up 3 levels to get to apps/desktop
        const appRoot = path.resolve(__dirname, "../../..");
        if (app && !("getAppPath" in app)) {
            (app as { getAppPath: () => string }).getAppPath = vi.fn(() => {
                return appRoot;
            });
        } else if (app) {
            vi.mocked(app.getAppPath as () => string).mockReturnValue(appRoot);
        }

        // Create a temporary directory for test databases
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repair-test-"));
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
            expect((copied[0] as { id: number }).id).toBe(1);

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
                                        selector: (c) => c.toLowerCase(),
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
                            // Filter out SQL reserved keywords and "id" (already used as primary key)
                            const sqlKeywords = new Set([
                                "id",
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
                                "all",
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

    describe("removeOrphanMarcherPages", () => {
        it("should remove marcher_pages with invalid marcher_id", () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            // Create tables
            db.exec(`
                CREATE TABLE marchers (
                    id INTEGER PRIMARY KEY,
                    name TEXT,
                    section TEXT NOT NULL,
                    drill_prefix TEXT NOT NULL,
                    drill_order INTEGER NOT NULL
                );
                CREATE TABLE pages (
                    id INTEGER PRIMARY KEY,
                    start_beat INTEGER NOT NULL,
                    is_subset INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE marcher_pages (
                    id INTEGER PRIMARY KEY,
                    marcher_id INTEGER NOT NULL,
                    page_id INTEGER NOT NULL,
                    x REAL NOT NULL,
                    y REAL NOT NULL
                );
            `);

            // Insert valid data
            db.exec(`
                INSERT INTO marchers (id, name, section, drill_prefix, drill_order)
                VALUES (1, 'Marcher 1', 'Brass', 'T', 1),
                       (2, 'Marcher 2', 'Brass', 'T', 2);
                INSERT INTO pages (id, start_beat, is_subset)
                VALUES (1, 0, 0),
                       (2, 4, 0);
                INSERT INTO marcher_pages (id, marcher_id, page_id, x, y)
                VALUES (1, 1, 1, 10.0, 20.0),
                       (2, 2, 1, 15.0, 25.0),
                       (3, 999, 1, 20.0, 30.0),  -- Invalid marcher_id
                       (4, 1, 2, 25.0, 35.0);
            `);

            // Verify initial state
            const beforeCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(beforeCount.count).toBe(4);

            // Run the function
            removeOrphanMarcherPages(db);

            // Verify orphaned marcher_pages were removed
            const afterCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(afterCount.count).toBe(3);

            const remaining = db
                .prepare("SELECT id FROM marcher_pages ORDER BY id")
                .all() as Array<{ id: number }>;
            expect(remaining.map((r) => r.id)).toEqual([1, 2, 4]);

            db.close();
            fs.unlinkSync(dbPath);
        });

        it("should remove marcher_pages with invalid page_id", () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            // Create tables
            db.exec(`
                CREATE TABLE marchers (
                    id INTEGER PRIMARY KEY,
                    name TEXT,
                    section TEXT NOT NULL,
                    drill_prefix TEXT NOT NULL,
                    drill_order INTEGER NOT NULL
                );
                CREATE TABLE pages (
                    id INTEGER PRIMARY KEY,
                    start_beat INTEGER NOT NULL,
                    is_subset INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE marcher_pages (
                    id INTEGER PRIMARY KEY,
                    marcher_id INTEGER NOT NULL,
                    page_id INTEGER NOT NULL,
                    x REAL NOT NULL,
                    y REAL NOT NULL
                );
            `);

            // Insert valid data
            db.exec(`
                INSERT INTO marchers (id, name, section, drill_prefix, drill_order)
                VALUES (1, 'Marcher 1', 'Brass', 'T', 1),
                       (2, 'Marcher 2', 'Brass', 'T', 2);
                INSERT INTO pages (id, start_beat, is_subset)
                VALUES (1, 0, 0),
                       (2, 4, 0);
                INSERT INTO marcher_pages (id, marcher_id, page_id, x, y)
                VALUES (1, 1, 1, 10.0, 20.0),
                       (2, 2, 1, 15.0, 25.0),
                       (3, 1, 999, 20.0, 30.0),  -- Invalid page_id
                       (4, 1, 2, 25.0, 35.0);
            `);

            // Verify initial state
            const beforeCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(beforeCount.count).toBe(4);

            // Run the function
            removeOrphanMarcherPages(db);

            // Verify orphaned marcher_pages were removed
            const afterCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(afterCount.count).toBe(3);

            const remaining = db
                .prepare("SELECT id FROM marcher_pages ORDER BY id")
                .all() as Array<{ id: number }>;
            expect(remaining.map((r) => r.id)).toEqual([1, 2, 4]);

            db.close();
            fs.unlinkSync(dbPath);
        });

        it("should remove marcher_pages with both invalid marcher_id and page_id", () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            // Create tables
            db.exec(`
                CREATE TABLE marchers (
                    id INTEGER PRIMARY KEY,
                    name TEXT,
                    section TEXT NOT NULL,
                    drill_prefix TEXT NOT NULL,
                    drill_order INTEGER NOT NULL
                );
                CREATE TABLE pages (
                    id INTEGER PRIMARY KEY,
                    start_beat INTEGER NOT NULL,
                    is_subset INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE marcher_pages (
                    id INTEGER PRIMARY KEY,
                    marcher_id INTEGER NOT NULL,
                    page_id INTEGER NOT NULL,
                    x REAL NOT NULL,
                    y REAL NOT NULL
                );
            `);

            // Insert valid data
            db.exec(`
                INSERT INTO marchers (id, name, section, drill_prefix, drill_order)
                VALUES (1, 'Marcher 1', 'Brass', 'T', 1);
                INSERT INTO pages (id, start_beat, is_subset)
                VALUES (1, 0, 0);
                INSERT INTO marcher_pages (id, marcher_id, page_id, x, y)
                VALUES (1, 1, 1, 10.0, 20.0),
                       (2, 999, 1, 15.0, 25.0),      -- Invalid marcher_id
                       (3, 1, 999, 20.0, 30.0),      -- Invalid page_id
                       (4, 888, 777, 25.0, 35.0);   -- Both invalid
            `);

            // Verify initial state
            const beforeCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(beforeCount.count).toBe(4);

            // Run the function
            removeOrphanMarcherPages(db);

            // Verify all orphaned marcher_pages were removed
            const afterCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(afterCount.count).toBe(1);

            const remaining = db
                .prepare("SELECT id FROM marcher_pages")
                .get() as { id: number };
            expect(remaining.id).toBe(1);

            db.close();
            fs.unlinkSync(dbPath);
        });

        it("should keep all valid marcher_pages", () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            // Create tables
            db.exec(`
                CREATE TABLE marchers (
                    id INTEGER PRIMARY KEY,
                    name TEXT,
                    section TEXT NOT NULL,
                    drill_prefix TEXT NOT NULL,
                    drill_order INTEGER NOT NULL
                );
                CREATE TABLE pages (
                    id INTEGER PRIMARY KEY,
                    start_beat INTEGER NOT NULL,
                    is_subset INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE marcher_pages (
                    id INTEGER PRIMARY KEY,
                    marcher_id INTEGER NOT NULL,
                    page_id INTEGER NOT NULL,
                    x REAL NOT NULL,
                    y REAL NOT NULL
                );
            `);

            // Insert valid data
            db.exec(`
                INSERT INTO marchers (id, name, section, drill_prefix, drill_order)
                VALUES (1, 'Marcher 1', 'Brass', 'T', 1),
                       (2, 'Marcher 2', 'Brass', 'T', 2),
                       (3, 'Marcher 3', 'Brass', 'T', 3);
                INSERT INTO pages (id, start_beat, is_subset)
                VALUES (1, 0, 0),
                       (2, 4, 0),
                       (3, 8, 0);
                INSERT INTO marcher_pages (id, marcher_id, page_id, x, y)
                VALUES (1, 1, 1, 10.0, 20.0),
                       (2, 1, 2, 15.0, 25.0),
                       (3, 2, 1, 20.0, 30.0),
                       (4, 2, 3, 25.0, 35.0),
                       (5, 3, 2, 30.0, 40.0);
            `);

            // Verify initial state
            const beforeCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(beforeCount.count).toBe(5);

            // Run the function
            removeOrphanMarcherPages(db);

            // Verify all valid marcher_pages remain
            const afterCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(afterCount.count).toBe(5);

            const remaining = db
                .prepare("SELECT id FROM marcher_pages ORDER BY id")
                .all() as Array<{ id: number }>;
            expect(remaining.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);

            db.close();
            fs.unlinkSync(dbPath);
        });

        it("should handle empty marcher_pages table", () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            // Create tables
            db.exec(`
                CREATE TABLE marchers (
                    id INTEGER PRIMARY KEY,
                    name TEXT,
                    section TEXT NOT NULL,
                    drill_prefix TEXT NOT NULL,
                    drill_order INTEGER NOT NULL
                );
                CREATE TABLE pages (
                    id INTEGER PRIMARY KEY,
                    start_beat INTEGER NOT NULL,
                    is_subset INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE marcher_pages (
                    id INTEGER PRIMARY KEY,
                    marcher_id INTEGER NOT NULL,
                    page_id INTEGER NOT NULL,
                    x REAL NOT NULL,
                    y REAL NOT NULL
                );
            `);

            // Run the function on empty table
            removeOrphanMarcherPages(db);

            // Verify table is still empty
            const count = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(count.count).toBe(0);

            db.close();
            fs.unlinkSync(dbPath);
        });

        it("should handle empty marchers and pages tables", () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            // Create tables
            db.exec(`
                CREATE TABLE marchers (
                    id INTEGER PRIMARY KEY,
                    name TEXT,
                    section TEXT NOT NULL,
                    drill_prefix TEXT NOT NULL,
                    drill_order INTEGER NOT NULL
                );
                CREATE TABLE pages (
                    id INTEGER PRIMARY KEY,
                    start_beat INTEGER NOT NULL,
                    is_subset INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE marcher_pages (
                    id INTEGER PRIMARY KEY,
                    marcher_id INTEGER NOT NULL,
                    page_id INTEGER NOT NULL,
                    x REAL NOT NULL,
                    y REAL NOT NULL
                );
            `);

            // Insert orphaned marcher_pages
            db.exec(`
                INSERT INTO marcher_pages (id, marcher_id, page_id, x, y)
                VALUES (1, 1, 1, 10.0, 20.0),
                       (2, 2, 2, 15.0, 25.0);
            `);

            // Verify initial state
            const beforeCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(beforeCount.count).toBe(2);

            // Run the function
            removeOrphanMarcherPages(db);

            // Verify all orphaned marcher_pages were removed
            const afterCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(afterCount.count).toBe(0);

            db.close();
            fs.unlinkSync(dbPath);
        });

        it("should handle multiple orphaned records efficiently", () => {
            const dbPath = path.join(tempDir, "test.db");
            const db = new Database(dbPath);

            // Create tables
            db.exec(`
                CREATE TABLE marchers (
                    id INTEGER PRIMARY KEY,
                    name TEXT,
                    section TEXT NOT NULL,
                    drill_prefix TEXT NOT NULL,
                    drill_order INTEGER NOT NULL
                );
                CREATE TABLE pages (
                    id INTEGER PRIMARY KEY,
                    start_beat INTEGER NOT NULL,
                    is_subset INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE marcher_pages (
                    id INTEGER PRIMARY KEY,
                    marcher_id INTEGER NOT NULL,
                    page_id INTEGER NOT NULL,
                    x REAL NOT NULL,
                    y REAL NOT NULL
                );
            `);

            // Insert one valid marcher and page
            db.exec(`
                INSERT INTO marchers (id, name, section, drill_prefix, drill_order)
                VALUES (1, 'Marcher 1', 'Brass', 'T', 1);
                INSERT INTO pages (id, start_beat, is_subset)
                VALUES (1, 0, 0);
            `);

            // Insert many orphaned marcher_pages
            const stmt = db.prepare(
                "INSERT INTO marcher_pages (id, marcher_id, page_id, x, y) VALUES (?, ?, ?, ?, ?)",
            );
            const insertMany = db.transaction((marcherPages) => {
                for (const mp of marcherPages) {
                    stmt.run(mp.id, mp.marcher_id, mp.page_id, mp.x, mp.y);
                }
            });

            const marcherPages = [];
            // Add one valid entry
            marcherPages.push({
                id: 1,
                marcher_id: 1,
                page_id: 1,
                x: 10.0,
                y: 20.0,
            });
            // Add 50 orphaned entries
            for (let i = 2; i <= 51; i++) {
                marcherPages.push({
                    id: i,
                    marcher_id: i + 100, // Invalid marcher_id
                    page_id: i + 200, // Invalid page_id
                    x: 10.0 * i,
                    y: 20.0 * i,
                });
            }

            insertMany(marcherPages);

            // Verify initial state
            const beforeCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(beforeCount.count).toBe(51);

            // Run the function
            removeOrphanMarcherPages(db);

            // Verify only valid entry remains
            const afterCount = db
                .prepare("SELECT COUNT(*) as count FROM marcher_pages")
                .get() as { count: number };
            expect(afterCount.count).toBe(1);

            const remaining = db
                .prepare("SELECT id FROM marcher_pages")
                .get() as { id: number };
            expect(remaining.id).toBe(1);

            db.close();
            fs.unlinkSync(dbPath);
        });

        describe("property-based tests with fast-check", () => {
            it("should remove all orphaned marcher_pages regardless of data distribution", async () => {
                await fc.assert(
                    fc.asyncProperty(
                        fc.record({
                            marcherIds: fc.uniqueArray(
                                fc.integer({ min: 1, max: 100 }),
                                {
                                    minLength: 0,
                                    maxLength: 20,
                                },
                            ),
                            pageIds: fc.uniqueArray(
                                fc.integer({ min: 1, max: 100 }),
                                {
                                    minLength: 0,
                                    maxLength: 20,
                                },
                            ),
                            marcherPages: fc.array(
                                fc.record({
                                    id: fc.integer({ min: 1, max: 1000 }),
                                    marcher_id: fc.integer({
                                        min: 1,
                                        max: 150,
                                    }),
                                    page_id: fc.integer({ min: 1, max: 150 }),
                                    x: fc.float({ min: -1000, max: 1000 }),
                                    y: fc.float({ min: -1000, max: 1000 }),
                                }),
                                { minLength: 0, maxLength: 50 },
                            ),
                        }),
                        async ({ marcherIds, pageIds, marcherPages }) => {
                            const dbPath = path.join(
                                tempDir,
                                `test-${Date.now()}-${Math.random()}.db`,
                            );
                            const db = new Database(dbPath);

                            try {
                                // Create tables
                                db.exec(`
                                CREATE TABLE marchers (
                                    id INTEGER PRIMARY KEY,
                                    name TEXT,
                                    section TEXT NOT NULL,
                                    drill_prefix TEXT NOT NULL,
                                    drill_order INTEGER NOT NULL
                                );
                                CREATE TABLE pages (
                                    id INTEGER PRIMARY KEY,
                                    start_beat INTEGER NOT NULL,
                                    is_subset INTEGER NOT NULL DEFAULT 0
                                );
                                CREATE TABLE marcher_pages (
                                    id INTEGER PRIMARY KEY,
                                    marcher_id INTEGER NOT NULL,
                                    page_id INTEGER NOT NULL,
                                    x REAL NOT NULL,
                                    y REAL NOT NULL
                                );
                            `);

                                // Insert marchers
                                const insertMarcher = db.prepare(
                                    "INSERT INTO marchers (id, name, section, drill_prefix, drill_order) VALUES (?, ?, ?, ?, ?)",
                                );
                                marcherIds.forEach((id, index) => {
                                    insertMarcher.run(
                                        id,
                                        `Marcher ${id}`,
                                        "Brass",
                                        "T",
                                        index + 1,
                                    );
                                });

                                // Insert pages
                                const insertPage = db.prepare(
                                    "INSERT INTO pages (id, start_beat, is_subset) VALUES (?, ?, ?)",
                                );
                                pageIds.forEach((id, index) => {
                                    insertPage.run(id, index * 4, 0);
                                });

                                // Insert marcher_pages
                                const insertMarcherPage = db.prepare(
                                    "INSERT INTO marcher_pages (id, marcher_id, page_id, x, y) VALUES (?, ?, ?, ?, ?)",
                                );
                                const uniqueMarcherPageIds = new Set<number>();
                                for (const mp of marcherPages) {
                                    // Ensure unique IDs to avoid constraint violations
                                    if (!uniqueMarcherPageIds.has(mp.id)) {
                                        uniqueMarcherPageIds.add(mp.id);
                                        try {
                                            insertMarcherPage.run(
                                                mp.id,
                                                mp.marcher_id,
                                                mp.page_id,
                                                mp.x,
                                                mp.y,
                                            );
                                        } catch {
                                            // Skip if there's a constraint violation
                                        }
                                    }
                                }

                                // Get all marcher_pages before
                                const before = db
                                    .prepare(
                                        "SELECT id, marcher_id, page_id FROM marcher_pages",
                                    )
                                    .all() as Array<{
                                    id: number;
                                    marcher_id: number;
                                    page_id: number;
                                }>;

                                // Calculate which should remain (valid foreign keys)
                                const validMarcherIds = new Set(marcherIds);
                                const validPageIds = new Set(pageIds);
                                const expectedValid = before.filter(
                                    (mp) =>
                                        validMarcherIds.has(mp.marcher_id) &&
                                        validPageIds.has(mp.page_id),
                                );

                                // Run the function
                                removeOrphanMarcherPages(db);

                                // Get all marcher_pages after
                                const after = db
                                    .prepare(
                                        "SELECT id, marcher_id, page_id FROM marcher_pages",
                                    )
                                    .all() as Array<{
                                    id: number;
                                    marcher_id: number;
                                    page_id: number;
                                }>;

                                // Verify only valid entries remain
                                expect(after.length).toBe(expectedValid.length);
                                const afterIds = new Set(
                                    after.map((mp) => mp.id),
                                );
                                for (const valid of expectedValid) {
                                    expect(afterIds.has(valid.id)).toBe(true);
                                }

                                // Verify all remaining entries have valid foreign keys
                                for (const mp of after) {
                                    expect(
                                        validMarcherIds.has(mp.marcher_id),
                                    ).toBe(true);
                                    expect(validPageIds.has(mp.page_id)).toBe(
                                        true,
                                    );
                                }

                                db.close();
                                fs.unlinkSync(dbPath);
                            } catch (error) {
                                try {
                                    db.close();
                                    if (fs.existsSync(dbPath)) {
                                        fs.unlinkSync(dbPath);
                                    }
                                } catch {
                                    // Ignore cleanup errors
                                }
                                throw error;
                            }
                        },
                    ),
                );
            });

            it("should preserve all valid marcher_pages and remove all orphans", async () => {
                await fc.assert(
                    fc.asyncProperty(
                        fc.record({
                            numMarchers: fc.integer({ min: 1, max: 30 }),
                            numPages: fc.integer({ min: 1, max: 30 }),
                            numMarcherPages: fc.integer({ min: 0, max: 100 }),
                            orphanRatio: fc.float({ min: 0, max: 1 }),
                        }),
                        async ({
                            numMarchers,
                            numPages,
                            numMarcherPages,
                            orphanRatio,
                        }) => {
                            const dbPath = path.join(
                                tempDir,
                                `test-${Date.now()}-${Math.random()}.db`,
                            );
                            const db = new Database(dbPath);

                            try {
                                // Create tables
                                db.exec(`
                                CREATE TABLE marchers (
                                    id INTEGER PRIMARY KEY,
                                    name TEXT,
                                    section TEXT NOT NULL,
                                    drill_prefix TEXT NOT NULL,
                                    drill_order INTEGER NOT NULL
                                );
                                CREATE TABLE pages (
                                    id INTEGER PRIMARY KEY,
                                    start_beat INTEGER NOT NULL,
                                    is_subset INTEGER NOT NULL DEFAULT 0
                                );
                                CREATE TABLE marcher_pages (
                                    id INTEGER PRIMARY KEY,
                                    marcher_id INTEGER NOT NULL,
                                    page_id INTEGER NOT NULL,
                                    x REAL NOT NULL,
                                    y REAL NOT NULL
                                );
                            `);

                                // Create marchers
                                const marcherIds: number[] = [];
                                const insertMarcher = db.prepare(
                                    "INSERT INTO marchers (id, name, section, drill_prefix, drill_order) VALUES (?, ?, ?, ?, ?)",
                                );
                                for (let i = 1; i <= numMarchers; i++) {
                                    marcherIds.push(i);
                                    insertMarcher.run(
                                        i,
                                        `Marcher ${i}`,
                                        "Brass",
                                        "T",
                                        i,
                                    );
                                }

                                // Create pages
                                const pageIds: number[] = [];
                                const insertPage = db.prepare(
                                    "INSERT INTO pages (id, start_beat, is_subset) VALUES (?, ?, ?)",
                                );
                                for (let i = 1; i <= numPages; i++) {
                                    pageIds.push(i);
                                    insertPage.run(i, (i - 1) * 4, 0);
                                }

                                // Create marcher_pages with mix of valid and orphaned entries
                                const insertMarcherPage = db.prepare(
                                    "INSERT INTO marcher_pages (id, marcher_id, page_id, x, y) VALUES (?, ?, ?, ?, ?)",
                                );
                                const validMarcherPageIds = new Set<number>();
                                let idCounter = 1;

                                for (let i = 0; i < numMarcherPages; i++) {
                                    // Use deterministic logic: approximately orphanRatio fraction should be orphaned
                                    // This creates a deterministic pattern that respects the orphanRatio parameter
                                    const shouldBeOrphan =
                                        i / numMarcherPages < orphanRatio;
                                    let marcher_id: number;
                                    let page_id: number;

                                    if (shouldBeOrphan) {
                                        // Create orphaned entry - alternate between invalid marcher_id and invalid page_id
                                        if (i % 2 === 0) {
                                            // Invalid marcher_id
                                            marcher_id = numMarchers + 1 + i;
                                            page_id =
                                                pageIds[i % pageIds.length] ||
                                                pageIds[0] ||
                                                1;
                                        } else {
                                            // Invalid page_id
                                            marcher_id =
                                                marcherIds[
                                                    i % marcherIds.length
                                                ] ||
                                                marcherIds[0] ||
                                                1;
                                            page_id = numPages + 1 + i;
                                        }
                                    } else {
                                        // Valid entry - use deterministic selection based on index
                                        marcher_id =
                                            marcherIds[i % marcherIds.length] ||
                                            marcherIds[0] ||
                                            1;
                                        page_id =
                                            pageIds[i % pageIds.length] ||
                                            pageIds[0] ||
                                            1;
                                    }

                                    if (!validMarcherPageIds.has(idCounter)) {
                                        validMarcherPageIds.add(idCounter);
                                        try {
                                            insertMarcherPage.run(
                                                idCounter,
                                                marcher_id,
                                                page_id,
                                                i * 10.0,
                                                i * 20.0,
                                            );
                                        } catch {
                                            // Skip constraint violations
                                        }
                                    }
                                    idCounter++;
                                }

                                // Count valid entries
                                const validMarcherIds = new Set(marcherIds);
                                const validPageIds = new Set(pageIds);
                                const before = db
                                    .prepare(
                                        "SELECT id, marcher_id, page_id FROM marcher_pages",
                                    )
                                    .all() as Array<{
                                    id: number;
                                    marcher_id: number;
                                    page_id: number;
                                }>;
                                const expectedValidCount = before.filter(
                                    (mp) =>
                                        validMarcherIds.has(mp.marcher_id) &&
                                        validPageIds.has(mp.page_id),
                                ).length;

                                // Run the function
                                removeOrphanMarcherPages(db);

                                // Verify count
                                const after = db
                                    .prepare(
                                        "SELECT COUNT(*) as count FROM marcher_pages",
                                    )
                                    .get() as { count: number };
                                expect(after.count).toBe(expectedValidCount);

                                // Verify all remaining are valid
                                const remaining = db
                                    .prepare(
                                        "SELECT marcher_id, page_id FROM marcher_pages",
                                    )
                                    .all() as Array<{
                                    marcher_id: number;
                                    page_id: number;
                                }>;
                                for (const mp of remaining) {
                                    expect(
                                        validMarcherIds.has(mp.marcher_id),
                                    ).toBe(true);
                                    expect(validPageIds.has(mp.page_id)).toBe(
                                        true,
                                    );
                                }

                                db.close();
                                fs.unlinkSync(dbPath);
                            } catch (error) {
                                try {
                                    db.close();
                                    if (fs.existsSync(dbPath)) {
                                        fs.unlinkSync(dbPath);
                                    }
                                } catch {
                                    // Ignore cleanup errors
                                }
                                throw error;
                            }
                        },
                    ),
                );
            });

            it("should be idempotent - running twice should have the same result", async () => {
                await fc.assert(
                    fc.asyncProperty(
                        fc.record({
                            marcherIds: fc.uniqueArray(
                                fc.integer({ min: 1, max: 50 }),
                                {
                                    minLength: 1,
                                    maxLength: 15,
                                },
                            ),
                            pageIds: fc.uniqueArray(
                                fc.integer({ min: 1, max: 50 }),
                                {
                                    minLength: 1,
                                    maxLength: 15,
                                },
                            ),
                            marcherPages: fc.array(
                                fc.record({
                                    id: fc.integer({ min: 1, max: 500 }),
                                    marcher_id: fc.integer({
                                        min: 1,
                                        max: 100,
                                    }),
                                    page_id: fc.integer({ min: 1, max: 100 }),
                                    x: fc.float({ min: -500, max: 500 }),
                                    y: fc.float({ min: -500, max: 500 }),
                                }),
                                { minLength: 1, maxLength: 30 },
                            ),
                        }),
                        async ({ marcherIds, pageIds, marcherPages }) => {
                            const dbPath1 = path.join(
                                tempDir,
                                `test1-${Date.now()}-${Math.random()}.db`,
                            );
                            const dbPath2 = path.join(
                                tempDir,
                                `test2-${Date.now()}-${Math.random()}.db`,
                            );
                            const db1 = new Database(dbPath1);
                            const db2 = new Database(dbPath2);

                            try {
                                const setupDb = (db: Database.Database) => {
                                    db.exec(`
                                    CREATE TABLE marchers (
                                        id INTEGER PRIMARY KEY,
                                        name TEXT,
                                        section TEXT NOT NULL,
                                        drill_prefix TEXT NOT NULL,
                                        drill_order INTEGER NOT NULL
                                    );
                                    CREATE TABLE pages (
                                        id INTEGER PRIMARY KEY,
                                        start_beat INTEGER NOT NULL,
                                        is_subset INTEGER NOT NULL DEFAULT 0
                                    );
                                    CREATE TABLE marcher_pages (
                                        id INTEGER PRIMARY KEY,
                                        marcher_id INTEGER NOT NULL,
                                        page_id INTEGER NOT NULL,
                                        x REAL NOT NULL,
                                        y REAL NOT NULL
                                    );
                                `);

                                    const insertMarcher = db.prepare(
                                        "INSERT INTO marchers (id, name, section, drill_prefix, drill_order) VALUES (?, ?, ?, ?, ?)",
                                    );
                                    marcherIds.forEach((id, index) => {
                                        insertMarcher.run(
                                            id,
                                            `Marcher ${id}`,
                                            "Brass",
                                            "T",
                                            index + 1,
                                        );
                                    });

                                    const insertPage = db.prepare(
                                        "INSERT INTO pages (id, start_beat, is_subset) VALUES (?, ?, ?)",
                                    );
                                    pageIds.forEach((id, index) => {
                                        insertPage.run(id, index * 4, 0);
                                    });

                                    const insertMarcherPage = db.prepare(
                                        "INSERT INTO marcher_pages (id, marcher_id, page_id, x, y) VALUES (?, ?, ?, ?, ?)",
                                    );
                                    const uniqueIds = new Set<number>();
                                    for (const mp of marcherPages) {
                                        if (!uniqueIds.has(mp.id)) {
                                            uniqueIds.add(mp.id);
                                            try {
                                                insertMarcherPage.run(
                                                    mp.id,
                                                    mp.marcher_id,
                                                    mp.page_id,
                                                    mp.x,
                                                    mp.y,
                                                );
                                            } catch {
                                                // Skip constraint violations
                                            }
                                        }
                                    }
                                };

                                setupDb(db1);
                                setupDb(db2);

                                // Run function once on db1
                                removeOrphanMarcherPages(db1);
                                const result1 = db1
                                    .prepare(
                                        "SELECT id, marcher_id, page_id, x, y FROM marcher_pages ORDER BY id",
                                    )
                                    .all() as Array<{
                                    id: number;
                                    marcher_id: number;
                                    page_id: number;
                                    x: number;
                                    y: number;
                                }>;

                                // Run function twice on db2
                                removeOrphanMarcherPages(db2);
                                removeOrphanMarcherPages(db2);
                                const result2 = db2
                                    .prepare(
                                        "SELECT id, marcher_id, page_id, x, y FROM marcher_pages ORDER BY id",
                                    )
                                    .all() as Array<{
                                    id: number;
                                    marcher_id: number;
                                    page_id: number;
                                    x: number;
                                    y: number;
                                }>;

                                // Results should be identical
                                expect(result1.length).toBe(result2.length);
                                expect(result1).toEqual(result2);

                                db1.close();
                                db2.close();
                                fs.unlinkSync(dbPath1);
                                fs.unlinkSync(dbPath2);
                            } catch (error) {
                                try {
                                    db1.close();
                                    db2.close();
                                    if (fs.existsSync(dbPath1)) {
                                        fs.unlinkSync(dbPath1);
                                    }
                                    if (fs.existsSync(dbPath2)) {
                                        fs.unlinkSync(dbPath2);
                                    }
                                } catch {
                                    // Ignore cleanup errors
                                }
                                throw error;
                            }
                        },
                    ),
                );
            });
        });
    });
});
