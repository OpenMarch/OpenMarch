import { it as baseTest } from "vitest";
import { schema } from "@/../electron/database/db";
import { drizzle, SQLJsDatabase, SQLJsTransaction } from "drizzle-orm/sql-js";
import initSqlJs from "sql.js";
import fs from "fs-extra";
import path from "path";

/**
 * Custom test function that extends the base test function with a database fixture.
 *
 * The database fixture is a temporary database file that is created before each test function.
 * The database file is copied from the blank database file in the db-functions/__test__ directory.
 * The database file is then used in the test function.
 * The database file is deleted after the test function is finished.
 */
const it = baseTest.extend<{
    db: SQLJsDatabase<typeof schema>;
}>({
    // eslint-disable-next-line no-empty-pattern
    db: async ({}, use) => {
        // setup the fixture before each test function

        const SQL = await initSqlJs({
            locateFile: (file: string) => `./node_modules/sql.js/dist/${file}`,
        });

        const blankDatabaseFile = path.join(
            __dirname,
            "../e2e/mock-databases/blank.dots",
        );
        const tempDatabaseFile = `${Date.now()}.tmp.dots`;

        try {
            await fs.copyFile(blankDatabaseFile, tempDatabaseFile);
            const db = new SQL.Database(fs.readFileSync(tempDatabaseFile));
            await use(
                drizzle(db, {
                    schema,
                    casing: "snake_case",
                    logger: true,
                }),
            );
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
});

const transaction = (
    db: SQLJsDatabase<typeof schema>,
    func: (tx: SQLJsTransaction<typeof schema, any>) => Promise<void>,
) => {
    return db.transaction(async (tx) => {
        await func(tx);
    });
};

export { it, it as test, transaction, schema };
