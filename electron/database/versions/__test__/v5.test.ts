import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createMarchers } from "../../tables/MarcherTable";
import { createPages } from "../../tables/PageTable";
import {
    NewMarchers,
    NewPages,
    NewShapePages,
    NewShapes,
} from "../../__test__/DatabaseMocks";
import { createShapes } from "../../tables/ShapeTable";
import { createShapePages } from "../../tables/ShapePageTable";
import FieldProperties from "../../../../src/global/classes/FieldProperties";
import Constants from "../../../../src/global/Constants";
import v1 from "../v1";
import v5 from "../v5";
import v4 from "../v4";

type PreviousMigration = v4;
type CurrentMigration = v5;

const CURR_VERSION_NUM = 5;
const PREV_VERSION_NUM = CURR_VERSION_NUM - 1;

describe("Database v5 Migration Tests", () => {
    let CurrentMigration: CurrentMigration;
    let db: Database.Database;
    beforeEach(() => {
        db = new Database(":memory:");
        CurrentMigration = new v5(() => db);
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

    describe("v5 to v5 migration", () => {
        beforeEach(() => {
            db = new Database(":memory:");
            CurrentMigration = new v5(() => db);
            CurrentMigration.createTables();
        });

        it("Should have the correct version number", () => {
            expect(db.pragma("user_version", { simple: true })).toBe(
                CURR_VERSION_NUM,
            );
        });

        it("Should not modify database when pragma value is already at version 4", () => {
            // Setup v5 database with pixelsPerStep
            db.pragma("user_version = 5");
            CurrentMigration.migrateToThisVersion(db);
            expect(hasImageColumn(db)).toBe(true);
        });
    });

    describe("v4 to v5 migration", () => {
        let previousMigration: PreviousMigration;

        function createTestData(db: Database.Database) {
            createMarchers({
                db,
                newMarchers: [NewMarchers[0], NewMarchers[1], NewMarchers[2]],
            });
            createPages({
                db,
                newPages: [NewPages[0], NewPages[1], NewPages[2]],
            });
            createShapes({ db, args: [NewShapes[0], NewShapes[1]] });
            createShapePages({
                db,
                args: [NewShapePages[0], NewShapePages[1]],
            });
        }
        beforeEach(() => {
            db = new Database(":memory:");
            CurrentMigration = new v5(() => db);
            previousMigration = new v4(() => db);
            previousMigration.createTables();
            createTestData(db);
            // Setup initial tables and test data
        });

        it("Should fully migrate v3 database", () => {
            expect(hasImageColumn(db)).toBeFalsy();

            CurrentMigration.migrateToThisVersion(db);

            expect(hasImageColumn(db)).toBeTruthy();
        });

        it("Should handle empty tables during migration", () => {
            // Setup empty tables
            expect(db.pragma("user_version", { simple: true })).toBe(
                PREV_VERSION_NUM,
            );
            db.prepare("DELETE FROM marchers").run();
            db.prepare("DELETE FROM pages").run();
            db.prepare("DELETE FROM shapes").run();
            db.prepare("DELETE FROM shape_pages").run();

            expect(() => {
                CurrentMigration.migrateToThisVersion(db);
            }).not.toThrow();

            expect(db.pragma("user_version", { simple: true })).toBe(
                CURR_VERSION_NUM,
            );
        });
    });

    describe("Be able to migrate from v1 to v5", () => {
        function createTestData(db: Database.Database) {
            createMarchers({
                db,
                newMarchers: [NewMarchers[0], NewMarchers[1], NewMarchers[2]],
            });
            createPages({
                db,
                newPages: [NewPages[0], NewPages[1], NewPages[2]],
            });
        }

        beforeEach(() => {
            db = new Database(":memory:");
            db.pragma("foreign_keys = ON");
            const v1Migration = new v1(() => db);
            v1Migration.createTables();
            CurrentMigration = new v5(() => db);
            createTestData(db);
            // Setup v1 database structure
            db.pragma("user_version = 1");

            const result = db
                .prepare(`SELECT * FROM ${Constants.FieldPropertiesTableName}`)
                .get({}) as { json_data: string };
            const jsonData = result.json_data;
            const fieldProperties = JSON.parse(jsonData) as FieldProperties;
            const { pixelsPerStep, ...rest } = fieldProperties;
            const stmt = db.prepare(`
                                UPDATE ${Constants.FieldPropertiesTableName}
                                SET json_data = @json_data
                                WHERE id = 1
                            `);
            stmt.run({ json_data: JSON.stringify(rest) });
        });

        it("ensure it goes from 1 to 5", () => {
            expect(db.pragma("user_version", { simple: true })).toBe(1);
            CurrentMigration.migrateToThisVersion();
            expect(db.pragma("user_version", { simple: true })).toBe(
                CURR_VERSION_NUM,
            );
        });
    });
});
