import Database from "better-sqlite3";
import { describe, beforeEach, afterEach, test, expect } from "vitest";
import {
    getShapes,
    createShapes,
    updateShapes,
    deleteShapes,
} from "../ShapeTable";
import { initTestDatabase } from "./testUtils";

describe("MarcherShapeTable", () => {
    let db: Database.Database;

    beforeEach(async () => {
        db = await initTestDatabase();
    });

    afterEach(() => {
        db?.close();
    });

    describe("createShapeTable", () => {
        test("creates table with correct schema", () => {
            const tableInfo = db
                .prepare(
                    "SELECT * FROM sqlite_master WHERE type='table' AND name='shapes'",
                )
                .get();
            expect(tableInfo).toBeTruthy();
        });
    });

    describe("getShapes", () => {
        test("returns empty array when no shapes exist", () => {
            const result = getShapes({ db });
            expect(result.success).toBe(true);
            expect(result.data).toEqual([]);
        });
    });

    describe("createShapes", () => {
        test("successfully creates new shape", () => {
            const newShape = {
                name: "Test Shape",
                notes: "Test Notes",
            };

            const result = createShapes({ db, args: [newShape] });
            expect(result.success).toBe(true);
            expect(result.data[0]).toMatchObject({
                name: "Test Shape",
                notes: "Test Notes",
            });
            expect(result.data[0].id).toBeDefined();
        });
    });

    describe("updateShapes", () => {
        test("updates existing shape", async () => {
            // First create a shape
            const created = createShapes({
                db,
                args: [{ name: "Original Shape" }],
            });

            const updateResult = updateShapes({
                db,
                args: [
                    {
                        id: created.data[0].id,
                        name: "Updated Shape",
                        notes: "Updated Notes",
                    },
                ],
            });

            expect(updateResult.success).toBe(true);
            expect(updateResult.data[0]).toMatchObject({
                name: "Updated Shape",
                notes: "Updated Notes",
            });
        });
    });

    describe("deleteShapes", () => {
        test("deletes existing shape", () => {
            // First create a shape
            const created = createShapes({
                db,
                args: [{ name: "To Be Deleted" }],
            });

            const deleteResult = deleteShapes({
                db,
                ids: new Set([created.data[0].id]),
            });

            expect(deleteResult.success).toBe(true);

            // Verify shape is deleted
            const shapes = getShapes({ db });
            expect(shapes.data).toHaveLength(0);
        });
    });

    describe("error handling", () => {
        test("handles invalid updates gracefully", () => {
            const result = updateShapes({
                db,
                args: [{ id: 999, name: "NonExistent" }],
            });
            expect(result.success).toBe(false);
        });

        test("handles invalid deletes gracefully", () => {
            const result = deleteShapes({
                db,
                ids: new Set([999]),
            });
            expect(result.success).toBe(false);
        });
    });
});
