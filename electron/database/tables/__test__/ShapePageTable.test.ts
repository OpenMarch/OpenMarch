import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
    createShapePages,
    getShapePages,
    updateShapePages,
    deleteShapePages,
    createShapePageTable,
} from "../ShapePageTable";
import * as History from "../../database.history";
import Constants from "@/global/Constants";
import { createPages, createPageTable, deletePages } from "../PageTable";
import * as DbMocks from "./DatabaseMocks";
import { createShapes, createShapeTable, deleteShapes } from "../ShapeTable";
import { createMarcherPageTable } from "../MarcherPageTable";
import { createMarcherTable } from "../MarcherTable";
import { createShapePageMarcherTable } from "../ShapePageMarcherTable";

describe("ShapePageTable CRUD Operations", () => {
    let db: Database.Database;

    beforeEach(() => {
        db = new Database(":memory:");
        History.createHistoryTables(db);
        createShapePageTable(db);
        createPageTable(db);
        createShapeTable(db);
        createMarcherPageTable(db);
        createShapePageMarcherTable(db);
        createMarcherTable(db);
        // Create a shape
        expect(createShapes({ db, args: DbMocks.NewShapes }).success).toBe(
            true,
        );
        expect(createPages({ db, newPages: DbMocks.NewPages }).success).toBe(
            true,
        );
    });

    afterEach(() => {
        db.close();
    });

    it("should create the shape_pages table", () => {
        const tables = db
            .prepare(
                `SELECT name FROM sqlite_master WHERE type='table' AND name='${Constants.ShapePageTableName}'`,
            )
            .all();
        expect(tables.length).toBe(1);

        const columns = db.prepare("PRAGMA table_info(shape_pages)").all();

        expect(columns).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "id" }),
                expect.objectContaining({ name: "shape_id" }),
                expect.objectContaining({ name: "page_id" }),
                expect.objectContaining({ name: "svg_path" }),
                expect.objectContaining({ name: "notes" }),
                expect.objectContaining({ name: "created_at" }),
                expect.objectContaining({ name: "updated_at" }),
            ]),
        );
    });

    it("should create new shape pages", () => {
        const newShapePages = [
            {
                shape_id: 1,
                page_id: 0,
                svg_path: "M 0 0 L 100 100",
                notes: "Test shape page",
                marcher_coordinates: [],
            },
        ];

        const result = createShapePages({ db, args: newShapePages });

        expect(result.success).toBe(true);
        expect(result.data[0].shape_id).toBe(1);
        expect(result.data[0].svg_path).toBe("M 0 0 L 100 100");
    });

    it("should retrieve all shape pages", () => {
        const newShapePages = [
            {
                shape_id: 1,
                page_id: 0,
                svg_path: "M 0 0 L 100 100",
                marcher_coordinates: [],
            },
            {
                shape_id: 2,
                page_id: 0,
                svg_path: "M 50 50 L 150 150",
                marcher_coordinates: [],
            },
        ];
        createShapePages({ db, args: newShapePages });

        const result = getShapePages({ db });

        expect(result.success).toBe(true);
        expect(result.data.length).toBe(2);
        expect(result.data[1].svg_path).toBe("M 50 50 L 150 150");
    });

    it("should update existing shape pages", () => {
        const newShapePage = [
            {
                shape_id: 1,
                page_id: 0,
                svg_path: "M 0 0 L 100 100",
                marcher_coordinates: [],
            },
        ];
        const created = createShapePages({ db, args: newShapePage });
        expect(created.success).toBeTruthy();

        const updates = [
            {
                id: created.data[0].id,
                svg_path: "M 200 200 L 300 300",
                notes: "Updated notes",
            },
        ];

        const result = updateShapePages({ db, args: updates });

        expect(result.success).toBe(true);
        expect(result.data[0].svg_path).toBe("M 200 200 L 300 300");
        expect(result.data[0].notes).toBe("Updated notes");
    });

    it("should delete shape pages", () => {
        const newShapePage = [
            {
                shape_id: 1,
                page_id: 0,
                svg_path: "M 0 0 L 100 100",
                marcher_coordinates: [],
            },
        ];
        const created = createShapePages({ db, args: newShapePage });

        const result = deleteShapePages({
            db,
            ids: new Set([created.data[0].id]),
        });

        expect(result.success).toBe(true);
        expect(result.data[0].id).toBe(created.data[0].id);

        const remaining = getShapePages({ db });
        expect(remaining.data.length).toBe(0);
    });

    it("should enforce unique constraint on shape_id and page_id", () => {
        const newShapePage = [
            {
                shape_id: 1,
                page_id: 0,
                svg_path: "M 0 0 L 100 100",
                marcher_coordinates: [],
            },
        ];
        createShapePages({ db, args: newShapePage });

        const duplicate = createShapePages({ db, args: newShapePage });
        expect(duplicate.success).toBe(false);
    });

    it("should delete shape pages when the shape is deleted", () => {
        const newShapePages = [
            {
                shape_id: 1,
                page_id: 0,
                svg_path: "M 0 0 L 100 100",
                marcher_coordinates: [],
            },
            {
                shape_id: 1,
                page_id: 1,
                svg_path: "M 0 0 L 100 100",
                marcher_coordinates: [],
            },
            {
                shape_id: 2,
                page_id: 0,
                svg_path: "M 50 50 L 150 150",
                marcher_coordinates: [],
            },
            {
                shape_id: 2,
                page_id: 1,
                svg_path: "M 50 50 L 150 150",
                marcher_coordinates: [],
            },
        ];
        expect(createShapePages({ db, args: newShapePages }).success).toBe(
            true,
        );
        expect(deleteShapes({ db, ids: new Set([1]) }).success).toBeTruthy();

        const remaining = getShapePages({ db }).data;
        expect(remaining).toMatchObject([newShapePages[2], newShapePages[3]]);
    });

    it("should delete shape pages when the page is deleted", () => {
        const newShapePages = [
            {
                shape_id: 1,
                page_id: 0,
                svg_path: "M 0 0 L 100 100",
                marcher_coordinates: [],
            },
            {
                shape_id: 1,
                page_id: 1,
                svg_path: "M 0 0 L 100 100",
                marcher_coordinates: [],
            },
            {
                shape_id: 2,
                page_id: 0,
                svg_path: "M 50 50 L 150 150",
                marcher_coordinates: [],
            },
            {
                shape_id: 2,
                page_id: 1,
                svg_path: "M 50 50 L 150 150",
                marcher_coordinates: [],
            },
        ];
        expect(createShapePages({ db, args: newShapePages }).success).toBe(
            true,
        );
        expect(deletePages({ db, pageIds: new Set([1]) }).success).toBeTruthy();
        const remaining = getShapePages({ db }).data;
        expect(remaining).toMatchObject([newShapePages[0], newShapePages[2]]);
    });
});
