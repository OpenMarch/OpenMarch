import { it as baseTest, describe, TestAPI } from "vitest";
import { schema } from "@/../electron/database/db";
import { drizzle, drizzle as sqlJsDrizzle } from "drizzle-orm/sql-js";
import { drizzle as betterSqliteDrizzle } from "drizzle-orm/better-sqlite3";
import Database, { RunResult } from "better-sqlite3";
import initSqlJs from "sql.js";
import fs from "fs-extra";
import path from "path";
import * as mockDataMarchersAndPages from "./mock-data/marchers-and-pages.mjs";
import * as mockDataMarchers from "./mock-data/marchers.mjs";
import * as mockDataPages from "./mock-data/pages.mjs";
import * as mockDataBeats from "./mock-data/beats.mjs";
import { SQLiteTransaction, BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { SqliteRemoteResult } from "drizzle-orm/sqlite-proxy";
import { createAllUndoTriggers, dropAllUndoTriggers } from "@/db-functions";

type DbConnection = BaseSQLiteDatabase<
    "async",
    RunResult | void | SqliteRemoteResult<unknown>,
    typeof schema
>;
const getTempDotsPath = (task: Readonly<{ id: string }>) => {
    const taskId = task.id.startsWith("-") ? task.id.slice(1) : task.id;
    return path.resolve(`${taskId}.tmp.dots`);
};

const getTempDb = async (task: Readonly<{ id: string }>) => {
    // Get the path to the temporary database file
    const dbPath = getTempDotsPath(task);

    // ✅ Assert database file exists
    if (!fs.existsSync(dbPath)) {
        throw new Error(`Expected DB file at ${dbPath} to exist`);
    }

    // ✅ Load and apply SQL using sql.js
    const dbBuffer = fs.readFileSync(dbPath);

    // Initialize sql.js
    const SQL = await initSqlJs({
        locateFile: (file: string) => `./node_modules/sql.js/dist/${file}`,
    });

    const db = new SQL.Database(dbBuffer);

    const orm = drizzle(db, {
        schema,
        casing: "snake_case",
        logger: true,
    });

    return { db: db, dbPath: dbPath, orm: orm };
};

/**
 * Utility function to load and apply SQL to a database file
 * @param testInfo - Test info object containing outputDir
 * @param sqlFilename - Name of the SQL file (relative to mock-databases folder)
 */
const loadSqlIntoDatabase = async (
    task: Readonly<{ id: string }>,
    sqlFilename: string,
): Promise<void> => {
    // Resolve SQL file path relative to mock-databases folder
    const sqlPath = path.resolve(__dirname, "mock-data", sqlFilename);

    // ✅ Assert SQL file exists
    if (!fs.existsSync(sqlPath)) {
        throw new Error(`SQL file not found at ${sqlPath}`);
    }

    // ✅ Load and apply SQL using sql.js
    const sql = fs.readFileSync(sqlPath, "utf-8");

    // Get the path to the temporary database file
    const { db, dbPath, orm } = await getTempDb(task);

    // drop all triggers
    await dropAllUndoTriggers(orm as unknown as any);
    await db.exec(sql);
    await createAllUndoTriggers(orm as unknown as any);
    const updatedDbBuffer = db.export();
    fs.writeFileSync(dbPath, updatedDbBuffer);
    db.close();
};

/********* FIXTURES *********/
type beats = {
    expectedBeats: Omit<
        typeof schema.beats.$inferSelect,
        "created_at" | "updated_at"
    >[];
};

type pages = {
    expectedBeats: Omit<
        typeof schema.beats.$inferSelect,
        "created_at" | "updated_at"
    >[];
    expectedPages: Omit<
        typeof schema.pages.$inferSelect,
        "created_at" | "updated_at"
    >[];
};

type marchersAndPages = {
    expectedBeats: Omit<
        typeof schema.beats.$inferSelect,
        "created_at" | "updated_at"
    >[];
    expectedMarchers: Omit<
        typeof schema.marchers.$inferSelect,
        "created_at" | "updated_at"
    >[];
    expectedPages: Omit<
        typeof schema.pages.$inferSelect,
        "created_at" | "updated_at"
    >[];
    expectedMarcherPages: Omit<
        typeof schema.marcher_pages.$inferSelect,
        "created_at" | "updated_at"
    >[];
};

type marchers = {
    expectedMarchers: Omit<
        typeof schema.marchers.$inferSelect,
        "created_at" | "updated_at"
    >[];
};

type BaseApi = {
    setupDb: void;
    marchersAndPages: marchersAndPages;
    beats: beats;
    pages: pages;
    marchers: marchers;
};

/********* END FIXTURES *********/

type DbTestAPI = {
    db: DbConnection;
} & BaseApi;

/**
 * Base test fixture that sets up a temporary database file before each test function.
 *
 * The database file is created by copying the blank database file from the migrations folder.
 * After each test function, the database file is deleted.
 */
const baseFixture = baseTest.extend<BaseApi>({
    setupDb: [
        async ({ task }, use) => {
            // setup the fixture before each test function
            const blankDatabaseFile = path.join(
                __dirname,
                "../../electron/database/migrations/_blank.dots",
            );
            const tempDatabaseFile = getTempDotsPath(task);

            try {
                await fs.copyFile(blankDatabaseFile, tempDatabaseFile);
                const { orm, db } = await getTempDb(task);

                // create the undo triggers and save the database
                await createAllUndoTriggers(orm as unknown as any);
                const updatedDbBuffer = db.export();

                fs.writeFileSync(tempDatabaseFile, updatedDbBuffer);
                db.close();
                await use();
            } catch (error) {
                console.error("Error setting up database:", error);
                throw error;
            } finally {
                await fs.remove(tempDatabaseFile);
                console.log(
                    "Cleaned up temporary database file:",
                    tempDatabaseFile,
                );
            }
        },
        { auto: true },
    ],
    beats: async ({ task }, use) => {
        await loadSqlIntoDatabase(task, "beats.sql");
        await use(mockDataBeats);
    },
    marchersAndPages: async ({ task }, use) => {
        await loadSqlIntoDatabase(task, "marchers-and-pages.sql");
        await use(mockDataMarchersAndPages);
    },
    pages: async ({ task }, use) => {
        await loadSqlIntoDatabase(task, "pages.sql");
        await use(mockDataPages);
    },
    marchers: async ({ task }, use) => {
        await loadSqlIntoDatabase(task, "marchers.sql");
        await use(mockDataMarchers);
    },
});

const sqlJsTest: TestAPI<DbTestAPI> = baseFixture.extend<{ db: DbConnection }>({
    db: async ({ task }, use) => {
        // setup the fixture before each test function
        const SQL = await initSqlJs({
            locateFile: (file: string) => `./node_modules/sql.js/dist/${file}`,
        });
        const tempDatabaseFile = getTempDotsPath(task);

        const db = new SQL.Database(fs.readFileSync(tempDatabaseFile));
        await use(
            sqlJsDrizzle(db, {
                schema,
                casing: "snake_case",
                logger: true,
            }) as unknown as DbConnection,
        );
        db.close();
    },
});

const betterSqliteTest: TestAPI<DbTestAPI> = baseFixture.extend<{
    db: DbConnection;
}>({
    db: async ({ task }, use) => {
        // setup the fixture before each test function
        const tempDatabaseFile = getTempDotsPath(task);

        try {
            new Database(":memory:");
        } catch (error) {
            console.error(
                "Error setting up database better-sqlite3 database... \nEnsure better-sqlite3 is compiled for Node by running 'pnpm run test:prepare'\n",
                error,
            );
            throw error;
        }

        const db = new Database(tempDatabaseFile);

        await use(
            betterSqliteDrizzle(db, {
                schema,
                casing: "snake_case",
                logger: true,
            }) as unknown as DbConnection,
        );
        db.close();
    },
});

const transaction = (
    db: DbConnection,
    func: (
        tx: SQLiteTransaction<any, any, typeof schema, any>,
    ) => Promise<void>,
) => {
    return db.transaction(async (tx) => {
        await func(tx);
    });
};

type DbTestsFunc = (
    it: TestAPI<DbTestAPI>,
    dbType: "sql-js" | "better-sqlite3",
) => void;

/**
 * Utility function to describe tests for database tests in the renderer.
 *
 * When you wrap your tests with this, the test driver will test with both sql-js and better-sqlite3 database drivers.
 *
 * This is important so we know that our drizzle functions will work with both database drivers.
 *
 * @param name - The name of the test suite.
 * @param tests - The tests to run.
 */
const describeDbTests = (
    name: string,
    tests: (
        it: TestAPI<DbTestAPI>,
        dbType: "sql-js" | "better-sqlite3",
    ) => void,
) => {
    // Better-sqlite is disabled by default just to remove redundancy. It is run in CI.
    // Feel free to enable it by setting the `VITEST_ENABLE_SQLJS` environment variable to `true`.
    describe("better-sqlite3", () => {
        tests(betterSqliteTest, "better-sqlite3");
    });
    const runSqlJsTests = process.env.VITEST_ENABLE_SQLJS === "true";
    if (runSqlJsTests)
        describe("sql-js", () => {
            tests(sqlJsTest, "sql-js");
        });
};

export {
    sqlJsTest,
    betterSqliteTest,
    describeDbTests,
    type DbTestsFunc,
    type DbTestAPI,
    transaction,
    schema,
    type DbConnection,
};
