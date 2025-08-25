import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as MarcherPageTable from "../MarcherPageTable";
import * as MarcherTable from "../MarcherTable";
import * as PageTable from "../PageTable";
import * as DbMocks from "../../__test__/DatabaseMocks";
import { initTestDatabase } from "./testUtils";
import { getOrm, schema } from "../../db";
import { ModifiedMarcherPageArgs } from "../../../../src/global/classes/MarcherPage";
import { MockPathways } from "../../__test__/PathwayMocks";

describe("MarcherPageTable", () => {
    let db: Database.Database;
    let orm: any;

    beforeEach(async () => {
        db = await initTestDatabase();
        orm = getOrm(db);

        // Create prerequisite data
        expect(
            PageTable.createPages({ db, newPages: DbMocks.NewPages }).success,
        ).toBe(true);
        expect(
            MarcherTable.createMarchers({
                db,
                newMarchers: DbMocks.NewMarchers,
            }).success,
        ).toBe(true);
    });

    describe("getMarcherPages", () => {
        it("should return all marcher pages when no filters are provided", () => {
            const result = MarcherPageTable.getMarcherPages({ db });

            expect(result.success).toBe(true);
            expect(result.data).toBeInstanceOf(Array);

            // Should have marcher pages for each marcher-page combination
            // 5 marchers * 6 pages (including the default page) = 30 marcher pages
            expect(result.data.length).toBe(30);
        });

        it("should filter by marcher_id", () => {
            const result = MarcherPageTable.getMarcherPages({
                db,
                marcher_id: 1,
            });

            expect(result.success).toBe(true);
            expect(result.data).toBeInstanceOf(Array);

            // Should have 6 pages for marcher_id 1
            expect(result.data.length).toBe(6);
            expect(result.data.every((mp) => mp.marcher_id === 1)).toBe(true);
        });

        it("should filter by page_id", () => {
            const result = MarcherPageTable.getMarcherPages({ db, page_id: 1 });

            expect(result.success).toBe(true);
            expect(result.data).toBeInstanceOf(Array);

            // Should have 5 marchers for page_id 1
            expect(result.data.length).toBe(5);
            expect(result.data.every((mp) => mp.page_id === 1)).toBe(true);
        });

        it("should filter by both marcher_id and page_id", () => {
            const result = MarcherPageTable.getMarcherPages({
                db,
                marcher_id: 1,
                page_id: 1,
            });

            expect(result.success).toBe(true);
            expect(result.data).toBeInstanceOf(Array);

            // Should have exactly 1 marcher page
            expect(result.data.length).toBe(1);
            expect(result.data[0].marcher_id).toBe(1);
            expect(result.data[0].page_id).toBe(1);
        });

        it("should include pathway data when marcher page has path_data_id", async () => {
            // Create a pathway first using mock data
            const pathwayData = MockPathways[0]; // Use the first mock pathway

            const pathwayResult = orm
                .insert(schema.pathways)
                .values(pathwayData)
                .returning()
                .get();
            expect(pathwayResult).toBeDefined();

            // Update a marcher page to reference this pathway
            const marcherPageToUpdate = {
                marcher_id: 1,
                page_id: 1,
                path_data_id: pathwayResult.id,
                path_start_position: 0.5,
                path_end_position: 0.8,
                x: 50,
                y: 50,
            };

            const updateResult = MarcherPageTable.updateMarcherPages({
                db,
                marcherPageUpdates: [marcherPageToUpdate],
            });
            expect(updateResult.success).toBe(true);

            // Get the marcher page and verify pathway data is included
            const result = MarcherPageTable.getMarcherPages({
                db,
                marcher_id: 1,
                page_id: 1,
            });

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(1);
            expect(result.data[0].path_data).toBe(pathwayData.path_data);
            expect(result.data[0].pathway_notes).toBe(pathwayData.notes);
        });

        it("should handle marcher pages without pathway data", () => {
            const result = MarcherPageTable.getMarcherPages({
                db,
                marcher_id: 1,
                page_id: 1,
            });

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(1);
            expect(result.data[0].path_data).toBeNull();
            expect(result.data[0].pathway_notes).toBeNull();
        });

        it("should return correct marcher page structure", () => {
            const result = MarcherPageTable.getMarcherPages({
                db,
                marcher_id: 1,
                page_id: 1,
            });

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(1);

            const marcherPage = result.data[0];
            expect(marcherPage).toHaveProperty("id");
            expect(marcherPage).toHaveProperty("marcher_id");
            expect(marcherPage).toHaveProperty("page_id");
            expect(marcherPage).toHaveProperty("x");
            expect(marcherPage).toHaveProperty("y");
            expect(marcherPage).toHaveProperty("created_at");
            expect(marcherPage).toHaveProperty("updated_at");
            expect(marcherPage).toHaveProperty("path_data_id");
            expect(marcherPage).toHaveProperty("path_start_position");
            expect(marcherPage).toHaveProperty("path_end_position");
            expect(marcherPage).toHaveProperty("notes");
            expect(marcherPage).toHaveProperty("path_data");
            expect(marcherPage).toHaveProperty("pathway_notes");
        });
    });

    describe("getMarcherPage", () => {
        it("should return a single marcher page for specific marcher and page", () => {
            const result = MarcherPageTable.getMarcherPage({
                db,
                marcher_id: 1,
                page_id: 1,
            });

            expect(result.success).toBe(true);
            expect(result.data).not.toBeNull();
            expect(result.data!.marcher_id).toBe(1);
            expect(result.data!.page_id).toBe(1);
        });

        it("should return null for non-existent marcher page", () => {
            const result = MarcherPageTable.getMarcherPage({
                db,
                marcher_id: 999,
                page_id: 999,
            });

            expect(result.success).toBe(true);
            expect(result.data).toBeNull();
        });
    });

    describe("createMarcherPages", () => {
        it("should fail when trying to create duplicate marcher pages", () => {
            // Note: Marcher pages are automatically created when marchers and pages are created
            // So trying to create them again should fail due to unique constraint
            const newMarcherPages: ModifiedMarcherPageArgs[] = [
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: 100,
                    y: 200,
                    notes: "Test marcher page 1",
                },
            ];

            const result = MarcherPageTable.createMarcherPages({
                db,
                newMarcherPages,
                useNextUndoGroup: true,
            });

            // Should fail because marcher page already exists
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it("should handle empty array of marcher pages", () => {
            const result = MarcherPageTable.createMarcherPages({
                db,
                newMarcherPages: [],
                useNextUndoGroup: true,
            });

            expect(result.success).toBe(true);
            expect(result.data).toBeNull();
        });
    });

    describe("updateMarcherPages", () => {
        it("should update marcher page coordinates", () => {
            const updates: ModifiedMarcherPageArgs[] = [
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: 300,
                    y: 400,
                    notes: "Updated position",
                },
            ];

            const result = MarcherPageTable.updateMarcherPages({
                db,
                marcherPageUpdates: updates,
            });

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(1);

            const updatedMarcherPage = result.data[0];
            expect(updatedMarcherPage.marcher_id).toBe(1);
            expect(updatedMarcherPage.page_id).toBe(1);
            expect(updatedMarcherPage.x).toBe(300);
            expect(updatedMarcherPage.y).toBe(400);
            expect(updatedMarcherPage.notes).toBe("Updated position");
        });

        it("should update multiple marcher pages", () => {
            const updates: ModifiedMarcherPageArgs[] = [
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: 100,
                    y: 200,
                    notes: "First update",
                },
                {
                    marcher_id: 2,
                    page_id: 1,
                    x: 150,
                    y: 250,
                    notes: "Second update",
                },
            ];

            const result = MarcherPageTable.updateMarcherPages({
                db,
                marcherPageUpdates: updates,
            });

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(2);

            expect(result.data[0].marcher_id).toBe(1);
            expect(result.data[0].x).toBe(100);
            expect(result.data[0].y).toBe(200);

            expect(result.data[1].marcher_id).toBe(2);
            expect(result.data[1].x).toBe(150);
            expect(result.data[1].y).toBe(250);
        });

        it("should handle child actions without lock checking", () => {
            const updates: ModifiedMarcherPageArgs[] = [
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: 500,
                    y: 600,
                    notes: "Child action update",
                },
            ];

            const result = MarcherPageTable.updateMarcherPages({
                db,
                marcherPageUpdates: updates,
                isChildAction: true,
            });

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(1);
            expect(result.data[0].x).toBe(500);
            expect(result.data[0].y).toBe(600);
        });

        it("should skip locked marcher pages", () => {
            // First, create a shape to reference
            const shape = {
                name: "Test Shape",
                notes: "Test shape for locking",
            };

            const shapeResult = orm
                .insert(schema.shapes)
                .values(shape)
                .returning()
                .get();
            expect(shapeResult).toBeDefined();

            // Create a shape page first
            const shapePage = {
                shape_id: shapeResult.id,
                page_id: 1,
                svg_path: "M 0 0 L 100 100",
                marcher_coordinates: [],
            };

            const shapePageResult = orm
                .insert(schema.shape_pages)
                .values(shapePage)
                .returning()
                .get();
            expect(shapePageResult).toBeDefined();

            // Create the shape page marcher to lock the marcher page
            const shapePageMarcher = {
                shape_page_id: shapePageResult.id,
                marcher_id: 1,
                position_order: 1,
                notes: "Locking marcher page",
            };

            const spmResult = orm
                .insert(schema.shape_page_marchers)
                .values(shapePageMarcher)
                .returning()
                .get();
            expect(spmResult).toBeDefined();

            // Now try to update the locked marcher page
            const updates: ModifiedMarcherPageArgs[] = [
                {
                    marcher_id: 1,
                    page_id: 1,
                    x: 999,
                    y: 999,
                    notes: "Should be skipped",
                },
            ];

            const result = MarcherPageTable.updateMarcherPages({
                db,
                marcherPageUpdates: updates,
            });

            expect(result.success).toBe(true);
            // Should return empty array because the marcher page is locked
            expect(result.data.length).toBe(0);
        });

        it("should handle non-existent marcher page gracefully", () => {
            const updates: ModifiedMarcherPageArgs[] = [
                {
                    marcher_id: 999,
                    page_id: 999,
                    x: 100,
                    y: 200,
                    notes: "Non-existent marcher page",
                },
            ];

            // This should throw an error because the marcher page doesn't exist
            expect(() => {
                MarcherPageTable.updateMarcherPages({
                    db,
                    marcherPageUpdates: updates,
                });
            }).toThrow();
        });
    });

    describe("error handling", () => {
        it("should handle database errors gracefully", () => {
            // Close the database to simulate an error
            db.close();

            const result = MarcherPageTable.getMarcherPages({ db });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error!.message).toContain(
                "Failed to get marcher pages",
            );
        });
    });

    describe("pathway integration", () => {
        it("should properly join with pathways table and return pathway data", async () => {
            // Create multiple pathways using mock data
            const pathways = [MockPathways[0], MockPathways[1]]; // Use first two mock pathways

            const pathwayResults = orm
                .insert(schema.pathways)
                .values(pathways)
                .returning()
                .all();
            expect(pathwayResults.length).toBe(2);

            // Update marcher pages to reference these pathways
            const marcherPageUpdates = [
                {
                    marcher_id: 1,
                    page_id: 1,
                    path_data_id: pathwayResults[0].id,
                    path_start_position: 0.3,
                    path_end_position: 0.6,
                    x: 30,
                    y: 30,
                },
                {
                    marcher_id: 2,
                    page_id: 1,
                    path_data_id: pathwayResults[1].id,
                    path_start_position: 0.7,
                    path_end_position: 0.9,
                    x: 70,
                    y: 70,
                },
            ];

            const updateResult = MarcherPageTable.updateMarcherPages({
                db,
                marcherPageUpdates,
            });
            expect(updateResult.success).toBe(true);

            // Get marcher pages and verify pathway data
            const result = MarcherPageTable.getMarcherPages({ db, page_id: 1 });

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(5); // 5 marchers on page 1

            // Find the marcher pages with pathway data
            const marcherPage1 = result.data.find(
                (mp) => mp.marcher_id === 1 && mp.page_id === 1,
            );
            const marcherPage2 = result.data.find(
                (mp) => mp.marcher_id === 2 && mp.page_id === 1,
            );

            expect(marcherPage1).toBeDefined();
            expect(marcherPage1!.path_data).toBe(pathways[0].path_data);
            expect(marcherPage1!.pathway_notes).toBe(pathways[0].notes);

            expect(marcherPage2).toBeDefined();
            expect(marcherPage2!.path_data).toBe(pathways[1].path_data);
            expect(marcherPage2!.pathway_notes).toBe(pathways[1].notes);
        });

        it("should handle marcher pages with and without pathways in the same query", () => {
            // Create a pathway using mock data
            const pathway = MockPathways[2]; // Use the third mock pathway

            const pathwayResult = orm
                .insert(schema.pathways)
                .values(pathway)
                .returning()
                .get();
            expect(pathwayResult).toBeDefined();

            // Update only one marcher page to have pathway data
            const marcherPageUpdate = {
                marcher_id: 1,
                page_id: 1,
                path_data_id: pathwayResult.id,
                path_start_position: 0.5,
                path_end_position: 0.8,
                x: 50,
                y: 50,
            };

            const updateResult = MarcherPageTable.updateMarcherPages({
                db,
                marcherPageUpdates: [marcherPageUpdate],
            });
            expect(updateResult.success).toBe(true);

            // Get all marcher pages for page 1
            const result = MarcherPageTable.getMarcherPages({ db, page_id: 1 });

            expect(result.success).toBe(true);
            expect(result.data.length).toBe(5);

            // Check that one has pathway data and others don't
            const withPathway = result.data.filter(
                (mp) => mp.path_data !== null,
            );
            const withoutPathway = result.data.filter(
                (mp) => mp.path_data === null,
            );

            expect(withPathway.length).toBe(1);
            expect(withoutPathway.length).toBe(4);

            expect(withPathway[0].path_data).toBe(pathway.path_data);
            expect(withPathway[0].pathway_notes).toBe(pathway.notes);
            expect(
                withoutPathway.every(
                    (mp) => mp.path_data === null && mp.pathway_notes === null,
                ),
            ).toBe(true);
        });
    });
});
