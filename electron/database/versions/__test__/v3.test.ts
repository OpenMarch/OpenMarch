import { beforeEach, describe, expect, it } from "vitest";
import v3, { scaleSvgNumbers } from "../v3";
import Database from "better-sqlite3";
import { createMarchers } from "../../../database/tables/MarcherTable";
import { createPages } from "../../../database/tables/PageTable";
import {
    NewMarchers,
    NewPages,
    NewShapePages,
    NewShapes,
} from "../../../database/__test__/DatabaseMocks";
import { createShapes } from "../../../database/tables/ShapeTable";
import {
    createShapePages,
    getShapePages,
} from "../../../database/tables/ShapePageTable";
import { getMarcherPages } from "../../../database/tables/MarcherPageTable";
import type FieldProperties from "../../../../src/global/classes/FieldProperties";
import Constants from "../../../../src/global/Constants";

describe("scaleSvgNumbers", () => {
    it("scales positive integers", () => {
        const input = "M 10 20 L 30 40";
        const result = scaleSvgNumbers(input, 2);
        expect(result).toBe("M 20 40 L 60 80");
    });

    it("scales negative numbers", () => {
        const input = "M -5 -10 L -15 -20";
        const result = scaleSvgNumbers(input, 2);
        expect(result).toBe("M -10 -20 L -30 -40");
    });

    it("scales decimal numbers", () => {
        const input = "M 1.5 2.75 L 3.25 4.5";
        const result = scaleSvgNumbers(input, 2);
        expect(result).toBe("M 3 5.5 L 6.5 9");
    });

    it("handles mixed positive and negative decimals", () => {
        const input = "M -1.5 2.5 L -3.75 4.25";
        const result = scaleSvgNumbers(input, 2);
        expect(result).toBe("M -3 5 L -7.5 8.5");
    });

    it("scales with fractional multiplier", () => {
        const input = "M 10 20 L 30 40";
        const result = scaleSvgNumbers(input, 0.5);
        expect(result).toBe("M 5 10 L 15 20");
    });

    it("preserves non-numeric parts of the string", () => {
        const input = "M 10 text 20 L 30 more 40";
        const result = scaleSvgNumbers(input, 2);
        expect(result).toBe("M 20 text 40 L 60 more 80");
    });

    it("handles string with no numbers", () => {
        const input = "M L Z";
        const result = scaleSvgNumbers(input, 2);
        expect(result).toBe("M L Z");
    });
});

describe("Database v3 Migration Tests", () => {
    let db: Database.Database;
    let v3Migration: v3;

    beforeEach(() => {
        db = new Database(":memory:");
        db.pragma("foreign_keys = ON");
        v3Migration = new v3(() => db);
        v3Migration.createTables();
        createTestData(db);
        // Setup initial tables and test data
    });

    function createTestData(db: Database.Database) {
        createMarchers({
            db,
            newMarchers: [NewMarchers[0], NewMarchers[1], NewMarchers[2]],
        });
        createPages({ db, newPages: [NewPages[0], NewPages[1], NewPages[2]] });
        createShapes({ db, args: [NewShapes[0], NewShapes[1]] });
        createShapePages({ db, args: [NewShapePages[0], NewShapePages[1]] });
    }

    function getAllData(db: Database.Database) {
        return {
            version: db.pragma("user_version", { simple: true }),
            marchers: db.prepare("SELECT * FROM marchers").all(),
            pages: db.prepare("SELECT * FROM pages").all(),
            shapes: db.prepare("SELECT * FROM shapes").all(),
            shapePages: db.prepare("SELECT * FROM shape_pages").all(),
        };
    }

    it("Should not modify database when pragma value is already at version 3", () => {
        // Setup v3 database with pixelsPerStep
        db.pragma("user_version = 3");
        const startingData = getAllData(db);
        v3Migration.migrateToThisVersion(db);
        const newData = getAllData(db);
        expect(newData).toEqual(startingData);
    });

    it("Should not modify database when already at version 3 functionally", () => {
        // Setup v3 database with pixelsPerStep
        const startingData = getAllData(db);
        v3Migration.migrateToThisVersion(db);
        const newData = getAllData(db);
        expect(newData).toEqual(startingData);
    });

    it("Should fully migrate v2 database", () => {
        // Modify the field properties to be in v2 format
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

        // Setup v2 database structure
        db.pragma("user_version = 2");
        const originalMarcherPages = getMarcherPages({ db });
        expect(originalMarcherPages.success).toBeTruthy();
        const originalShapePages = getShapePages({ db });
        expect(originalShapePages.success).toBeTruthy();

        v3Migration.migrateToThisVersion(db);

        const migratedMarcherPages = getMarcherPages({ db });
        expect(migratedMarcherPages.success).toBeTruthy();
        const migratedShapePages = getShapePages({ db });
        expect(migratedShapePages.success).toBeTruthy();

        // Verify all marcher pages were migrated correctly
        for (let i = 0; i < originalMarcherPages.data.length; i++) {
            expect(migratedMarcherPages.data[i]).toEqual({
                ...originalMarcherPages.data[i],
                x: originalMarcherPages.data[i].x * 1.2,
                y: originalMarcherPages.data[i].y * 1.2,
            });
        }

        for (let i = 0; i < originalShapePages.data.length; i++) {
            expect(migratedShapePages.data[i]).toEqual({
                ...originalShapePages.data[i],
                svg_path: scaleSvgNumbers(
                    originalShapePages.data[i].svg_path,
                    1.2,
                ),
            });
        }

        // Verify database version was updated
        expect(db.pragma("user_version", { simple: true })).toBe(3);
    });

    it("Should handle empty tables during migration", () => {
        // Setup empty tables
        db.pragma("user_version = 2");
        db.prepare("DELETE FROM marchers").run();
        db.prepare("DELETE FROM pages").run();
        db.prepare("DELETE FROM shapes").run();
        db.prepare("DELETE FROM shape_pages").run();

        expect(() => {
            v3Migration.migrateToThisVersion(db);
        }).not.toThrow();

        expect(db.pragma("user_version", { simple: true })).toBe(3);
    });

    it("Should maintain data integrity during migration", () => {
        db.pragma("user_version = 2");
        const startingRelationships = {
            marchers: db
                .prepare("SELECT COUNT(*) as count FROM marchers")
                .get(),
            pages: db.prepare("SELECT COUNT(*) as count FROM pages").get(),
            shapes: db.prepare("SELECT COUNT(*) as count FROM shapes").get(),
            shapePages: db
                .prepare("SELECT COUNT(*) as count FROM shape_pages")
                .get(),
        };

        v3Migration.migrateToThisVersion(db);

        const endingRelationships = {
            marchers: db
                .prepare("SELECT COUNT(*) as count FROM marchers")
                .get(),
            pages: db.prepare("SELECT COUNT(*) as count FROM pages").get(),
            shapes: db.prepare("SELECT COUNT(*) as count FROM shapes").get(),
            shapePages: db
                .prepare("SELECT COUNT(*) as count FROM shape_pages")
                .get(),
        };

        expect(endingRelationships).toEqual(startingRelationships);

        // Verify foreign keys are still valid
        expect(() => {
            db.prepare("PRAGMA foreign_key_check").all();
        }).not.toThrow();
    });
});
