import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
    createShapePages,
    getShapePages,
    updateShapePages,
    deleteShapePages,
    copyShapePageToPage,
} from "../ShapePageTable";
import Constants from "../../../../src/global/Constants";
import { createPages, deletePages } from "../PageTable";
import * as DbMocks from "../../__test__/DatabaseMocks";
import { createShapes, deleteShapes } from "../ShapeTable";
import { createMarchers } from "../MarcherTable";
import { getShapePageMarchers } from "../ShapePageMarcherTable";
import { initTestDatabase } from "./testUtils";

describe("ShapePageTable CRUD Operations", () => {
    let db: Database.Database;

    beforeEach(() => {
        db = initTestDatabase();

        // Create a shape
        expect(createShapes({ db, args: DbMocks.NewShapes }).success).toBe(
            true,
        );
        expect(createPages({ db, newPages: DbMocks.NewPages }).success).toBe(
            true,
        );
    });

    afterEach(() => {
        db?.close();
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
                marcher_coordinates: [],
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

        const expectedShapePages = [
            {
                shape_id: 2,
                page_id: 0,
                svg_path: "M 50 50 L 150 150",
            },
            {
                shape_id: 2,
                page_id: 1,
                svg_path: "M 50 50 L 150 150",
            },
        ];
        expect(remaining).toMatchObject(expectedShapePages);
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
        expect(remaining).toMatchObject([
            {
                shape_id: 1,
                page_id: 0,
                svg_path: "M 0 0 L 100 100",
            },
            {
                shape_id: 2,
                page_id: 0,
                svg_path: "M 50 50 L 150 150",
            },
        ]);
    });
    describe("ShapePageTable Cascade Delete Operations", () => {
        let db: Database.Database;

        beforeEach(() => {
            db = initTestDatabase();
            expect(createShapes({ db, args: DbMocks.NewShapes }).success).toBe(
                true,
            );
            expect(
                createPages({ db, newPages: DbMocks.NewPages }).success,
            ).toBe(true);
        });

        afterEach(() => {
            db.close();
        });

        it("should automatically delete shape when its last shapePage is deleted", () => {
            const newShapePages = [
                {
                    shape_id: 1,
                    page_id: 0,
                    svg_path: "M 0 0 L 100 100",
                    marcher_coordinates: [],
                },
            ];
            const created = createShapePages({ db, args: newShapePages });
            expect(created.success).toBeTruthy();

            const result = deleteShapePages({
                db,
                ids: new Set([created.data[0].id]),
            });

            expect(result.success).toBe(true);
            const shapes = db
                .prepare("SELECT * FROM shapes WHERE id = 1")
                .all();
            expect(shapes.length).toBe(0);
        });

        it("should not delete shape when it still has other shapePages after deletion", () => {
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
                    svg_path: "M 200 200 L 300 300",
                    marcher_coordinates: [],
                },
            ];
            const created = createShapePages({ db, args: newShapePages });
            expect(created.success).toBeTruthy();

            const result = deleteShapePages({
                db,
                ids: new Set([created.data[0].id]),
            });

            expect(result.success).toBe(true);
            const shapes = db
                .prepare("SELECT * FROM shapes WHERE id = 1")
                .all();
            expect(shapes.length).toBe(1);
        });

        it("should handle deletion of multiple shapePages with shape cascade", () => {
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
                    svg_path: "M 200 200 L 300 300",
                    marcher_coordinates: [],
                },
            ];
            const created = createShapePages({ db, args: newShapePages });
            expect(created.success).toBeTruthy();

            let shapes = db.prepare("SELECT * FROM shapes").all();
            expect(shapes.length).toBe(4);

            const result = deleteShapePages({
                db,
                ids: new Set([created.data[0].id, created.data[1].id]),
            });

            expect(result.success).toBe(true);
            shapes = db.prepare("SELECT * FROM shapes").all();
            expect(shapes.length).toBe(2);
        });

        it("should handle empty set of ids for deletion", () => {
            const result = deleteShapePages({
                db,
                ids: new Set(),
            });

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(0);
        });
    });

    describe("ShapePageTable Copy Operations", () => {
        it("should successfully copy a shape page to a new page", () => {
            expect(
                createMarchers({ db, newMarchers: DbMocks.NewMarchers })
                    .success,
            ).toBeTruthy();

            const initialShapePage = [
                {
                    shape_id: 1,
                    page_id: 0,
                    svg_path: "M 0 0 L 100 100",
                    notes: "Original notes",
                    marcher_coordinates: [
                        { marcher_id: 2, x: 30, y: 40 },
                        { marcher_id: 1, x: 10, y: 20 },
                    ],
                },
            ];
            const created = createShapePages({ db, args: initialShapePage });
            expect(created.success).toBeTruthy();

            const targetPageId = 1;

            const result = copyShapePageToPage({
                db,
                shapePageId: created.data[0].id,
                targetPageId: targetPageId,
            });

            expect(result.success).toBeTruthy();
            expect(result.data).toBeDefined();
            expect(result.data?.page_id).toBe(1);
            expect(result.data?.svg_path).toBe("M 0 0 L 100 100");
            expect(result.data?.notes).toBe("Original notes");
        });

        it("should fail when copying to a page that already has a shape page", () => {
            const initialShapePages = [
                {
                    shape_id: 1,
                    page_id: 0,
                    svg_path: "M 0 0 L 100 100",
                    marcher_coordinates: [],
                },
                {
                    shape_id: 2,
                    page_id: 1,
                    svg_path: "M 200 200 L 300 300",
                    marcher_coordinates: [],
                },
            ];
            const created = createShapePages({ db, args: initialShapePages });
            expect(created.success).toBeTruthy();

            const result = copyShapePageToPage({
                db,
                shapePageId: created.data[0].id,
                targetPageId: 1,
            });

            expect(result.success).toBeFalsy();
            expect(result.error?.message).toBeDefined();
        });

        it("should fail when copying to a non-existent page", () => {
            const result = copyShapePageToPage({
                db,
                shapePageId: 1,
                targetPageId: 999,
            });
            expect(result.success).toBeFalsy();
        });

        it("should fail when trying to copy to a page the shapePage is already on", () => {
            const initialShapePage = [
                {
                    shape_id: 1,
                    page_id: 1,
                    svg_path: "M 0 0 L 100 100",
                    marcher_coordinates: [],
                },
            ];
            const created = createShapePages({ db, args: initialShapePage });
            expect(created.success).toBeTruthy();

            const result = copyShapePageToPage({
                db,
                shapePageId: created.data[0].id,
                targetPageId: 1,
            });

            expect(result.success).toBeFalsy();
            expect(result.error?.message).toBeDefined();
        });

        it("should preserve marcher coordinates when copying", () => {
            expect(
                createMarchers({ db, newMarchers: DbMocks.NewMarchers })
                    .success,
            ).toBeTruthy();

            const marcherCoords = [
                { marcher_id: 1, x: 100, y: 200 },
                { marcher_id: 2, x: 300, y: 400 },
            ];
            const initialShapePage = [
                {
                    shape_id: 1,
                    page_id: 0,
                    svg_path: "M 0 0 L 100 100",
                    marcher_coordinates: marcherCoords,
                },
            ];
            const created = createShapePages({ db, args: initialShapePage });
            expect(created.success).toBeTruthy();

            const result = copyShapePageToPage({
                db,
                shapePageId: created.data[0].id,
                targetPageId: 1,
            });

            expect(result.success).toBeTruthy();
            const newShapePageMarchers = getShapePageMarchers({
                db,
                shapePageId: result.data!.id,
            });
            expect(newShapePageMarchers.success).toBeTruthy();
            expect(newShapePageMarchers.data.length).toBe(marcherCoords.length);
        });
    });
});
