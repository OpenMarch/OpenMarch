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
import { createPageTable } from "../PageTable";
import { createShapes, createShapeTable } from "../ShapeTable";

describe("ShapePageTable CRUD Operations", () => {
    let db: Database.Database;

    beforeEach(() => {
        db = new Database(":memory:");
        History.createHistoryTables(db);
        createShapePageTable(db);
        createPageTable(db);
        createShapeTable(db);
        // Create a shape
        createShapes({ db, args: [{}, {}] });
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
            },
        ];

        const result = createShapePages({ db, args: newShapePages });

        expect(result.success).toBe(true);
        expect(result.data[0].shape_id).toBe(1);
        expect(result.data[0].svg_path).toBe("M 0 0 L 100 100");
    });

    it("should retrieve all shape pages", () => {
        const newShapePages = [
            { shape_id: 1, page_id: 0, svg_path: "M 0 0 L 100 100" },
            { shape_id: 2, page_id: 0, svg_path: "M 50 50 L 150 150" },
        ];
        createShapePages({ db, args: newShapePages });

        const result = getShapePages({ db });

        expect(result.success).toBe(true);
        expect(result.data.length).toBe(2);
        expect(result.data[1].svg_path).toBe("M 50 50 L 150 150");
    });

    it("should update existing shape pages", () => {
        const newShapePage = [
            { shape_id: 1, page_id: 0, svg_path: "M 0 0 L 100 100" },
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
            { shape_id: 1, page_id: 0, svg_path: "M 0 0 L 100 100" },
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
            },
        ];
        createShapePages({ db, args: newShapePage });

        const duplicate = createShapePages({ db, args: newShapePage });
        expect(duplicate.success).toBe(false);
    });
});
