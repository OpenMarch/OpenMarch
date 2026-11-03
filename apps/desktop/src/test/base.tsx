import { it as baseTest, describe, TestAPI, vi } from "vitest";
import { drizzle, drizzle as sqlJsDrizzle } from "drizzle-orm/sql-js";
import { drizzle as sqliteProxyDrizzle } from "drizzle-orm/sqlite-proxy";
import { DatabaseSync, type StatementResultingChanges } from "node:sqlite";
import initSqlJs from "sql.js";
import fs from "fs-extra";
import os from "os";
import path from "path";
import * as mockDataMarchersAndPages from "./mock-data/marchers-and-pages.mjs";
import * as mockDataMarchers from "./mock-data/marchers.mjs";
import * as mockDataPages from "./mock-data/pages.mjs";
import * as mockDataBeats from "./mock-data/beats.mjs";
import { SQLiteTransaction, BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { SqliteRemoteResult } from "drizzle-orm/sqlite-proxy";
import { createAllUndoTriggers, dropAllUndoTriggers } from "@/db-functions";
import {
    handleSqlProxyWithDbBetterSqlite,
    handleSqlProxyWithDbSqlJs,
} from "./sqlProxyTestUtil";
import {
    addLaterMarcherColumns,
    laterTableStatements,
    convertFixtureFile,
    pageEraBlankPath,
    timelineFixtureMode,
} from "./timelineMode";
import { copyCachedDatabase } from "./fixtureCache";
import { drizzle as drizzleSqliteProxy } from "drizzle-orm/sqlite-proxy";
import type { JSX } from "react";
import { createRendererSqlProxyQueue } from "@/global/database/sqlProxyQueue";
import { createSqlReadBatch } from "@/global/database/sqlReadBatch";
import {
    handleSqlReadBatchWithDb,
    type SqlBatchQuery,
    type SqlReadBatchResult,
} from "@/../electron/database/sqlProxy";

// Needs to be here for an import error
import { schema as electronSchema } from "@/../electron/database/db";
import type * as pageEraSchema from "@/../electron/database/migrations/pageEraSchema";
export const schema = electronSchema;

/**
 * For seeded tests, the number of them to run.
 *
 * This will create seeds from 0 to SEED_AMOUNT - 1 with faker.js
 */
export const SEED_AMOUNT = process.env.VITEST_SEED_AMOUNT
    ? parseInt(process.env.VITEST_SEED_AMOUNT)
    : 10;
export const seedObj = Array.from({ length: SEED_AMOUNT }, (_, i) => ({
    seed: i,
}));

type DbConnection = BaseSQLiteDatabase<
    "async",
    StatementResultingChanges | void | SqliteRemoteResult<unknown>,
    typeof schema
>;
/**
 * Test databases go in the system temp folder, named by process. Task ids are
 * only unique within one run, so two runs writing to the working directory
 * (two agents, or a watch run beside a full run) used to share files.
 */
const tempDotsDir = path.join(os.tmpdir(), "openmarch-test");
fs.ensureDirSync(tempDotsDir);

const getTempDotsPath = (task: Readonly<{ id: string }>) => {
    const taskId = task.id.startsWith("-") ? task.id.slice(1) : task.id;
    return path.join(tempDotsDir, `${process.pid}-${taskId}.tmp.dots`);
};

const getTempDb = async (dbPath: string) => {
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

/** The SQL files each test's data fixtures loaded, by task id, in order. */
const loadedSqlFiles = new Map<string, string[]>();

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

    // The page show goes into a page-era file, which replaces the blank timeline file. A test can
    // use several data fixtures (`beats` and `marchers`); the previous one's file is already
    // converted, so the page-era file gets every fixture's SQL so far, in order
    const loaded = [...(loadedSqlFiles.get(task.id) ?? []), sqlPath];
    loadedSqlFiles.set(task.id, loaded);
    const timeline = timelineFixtureMode();
    const key = `${timeline ? "timeline" : "page"}-${loaded.map((file) => path.basename(file, ".sql")).join("+")}`;
    await copyCachedDatabase(key, getTempDotsPath(task), async (dbPath) => {
        await fs.copyFile(await pageEraBlankPath(), dbPath);
        const { db, orm } = await getTempDb(dbPath);

        // drop all triggers
        await dropAllUndoTriggers(orm as unknown as any);
        for (const file of loaded)
            await db.exec(fs.readFileSync(file, "utf-8"));
        // A page-mode fixture gets the later tables timeline edits read, with their undo triggers
        if (!timeline)
            for (const statement of laterTableStatements())
                await db.exec(statement);
        await createAllUndoTriggers(orm as unknown as any);
        const updatedDbBuffer = db.export();
        fs.writeFileSync(dbPath, updatedDbBuffer);
        db.close();
        // Like opening an older show in the app: convert it to timelines (see ./timelineMode.ts)
        if (timeline) await convertFixtureFile(dbPath);
        else addLaterMarcherColumns(dbPath);
    });
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
    /** The page show's positions, from before the fixture converted it to timelines */
    expectedMarcherPages: Omit<
        typeof pageEraSchema.marcher_pages.$inferSelect,
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
    /**
     * A wrapper function that provides the necessary context for React component tests.
     */
    wrapper: ({ children }: { children: React.ReactNode }) => JSX.Element;
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
 * The database file is a copy of the blank database file from the migrations folder with the
 * undo triggers added, built once per run (./fixtureCache.ts).
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
                await copyCachedDatabase(
                    "blank",
                    tempDatabaseFile,
                    async (dbPath) => {
                        await fs.copyFile(blankDatabaseFile, dbPath);
                        const { orm, db } = await getTempDb(dbPath);

                        // create the undo triggers and save the database
                        await createAllUndoTriggers(orm as unknown as any);
                        const updatedDbBuffer = db.export();

                        fs.writeFileSync(dbPath, updatedDbBuffer);
                        db.close();
                    },
                );
                await use();
            } catch (error) {
                console.error("Error setting up database:", error);
                throw error;
            } finally {
                loadedSqlFiles.delete(task.id);
                await fs.remove(tempDatabaseFile);
                console.log(
                    "Cleaned up temporary database file:",
                    tempDatabaseFile,
                );
            }
        },
        { auto: true },
    ],
    // eslint-disable-next-line no-empty-pattern
    wrapper: async ({}, use) => {
        // Imported here, so the many DB tests that never render don't load React Query, Radix
        // and the app's providers
        const [
            { QueryClient, QueryClientProvider },
            { TooltipProvider },
            { IsPlayingProvider },
            { SelectedAudioFileProvider },
            { SelectedMarchersProvider },
            { SelectedPageProvider },
        ] = await Promise.all([
            import("@tanstack/react-query"),
            import("@radix-ui/react-tooltip"),
            import("@/context/IsPlayingContext"),
            import("@/context/SelectedAudioFileContext"),
            import("@/context/SelectedMarchersContext"),
            import("@/context/SelectedPageContext"),
        ]);
        const queryClient = new QueryClient();
        const wrapper = ({ children }: { children: React.ReactNode }) => {
            return (
                <QueryClientProvider client={queryClient}>
                    <TooltipProvider
                        delayDuration={500}
                        skipDelayDuration={500}
                    >
                        <IsPlayingProvider>
                            <SelectedPageProvider>
                                <SelectedMarchersProvider>
                                    <SelectedAudioFileProvider>
                                        {children}
                                    </SelectedAudioFileProvider>
                                </SelectedMarchersProvider>
                            </SelectedPageProvider>
                        </IsPlayingProvider>
                    </TooltipProvider>
                </QueryClientProvider>
            );
        };
        await use(wrapper);
    },
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

function setUpGlobalMocks<T>(
    db: T,
    dbFunction: (
        db: T,
        sql: string,
        params: any[],
        method: "all" | "run" | "get" | "values",
    ) => Promise<{ rows: any[] }>,
    readBatch?: (db: T, queries: SqlBatchQuery[]) => SqlReadBatchResult,
) {
    const queuedSqlProxy = createRendererSqlProxyQueue(
        async (
            sql: string,
            params: any[],
            method: "all" | "run" | "get" | "values",
        ) => dbFunction(db, sql, params, method),
    );
    // As main's `sql:read-batch` does, on the test's connection
    const sqlReadBatch = async (queries: SqlBatchQuery[]) => {
        if (!readBatch)
            throw new Error("This test database has no batch reads");
        return readBatch(db, queries);
    };

    // Check if window.electron already exists, if so update it, otherwise create it
    if (window.electron) {
        window.electron.sqlProxy = (
            sql: string,
            params: any[],
            method: "all" | "run" | "get" | "values",
        ) => queuedSqlProxy(sql, params, method);
        window.electron.sqlReadBatch = sqlReadBatch;
    } else {
        Object.defineProperty(window, "electron", {
            value: {
                sqlProxy: (
                    sql: string,
                    params: any[],
                    method: "all" | "run" | "get" | "values",
                ) => queuedSqlProxy(sql, params, method),
                sqlReadBatch,
                log: (
                    level: "log" | "info" | "warn" | "error",
                    message: string,
                    ...args: any[]
                ) => {
                    console[level]("[MainProcessFaker]: " + message, ...args);
                },
            },
            configurable: true,
            writable: true,
        });
    }
    vi.mock("@global/database/db", () => ({
        db: drizzleSqliteProxy(
            async (
                sql: string,
                params: any[],
                method: "all" | "run" | "get" | "values",
            ) => {
                try {
                    const result = await queuedSqlProxy(sql, params, method);
                    return result;
                } catch (error: any) {
                    console.error("Error from SQLite proxy:", error);
                    throw error;
                }
            },
            { schema, casing: "snake_case" },
        ),
        schema,
    }));
}

const sqlJsTest: TestAPI<DbTestAPI> = baseFixture.extend<{ db: DbConnection }>({
    db: async ({ task }, use) => {
        // setup the fixture before each test function
        const SQL = await initSqlJs({
            locateFile: (file: string) => `./node_modules/sql.js/dist/${file}`,
        });
        const tempDatabaseFile = getTempDotsPath(task);

        const db = new SQL.Database(fs.readFileSync(tempDatabaseFile));

        setUpGlobalMocks(db, handleSqlProxyWithDbSqlJs);
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

/**
 * Test fixture for better-sqlite3 database with proxy
 *
 * This is used with a proxy, rather than a direct database connection, as that is how it is used in the app.
 */
const betterSqliteTestWithProxy: TestAPI<DbTestAPI> = baseFixture.extend<{
    db: DbConnection;
}>({
    db: async ({ task }, use) => {
        // setup the fixture before each test function
        const tempDatabaseFile = getTempDotsPath(task);

        try {
            new DatabaseSync(":memory:");
        } catch (error) {
            console.error(
                "Error setting up database better-sqlite3 database... \nEnsure better-sqlite3 is compiled for this platform",
                error,
            );
            throw error;
        }

        const db = new DatabaseSync(tempDatabaseFile);

        setUpGlobalMocks(
            db,
            handleSqlProxyWithDbBetterSqlite,
            handleSqlReadBatchWithDb,
        );
        await use(
            sqliteProxyDrizzle(
                async (sql, params, method) =>
                    handleSqlProxyWithDbBetterSqlite(db, sql, params, method),
                createSqlReadBatch(async (queries) =>
                    handleSqlReadBatchWithDb(db, queries),
                ),
                {
                    schema,
                    casing: "snake_case",
                    logger: true,
                },
            ) as unknown as DbConnection,
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
    // We test better-sqlite3 with a proxy, as that is how it is used in the app.
    if (process.env.VITEST_DISABLE_BETTER_SQLITE_PROXY !== "true")
        describe("better-sqlite3", () => {
            tests(betterSqliteTestWithProxy, "better-sqlite3");
        });
    else
        // specifically skip the better-sqlite3 tests so it's visible that they're disabled
        describe.skip("better-sqlite3", () => {
            tests(betterSqliteTestWithProxy, "better-sqlite3");
        });

    // SQL.js is disabled by default just to remove redundancy. It is run in CI.
    // Feel free to enable it by setting the `VITEST_ENABLE_SQLJS` environment variable to `true`.
    // We test SQL.js as we're hoping that we'll use it in the future.
    if (process.env.VITEST_ENABLE_SQLJS === "true")
        // Transactions are currently not working very well with the db proxy.
        // SQL.js or WASM SQLite support should be revisited, perhaps with wa-sqlite
        // https://www.powersync.com/blog/sqlite-persistence-on-the-web
        describe.skip("sql-js", () => {
            tests(sqlJsTest, "sql-js");
        });
};

export {
    getTempDotsPath,
    sqlJsTest,
    betterSqliteTestWithProxy,
    describeDbTests,
    type DbTestsFunc,
    type DbTestAPI,
    transaction,
    type DbConnection,
};
