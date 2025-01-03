import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as History from "../../database.history";
import { createPages, createPageTable } from "../PageTable";
import { createShapes, createShapeTable } from "../ShapeTable";
import {
    createShapePageMarchers,
    createShapePageMarcherTable,
    deleteShapePageMarchers,
    getShapePageMarchers,
    getSpmByMarcherPage,
    swapPositionOrder,
    updateShapePageMarchers,
} from "../ShapePageMarcherTable";
import { createMarchers, createMarcherTable } from "../MarcherTable";
import * as DbMocks from "../../__test__/DatabaseMocks";
import {
    createShapePages,
    createShapePageTable,
    getShapePages,
    NewShapePageArgs,
} from "../ShapePageTable";
import { createMarcherPageTable } from "../MarcherPageTable";

const NewShapePages: NewShapePageArgs[] = [
    {
        shape_id: 1,
        page_id: 1,
        svg_path: "M 0 0 L 100 100",
        notes: "This is a note",
        marcher_coordinates: [],
    },
    {
        shape_id: 2,
        page_id: 1,
        svg_path: "M 200 200 L 100 100",
        notes: null,
        marcher_coordinates: [],
    },
    {
        shape_id: 2,
        page_id: 2,
        svg_path: "M 0 0 Q 150 150 780 500",
        marcher_coordinates: [],
    },
    {
        shape_id: 1,
        page_id: 4,
        svg_path: "M 0 0 L 100 100",
        notes: "This is a note",
        marcher_coordinates: [],
    },
];

describe("ShapePageMarcherTable CRUD Operations", () => {
    let db: Database.Database;

    beforeEach(() => {
        db = new Database(":memory:");
        History.createHistoryTables(db);
        createPageTable(db);
        createShapeTable(db);
        createShapePageMarcherTable(db);
        createShapePageTable(db);
        createMarcherTable(db);
        createMarcherPageTable(db);
        // Create the pre-requisite objects
        expect(createPages({ db, newPages: DbMocks.NewPages }).success).toBe(
            true,
        );
        expect(
            createMarchers({ db, newMarchers: DbMocks.NewMarchers }).success,
        ).toBe(true);
        expect(createShapes({ db, args: DbMocks.NewShapes }).success).toBe(
            true,
        );
        expect(createShapePages({ db, args: NewShapePages }).success).toBe(
            true,
        );
    });

    describe("CreateShapePageMarchers", () => {
        it("should successfully create a single ShapePageMarcher", () => {
            const newSPM = {
                shape_page_id: 1,
                marcher_id: 1,
                position_order: 1,
                notes: "Test marcher position",
            };

            const result = createShapePageMarchers({ db, args: [newSPM] });
            expect(result.success).toBe(true);
            expect(result.data[0]).toMatchObject(newSPM);

            // Get the SPMs and check their values
            const spmsResponse = getShapePageMarchers({ db });
            expect(spmsResponse.success).toBe(true);
            const allSPMs = spmsResponse.data;
            expect(allSPMs).toHaveLength(1);
            expect(allSPMs).toMatchObject([newSPM]);
        });

        it("should handle multiple ShapePageMarchers creation", () => {
            const newSPMs = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                { shape_page_id: 1, marcher_id: 3, position_order: 3 },
            ];

            const result = createShapePageMarchers({ db, args: newSPMs });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(3);

            // Get the SPMs and check their values
            const spmsResponse = getShapePageMarchers({ db });
            expect(spmsResponse.success).toBe(true);
            const allSPMs = spmsResponse.data;
            expect(allSPMs).toHaveLength(3);
            expect(allSPMs).toMatchObject(newSPMs);
        });

        it("should auto-increment position_order when inserting at existing position", () => {
            const initialSPMs = [
                {
                    shape_page_id: 1,
                    marcher_id: 1,
                    position_order: 1,
                },
                {
                    shape_page_id: 1,
                    marcher_id: 3,
                    position_order: 1,
                },
            ];
            const initialResponse = createShapePageMarchers({
                db,
                args: initialSPMs,
            });
            expect(initialResponse.success).toBe(true);

            const newSPM = {
                shape_page_id: 1,
                marcher_id: 2,
                position_order: 1,
            };
            const result = createShapePageMarchers({ db, args: [newSPM] });
            expect(result.success).toBe(true);

            // Get the SPMs and check their values
            const spmsResponse = getShapePageMarchers({ db });
            expect(spmsResponse.success).toBe(true);
            const allSPMs = spmsResponse.data;
            expect(allSPMs).toHaveLength(3);
            expect(allSPMs).toMatchObject([
                { ...initialSPMs[0], position_order: 3 },
                { ...initialSPMs[1], position_order: 2 },
                newSPM,
            ]);
        });

        it("should enforce unique constraints on shape_page_id and marcher_id", () => {
            const duplicateSPMs = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 1, marcher_id: 1, position_order: 2 },
            ];

            const result = createShapePageMarchers({ db, args: duplicateSPMs });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it("should handle optional notes field correctly", () => {
            const spmWithNotes = {
                shape_page_id: 1,
                marcher_id: 1,
                position_order: 1,
                notes: "Test notes",
            };

            const spmWithoutNotes = {
                shape_page_id: 1,
                marcher_id: 2,
                position_order: 2,
            };

            const result = createShapePageMarchers({
                db,
                args: [spmWithNotes, spmWithoutNotes],
            });
            expect(result.success).toBe(true);
            expect(result.data[0].notes).toBe("Test notes");
            expect(result.data[1].notes).toBeNull();
        });
    });

    describe("GetShapePageMarchers", () => {
        it("should return empty array when no shape page marchers exist", () => {
            const result = getShapePageMarchers({ db });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
        });

        it("should return only marchers for specified shape_page_id", () => {
            const spms = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                { shape_page_id: 2, marcher_id: 3, position_order: 1 },
            ];
            createShapePageMarchers({ db, args: spms });

            const result = getShapePageMarchers({ db, shapePageId: 1 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
            expect(result.data).toMatchObject([spms[0], spms[1]]);
        });

        it("should return empty array when shape_page_id has no marchers", () => {
            const spms = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 1, marcher_id: 2, position_order: 2 },
            ];
            createShapePageMarchers({ db, args: spms });

            const result = getShapePageMarchers({ db, shapePageId: 2 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(0);
        });

        it("should return all marchers when no shape_page_id is specified", () => {
            const spms = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 2, marcher_id: 2, position_order: 1 },
                { shape_page_id: 3, marcher_id: 3, position_order: 1 },
            ];
            createShapePageMarchers({ db, args: spms });

            const result = getShapePageMarchers({ db });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(3);
            expect(result.data).toMatchObject(spms);
        });

        it("should return marchers with all fields including notes", () => {
            const spm = {
                shape_page_id: 1,
                marcher_id: 1,
                position_order: 1,
                notes: "Test notes",
            };
            createShapePageMarchers({ db, args: [spm] });

            const result = getShapePageMarchers({ db, shapePageId: 1 });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
            expect(result.data[0]).toMatchObject(spm);
        });

        describe("GetShapePageMarchers with marcherIds filter", () => {
            it("should filter results by marcherIds when provided", () => {
                const spms = [
                    { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                    { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                    { shape_page_id: 1, marcher_id: 3, position_order: 3 },
                    { shape_page_id: 4, marcher_id: 1, position_order: 1 },
                ];
                createShapePageMarchers({ db, args: spms });

                const result = getShapePageMarchers({
                    db,
                    marcherIds: new Set([1, 2]),
                });

                expect(result.success).toBe(true);
                expect(result.data).toHaveLength(3);
                expect(
                    result.data.every(
                        (spm) => spm.marcher_id === 1 || spm.marcher_id === 2,
                    ),
                ).toBe(true);
            });

            it("should combine shapePageId and marcherIds filters correctly", () => {
                const spms = [
                    { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                    { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                    { shape_page_id: 4, marcher_id: 1, position_order: 1 },
                    { shape_page_id: 4, marcher_id: 3, position_order: 2 },
                ];
                createShapePageMarchers({ db, args: spms });

                const result = getShapePageMarchers({
                    db,
                    shapePageId: 1,
                    marcherIds: new Set([1, 3]),
                });

                expect(result.success).toBe(true);
                expect(result.data).toHaveLength(1);
                expect(result.data[0]).toMatchObject({
                    shape_page_id: 1,
                    marcher_id: 1,
                });
            });

            it("should return empty array when marcherIds filter matches no records", () => {
                const spms = [
                    { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                    { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                ];
                createShapePageMarchers({ db, args: spms });

                const result = getShapePageMarchers({
                    db,
                    marcherIds: new Set([3, 4]),
                });

                expect(result.success).toBe(true);
                expect(result.data).toHaveLength(0);
            });

            it("should handle empty marcherIds set", () => {
                const spms = [
                    { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                    { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                ];
                createShapePageMarchers({ db, args: spms });

                const result = getShapePageMarchers({
                    db,
                    marcherIds: new Set(),
                });

                expect(result.success).toBe(true);
                expect(result.data).toHaveLength(0);
            });
        });
    });

    describe("UpdateShapePageMarchers", () => {
        it("should successfully update a single ShapePageMarcher's notes", () => {
            const initialSPM = {
                shape_page_id: 1,
                marcher_id: 1,
                position_order: 1,
                notes: "Initial notes",
            };
            let result = createShapePageMarchers({ db, args: [initialSPM] });
            expect(result.success).toBe(true);
            expect(result.data).toMatchObject([initialSPM]);

            const updateArgs = {
                id: 1,
                notes: "Updated notes",
            };

            result = updateShapePageMarchers({ db, args: [updateArgs] });
            expect(result.success).toBe(true);
            expect(result.data.length).toBe(1);
            expect(result.data).toMatchObject([updateArgs]);
        });

        it("should fail gracefully when updating non-existent ShapePageMarcher", () => {
            const updateArgs = {
                id: 999,
                notes: "This should fail",
            };

            const result = updateShapePageMarchers({ db, args: [updateArgs] });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it("should handle batch updates of multiple ShapePageMarchers", () => {
            const initialSPMs = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 1, marcher_id: 2, position_order: 2 },
            ];
            createShapePageMarchers({ db, args: initialSPMs });

            const updateArgs = [
                { id: 1, notes: "Updated notes 1" },
                { id: 2, notes: "Updated notes 2" },
            ];

            const result = updateShapePageMarchers({ db, args: updateArgs });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
            expect(result.data[0].notes).toBe("Updated notes 1");
            expect(result.data[1].notes).toBe("Updated notes 2");
        });

        it("should rollback changes when partial update fails", () => {
            const initialSPM = {
                shape_page_id: 1,
                marcher_id: 1,
                position_order: 1,
                notes: "Initial notes",
            };
            createShapePageMarchers({ db, args: [initialSPM] });

            const updateArgs = [
                { id: 1, notes: "Valid update" },
                { id: 999, notes: "Invalid update" },
            ];

            const result = updateShapePageMarchers({ db, args: updateArgs });
            expect(result.success).toBe(false);

            const spmsResponse = getShapePageMarchers({ db });
            expect(spmsResponse.data[0].notes).toBe("Initial notes");
        });

        describe("position_order", () => {
            it("should handle position order updates with a single marcher to the beginning", () => {
                const initialSPMs = [
                    { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                    { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                    { shape_page_id: 1, marcher_id: 3, position_order: 3 },
                    { shape_page_id: 1, marcher_id: 4, position_order: 4 },
                ];
                expect(
                    createShapePageMarchers({ db, args: initialSPMs }).success,
                ).toBe(true);

                const updateArgs = {
                    id: 3,
                    position_order: 1,
                };

                const expectedSpms = [
                    { ...initialSPMs[0], position_order: 2 },
                    { ...initialSPMs[1], position_order: 3 },
                    { ...initialSPMs[2], position_order: 1 },
                    { ...initialSPMs[3], position_order: 4 },
                ];
                const result = updateShapePageMarchers({
                    db,
                    args: [updateArgs],
                });
                expect(result.success).toBe(true);
                const allSpms = getShapePageMarchers({ db }).data;
                expect(allSpms).toMatchObject(expectedSpms);
            });

            it("should handle position order updates with single marcher to the end", () => {
                const initialSPMs = [
                    { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                    { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                    { shape_page_id: 1, marcher_id: 3, position_order: 3 },
                    { shape_page_id: 1, marcher_id: 4, position_order: 4 },
                ];
                expect(
                    createShapePageMarchers({ db, args: initialSPMs }).success,
                ).toBe(true);

                const updateArgs = {
                    id: 2,
                    position_order: 5,
                };

                const expectedSpms = [
                    { ...initialSPMs[0], position_order: 1 },
                    { ...initialSPMs[1], position_order: 4 },
                    { ...initialSPMs[2], position_order: 2 },
                    { ...initialSPMs[3], position_order: 3 },
                ];
                const result = updateShapePageMarchers({
                    db,
                    args: [updateArgs],
                });
                expect(result.success).toBe(true);
                const allSpms = getShapePageMarchers({ db }).data;
                expect(allSpms).toMatchObject(expectedSpms);
            });

            it("should handle position order updates with single marcher in the middle", () => {
                const initialSPMs = [
                    { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                    { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                    { shape_page_id: 1, marcher_id: 3, position_order: 3 },
                    { shape_page_id: 1, marcher_id: 4, position_order: 4 },
                ];
                expect(
                    createShapePageMarchers({ db, args: initialSPMs }).success,
                ).toBe(true);

                const updateArgs = {
                    id: 1,
                    position_order: 3,
                };

                const expectedSpms = [
                    { ...initialSPMs[0], position_order: 2 },
                    { ...initialSPMs[1], position_order: 1 },
                    { ...initialSPMs[2], position_order: 3 },
                    { ...initialSPMs[3], position_order: 4 },
                ];
                const result = updateShapePageMarchers({
                    db,
                    args: [updateArgs],
                });
                expect(result.success).toBe(true);
                const allSpms = getShapePageMarchers({ db }).data;
                expect(allSpms).toMatchObject(expectedSpms);
            });

            it("should handle position order updates with multiple marchers at the beginning, middle, and end", () => {
                const initialSPMs = [
                    { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                    { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                    { shape_page_id: 1, marcher_id: 3, position_order: 3 },
                    { shape_page_id: 1, marcher_id: 4, position_order: 4 },
                    { shape_page_id: 1, marcher_id: 5, position_order: 5 },
                ];
                expect(
                    createShapePageMarchers({ db, args: initialSPMs }).success,
                ).toBe(true);

                const updateArgs = [
                    { id: 1, position_order: 6 },
                    { id: 3, position_order: 1 },
                    { id: 5, position_order: 5 },
                ];

                const expectedSpms = [
                    { ...initialSPMs[0], position_order: 5 },
                    { ...initialSPMs[1], position_order: 2 },
                    { ...initialSPMs[2], position_order: 1 },
                    { ...initialSPMs[3], position_order: 3 },
                    { ...initialSPMs[4], position_order: 4 },
                ];
                const result = updateShapePageMarchers({
                    db,
                    args: updateArgs,
                });
                expect(result.success).toBe(true);
                const allSpms = getShapePageMarchers({ db }).data;
                expect(allSpms).toMatchObject(expectedSpms);
            });
        });
    });
    describe("DeleteShapePageMarchers", () => {
        it("should successfully delete a single ShapePageMarcher", () => {
            const initialSPM = {
                shape_page_id: 1,
                marcher_id: 1,
                position_order: 1,
                notes: "Test notes",
            };
            const createResult = createShapePageMarchers({
                db,
                args: [initialSPM],
            });
            expect(createResult.success).toBe(true);

            const result = deleteShapePageMarchers({ db, ids: new Set([1]) });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1);
            expect(result.data[0]).toMatchObject(initialSPM);

            const remainingSPMs = getShapePageMarchers({ db });
            expect(remainingSPMs.data).toHaveLength(0);
        });

        it("should handle deletion of multiple ShapePageMarchers", () => {
            const initialSPMs = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                { shape_page_id: 1, marcher_id: 3, position_order: 3 },
            ];
            createShapePageMarchers({ db, args: initialSPMs });

            const result = deleteShapePageMarchers({
                db,
                ids: new Set([1, 2]),
            });
            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(2);
            expect(result.data).toMatchObject([initialSPMs[0], initialSPMs[1]]);

            const remainingSPMs = getShapePageMarchers({ db });
            expect(remainingSPMs.data).toHaveLength(1);
            expect(remainingSPMs.data[0]).toMatchObject({
                ...initialSPMs[2],
                position_order: 1,
            });
        });

        it("should properly flatten order after deletion", () => {
            const initialSPMs = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                { shape_page_id: 1, marcher_id: 3, position_order: 3 },
                { shape_page_id: 1, marcher_id: 4, position_order: 4 },
            ];
            const createResult = createShapePageMarchers({
                db,
                args: initialSPMs,
            });
            expect(createResult.success).toBe(true);

            const result = deleteShapePageMarchers({
                db,
                ids: new Set([2, 3]),
            });
            expect(result.success).toBe(true);

            const remainingSPMs = getShapePageMarchers({ db });
            expect(remainingSPMs.data).toHaveLength(2);
            expect(remainingSPMs.data).toMatchObject([
                { ...initialSPMs[0], position_order: 1 },
                { ...initialSPMs[3], position_order: 2 },
            ]);
        });

        it("should handle deletion with multiple shape_page_ids", () => {
            const initialSPMs = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                { shape_page_id: 2, marcher_id: 3, position_order: 1 },
                { shape_page_id: 2, marcher_id: 4, position_order: 2 },
            ];
            createShapePageMarchers({ db, args: initialSPMs });

            const result = deleteShapePageMarchers({
                db,
                ids: new Set([1, 3]),
            });
            expect(result.success).toBe(true);

            const remainingSPMs = getShapePageMarchers({ db });
            expect(remainingSPMs.data).toHaveLength(2);
            expect(remainingSPMs.data).toMatchObject([
                { ...initialSPMs[1], position_order: 1 },
                { ...initialSPMs[3], position_order: 1 },
            ]);
        });

        it("should fail gracefully when trying to delete non-existent ids", () => {
            const result = deleteShapePageMarchers({
                db,
                ids: new Set([999, 1000]),
            });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });
    describe("GetSpmByMarcherPage", () => {
        it("should return null when no matching ShapePageMarcher exists", () => {
            const result = getSpmByMarcherPage({
                db,
                marcherPage: { marcher_id: 1, page_id: 1 },
            });
            expect(result.success).toBe(true);
            expect(result.data).toBeNull();
        });

        it("should return the correct ShapePageMarcher when it exists", () => {
            const shapePage = getShapePages({ db }).data[0];
            const newSPM = {
                shape_page_id: shapePage.id,
                marcher_id: 1,
                position_order: 1,
                notes: "Test notes",
            };
            const createSpmResponse = createShapePageMarchers({
                db,
                args: [newSPM],
            });
            expect(createSpmResponse.success).toBe(true);

            const result = getSpmByMarcherPage({
                db,
                marcherPage: { marcher_id: 1, page_id: shapePage.page_id },
            });
            expect(result.success).toBe(true);
            expect(createSpmResponse.data[0]).toMatchObject(result.data as any);
        });

        it("should return the correct ShapePageMarcher when it exists", () => {
            const shapePage = getShapePages({ db }).data[2];
            const newSPM = {
                shape_page_id: shapePage.id,
                marcher_id: 1,
                position_order: 1,
                notes: "Test notes",
            };
            const createSpmResponse = createShapePageMarchers({
                db,
                args: [newSPM],
            });
            expect(createSpmResponse.success).toBe(true);

            const result = getSpmByMarcherPage({
                db,
                marcherPage: { marcher_id: 1, page_id: shapePage.page_id },
            });
            expect(result.success).toBe(true);
            expect(createSpmResponse.data[0]).toMatchObject(result.data as any);
        });

        it("should return null when the marcher_id is invalid", () => {
            const result = getSpmByMarcherPage({
                db,
                marcherPage: { marcher_id: -1, page_id: 1 },
            });
            expect(result.success).toBe(true);
            expect(result.data).toBeNull();
        });

        it("should return null when the page_id is invalid", () => {
            const result = getSpmByMarcherPage({
                db,
                marcherPage: { marcher_id: 1, page_id: -1 },
            });
            expect(result.success).toBe(true);
            expect(result.data).toBeNull();
        });
    });

    describe("throwError when creating duplicate marcher and page combination", () => {
        it("should throw an error when creating duplicate marcher and page combination", () => {
            const shapePagesResponse = getShapePages({
                db,
            });
            expect(shapePagesResponse.success).toBe(true);

            const shapePage0 = shapePagesResponse.data[0];
            const shapePage1 = shapePagesResponse.data[1];
            // If this is not true, pick two ShapePages that have the same page_id
            expect(shapePage0.page_id).toBe(shapePage1.page_id);

            const newSPMs = [
                {
                    shape_page_id: shapePage0.id,
                    marcher_id: 3,
                    position_order: 1,
                    notes: "Test notes",
                },
                {
                    shape_page_id: shapePage1.id,
                    marcher_id: 3,
                    position_order: 2,
                },
            ];

            const existingSPMsResponse = getShapePageMarchers({
                db,
            });
            expect(existingSPMsResponse.success).toBe(true);

            // Create first ShapePageMarcher
            expect(
                createShapePageMarchers({ db, args: [newSPMs[0]] }).success,
            ).toBe(true);

            // Attempt to create duplicate ShapePageMarcher
            const duplicateResult = createShapePageMarchers({
                db,
                args: [newSPMs[1]],
            });
            expect(duplicateResult.success).toBe(false);
            expect(duplicateResult.error).toBeDefined();
        });

        it("should not throw an error when forced creating duplicate marcher and page combination", () => {
            let shapePagesResponse = getShapePages({
                db,
            });
            expect(shapePagesResponse.success).toBe(true);

            const shapePage0 = shapePagesResponse.data[0];
            const shapePage1 = shapePagesResponse.data[1];
            // If this is not true, pick two ShapePages that have the same page_id
            expect(shapePage0.page_id).toBe(shapePage1.page_id);

            const newSPMs = [
                {
                    shape_page_id: shapePage0.id,
                    marcher_id: 3,
                    position_order: 1,
                    notes: "Test notes",
                },
                {
                    shape_page_id: shapePage1.id,
                    marcher_id: 3,
                    position_order: 2,
                },
            ];

            const existingSPMsResponse = getShapePageMarchers({
                db,
            });
            expect(existingSPMsResponse.success).toBe(true);

            const shapePageToDelete = shapePage0;

            // Create first ShapePageMarcher
            expect(
                createShapePageMarchers({ db, args: [newSPMs[0]] }).success,
            ).toBe(true);

            // Attempt to create duplicate ShapePageMarcher
            const duplicateResult = createShapePageMarchers({
                db,
                args: [newSPMs[1]],
                force: true,
            });
            expect(duplicateResult.success).toBe(true);
            expect(duplicateResult.data[0]).toMatchObject(newSPMs[1]);

            shapePagesResponse = getShapePages({
                db,
            });
            // expect the shape page to be deleted
            expect(shapePagesResponse.success).toBeTruthy();
            expect(
                shapePagesResponse.data.find(
                    (sp) => sp.id === shapePageToDelete!.id,
                ),
            ).toBeUndefined();
        });
    });
    describe("SwapShapePageMarcherPositions", () => {
        it("should swap positions of two shape page marchers", () => {
            const initialSPMs = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 1, marcher_id: 2, position_order: 2 },
            ];
            const createResult = createShapePageMarchers({
                db,
                args: initialSPMs,
            });
            expect(createResult.success).toBe(true);

            const result = swapPositionOrder({
                db,
                spmId1: 1,
                spmId2: 2,
            });

            expect(result.success).toBe(true);
            expect(result.data[0].position_order).toBe(2);
            expect(result.data[1].position_order).toBe(1);
        });

        it("should fail when one of the SPM IDs doesn't exist", () => {
            const initialSPM = {
                shape_page_id: 1,
                marcher_id: 1,
                position_order: 1,
            };
            const createResult = createShapePageMarchers({
                db,
                args: [initialSPM],
            });
            expect(createResult.success).toBe(true);

            const result = swapPositionOrder({
                db,
                spmId1: 1,
                spmId2: 999,
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it("should maintain position integrity when swapping non-consecutive positions", () => {
            const initialSPMs = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 1, marcher_id: 2, position_order: 2 },
                { shape_page_id: 1, marcher_id: 3, position_order: 3 },
            ];
            const createResult = createShapePageMarchers({
                db,
                args: initialSPMs,
            });
            expect(createResult.success).toBe(true);

            const result = swapPositionOrder({
                db,
                spmId1: 1,
                spmId2: 3,
            });

            expect(result.success).toBe(true);
            const updatedSPMs = getShapePageMarchers({ db }).data;
            expect(updatedSPMs[0].position_order).toBe(3);
            expect(updatedSPMs[1].position_order).toBe(2);
            expect(updatedSPMs[2].position_order).toBe(1);
        });

        it("should handle swapping with useNextUndoGroup flag", () => {
            const initialSPMs = [
                { shape_page_id: 1, marcher_id: 1, position_order: 1 },
                { shape_page_id: 1, marcher_id: 2, position_order: 2 },
            ];
            const createResult = createShapePageMarchers({
                db,
                args: initialSPMs,
            });
            expect(createResult.success).toBe(true);

            const result = swapPositionOrder({
                db,
                spmId1: 1,
                spmId2: 2,
                useNextUndoGroup: true,
            });

            expect(result.success).toBe(true);
            expect(result.data[0].position_order).toBe(2);
            expect(result.data[1].position_order).toBe(1);
        });
    });
});
