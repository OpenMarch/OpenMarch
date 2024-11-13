import Database from "better-sqlite3";
import { describe, beforeEach, afterEach, test, expect } from "vitest";
import {
    createShapeTable,
    getShapes,
    createShape,
    updateShape,
    deleteShape,
} from "../MarcherShapeTable";
import * as History from "../../database.history";

describe("MarcherShapeTable", () => {
    let db: Database.Database;

    beforeEach(() => {
        db = new Database(":memory:");
        History.createHistoryTables(db);
        createShapeTable(db);
    });

    afterEach(() => {
        db.close();
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

    describe("createShape", () => {
        test("successfully creates new shape", () => {
            const newShape = {
                name: "Test Shape",
                notes: "Test Notes",
            };

            const result = createShape({ db, args: [newShape] });
            expect(result.success).toBe(true);
            expect(result.data[0]).toMatchObject({
                name: "Test Shape",
                notes: "Test Notes",
            });
            expect(result.data[0].id).toBeDefined();
        });
    });

    describe("updateShape", () => {
        test("updates existing shape", async () => {
            // First create a shape
            const created = createShape({
                db,
                args: [{ name: "Original Shape" }],
            });

            const updateResult = updateShape({
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

    describe("deleteShape", () => {
        test("deletes existing shape", () => {
            // First create a shape
            const created = createShape({
                db,
                args: [{ name: "To Be Deleted" }],
            });

            const deleteResult = deleteShape({
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
            const result = updateShape({
                db,
                args: [{ id: 999, name: "NonExistent" }],
            });
            expect(result.success).toBe(false);
        });

        test("handles invalid deletes gracefully", () => {
            const result = deleteShape({
                db,
                ids: new Set([999]),
            });
            expect(result.success).toBe(false);
        });
    });
});
