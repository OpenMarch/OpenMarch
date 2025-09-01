import { it as baseTest, describe, TestAPI } from "vitest";
import { schema } from "@/../electron/database/db";
import { drizzle as sqlJsDrizzle } from "drizzle-orm/sql-js";
import { drizzle as betterSqliteDrizzle } from "drizzle-orm/better-sqlite3";
import Database, { RunResult } from "better-sqlite3";
import initSqlJs from "sql.js";
import fs from "fs-extra";
import path from "path";
import * as mockData from "./mock-data/marchers-and-pages.mjs";
import { SQLiteTransaction, BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { SqliteRemoteResult } from "drizzle-orm/sqlite-proxy";

type DbConnection = BaseSQLiteDatabase<
    "async",
    RunResult | void | SqliteRemoteResult<unknown>,
    typeof schema
>;
const getTempDotsPath = (task: Readonly<{ id: string }>) => {
    return path.resolve(`${task.id}.tmp.dots`);
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
    // Get the path to the temporary database file
    const dbPath = getTempDotsPath(task);

    // Resolve SQL file path relative to mock-databases folder
    const sqlPath = path.resolve(__dirname, "mock-data", sqlFilename);

    // ✅ Assert database file exists
    if (!fs.existsSync(dbPath)) {
        throw new Error(`Expected DB file at ${dbPath} to exist`);
    }

    // ✅ Assert SQL file exists
    if (!fs.existsSync(sqlPath)) {
        throw new Error(`SQL file not found at ${sqlPath}`);
    }

    // ✅ Load and apply SQL using sql.js
    const sql = fs.readFileSync(sqlPath, "utf-8");
    const dbBuffer = fs.readFileSync(dbPath);

    // Initialize sql.js
    const SQL = await initSqlJs({
        locateFile: (file: string) => `./node_modules/sql.js/dist/${file}`,
    });

    const db = new SQL.Database(dbBuffer);
    db.exec(sql);
    const updatedDbBuffer = db.export();
    fs.writeFileSync(dbPath, updatedDbBuffer);
    db.close();
};

type marchersAndPages = {
    expectedBeats: (typeof schema.beats)[];
    expectedMarchers: (typeof schema.marchers)[];
    expectedPages: (typeof schema.pages)[];
    expectedMarcherPages: (typeof schema.marcher_pages)[];
};

type BaseApi = {
    setupDb: void;
    marchersAndPages: marchersAndPages;
};
type DbTestAPI = {
    setupDb: void;
    marchersAndPages: marchersAndPages;
    db: DbConnection;
};

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
    marchersAndPages: async ({ task }, use) => {
        await loadSqlIntoDatabase(task, "marchers-and-pages.sql");
        await use(mockData as unknown as marchersAndPages);
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
    },
});

const betterSqliteTest: TestAPI<DbTestAPI> = baseFixture.extend<{
    db: DbConnection;
}>({
    db: async ({ task, skip }, use) => {
        // setup the fixture before each test function
        const tempDatabaseFile = getTempDotsPath(task);

        try {
            new Database(":memory:");
        } catch (error) {
            console.error(
                "Error setting up database better-sqlite3 database... \nEnsure better-sqlite3 is compiled for Node by running 'pnpm run test:prepare'\n",
                error,
            );
            skip();
        }

        const db = new Database(tempDatabaseFile);

        await use(
            betterSqliteDrizzle(db, {
                schema,
                casing: "snake_case",
                logger: true,
            }) as unknown as DbConnection,
        );
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
    describe("sql-js", () => {
        tests(sqlJsTest, "sql-js");
    });
    describe("better-sqlite3", () => {
        tests(betterSqliteTest, "better-sqlite3");
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
