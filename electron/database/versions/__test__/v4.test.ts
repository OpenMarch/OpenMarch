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
import FieldProperties from "../../../../src/global/classes/FieldProperties";
import Constants from "../../../../src/global/Constants";
import v1 from "../v1";
import v4 from "../v4";

const v3FieldProperties = {
    centerFrontPoint: { xPixels: 960, yPixels: 1023.96 },
    xCheckpoints: [
        {
            name: "0 yard line",
            axis: "x",
            terseName: "0",
            stepsFromCenterFront: -80,
            useAsReference: true,
        },
        {
            name: "5 yard line",
            axis: "x",
            terseName: "5",
            stepsFromCenterFront: -72,
            useAsReference: true,
        },
        {
            name: "10 yard line",
            axis: "x",
            terseName: "10",
            stepsFromCenterFront: -64,
            useAsReference: true,
            fieldLabel: "10",
        },
        {
            name: "15 yard line",
            axis: "x",
            terseName: "15",
            stepsFromCenterFront: -56,
            useAsReference: true,
        },
        {
            name: "20 yard line",
            axis: "x",
            terseName: "20",
            stepsFromCenterFront: -48,
            useAsReference: true,
            fieldLabel: "20",
        },
        {
            name: "25 yard line",
            axis: "x",
            terseName: "25",
            stepsFromCenterFront: -40,
            useAsReference: true,
        },
        {
            name: "30 yard line",
            axis: "x",
            terseName: "30",
            stepsFromCenterFront: -32,
            useAsReference: true,
            fieldLabel: "30",
        },
        {
            name: "35 yard line",
            axis: "x",
            terseName: "35",
            stepsFromCenterFront: -24,
            useAsReference: true,
        },
        {
            name: "40 yard line",
            axis: "x",
            terseName: "40",
            stepsFromCenterFront: -16,
            useAsReference: true,
            fieldLabel: "40",
        },
        {
            name: "45 yard line",
            axis: "x",
            terseName: "45",
            stepsFromCenterFront: -8,
            useAsReference: true,
        },
        {
            name: "50 yard line",
            axis: "x",
            terseName: "50",
            stepsFromCenterFront: 0,
            useAsReference: true,
            fieldLabel: "50",
        },
        {
            name: "45 yard line",
            axis: "x",
            terseName: "45",
            stepsFromCenterFront: 8,
            useAsReference: true,
        },
        {
            name: "40 yard line",
            axis: "x",
            terseName: "40",
            stepsFromCenterFront: 16,
            useAsReference: true,
            fieldLabel: "40",
        },
        {
            name: "35 yard line",
            axis: "x",
            terseName: "35",
            stepsFromCenterFront: 24,
            useAsReference: true,
        },
        {
            name: "30 yard line",
            axis: "x",
            terseName: "30",
            stepsFromCenterFront: 32,
            useAsReference: true,
            fieldLabel: "30",
        },
        {
            name: "25 yard line",
            axis: "x",
            terseName: "25",
            stepsFromCenterFront: 40,
            useAsReference: true,
        },
        {
            name: "20 yard line",
            axis: "x",
            terseName: "20",
            stepsFromCenterFront: 48,
            useAsReference: true,
            fieldLabel: "20",
        },
        {
            name: "15 yard line",
            axis: "x",
            terseName: "15",
            stepsFromCenterFront: 56,
            useAsReference: true,
        },
        {
            name: "10 yard line",
            axis: "x",
            terseName: "10",
            stepsFromCenterFront: 64,
            useAsReference: true,
            fieldLabel: "10",
        },
        {
            name: "5 yard line",
            axis: "x",
            terseName: "5",
            stepsFromCenterFront: 72,
            useAsReference: true,
        },
        {
            name: "0 yard line",
            axis: "x",
            terseName: "0",
            stepsFromCenterFront: 80,
            useAsReference: true,
        },
    ],
    yCheckpoints: [
        {
            name: "front sideline",
            axis: "y",
            stepsFromCenterFront: 0,
            useAsReference: true,
            terseName: "FSL",
            visible: false,
        },
        {
            name: "HS front hash",
            axis: "y",
            stepsFromCenterFront: -28,
            useAsReference: true,
            terseName: "FH",
        },
        {
            name: "HS back hash",
            axis: "y",
            stepsFromCenterFront: -56,
            useAsReference: true,
            terseName: "BH",
        },
        {
            name: "grid back sideline",
            axis: "y",
            stepsFromCenterFront: -85,
            useAsReference: true,
            terseName: "grid:BSL",
            visible: false,
        },
        {
            name: "real back sideline",
            axis: "y",
            stepsFromCenterFront: -85.33,
            useAsReference: false,
            terseName: "real:BSL",
            visible: false,
        },
    ],
    pixelsPerStep: 12,
    name: "High school football field (no end zones)",
    width: 1920,
    height: 1023.96,
    yardNumberCoordinates: {
        homeStepsFromFrontToOutside: 11.2,
        homeStepsFromFrontToInside: 14.4,
        awayStepsFromFrontToInside: 70.9333,
        awayStepsFromFrontToOutside: 74.1333,
    },
};

describe("Database v4 Migration Tests", () => {
    let v4Migration: v4;
    let db: Database.Database;
    beforeEach(() => {
        db = new Database(":memory:");
        v4Migration = new v4(() => db);
    });

    function getAllData(db: Database.Database) {
        return {
            version: db.pragma("user_version", { simple: true }),
            marchers: db.prepare("SELECT * FROM marchers").all(),
            pages: db.prepare("SELECT * FROM pages").all(),
            shapes: db.prepare("SELECT * FROM shapes").all(),
            shapePages: db.prepare("SELECT * FROM shape_pages").all(),
        };
    }

    describe("v4 to v4 migration", () => {
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
            v4Migration = new v4(() => db);
            v4Migration.createTables();
            createTestData(db);
            // Setup initial tables and test data
        });

        it("Should have the correct version number", () => {
            expect(db.pragma("user_version", { simple: true })).toBe(4);
        });

        it("Should not modify database when pragma value is already at version 4", () => {
            // Setup v4 database with pixelsPerStep
            db.pragma("user_version = 4");
            const startingData = getAllData(db);
            v4Migration.migrateToThisVersion(db);
            const newData = getAllData(db);
            expect(newData).toEqual(startingData);
        });

        it("Should not modify database when already at version 4 functionally", () => {
            // Setup v4 database with pixelsPerStep
            const startingData = getAllData(db);
            v4Migration.migrateToThisVersion(db);
            const newData = getAllData(db);
            expect(newData).toEqual(startingData);
        });
    });

    describe("v3 to v4 migration", () => {
        let v3Migration: v3;

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
            v4Migration = new v4(() => db);
            v3Migration = new v3(() => db);
            v3Migration.createTables();
            createTestData(db);
            // Setup initial tables and test data
        });

        it("Should fully migrate v3 database", () => {
            // Modify the field properties to be in v3 format
            const getFieldProperties = () => {
                const result = db
                    .prepare(
                        `SELECT * FROM ${Constants.FieldPropertiesTableName}`,
                    )
                    .get({}) as { json_data: string };
                const jsonData = result.json_data;
                return JSON.parse(jsonData) as FieldProperties;
            };
            db.prepare(
                `UPDATE ${Constants.FieldPropertiesTableName} SET json_data = ?`,
            ).run(JSON.stringify(v3FieldProperties));
            const oldFieldProperties = getFieldProperties();

            // Setup v3 database structure
            const originalMarcherPages = getMarcherPages({ db });
            expect(originalMarcherPages.success).toBeTruthy();
            const originalShapePages = getShapePages({ db });
            expect(originalShapePages.success).toBeTruthy();

            v4Migration.migrateToThisVersion(db);

            const migratedMarcherPages = getMarcherPages({ db });
            expect(migratedMarcherPages.success).toBeTruthy();
            const migratedShapePages = getShapePages({ db });
            expect(migratedShapePages.success).toBeTruthy();

            const newFieldProperties = new FieldProperties(
                getFieldProperties(),
            );
            expect(oldFieldProperties).not.toEqual(newFieldProperties);

            const multiplier =
                newFieldProperties.pixelsPerStep /
                oldFieldProperties.pixelsPerStep;

            // Verify all marcher pages were migrated correctly
            for (let i = 0; i < originalMarcherPages.data.length; i++) {
                expect(migratedMarcherPages.data[i]).toEqual({
                    ...originalMarcherPages.data[i],
                    x: originalMarcherPages.data[i].x * multiplier,
                    y: originalMarcherPages.data[i].y * multiplier,
                });
            }

            for (let i = 0; i < originalShapePages.data.length; i++) {
                expect(migratedShapePages.data[i]).toEqual({
                    ...originalShapePages.data[i],
                    svg_path: scaleSvgNumbers(
                        originalShapePages.data[i].svg_path,
                        multiplier,
                    ),
                });
            }

            // Verify database version was updated
            expect(db.pragma("user_version", { simple: true })).toBe(4);
        });

        it("Should handle empty tables during migration", () => {
            // Setup empty tables
            expect(db.pragma("user_version", { simple: true })).toBe(3);
            db.prepare("DELETE FROM marchers").run();
            db.prepare("DELETE FROM pages").run();
            db.prepare("DELETE FROM shapes").run();
            db.prepare("DELETE FROM shape_pages").run();

            expect(() => {
                v4Migration.migrateToThisVersion(db);
            }).not.toThrow();

            expect(db.pragma("user_version", { simple: true })).toBe(4);
        });

        it("Should maintain data integrity during migration", () => {
            db.pragma("user_version = 2");
            const startingRelationships = {
                marchers: db
                    .prepare("SELECT COUNT(*) as count FROM marchers")
                    .get(),
                pages: db.prepare("SELECT COUNT(*) as count FROM pages").get(),
                shapes: db
                    .prepare("SELECT COUNT(*) as count FROM shapes")
                    .get(),
                shapePages: db
                    .prepare("SELECT COUNT(*) as count FROM shape_pages")
                    .get(),
            };

            v4Migration.migrateToThisVersion(db);

            const endingRelationships = {
                marchers: db
                    .prepare("SELECT COUNT(*) as count FROM marchers")
                    .get(),
                pages: db.prepare("SELECT COUNT(*) as count FROM pages").get(),
                shapes: db
                    .prepare("SELECT COUNT(*) as count FROM shapes")
                    .get(),
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

    describe("Be able to migrate from v1 to v3", () => {
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
            v4Migration = new v3(() => db);
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

        it("ensure it goes from 1 to 3", () => {
            expect(db.pragma("user_version", { simple: true })).toBe(1);
            v4Migration.migrateToThisVersion();
            expect(db.pragma("user_version", { simple: true })).toBe(3);
        });
    });
    describe("Be able to migrate from v0 to v3", () => {
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
            v4Migration = new v3(() => db);
            createTestData(db);
            // Setup v1 database structure
            db.pragma("user_version = 0");

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

        it("ensure it goes from 0 to 3", () => {
            expect(db.pragma("user_version", { simple: true })).toBe(0);
            v4Migration.migrateToThisVersion();
            expect(db.pragma("user_version", { simple: true })).toBe(3);
        });
    });
});
