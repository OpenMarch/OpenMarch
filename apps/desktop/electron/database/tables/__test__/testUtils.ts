import Database, { RunResult } from "better-sqlite3";
import { getOrm, schema } from "../../db";
import { DrizzleMigrationService } from "electron/database/services/DrizzleMigrationService";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { SqliteRemoteResult } from "drizzle-orm/sqlite-proxy";
import { drizzle as betterSqliteDrizzle } from "drizzle-orm/better-sqlite3";

export type DbConnection = BaseSQLiteDatabase<
    "async",
    RunResult | void | SqliteRemoteResult<typeof schema>,
    typeof schema
>;

export const initTestDatabase = async (): Promise<Database.Database> => {
    const db = new Database(":memory:");
    const orm = getOrm(db);
    const migrator = new DrizzleMigrationService(orm, db);
    db.pragma("user_version = 7");
    await migrator.applyPendingMigrations();
    await migrator.initializeDatabase(orm);

    // create 16 beats
    const beatValues = Array.from({ length: 16 }, (_, i) => ({
        duration: 0.5,
        position: i + 1,
    }));
    orm.insert(schema.beats).values(beatValues).run();
    return db;
};
export const initTestDatabaseOrm = async (): Promise<DbConnection> => {
    try {
        new Database(":memory:");
    } catch (error) {
        console.error(
            "Error setting up database better-sqlite3 database... \nEnsure better-sqlite3 is compiled for Node by running 'pnpm run test:prepare'\n",
            error,
        );
        throw error;
    }
    const db = new Database(":memory:");

    const orm = (await betterSqliteDrizzle(db, {
        schema,
        casing: "snake_case",
        logger: true,
    })) as unknown as DbConnection;

    const migrator = new DrizzleMigrationService(orm, db);
    db.pragma("user_version = 7");
    await migrator.applyPendingMigrations();
    await migrator.initializeDatabase(orm);

    // create 16 beats
    const beatValues = Array.from({ length: 16 }, (_, i) => ({
        duration: 0.5,
        position: i + 1,
    }));
    orm.insert(schema.beats).values(beatValues).run();
    return orm;
};
