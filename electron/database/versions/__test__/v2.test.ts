import { beforeEach, describe, expect, it } from "vitest";
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
import { createShapePages } from "../../../database/tables/ShapePageTable";
import Constants from "../../../../src/global/Constants";
import v1 from "../v1";
import v2 from "../v2";

describe("Database v2 Migration Tests", () => {
    let v2Migration: v2;
    let db: Database.Database;
    beforeEach(() => {
        db = new Database(":memory:");
        v2Migration = new v2(() => db);
    });

    describe("v1 to v2 migration", () => {
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
            v2Migration = new v2(() => db);
            v2Migration.createTables();
        });

        it("Should have the correct version number", () => {
            expect(db.pragma("user_version", { simple: true })).toBe(2);
        });

        it("Should not modify database when pragma value is already at version 2", () => {
            // Setup v2 database with pixelsPerStep
            db.pragma("user_version = 2");
            expect(db.pragma("user_version", { simple: true })).toBe(2);
            expect(() => v2Migration.migrateToThisVersion(db)).not.toThrow();
            expect(db.pragma("user_version", { simple: true })).toBe(2);
        });

        it("Should not modify database when already at version 3 functionally", () => {
            // Setup v2 database with pixelsPerStep
            expect(db.pragma("user_version", { simple: true })).toBe(2);
            expect(() => v2Migration.migrateToThisVersion(db)).not.toThrow();
            expect(db.pragma("user_version", { simple: true })).toBe(2);
        });

        it("Should not modify any data", () => {
            createTestData(db);
            const originalMarchers = db.prepare("SELECT * FROM marchers").all();
            const originalPages = db.prepare("SELECT * FROM pages").all();
            const originalShapes = db.prepare("SELECT * FROM shapes").all();
            const originalShapePages = db
                .prepare("SELECT * FROM shape_pages")
                .all();

            v2Migration.migrateToThisVersion(db);

            const migratedMarchers = db.prepare("SELECT * FROM marchers").all();
            const migratedPages = db.prepare("SELECT * FROM pages").all();
            const migratedShapes = db.prepare("SELECT * FROM shapes").all();
            const migratedShapePages = db
                .prepare("SELECT * FROM shape_pages")
                .all();

            expect(migratedMarchers).toEqual(originalMarchers);
            expect(migratedPages).toEqual(originalPages);
            expect(migratedShapes).toEqual(originalShapes);
            expect(migratedShapePages).toEqual(originalShapePages);
        });
    });

    describe("v1 to v2 migration", () => {
        let v1Migration: v1;

        beforeEach(() => {
            db = new Database(":memory:");
            v2Migration = new v2(() => db);
            v1Migration = new v1(() => db);
            v1Migration.createTables();
        });

        it("Should fully migrate v1 database to v2", () => {
            expect(() => {
                db.prepare(`SELECT * FROM ${Constants.ShapeTableName}`).all();
            }).toThrow();
            expect(() => {
                db.prepare(
                    `SELECT * FROM ${Constants.ShapePageTableName}`,
                ).all();
            }).toThrow();
            expect(() => {
                db.prepare(
                    `SELECT * FROM ${Constants.ShapePageMarcherTableName}`,
                ).all();
            }).toThrow();

            v2Migration.migrateToThisVersion(db);

            expect(() => {
                db.prepare(`SELECT * FROM ${Constants.ShapeTableName}`).all();
            }).not.toThrow();
            expect(() => {
                db.prepare(
                    `SELECT * FROM ${Constants.ShapePageTableName}`,
                ).all();
            }).not.toThrow();
            expect(() => {
                db.prepare(
                    `SELECT * FROM ${Constants.ShapePageMarcherTableName}`,
                ).all();
            }).not.toThrow();
        });

        it("Should not modify data during migration", () => {
            createMarchers({
                db,
                newMarchers: [NewMarchers[0], NewMarchers[1], NewMarchers[2]],
            });
            createPages({
                db,
                newPages: [NewPages[0], NewPages[1], NewPages[2]],
            });
            const originalMarchers = db
                .prepare(`SELECT * FROM ${Constants.MarcherTableName}`)
                .all();
            const originalPages = db
                .prepare(`SELECT * FROM ${Constants.PageTableName}`)
                .all();

            v2Migration.migrateToThisVersion(db);

            const migratedMarchers = db
                .prepare(`SELECT * FROM ${Constants.MarcherTableName}`)
                .all();
            const migratedPages = db
                .prepare(`SELECT * FROM ${Constants.PageTableName}`)
                .all();

            expect(migratedMarchers).toEqual(originalMarchers);
            expect(migratedPages).toEqual(originalPages);
        });
    });
});
