import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import v6 from "../v6";
import v7, { DrizzleMigration0Hash } from "../v7";
import { DrizzleMigrationService } from "electron/database/services/DrizzleMigrationService";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../migrations/schema";
import { format } from "sql-formatter";

function dumpSchema(
    db: Database.Database,
): { type: string; name: string; tbl_name: string; sql: string }[] {
    return db
        .prepare(
            "SELECT type, name, tbl_name, sql FROM sqlite_master where type = 'table' order by name asc",
        )
        .all()
        .map((row) => {
            const { sql, ...rest } = row as {
                type: string;
                name: string;
                tbl_name: string;
                sql: string;
            };
            const formattedSql = sql
                .replace(/`([^`]+)`/g, "$1")
                .replace(/"([^"]+)"/g, "$1")
                .toLowerCase();
            const formattedSql2 = format(formattedSql, { language: "sqlite" });
            return { ...rest, sql: formattedSql2 };
        });
}

function dumpTableContent(db: Database.Database, tableName: string): string {
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    // Filter out created_at and updated_at columns since they change every run
    const filteredRows = rows.map((row: any) => {
        const { created_at, updated_at, ...rest } = row;
        return rest;
    });
    return `Table ${tableName}:\n${JSON.stringify(filteredRows, null, 2)}\n`;
}

function getTables(db: Database.Database): string[] {
    return db
        .prepare(
            "select distinct name from sqlite_master where type = 'table' order by name asc",
        )
        .all()
        .map((row: any) => row.name);
}

function dumpAllTables(db: Database.Database): string[] {
    const tables = getTables(db);
    return tables.map((table) => dumpTableContent(db, table));
}

describe("Database v7 Migration Tests (Drizzle Transition)", () => {
    let db: Database.Database;

    beforeEach(() => {
        db = new Database(":memory:");
    });

    describe("create tables", () => {
        it("matches what a v7 migrated db would look like", async () => {
            // migrate a v6 db to v7
            const migrator = new v6(() => db);
            migrator.createTables();

            const v7Migrator = new v7(() => db);
            v7Migrator.migrateToThisVersion();

            // create a new db on v7 directly
            const db2 = new Database(":memory:");
            const v7Migrator2 = new v7(() => db2);
            await v7Migrator2.createTables();

            // expect their schemas to match
            const dbString = dumpSchema(db);
            await expect(dbString).toMatchFileSnapshot("v7-db-schema-dump.txt");

            const db2String = dumpSchema(db2);
            expect(db2String).toEqual(dbString);

            // expect their data to match
            const dbDump = dumpAllTables(db);
            await expect(dbDump.join("\n")).toMatchFileSnapshot(
                "v7-db-data-dump.txt",
            );

            const db2Dump = dumpAllTables(db2);
            expect(db2Dump).toEqual(dbDump);
        });

        it("marks the initial migration as applied", async () => {
            const migrator = new v6(() => db);
            migrator.createTables();

            const v7Migrator = new v7(() => db);
            v7Migrator.migrateToThisVersion();

            const migrationService = new DrizzleMigrationService(
                drizzle(db, { schema }),
                db,
            );

            // check that the initial migration is marked as applied
            const appliedMigrations = migrationService.getAppliedMigrations();
            expect(appliedMigrations.length).toBe(1);
            expect(appliedMigrations[0].hash).toBe(DrizzleMigration0Hash);

            // try to apply a migration to make sure it doesn't error
            await migrationService.applyPendingMigrations();
        });
    });
});
