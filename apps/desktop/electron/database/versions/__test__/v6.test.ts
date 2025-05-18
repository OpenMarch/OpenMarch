import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import Constants from "../../../../src/global/Constants";
import v6 from "../v6";

// type PreviousMigration = v6;
type CurrentMigration = v6;

const CURR_VERSION_NUM = 6;
// const PREV_VERSION_NUM = CURR_VERSION_NUM - 1;

describe("Database v6 Migration Tests", () => {
    let CurrentMigration: CurrentMigration;
    let db: Database.Database;
    beforeEach(() => {
        db = new Database(":memory:");
        CurrentMigration = new v6(() => db);
    });

    const hasImageColumn = (db: Database.Database): boolean => {
        const tableInfo = db
            .prepare(`PRAGMA table_info(${Constants.FieldPropertiesTableName})`)
            .all();
        console.log("TABLE INFO", tableInfo);
        return tableInfo.some(
            (column: any) => column.name === "image" && column.type === "BLOB",
        );
    };

    describe("v6 to v6 migration", () => {
        beforeEach(() => {
            db = new Database(":memory:");
            CurrentMigration = new v6(() => db);
            CurrentMigration.createTables();
        });

        it("Should have the correct version number", () => {
            expect(db.pragma("user_version", { simple: true })).toBe(
                CURR_VERSION_NUM,
            );
        });

        it("Should not modify database when pragma value is already at version 6", () => {
            // Setup v6 database with pixelsPerStep
            db.pragma("user_version = 6");
            CurrentMigration.migrateToThisVersion(db);
            expect(hasImageColumn(db)).toBe(true);
        });
    });

    // describe("v4 to v6 migration", () => {
    //     let previousMigration: PreviousMigration;

    //     function createTestData(db: Database.Database) {
    //         createMarchers({
    //             db,
    //             newMarchers: [NewMarchers[0], NewMarchers[1], NewMarchers[2]],
    //         });
    //         createPages({
    //             db,
    //             newPages: [NewPages[0], NewPages[1], NewPages[2]],
    //         });
    //         createShapes({ db, args: [NewShapes[0], NewShapes[1]] });
    //         createShapePages({
    //             db,
    //             args: [NewShapePages[0], NewShapePages[1]],
    //         });
    //     }
    //     beforeEach(() => {
    //         db = new Database(":memory:");
    //         CurrentMigration = new v6(() => db);
    //         previousMigration = new v4(() => db);
    //         previousMigration.createTables();
    //         createTestData(db);
    //         // Setup initial tables and test data
    //     });

    //     it("Should fully migrate v3 database", () => {
    //         expect(hasImageColumn(db)).toBeFalsy();

    //         CurrentMigration.migrateToThisVersion(db);

    //         expect(hasImageColumn(db)).toBeTruthy();
    //     });

    //     it("Should handle empty tables during migration", () => {
    //         // Setup empty tables
    //         expect(db.pragma("user_version", { simple: true })).toBe(
    //             PREV_VERSION_NUM,
    //         );
    //         db.prepare("DELETE FROM marchers").run();
    //         db.prepare("DELETE FROM pages").run();
    //         db.prepare("DELETE FROM shapes").run();
    //         db.prepare("DELETE FROM shape_pages").run();

    //         expect(() => {
    //             CurrentMigration.migrateToThisVersion(db);
    //         }).not.toThrow();

    //         expect(db.pragma("user_version", { simple: true })).toBe(
    //             CURR_VERSION_NUM,
    //         );
    //     });
    // });

    // describe("Be able to migrate from v1 to v6", () => {
    //     function createTestData(db: Database.Database) {
    //         createMarchers({
    //             db,
    //             newMarchers: [NewMarchers[0], NewMarchers[1], NewMarchers[2]],
    //         });
    //         createPages({
    //             db,
    //             newPages: [NewPages[0], NewPages[1], NewPages[2]],
    //         });
    //     }

    //     beforeEach(() => {
    //         db = new Database(":memory:");
    //         db.pragma("foreign_keys = ON");
    //         const v1Migration = new v1(() => db);
    //         v1Migration.createTables();
    //         CurrentMigration = new v6(() => db);
    //         createTestData(db);
    //         // Setup v1 database structure
    //         db.pragma("user_version = 1");

    //         const result = db
    //             .prepare(`SELECT * FROM ${Constants.FieldPropertiesTableName}`)
    //             .get({}) as { json_data: string };
    //         const jsonData = result.json_data;
    //         const fieldProperties = JSON.parse(jsonData) as FieldProperties;
    //         const { pixelsPerStep, ...rest } = fieldProperties;
    //         const stmt = db.prepare(`
    //                             UPDATE ${Constants.FieldPropertiesTableName}
    //                             SET json_data = @json_data
    //                             WHERE id = 1
    //                         `);
    //         stmt.run({ json_data: JSON.stringify(rest) });
    //     });

    //     it("ensure it goes from 1 to 5", () => {
    //         expect(db.pragma("user_version", { simple: true })).toBe(1);
    //         CurrentMigration.migrateToThisVersion();
    //         expect(db.pragma("user_version", { simple: true })).toBe(
    //             CURR_VERSION_NUM,
    //         );
    //     });
    // });
});
