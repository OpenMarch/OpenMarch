import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as PageTable from "../PageTable";
import * as MarcherTable from "../MarcherTable";
import * as MarcherPageTable from "../MarcherPageTable";
import { NewMarcherArgs } from "@/global/classes/Marcher";
import MarcherPage from "@/global/classes/MarcherPage";
import Constants from "@/global/Constants";
import { initTestDatabase } from "./testUtils";
import { generatePageNames, NewPageArgs } from "../PageTable";
import { DatabaseBeat, getBeats } from "../BeatTable";
import * as History from "../../database.history";
import Beat from "@/global/classes/Beat";
import Measure from "@/global/classes/Measure";
describe("PageTable", () => {
    describe("createPageTable", () => {
        let db: Database.Database;
        const trimData = (data: any[]) =>
            data.map((page: any) => {
                const { created_at, updated_at, ...rest } = page;
                return { ...rest, notes: rest.notes ? rest.notes : null };
            });
        beforeEach(() => {
            db = initTestDatabase();
        });

        it("should create the page table if it does not exist", () => {
            // Expect the page table to not exist
            let tableInfo = db
                .prepare(`PRAGMA table_info(${Constants.PageTableName})`)
                .all() as { name: string }[];
            // Expect the page table to be created
            const expectedColumns = [
                "id",
                "is_subset",
                "notes",
                "start_beat",
                "created_at",
                "updated_at",
            ];
            const columnNames = tableInfo.map((column) => column.name);
            expect(columnNames.sort()).toEqual(expectedColumns.sort());
        });

        it("Page 1 should exist at table creation with zero start_beat", () => {
            const allPages = PageTable.getPages({ db });
            expect(allPages.success).toBeTruthy();
            expect(trimData(allPages.data)).toEqual([
                {
                    id: 0,
                    is_subset: false,
                    notes: null,
                    start_beat: 1,
                },
            ]);
        });
    });

    describe("database interactions", () => {
        let db: Database.Database;
        const sort = (
            items: PageTable.DatabasePage[],
        ): PageTable.DatabasePage[] => {
            // Create a map to access items by their id
            const beats = getBeats({ db });
            const beatMap = new Map<number, DatabaseBeat>(
                beats.data.map((beat) => [beat.id, beat]),
            );

            return items.sort((a, b) => {
                const aBeat = beatMap.get(a.start_beat);
                const bBeat = beatMap.get(b.start_beat);
                if (!aBeat || !bBeat) {
                    console.log("aBeat", a.start_beat, aBeat);
                    console.log("bBeat", b.start_beat, bBeat);
                    throw new Error(
                        `Beat not found: ${a.start_beat} ${aBeat} - ${b.start_beat} ${bBeat}`,
                    );
                }
                return aBeat!.position - bBeat!.position;
            });
        };

        const trimData = (data: any[]) =>
            data.map((page: any) => {
                const { created_at, updated_at, ...rest } = page;
                return { ...rest, notes: rest.notes ? rest.notes : null };
            });

        function firstPage(
            nextPageId: number | null = null,
        ): PageTable.DatabasePage {
            return {
                id: 0,
                start_beat: 1,
                is_subset: false,
                notes: null,
            };
        }

        function trimAndSort(pages: PageTable.DatabasePage[]) {
            return trimData(sort(pages));
        }

        function addFirstPage(
            currentPages: PageTable.DatabasePage[],
        ): PageTable.DatabasePage[] {
            const sortedPages = trimAndSort(currentPages);
            return [firstPage(sortedPages[0].id), ...sortedPages];
        }

        beforeEach(() => {
            db = initTestDatabase();
        });

        describe("createPages", () => {
            it("should insert a new page into the database", () => {
                const newPages: NewPageArgs[] = [
                    {
                        is_subset: false,
                        notes: null,
                        start_beat: 8,
                    },
                ];
                const expectedCreatedPages = [
                    {
                        id: 1,
                        start_beat: 8,
                        is_subset: false,
                        notes: null,
                    },
                ];

                const result = PageTable.createPages({ newPages, db });

                expect(result.success).toBe(true);
                expect(trimData(result.data)).toEqual(expectedCreatedPages);

                const allMarchers = PageTable.getPages({ db });
                expect(allMarchers.success).toBe(true);
            });

            it("should insert sequential pages into the database with previous page defined", () => {
                let newPages: NewPageArgs[] = [
                    { start_beat: 12, is_subset: false },
                ];
                let expectedCreatedPages: PageTable.DatabasePage[] = [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                ];

                let createResult = PageTable.createPages({ newPages, db });
                let getResult = PageTable.getPages({ db });

                expect(createResult.success).toBe(true);
                expect(addFirstPage(createResult.data)).toEqual(
                    addFirstPage(expectedCreatedPages),
                );
                expect(trimAndSort(getResult.data)).toEqual(
                    addFirstPage(expectedCreatedPages),
                );

                // NEW PAGE 2
                newPages = [
                    {
                        start_beat: 15,
                        is_subset: true,
                    },
                ];
                expectedCreatedPages = [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 15,
                        is_subset: true,
                        notes: null,
                    },
                ];

                createResult = PageTable.createPages({ newPages, db });
                getResult = PageTable.getPages({ db });
                expect(trimAndSort(createResult.data)).toEqual([
                    expectedCreatedPages[1],
                ]);
                expect(trimAndSort(getResult.data)).toEqual(
                    addFirstPage(expectedCreatedPages),
                );

                // NEW PAGE 3
                newPages = [
                    {
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                ];
                expectedCreatedPages = [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 15,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                ];

                createResult = PageTable.createPages({ newPages, db });
                getResult = PageTable.getPages({ db });
                expect(createResult.success).toBe(true);
                expect(trimAndSort(createResult.data)).toEqual([
                    expectedCreatedPages[2],
                ]);
                expect(trimAndSort(getResult.data)).toEqual(
                    addFirstPage(expectedCreatedPages),
                );
            });

            it("should fail to insert a page with duplicate start_beat", () => {
                const firstPage: NewPageArgs[] = [
                    {
                        start_beat: 5,
                        is_subset: false,
                        notes: null,
                    },
                ];

                // Insert first page successfully
                const firstResult = PageTable.createPages({
                    newPages: firstPage,
                    db,
                });
                expect(firstResult.success).toBe(true);

                // Attempt to insert page with same start_beat
                const duplicatePage: NewPageArgs[] = [
                    {
                        start_beat: 5,
                        is_subset: true,
                        notes: "This should fail",
                    },
                ];

                const duplicateResult = PageTable.createPages({
                    newPages: duplicatePage,
                    db,
                });
                expect(duplicateResult.success).toBe(false);
                expect(duplicateResult.error).toBeDefined();
            });

            it("should insert new pages at the start of the database with no previous page defined", () => {
                let newPages: NewPageArgs[] = [
                    { start_beat: 12, is_subset: false },
                ];
                let expectedCreatedPages: PageTable.DatabasePage[] = [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                ];

                let createResult = PageTable.createPages({ newPages, db });
                let getResult = PageTable.getPages({ db });

                expect(createResult.success).toBe(true);
                expect(trimAndSort(createResult.data)).toEqual(
                    expectedCreatedPages,
                );
                expect(addFirstPage(createResult.data)).toEqual(
                    trimAndSort(getResult.data),
                );

                // NEW PAGE 2
                newPages = [
                    {
                        start_beat: 10,
                        is_subset: true,
                    },
                ];
                expectedCreatedPages = [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                ];

                createResult = PageTable.createPages({ newPages, db });
                getResult = PageTable.getPages({ db });

                expect(createResult.success).toBe(true);
                expect(trimAndSort(createResult.data)).toEqual([
                    expectedCreatedPages[1],
                ]);
                expect(addFirstPage(expectedCreatedPages)).toEqual(
                    trimAndSort(getResult.data),
                );

                // NEW PAGE 3
                newPages = [
                    {
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                ];
                expectedCreatedPages = [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                ];

                createResult = PageTable.createPages({ newPages, db });
                getResult = PageTable.getPages({ db });

                expect(createResult.success).toBe(true);
                expect(trimAndSort(createResult.data)).toEqual([
                    expectedCreatedPages[2],
                ]);
                expect(addFirstPage(expectedCreatedPages)).toEqual(
                    trimAndSort(getResult.data),
                );
            });

            it("should insert new pages into the database at the same time", () => {
                const newPages: NewPageArgs[] = [
                    { start_beat: 12, is_subset: false },
                    { start_beat: 10, is_subset: true },
                    {
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                ];
                const expectedCreatedPages: PageTable.DatabasePage[] = [
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });
                const getResult = PageTable.getPages({ db });

                expect(createResult.success).toBe(true);
                expect(trimAndSort(createResult.data)).toEqual(
                    trimAndSort(expectedCreatedPages),
                );
                expect(trimAndSort(getResult.data)).toEqual(
                    addFirstPage(expectedCreatedPages),
                );
            });

            it("should insert new pages into the middle of the database at the same time", () => {
                let newPages: NewPageArgs[] = [
                    { start_beat: 12, is_subset: false },
                    { start_beat: 10, is_subset: true },
                    {
                        start_beat: 16,
                        is_subset: false,

                        notes: "jeff notes",
                    },
                ];
                let expectedCreatedPages: PageTable.DatabasePage[] = [
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                ];

                let createResult = PageTable.createPages({ newPages, db });
                let getResult = PageTable.getPages({ db });

                expect(createResult.success).toBe(true);
                let trimmedCreateData = createResult.data.map((page: any) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                    };
                });
                let trimmedGetData = getResult.data.map((page: any) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                    };
                });
                expect(sort(trimmedCreateData)).toEqual(
                    sort(expectedCreatedPages),
                );
                expect(sort(trimmedGetData)).toEqual(
                    addFirstPage(sort(expectedCreatedPages)),
                );

                // NEW PAGES IN MIDDLE
                newPages = [
                    { start_beat: 13, is_subset: false },
                    { start_beat: 11, is_subset: true },
                    {
                        start_beat: 9,
                        is_subset: false,
                        notes: "jeff notes 2",
                    },
                ];
                expectedCreatedPages = [
                    {
                        id: 6,
                        start_beat: 9,
                        is_subset: false,
                        notes: "jeff notes 2",
                    },
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                    {
                        id: 5,
                        start_beat: 11,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 4,
                        start_beat: 13,
                        is_subset: false,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                ];

                createResult = PageTable.createPages({ newPages, db });
                getResult = PageTable.getPages({ db });

                expect(createResult.success).toBe(true);
                trimmedCreateData = createResult.data.map((page: any) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                    };
                });
                trimmedGetData = getResult.data.map((page: any) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                    };
                });
                const expectedCreated = [
                    expectedCreatedPages[0],
                    expectedCreatedPages[2],
                    expectedCreatedPages[3],
                ];
                expect(sort(trimmedCreateData)).toEqual(sort(expectedCreated));
                expect(sort(trimmedGetData)).toEqual(
                    addFirstPage(sort(expectedCreatedPages)),
                );
            });

            it("should also create marcherPages when marchers exist in the database", () => {
                const marchers: NewMarcherArgs[] = [
                    {
                        name: "jeff",
                        section: "brass",
                        drill_prefix: "B",
                        drill_order: 1,
                    },
                    {
                        name: "ana",
                        section: "brass",
                        drill_prefix: "B",
                        drill_order: 2,
                    },
                    {
                        name: "qwerty",
                        section: "wood",
                        drill_prefix: "W",
                        drill_order: 3,
                    },
                    {
                        name: "pal",
                        section: "brass",
                        drill_prefix: "B",
                        drill_order: 4,
                    },
                ];
                const createMarchersResponse = MarcherTable.createMarchers({
                    newMarchers: marchers,
                    db,
                });
                expect(createMarchersResponse.success).toBe(true);
                let allMarcherPages = () =>
                    MarcherPageTable.getMarcherPages({ db });
                expect(allMarcherPages().data.length).toBe(4);

                const newPages: NewPageArgs[] = [
                    { start_beat: 12, is_subset: false },
                    { start_beat: 10, is_subset: true },
                    {
                        start_beat: 16,
                        is_subset: false,

                        notes: "jeff notes",
                    },
                ];
                const expectedCreatedPages: PageTable.DatabasePage[] = [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });

                expect(createResult.success).toBe(true);
                const trimmedCreateData = createResult.data.map((page: any) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                    };
                });
                expect(sort(trimmedCreateData)).toEqual(
                    sort(expectedCreatedPages),
                );

                const marcherPages = MarcherPageTable.getMarcherPages({ db });
                expect(marcherPages.success).toBe(true);
                const marcherPagesMap = new Map<number, MarcherPage>(
                    marcherPages.data.map((marcherPage) => [
                        marcherPage.id,
                        marcherPage,
                    ]),
                );

                // Check that there is a marcherPage for every marcher and page combination
                for (const marcher of createMarchersResponse.data) {
                    for (const page of createResult.data) {
                        const marcherPage = marcherPages.data.find(
                            (marcherPage) =>
                                marcherPage.page_id === page.id &&
                                marcherPage.marcher_id === marcher.id,
                        );
                        expect(marcherPage).toBeDefined();
                        if (!marcherPage) continue;
                        // Check that the marcherPage is in the map
                        expect(marcherPagesMap.has(marcherPage.id)).toBe(true);
                        // Remove the marcherPage from the map
                        marcherPagesMap.delete(marcherPage.id);
                    }
                }
                expect(marcherPagesMap.size).toBe(4);
            });
        });

        describe("updatePages", () => {
            it("updates multiple pages", () => {
                const newPages: NewPageArgs[] = [
                    {
                        start_beat: 8,
                        is_subset: true,

                        notes: "do not touch",
                    },
                    {
                        start_beat: 12,
                        is_subset: false,

                        notes: "notes jeff",
                    },
                    { start_beat: 10, is_subset: true },
                    {
                        start_beat: 16,
                        is_subset: false,

                        notes: "jeff notes",
                    },
                ];
                const expectedCreatedPages: PageTable.DatabasePage[] = [
                    {
                        id: 4,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                    {
                        id: 2,
                        start_beat: 12,
                        is_subset: false,
                        notes: "notes jeff",
                    },
                    {
                        id: 3,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 1,
                        start_beat: 8,
                        is_subset: true,
                        notes: "do not touch",
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });

                expect(createResult.success).toBe(true);
                expect(trimAndSort(createResult.data)).toEqual(
                    sort(expectedCreatedPages),
                );

                const updatedPages: PageTable.ModifiedPageArgs[] = [
                    {
                        id: 1,
                        start_beat: 15,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 11,
                        is_subset: false,
                        notes: "new note",
                    },
                    {
                        id: 4,
                    },
                ];

                const expectedUpdatedPages: PageTable.DatabasePage[] = [
                    {
                        id: 1,
                        start_beat: 15,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 11,
                        is_subset: false,
                        notes: "new note",
                    },
                    {
                        id: 4,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                ];
                const expectedAllPages: PageTable.DatabasePage[] = [
                    ...expectedUpdatedPages,
                    expectedCreatedPages.find((page) => page.id === 3)!,
                ];

                const updateResult = PageTable.updatePages({
                    modifiedPages: updatedPages,
                    db,
                });
                expect(updateResult.success).toBe(true);
                const trimmedUpdateData = updateResult.data.map((page: any) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                    };
                });
                expect(sort(trimmedUpdateData)).toEqual(
                    sort(expectedUpdatedPages),
                );

                const allPages = PageTable.getPages({ db });
                expect(allPages.success).toBe(true);
                const trimmedAllData = allPages.data.map((page: any) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                    };
                });
                expect(sort(trimmedAllData)).toEqual(
                    addFirstPage(sort(expectedAllPages)),
                );
            });

            it("should not update values if it is undefined in the updatedPageArgs", () => {
                const newPages: NewPageArgs[] = [
                    { start_beat: 12, is_subset: true },
                    { start_beat: 10, is_subset: true },
                    {
                        start_beat: 16,
                        is_subset: true,

                        notes: "jeff notes",
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });
                expect(createResult.success).toBe(true);
                expect(createResult.data.length).toBe(3);

                const updatedPage: PageTable.ModifiedPageArgs = {
                    id: 3,
                };

                const updateResult = PageTable.updatePages({
                    modifiedPages: [updatedPage],
                    db,
                });
                expect(updateResult.success).toBe(true);
                expect(updateResult.data.length).toBe(1);

                const updatedPageResult = updateResult.data[0];
                expect(updatedPageResult.id).toBe(3);
                expect(updatedPageResult.notes).toBe("jeff notes");
                expect(updatedPageResult.start_beat).toBe(16); // Should update
                expect(updatedPageResult.is_subset).toBe(true); // Should update
            });
        });

        it("should fail to create pages with duplicate start_beat values", () => {
            const newPages: NewPageArgs[] = [
                { start_beat: 12, is_subset: true },
                { start_beat: 12, is_subset: false }, // Duplicate start_beat
            ];

            const createResult = PageTable.createPages({ newPages, db });
            expect(createResult.success).toBe(false);
            expect(createResult.error).toBeDefined();
        });

        it("should fail to update page with existing start_beat value", () => {
            const newPages: NewPageArgs[] = [
                { start_beat: 12, is_subset: true },
                { start_beat: 14, is_subset: true },
            ];

            const createResult = PageTable.createPages({ newPages, db });
            expect(createResult.success).toBe(true);

            const updatedPage: PageTable.ModifiedPageArgs = {
                id: 2,
                start_beat: 12, // Trying to update to existing start_beat
            };

            const updateResult = PageTable.updatePages({
                modifiedPages: [updatedPage],
                db,
            });
            expect(updateResult.success).toBe(false);
            expect(updateResult.error).toBeDefined();
        });

        describe("deletePage", () => {
            it("should delete a page by id from the database", async () => {
                const newPages: NewPageArgs[] = [
                    {
                        start_beat: 16,
                        is_subset: false,

                        notes: "jeff notes",
                    },
                    { start_beat: 10, is_subset: true },
                    { start_beat: 12, is_subset: false },
                ];
                const expectedCreatedPages = [
                    {
                        id: 1,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 3,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });
                const getResult = PageTable.getPages({ db });

                expect(createResult.success).toBe(true);
                expect(trimAndSort(getResult.data)).toEqual(
                    addFirstPage(sort(expectedCreatedPages)),
                );

                let expectedDeletedPage = {
                    id: 2,
                    start_beat: 10,
                    is_subset: true,
                    notes: null,
                };
                let expectedPages = [
                    {
                        id: 1,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                    {
                        id: 3,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                ];
                const deletePageResponse = PageTable.deletePages({
                    pageIds: new Set<number>([2]),
                    db,
                });
                expect(deletePageResponse.success).toBe(true);
                const trimmedDeleteData = deletePageResponse.data.map(
                    (page: any) => {
                        const { created_at, updated_at, ...rest } = page;
                        return {
                            ...rest,
                            notes: rest.notes ? rest.notes : null,
                        };
                    },
                );
                expect(trimmedDeleteData).toEqual([expectedDeletedPage]);
                const allPages = PageTable.getPages({ db });
                expect(allPages.success).toBe(true);
                expect(trimAndSort(allPages.data)).toEqual(
                    addFirstPage(expectedPages),
                );
            });
            it("should delete multiple pages by id from the database", async () => {
                const newPages: NewPageArgs[] = [
                    { start_beat: 12, is_subset: false },
                    { start_beat: 10, is_subset: true },
                    {
                        start_beat: 16,
                        is_subset: false,

                        notes: "jeff notes",
                    },
                    { start_beat: 13, is_subset: true },
                    {
                        start_beat: 14,
                        is_subset: false,

                        notes: "bad notes",
                    },
                    {
                        start_beat: 11,
                        is_subset: true,

                        notes: "nice notes",
                    },
                ];

                const expectedCreatedPages = [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                    {
                        id: 4,
                        start_beat: 13,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 5,
                        start_beat: 14,
                        is_subset: false,
                        notes: "bad notes",
                    },
                    {
                        id: 6,
                        start_beat: 11,
                        is_subset: true,
                        notes: "nice notes",
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });
                expect(createResult.success).toBe(true);
                expect(trimData(createResult.data)).toEqual(
                    sort(expectedCreatedPages),
                );

                const expectedDeletedPages = [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                    {
                        id: 4,
                        start_beat: 13,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 6,
                        start_beat: 11,
                        is_subset: true,
                        notes: "nice notes",
                    },
                ];
                const expectedPages = [
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 5,
                        start_beat: 14,
                        is_subset: false,
                        notes: "bad notes",
                    },
                ];
                const deletePageResponse = PageTable.deletePages({
                    pageIds: new Set<number>([1, 3, 4, 6]),
                    db,
                });
                expect(deletePageResponse.success).toBe(true);
                expect(trimData(deletePageResponse.data)).toEqual(
                    trimData(expectedDeletedPages),
                );
                const allPages = PageTable.getPages({ db });
                expect(allPages.success).toBe(true);
                expect(trimAndSort(allPages.data)).toEqual(
                    addFirstPage(expectedPages),
                );
            });

            it("should delete pages and their associated marcherPages", () => {
                const marchers: NewMarcherArgs[] = [
                    {
                        name: "jeff",
                        section: "brass",
                        drill_prefix: "B",
                        drill_order: 1,
                    },
                    {
                        name: "ana",
                        section: "brass",
                        drill_prefix: "B",
                        drill_order: 2,
                    },
                    {
                        name: "qwerty",
                        section: "wood",
                        drill_prefix: "W",
                        drill_order: 3,
                    },
                    {
                        name: "pal",
                        section: "brass",
                        drill_prefix: "B",
                        drill_order: 4,
                    },
                ];
                const createMarchersResponse = MarcherTable.createMarchers({
                    newMarchers: marchers,
                    db,
                });
                expect(createMarchersResponse.success).toBe(true);
                expect(createMarchersResponse.data.length).toBe(4);
                const expectMarcherPagesLengthToBe = (length: number) => {
                    const marcherPages = MarcherPageTable.getMarcherPages({
                        db,
                    });
                    expect(marcherPages.success).toBe(true);
                    expect(marcherPages.data.length).toBe(length + 4);
                };
                expectMarcherPagesLengthToBe(0);

                const newPages: NewPageArgs[] = [
                    { start_beat: 12, is_subset: false },
                    { start_beat: 10, is_subset: true },
                    {
                        start_beat: 16,
                        is_subset: false,

                        notes: "jeff notes",
                    },
                    { start_beat: 4, is_subset: true },
                    {
                        start_beat: 14,
                        is_subset: false,

                        notes: "bad notes",
                    },
                    {
                        start_beat: 9,
                        is_subset: true,

                        notes: "nice notes",
                    },
                ];

                const expectedCreatedPages = [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                    {
                        id: 4,
                        start_beat: 4,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 5,
                        start_beat: 14,
                        is_subset: false,
                        notes: "bad notes",
                    },
                    {
                        id: 6,
                        start_beat: 9,
                        is_subset: true,
                        notes: "nice notes",
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });
                expect(createResult.success).toBe(true);
                expect(trimData(createResult.data)).toEqual(
                    sort(expectedCreatedPages),
                );

                expectMarcherPagesLengthToBe(
                    expectedCreatedPages.length * marchers.length,
                );

                const expectedDeletedPages = [
                    {
                        id: 1,
                        start_beat: 12,
                        is_subset: false,
                        notes: null,
                    },
                    {
                        id: 3,
                        start_beat: 16,
                        is_subset: false,
                        notes: "jeff notes",
                    },
                    {
                        id: 4,
                        start_beat: 4,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 6,
                        start_beat: 9,
                        is_subset: true,
                        notes: "nice notes",
                    },
                ];
                const expectedPages = [
                    {
                        id: 2,
                        start_beat: 10,
                        is_subset: true,
                        notes: null,
                    },
                    {
                        id: 5,
                        start_beat: 14,
                        is_subset: false,
                        notes: "bad notes",
                    },
                ];
                const deletePageResponse = PageTable.deletePages({
                    pageIds: new Set<number>([1, 3, 4, 6]),
                    db,
                });
                expect(deletePageResponse.success).toBe(true);
                expect(trimData(deletePageResponse.data)).toEqual(
                    trimData(expectedDeletedPages),
                );
                const allPages = PageTable.getPages({ db });
                expect(allPages.success).toBe(true);
                expect(trimAndSort(allPages.data)).toEqual(
                    addFirstPage(expectedPages),
                );

                expectMarcherPagesLengthToBe(
                    marchers.length * expectedPages.length,
                );
                const marcherPages = MarcherPageTable.getMarcherPages({ db });
                const marcherPagesMap = new Map<number, MarcherPage>(
                    marcherPages.data.map((marcherPage) => [
                        marcherPage.id,
                        marcherPage,
                    ]),
                );
                // Check that there is a marcherPage for every marcher and page combination
                for (const marcher of createMarchersResponse.data) {
                    for (const page of allPages.data) {
                        const marcherPage = marcherPages.data.find(
                            (marcherPage) =>
                                marcherPage.page_id === page.id &&
                                marcherPage.marcher_id === marcher.id,
                        );
                        expect(marcherPage).toBeDefined();
                        if (!marcherPage) continue;
                        // Check that the marcherPage is in the map
                        expect(marcherPagesMap.has(marcherPage.id)).toBe(true);
                        // Remove the marcherPage from the map
                        marcherPagesMap.delete(marcherPage.id);
                    }
                }
                expect(marcherPagesMap.size).toBe(0);
            });
        });
    });

    describe("undo/redo", () => {
        let db: Database.Database;
        const sort = (
            items: PageTable.DatabasePage[],
        ): PageTable.DatabasePage[] => {
            // Create a map to access items by their id
            const beats = getBeats({ db });
            const beatMap = new Map<number, DatabaseBeat>(
                beats.data.map((beat) => [beat.id, beat]),
            );

            return items.sort((a, b) => {
                const aBeat = beatMap.get(a.start_beat);
                const bBeat = beatMap.get(b.start_beat);
                if (!aBeat || !bBeat) {
                    console.log("aBeat", a.start_beat, aBeat);
                    console.log("bBeat", b.start_beat, bBeat);
                    throw new Error(
                        `Beat not found: ${a.start_beat} ${aBeat} - ${b.start_beat} ${bBeat}`,
                    );
                }
                return aBeat!.position - bBeat!.position;
            });
        };

        beforeEach(() => {
            db = initTestDatabase();
        });
        describe("CreatePages", () => {
            describe("without any marchers", () => {
                it("should undo and redo a single created page correctly", () => {
                    const newPage: NewPageArgs = {
                        start_beat: 12,
                        is_subset: false,
                    };

                    // Create a new page
                    const createResult = PageTable.createPages({
                        newPages: [newPage],
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(1);

                    const createdPage = createResult.data[0];
                    expect(createdPage.start_beat).toBe(12);
                    expect(createdPage.is_subset).toBe(false);

                    // Undo the creation
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the page is no longer in the database
                    const getPagesAfterUndo = PageTable.getPages({ db });
                    expect(getPagesAfterUndo.success).toBe(true);
                    expect(getPagesAfterUndo.data.length).toBe(1);

                    // Redo the creation
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the page is back in the database
                    const getPagesAfterRedo = PageTable.getPages({ db });
                    expect(getPagesAfterRedo.success).toBe(true);
                    expect(getPagesAfterRedo.data.length).toBe(2);
                    const redonePage = sort(getPagesAfterRedo.data)[1];
                    expect(redonePage.start_beat).toBe(12);
                    expect(redonePage.is_subset).toBe(false);

                    // Undo the creation again
                    const undoResult2 = History.performUndo(db);
                    expect(undoResult2.success).toBe(true);

                    // Verify the page is no longer in the database
                    const getPagesAfterUndo2 = PageTable.getPages({ db });
                    expect(getPagesAfterUndo2.success).toBe(true);
                    expect(getPagesAfterUndo2.data.length).toBe(1);
                });

                it("should undo and redo multiple created pages correctly", () => {
                    const newPages: NewPageArgs[] = [
                        {
                            start_beat: 16,
                            is_subset: false,

                            notes: "jeff notes",
                        },
                        { start_beat: 10, is_subset: true },
                        { start_beat: 12, is_subset: false },
                    ];

                    // Create new pages
                    const createResult = PageTable.createPages({
                        newPages,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(3);

                    const createdPages = createResult.data.sort(
                        (a, b) => a.id - b.id,
                    );
                    expect(createdPages[0].start_beat).toBe(16);
                    expect(createdPages[0].is_subset).toBe(false);
                    expect(createdPages[0].notes).toBe("jeff notes");
                    expect(createdPages[1].start_beat).toBe(10);
                    expect(createdPages[1].is_subset).toBe(true);
                    expect(createdPages[2].start_beat).toBe(12);
                    expect(createdPages[2].is_subset).toBe(false);

                    // Undo the creation
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the pages are no longer in the database
                    const getPagesAfterUndo = PageTable.getPages({ db });
                    expect(getPagesAfterUndo.success).toBe(true);
                    expect(getPagesAfterUndo.data.length).toBe(1);

                    // Redo the creation
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the pages are back in the database
                    const getPagesAfterRedo = PageTable.getPages({ db });
                    expect(getPagesAfterRedo.success).toBe(true);
                    expect(getPagesAfterRedo.data.length).toBe(4);
                    const redonePages = getPagesAfterRedo.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    );
                    expect(redonePages[0].start_beat).toBe(16);
                    expect(redonePages[0].is_subset).toBe(false);
                    expect(redonePages[0].notes).toBe("jeff notes");
                    expect(redonePages[1].start_beat).toBe(10);
                    expect(redonePages[1].is_subset).toBe(true);
                    expect(redonePages[2].start_beat).toBe(12);
                    expect(redonePages[2].is_subset).toBe(false);

                    // Undo the creation again
                    const undoResult2 = History.performUndo(db);
                    expect(undoResult2.success).toBe(true);

                    // Verify the pages are no longer in the database
                    const getPagesAfterUndo2 = PageTable.getPages({ db });
                    expect(getPagesAfterUndo2.success).toBe(true);
                    expect(getPagesAfterUndo2.data.length).toBe(1);
                });

                it("can undo, redo, and undo the creation of multiple pages while other pages exist in the database", () => {
                    const existingPages: NewPageArgs[] = [
                        { start_beat: 5, is_subset: false },
                        { start_beat: 8, is_subset: true },
                    ];

                    // Create existing pages
                    const createExistingResult = PageTable.createPages({
                        newPages: existingPages,
                        db,
                    });
                    expect(createExistingResult.success).toBe(true);
                    expect(createExistingResult.data.length).toBe(2);

                    const newPages: NewPageArgs[] = [
                        {
                            start_beat: 16,
                            is_subset: false,

                            notes: "jeff notes",
                        },
                        { start_beat: 10, is_subset: true },
                        { start_beat: 12, is_subset: false },
                    ];

                    // Create new pages
                    const createResult = PageTable.createPages({
                        newPages,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(3);

                    const createdPages = createResult.data.sort(
                        (a, b) => a.id - b.id,
                    );
                    expect(createdPages[0].start_beat).toBe(16);
                    expect(createdPages[0].is_subset).toBe(false);
                    expect(createdPages[0].notes).toBe("jeff notes");
                    expect(createdPages[1].start_beat).toBe(10);
                    expect(createdPages[1].is_subset).toBe(true);
                    expect(createdPages[2].start_beat).toBe(12);
                    expect(createdPages[2].is_subset).toBe(false);

                    // Undo the creation
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the new pages are no longer in the database
                    const getPagesAfterUndo = PageTable.getPages({ db });
                    expect(getPagesAfterUndo.success).toBe(true);
                    expect(getPagesAfterUndo.data.length).toBe(3);

                    // Redo the creation
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the new pages are back in the database
                    const getPagesAfterRedo = PageTable.getPages({ db });
                    expect(getPagesAfterRedo.success).toBe(true);
                    expect(getPagesAfterRedo.data.length).toBe(6);
                    const redonePages = getPagesAfterRedo.data
                        .filter((p) => p.id !== PageTable.FIRST_PAGE_ID)
                        .slice(2);
                    expect(redonePages[0].start_beat).toBe(16);
                    expect(redonePages[0].is_subset).toBe(false);
                    expect(redonePages[0].notes).toBe("jeff notes");
                    expect(redonePages[1].start_beat).toBe(10);
                    expect(redonePages[1].is_subset).toBe(true);
                    expect(redonePages[2].start_beat).toBe(12);
                    expect(redonePages[2].is_subset).toBe(false);

                    // Undo the creation again
                    const undoResult2 = History.performUndo(db);
                    expect(undoResult2.success).toBe(true);

                    // Verify the new pages are no longer in the database again
                    const getPagesAfterUndo2 = PageTable.getPages({ db });
                    expect(getPagesAfterUndo2.success).toBe(true);
                    expect(getPagesAfterUndo2.data.length).toBe(3);
                });
            });
            describe("with marchers", () => {
                it("should undo, redo, and undo the creation of a single page and the associated marcher pages when 3 marchers exist", () => {
                    const marchers: NewMarcherArgs[] = [
                        {
                            name: "jeff",
                            section: "brass",
                            drill_prefix: "B",
                            drill_order: 1,
                        },
                        {
                            name: "ana",
                            section: "brass",
                            drill_prefix: "B",
                            drill_order: 2,
                        },
                        {
                            name: "qwerty",
                            section: "wood",
                            drill_prefix: "W",
                            drill_order: 3,
                        },
                    ];

                    // Create marchers
                    const createMarchersResponse = MarcherTable.createMarchers({
                        newMarchers: marchers,
                        db,
                    });
                    expect(createMarchersResponse.success).toBe(true);
                    expect(createMarchersResponse.data.length).toBe(3);

                    const newPage: NewPageArgs = {
                        start_beat: 12,
                        is_subset: false,
                    };

                    // Create a new page
                    const createResult = PageTable.createPages({
                        newPages: [newPage],
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(1);

                    const createdPage = createResult.data[0];
                    expect(createdPage.start_beat).toBe(12);
                    expect(createdPage.is_subset).toBe(false);

                    // Verify marcher pages are created
                    const marcherPages = MarcherPageTable.getMarcherPages({
                        db,
                    });
                    expect(marcherPages.success).toBe(true);
                    expect(marcherPages.data.length).toBe(6);

                    // Undo the creation
                    const undoResult = History.performUndo(db);
                    // History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the page and marcher pages are no longer in the database
                    const getPagesAfterUndo = PageTable.getPages({ db });
                    expect(getPagesAfterUndo.success).toBe(true);
                    expect(getPagesAfterUndo.data.length).toBe(1);

                    const marcherPagesAfterUndo =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterUndo.success).toBe(true);
                    expect(marcherPagesAfterUndo.data.length).toBe(3);

                    // Redo the creation
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the page and marcher pages are back in the database
                    const getPagesAfterRedo = PageTable.getPages({ db });
                    expect(getPagesAfterRedo.success).toBe(true);
                    expect(getPagesAfterRedo.data.length).toBe(2);
                    const redonePage = getPagesAfterRedo.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    )[0];
                    expect(redonePage.start_beat).toBe(12);
                    expect(redonePage.is_subset).toBe(false);

                    const marcherPagesAfterRedo =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterRedo.success).toBe(true);
                    expect(marcherPagesAfterRedo.data.length).toBe(6);

                    // Undo the creation again
                    const undoResult2 = History.performUndo(db);
                    expect(undoResult2.success).toBe(true);

                    // Verify the page and marcher pages are no longer in the database again
                    const getPagesAfterUndo2 = PageTable.getPages({ db });
                    expect(getPagesAfterUndo2.success).toBe(true);
                    expect(
                        getPagesAfterUndo2.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(0);

                    const marcherPagesAfterUndo2 =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterUndo2.success).toBe(true);
                    expect(marcherPagesAfterUndo2.data.length).toBe(3);
                });

                it("should undo, redo, and undo the creation of multiple pages and the associated marcher pages when 3 marchers exist", () => {
                    const marchers: NewMarcherArgs[] = [
                        {
                            name: "jeff",
                            section: "brass",
                            drill_prefix: "B",
                            drill_order: 1,
                        },
                        {
                            name: "ana",
                            section: "brass",
                            drill_prefix: "B",
                            drill_order: 2,
                        },
                        {
                            name: "qwerty",
                            section: "wood",
                            drill_prefix: "W",
                            drill_order: 3,
                        },
                    ];

                    // Create marchers
                    const createMarchersResponse = MarcherTable.createMarchers({
                        newMarchers: marchers,
                        db,
                    });
                    expect(createMarchersResponse.success).toBe(true);
                    expect(createMarchersResponse.data.length).toBe(3);

                    const newPages: NewPageArgs[] = [
                        {
                            start_beat: 16,
                            is_subset: false,

                            notes: "jeff notes",
                        },
                        { start_beat: 10, is_subset: true },
                        { start_beat: 12, is_subset: false },
                    ];

                    // Create new pages
                    const createResult = PageTable.createPages({
                        newPages,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(3);

                    const createdPages = createResult.data.sort(
                        (a, b) => a.id - b.id,
                    );
                    expect(createdPages[0].start_beat).toBe(16);
                    expect(createdPages[0].is_subset).toBe(false);
                    expect(createdPages[0].notes).toBe("jeff notes");
                    expect(createdPages[1].start_beat).toBe(10);
                    expect(createdPages[1].is_subset).toBe(true);
                    expect(createdPages[2].start_beat).toBe(12);
                    expect(createdPages[2].is_subset).toBe(false);

                    // Verify marcher pages are created
                    const marcherPages = MarcherPageTable.getMarcherPages({
                        db,
                    });
                    expect(marcherPages.success).toBe(true);
                    expect(marcherPages.data.length).toBe(12);

                    // Undo the creation
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the pages and marcher pages are no longer in the database
                    const getPagesAfterUndo = PageTable.getPages({ db });
                    expect(getPagesAfterUndo.success).toBe(true);
                    expect(getPagesAfterUndo.data.length).toBe(1);

                    const marcherPagesAfterUndo =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterUndo.success).toBe(true);
                    expect(marcherPagesAfterUndo.data.length).toBe(3);

                    // Redo the creation
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the pages and marcher pages are back in the database
                    const getPagesAfterRedo = PageTable.getPages({ db });
                    expect(getPagesAfterRedo.success).toBe(true);
                    expect(
                        getPagesAfterRedo.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(3);
                    const redonePages = getPagesAfterRedo.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    );
                    expect(redonePages[0].start_beat).toBe(16);
                    expect(redonePages[0].is_subset).toBe(false);
                    expect(redonePages[0].notes).toBe("jeff notes");
                    expect(redonePages[1].start_beat).toBe(10);
                    expect(redonePages[1].is_subset).toBe(true);
                    expect(redonePages[2].start_beat).toBe(12);
                    expect(redonePages[2].is_subset).toBe(false);

                    const marcherPagesAfterRedo =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterRedo.success).toBe(true);
                    expect(marcherPagesAfterRedo.data.length).toBe(12);

                    // Undo the creation again
                    const undoResult2 = History.performUndo(db);
                    expect(undoResult2.success).toBe(true);

                    // Verify the pages and marcher pages are no longer in the database again
                    const getPagesAfterUndo2 = PageTable.getPages({ db });
                    expect(getPagesAfterUndo2.success).toBe(true);
                    expect(
                        getPagesAfterUndo2.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(0);

                    const marcherPagesAfterUndo2 =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterUndo2.success).toBe(true);
                    expect(marcherPagesAfterUndo2.data.length).toBe(3);
                });
            });
        });

        describe("updatePages", () => {
            it("can undo, redo, and undo the updating of a single page", () => {
                const newPage: NewPageArgs = {
                    start_beat: 12,
                    is_subset: false,
                    notes: null,
                };

                // Create a new page
                const createResult = PageTable.createPages({
                    newPages: [newPage],
                    db,
                });
                expect(createResult.success).toBe(true);
                expect(createResult.data.length).toBe(1);

                const createdPage = createResult.data[0];
                expect(createdPage.start_beat).toBe(12);
                expect(createdPage.is_subset).toBe(false);

                // Update the page
                const updatedPage: PageTable.ModifiedPageArgs = {
                    id: createdPage.id,
                    start_beat: 15,
                    is_subset: true,
                    notes: "updated notes",
                };

                const updateResult = PageTable.updatePages({
                    modifiedPages: [updatedPage],
                    db,
                });
                expect(updateResult.success).toBe(true);
                expect(updateResult.data.length).toBe(1);

                const updatedPageResult = updateResult.data[0];
                expect(updatedPageResult.start_beat).toBe(15);
                expect(updatedPageResult.is_subset).toBe(true);
                expect(updatedPageResult.notes).toBe("updated notes");

                // Undo the update
                const undoResult = History.performUndo(db);
                expect(undoResult.success).toBe(true);

                // Verify the page is reverted to its original state
                const getPagesAfterUndo = PageTable.getPages({ db });
                expect(getPagesAfterUndo.success).toBe(true);
                expect(getPagesAfterUndo.data.length).toBe(2);
                const revertedPage = getPagesAfterUndo.data.filter(
                    (p) => p.id !== PageTable.FIRST_PAGE_ID,
                )[0];
                expect(revertedPage.start_beat).toBe(12);
                expect(revertedPage.is_subset).toBe(false);
                expect(revertedPage.notes).toBeNull();

                // Redo the update
                const redoResult = History.performRedo(db);
                expect(redoResult.success).toBe(true);

                // Verify the page is updated again
                const getPagesAfterRedo = PageTable.getPages({ db });
                expect(getPagesAfterRedo.success).toBe(true);
                expect(
                    getPagesAfterRedo.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    ).length,
                ).toBe(1);
                const redonePage = getPagesAfterRedo.data.filter(
                    (p) => p.id !== PageTable.FIRST_PAGE_ID,
                )[0];
                expect(redonePage.start_beat).toBe(15);
                expect(redonePage.is_subset).toBe(true);
                expect(redonePage.notes).toBe("updated notes");

                // Undo the update again
                const undoResult2 = History.performUndo(db);
                expect(undoResult2.success).toBe(true);

                // Verify the page is reverted to its original state again
                const getPagesAfterUndo2 = PageTable.getPages({ db });
                expect(getPagesAfterUndo2.success).toBe(true);
                expect(
                    getPagesAfterUndo2.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    ).length,
                ).toBe(1);
                const revertedPage2 = getPagesAfterUndo2.data.filter(
                    (p) => p.id !== PageTable.FIRST_PAGE_ID,
                )[0];
                expect(revertedPage2.start_beat).toBe(12);
                expect(revertedPage2.is_subset).toBe(false);
                expect(revertedPage2.notes).toBeNull();
            });
            it("can undo, redo, and undo the updating of multiple pages at once", () => {
                const newPages: NewPageArgs[] = [
                    {
                        start_beat: 16,
                        is_subset: false,

                        notes: "jeff notes",
                    },
                    { start_beat: 10, is_subset: true },
                    { start_beat: 12, is_subset: false },
                ];

                // Create new pages
                const createResult = PageTable.createPages({
                    newPages,
                    db,
                });
                expect(createResult.success).toBe(true);
                expect(createResult.data.length).toBe(3);

                const createdPages = createResult.data.sort(
                    (a, b) => a.id - b.id,
                );

                // Update the pages
                const updatedPages: PageTable.ModifiedPageArgs[] = [
                    {
                        id: createdPages[0].id,
                        start_beat: 15,
                        is_subset: true,
                        notes: "updated notes 1",
                    },
                    {
                        id: createdPages[1].id,
                        start_beat: 11,
                        is_subset: false,
                        notes: "updated notes 2",
                    },
                    {
                        id: createdPages[2].id,
                        start_beat: 8,
                        is_subset: true,
                        notes: "updated notes 3",
                    },
                ];

                const updateResult = PageTable.updatePages({
                    modifiedPages: updatedPages,
                    db,
                });
                expect(updateResult.success).toBe(true);
                expect(updateResult.data.length).toBe(3);

                const updatedPageResults = updateResult.data.sort(
                    (a, b) => a.id - b.id,
                );
                expect(updatedPageResults[0].start_beat).toBe(15);
                expect(updatedPageResults[0].is_subset).toBe(true);
                expect(updatedPageResults[0].notes).toBe("updated notes 1");
                expect(updatedPageResults[1].start_beat).toBe(11);
                expect(updatedPageResults[1].is_subset).toBe(false);
                expect(updatedPageResults[1].notes).toBe("updated notes 2");
                expect(updatedPageResults[2].start_beat).toBe(8);
                expect(updatedPageResults[2].is_subset).toBe(true);
                expect(updatedPageResults[2].notes).toBe("updated notes 3");

                // Undo the updates
                const undoResult = History.performUndo(db);
                expect(undoResult.success).toBe(true);

                // Verify the pages are reverted to their original state
                const getPagesAfterUndo = PageTable.getPages({ db });
                expect(getPagesAfterUndo.success).toBe(true);
                expect(getPagesAfterUndo.data.length).toBe(4);
                const revertedPages = getPagesAfterUndo.data.filter(
                    (p) => p.id !== PageTable.FIRST_PAGE_ID,
                );
                expect(revertedPages[0].start_beat).toBe(16);
                expect(revertedPages[0].is_subset).toBe(false);
                expect(revertedPages[0].notes).toBe("jeff notes");
                expect(revertedPages[1].start_beat).toBe(10);
                expect(revertedPages[1].is_subset).toBe(true);
                expect(revertedPages[1].notes).toBeNull();
                expect(revertedPages[2].start_beat).toBe(12);
                expect(revertedPages[2].is_subset).toBe(false);
                expect(revertedPages[2].notes).toBeNull();

                // Redo the updates
                const redoResult = History.performRedo(db);
                expect(redoResult.success).toBe(true);

                // Verify the pages are updated again
                const getPagesAfterRedo = PageTable.getPages({ db });
                expect(getPagesAfterRedo.success).toBe(true);
                expect(
                    getPagesAfterRedo.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    ).length,
                ).toBe(3);
                const redonePages = getPagesAfterRedo.data.filter(
                    (p) => p.id !== PageTable.FIRST_PAGE_ID,
                );
                expect(redonePages[0].start_beat).toBe(15);
                expect(redonePages[0].is_subset).toBe(true);
                expect(redonePages[0].notes).toBe("updated notes 1");
                expect(redonePages[1].start_beat).toBe(11);
                expect(redonePages[1].is_subset).toBe(false);
                expect(redonePages[1].notes).toBe("updated notes 2");
                expect(redonePages[2].start_beat).toBe(8);
                expect(redonePages[2].is_subset).toBe(true);
                expect(redonePages[2].notes).toBe("updated notes 3");

                // Undo the updates again
                const undoResult2 = History.performUndo(db);
                expect(undoResult2.success).toBe(true);

                // Verify the pages are reverted to their original state again
                const getPagesAfterUndo2 = PageTable.getPages({ db });
                expect(getPagesAfterUndo2.success).toBe(true);
                expect(
                    getPagesAfterUndo2.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    ).length,
                ).toBe(3);
                const revertedPages2 = getPagesAfterUndo2.data.filter(
                    (p) => p.id !== PageTable.FIRST_PAGE_ID,
                );
                expect(revertedPages2[0].start_beat).toBe(16);
                expect(revertedPages2[0].is_subset).toBe(false);
                expect(revertedPages2[0].notes).toBe("jeff notes");
                expect(revertedPages2[1].start_beat).toBe(10);
                expect(revertedPages2[1].is_subset).toBe(true);
                expect(revertedPages2[1].notes).toBeNull();
                expect(revertedPages2[2].start_beat).toBe(12);
                expect(revertedPages2[2].is_subset).toBe(false);
                expect(revertedPages2[2].notes).toBeNull();
            });
        });

        describe("deletePages", () => {
            describe("without any marchers", () => {
                it("should undo, redo, and undo a single page being deleted", () => {
                    const newPage: NewPageArgs = {
                        start_beat: 12,
                        is_subset: false,
                        notes: "jeff notes",
                    };

                    // Create a new page
                    const createResult = PageTable.createPages({
                        newPages: [newPage],
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(1);

                    const createdPage = createResult.data[0];
                    expect(createdPage.start_beat).toBe(12);
                    expect(createdPage.is_subset).toBe(false);

                    // Delete the page
                    const deleteResult = PageTable.deletePages({
                        pageIds: new Set<number>([createdPage.id]),
                        db,
                    });
                    expect(deleteResult.success).toBe(true);
                    expect(deleteResult.data.length).toBe(1);

                    const deletedPage = deleteResult.data[0];
                    expect(deletedPage.id).toBe(createdPage.id);

                    // Undo the deletion
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the page is back in the database
                    const getPagesAfterUndo = PageTable.getPages({ db });
                    expect(getPagesAfterUndo.success).toBe(true);
                    expect(getPagesAfterUndo.data.length).toBe(2);
                    const undonePage = getPagesAfterUndo.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    )[0];
                    expect(undonePage.start_beat).toBe(12);
                    expect(undonePage.is_subset).toBe(false);

                    // Redo the deletion
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the page is deleted again
                    const getPagesAfterRedo = PageTable.getPages({ db });
                    expect(getPagesAfterRedo.success).toBe(true);
                    expect(
                        getPagesAfterRedo.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(0);

                    // Undo the deletion again
                    const undoResult2 = History.performUndo(db);
                    expect(undoResult2.success).toBe(true);

                    // Verify the page is back in the database again
                    const getPagesAfterUndo2 = PageTable.getPages({ db });
                    expect(getPagesAfterUndo2.success).toBe(true);
                    expect(
                        getPagesAfterUndo2.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(1);
                    const undonePage2 = getPagesAfterUndo2.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    )[0];
                    expect(undonePage2.start_beat).toBe(12);
                    expect(undonePage2.is_subset).toBe(false);
                });

                it("should undo, redo, and undo multiple pages being deleted", () => {
                    const newPages: NewPageArgs[] = [
                        { start_beat: 12, is_subset: false },
                        { start_beat: 10, is_subset: true },
                        {
                            start_beat: 16,
                            is_subset: false,

                            notes: "jeff notes",
                        },
                    ];

                    // Create new pages
                    const createResult = PageTable.createPages({
                        newPages,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(3);

                    const createdPages = createResult.data;

                    // Delete the pages
                    const deleteResult = PageTable.deletePages({
                        pageIds: new Set<number>(
                            createdPages.map((page) => page.id),
                        ),
                        db,
                    });
                    expect(deleteResult.success).toBe(true);
                    expect(deleteResult.data.length).toBe(3);

                    const deletedPages = deleteResult.data;
                    expect(deletedPages.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );

                    // Undo the deletion
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the pages are back in the database
                    const getPagesAfterUndo = PageTable.getPages({ db });
                    expect(getPagesAfterUndo.success).toBe(true);
                    expect(getPagesAfterUndo.data.length).toBe(4);
                    const undonePages = getPagesAfterUndo.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    );
                    expect(undonePages.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );

                    // Redo the deletion
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the pages are deleted again
                    const getPagesAfterRedo = PageTable.getPages({ db });
                    expect(getPagesAfterRedo.success).toBe(true);
                    expect(
                        getPagesAfterRedo.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(0);

                    // Undo the deletion again
                    const undoResult2 = History.performUndo(db);
                    expect(undoResult2.success).toBe(true);

                    // Verify the pages are back in the database again
                    const getPagesAfterUndo2 = PageTable.getPages({ db });
                    expect(getPagesAfterUndo2.success).toBe(true);
                    expect(
                        getPagesAfterUndo2.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(3);
                    const undonePages2 = getPagesAfterUndo2.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    );
                    expect(undonePages2.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );
                });

                it("should undo, redo, and undo multiple pages being deleted while other pages already exist", () => {
                    const existingPages: NewPageArgs[] = [
                        { start_beat: 5, is_subset: false },
                        { start_beat: 8, is_subset: true },
                    ];

                    // Create existing pages
                    const createExistingResult = PageTable.createPages({
                        newPages: existingPages,
                        db,
                    });
                    expect(createExistingResult.success).toBe(true);
                    expect(createExistingResult.data.length).toBe(2);

                    const newPages: NewPageArgs[] = [
                        { start_beat: 12, is_subset: false },
                        { start_beat: 10, is_subset: true },
                        {
                            start_beat: 16,
                            is_subset: false,

                            notes: "jeff notes",
                        },
                    ];

                    // Create new pages
                    const createResult = PageTable.createPages({
                        newPages,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(3);

                    const createdPages = createResult.data;

                    // Delete the new pages
                    const deleteResult = PageTable.deletePages({
                        pageIds: new Set<number>(
                            createdPages.map((page) => page.id),
                        ),
                        db,
                    });
                    expect(deleteResult.success).toBe(true);
                    expect(deleteResult.data.length).toBe(3);

                    const deletedPages = deleteResult.data;
                    expect(deletedPages.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );

                    // Undo the deletion
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the new pages are back in the database
                    const getPagesAfterUndo = PageTable.getPages({ db });
                    expect(getPagesAfterUndo.success).toBe(true);
                    expect(getPagesAfterUndo.data.length).toBe(6);
                    const undonePages = getPagesAfterUndo.data
                        .filter((p) => p.id !== PageTable.FIRST_PAGE_ID)
                        .slice(2);
                    expect(undonePages.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );

                    // Redo the deletion
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the new pages are deleted again
                    const getPagesAfterRedo = PageTable.getPages({ db });
                    expect(getPagesAfterRedo.success).toBe(true);
                    expect(
                        getPagesAfterRedo.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(2);

                    // Undo the deletion again
                    const undoResult2 = History.performUndo(db);
                    expect(undoResult2.success).toBe(true);

                    // Verify the new pages are back in the database again
                    const getPagesAfterUndo2 = PageTable.getPages({ db });
                    expect(getPagesAfterUndo2.success).toBe(true);
                    expect(
                        getPagesAfterUndo2.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(5);
                    const undonePages2 = getPagesAfterUndo2.data
                        .filter((p) => p.id !== PageTable.FIRST_PAGE_ID)
                        .slice(2);
                    expect(undonePages2.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );
                });
            });

            describe("with marchers", () => {
                it("should undo, redo, and undo the deletion of multiple pages and their MarcherPages when marchers exist", () => {
                    const marchers: NewMarcherArgs[] = [
                        {
                            name: "jeff",
                            section: "brass",
                            drill_prefix: "B",
                            drill_order: 1,
                        },
                        {
                            name: "ana",
                            section: "brass",
                            drill_prefix: "B",
                            drill_order: 2,
                        },
                        {
                            name: "qwerty",
                            section: "wood",
                            drill_prefix: "W",
                            drill_order: 3,
                        },
                    ];

                    // Create marchers
                    const createMarchersResponse = MarcherTable.createMarchers({
                        newMarchers: marchers,
                        db,
                    });
                    expect(createMarchersResponse.success).toBe(true);
                    expect(createMarchersResponse.data.length).toBe(3);

                    const newPages: NewPageArgs[] = [
                        { start_beat: 12, is_subset: false },
                        { start_beat: 10, is_subset: true },
                        {
                            start_beat: 16,
                            is_subset: false,

                            notes: "jeff notes",
                        },
                    ];

                    // Create new pages
                    const createResult = PageTable.createPages({
                        newPages,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(3);

                    const createdPages = createResult.data;

                    // Verify marcher pages are created
                    const marcherPages = MarcherPageTable.getMarcherPages({
                        db,
                    });
                    expect(marcherPages.success).toBe(true);
                    expect(marcherPages.data.length).toBe(12);

                    // Delete the pages
                    const deleteResult = PageTable.deletePages({
                        pageIds: new Set<number>(
                            createdPages.map((page) => page.id),
                        ),
                        db,
                    });
                    expect(deleteResult.success).toBe(true);
                    expect(deleteResult.data.length).toBe(3);

                    const deletedPages = deleteResult.data;
                    expect(deletedPages.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );

                    // Verify marcher pages are deleted
                    const marcherPagesAfterDelete =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterDelete.success).toBe(true);
                    expect(marcherPagesAfterDelete.data.length).toBe(3);

                    // Undo the deletion
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the pages and marcher pages are back in the database
                    const getPagesAfterUndo = PageTable.getPages({ db });
                    expect(getPagesAfterUndo.success).toBe(true);
                    expect(
                        getPagesAfterUndo.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(3);
                    const undonePages = getPagesAfterUndo.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    );
                    expect(undonePages.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );

                    const marcherPagesAfterUndo =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterUndo.success).toBe(true);
                    expect(marcherPagesAfterUndo.data.length).toBe(12);

                    // Redo the deletion
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the pages and marcher pages are deleted again
                    const getPagesAfterRedo = PageTable.getPages({ db });
                    expect(getPagesAfterRedo.success).toBe(true);
                    expect(
                        getPagesAfterRedo.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(0);

                    const marcherPagesAfterRedo =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterRedo.success).toBe(true);
                    expect(marcherPagesAfterRedo.data.length).toBe(3);

                    // Undo the deletion again
                    const undoResult2 = History.performUndo(db);
                    expect(undoResult2.success).toBe(true);

                    // Verify the pages and marcher pages are back in the database again
                    const getPagesAfterUndo2 = PageTable.getPages({ db });
                    expect(getPagesAfterUndo2.success).toBe(true);
                    expect(
                        getPagesAfterUndo2.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(3);
                    const undonePages2 = getPagesAfterUndo2.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    );
                    expect(undonePages2.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );

                    const marcherPagesAfterUndo2 =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterUndo2.success).toBe(true);
                    expect(marcherPagesAfterUndo2.data.length).toBe(12);
                });

                it("should undo, redo, and undo the deletion of multiple pages and their MarcherPages when marchers and pages exist", () => {
                    const marchers: NewMarcherArgs[] = [
                        {
                            name: "jeff",
                            section: "brass",
                            drill_prefix: "B",
                            drill_order: 1,
                        },
                        {
                            name: "ana",
                            section: "brass",
                            drill_prefix: "B",
                            drill_order: 2,
                        },
                        {
                            name: "qwerty",
                            section: "wood",
                            drill_prefix: "W",
                            drill_order: 3,
                        },
                    ];

                    // Create marchers
                    const createMarchersResponse = MarcherTable.createMarchers({
                        newMarchers: marchers,
                        db,
                    });
                    expect(createMarchersResponse.success).toBe(true);
                    expect(createMarchersResponse.data.length).toBe(3);

                    const newPages: NewPageArgs[] = [
                        { start_beat: 12, is_subset: false },
                        { start_beat: 10, is_subset: true },
                        {
                            start_beat: 16,
                            is_subset: false,

                            notes: "jeff notes",
                        },
                    ];

                    // Create new pages
                    const createResult = PageTable.createPages({
                        newPages,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(3);

                    const createdPages = createResult.data;

                    // Verify marcher pages are created
                    const marcherPages = MarcherPageTable.getMarcherPages({
                        db,
                    });
                    expect(marcherPages.success).toBe(true);
                    expect(marcherPages.data.length).toBe(12);

                    // Delete the pages
                    const deleteResult = PageTable.deletePages({
                        pageIds: new Set<number>(
                            createdPages.map((page) => page.id),
                        ),
                        db,
                    });
                    expect(deleteResult.success).toBe(true);
                    expect(deleteResult.data.length).toBe(3);

                    const deletedPages = deleteResult.data;
                    expect(deletedPages.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );

                    // Verify marcher pages are deleted
                    const marcherPagesAfterDelete =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterDelete.success).toBe(true);
                    expect(marcherPagesAfterDelete.data.length).toBe(3);

                    // Undo the deletion
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the pages and marcher pages are back in the database
                    const getPagesAfterUndo = PageTable.getPages({ db });
                    expect(getPagesAfterUndo.success).toBe(true);
                    expect(
                        getPagesAfterUndo.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(3);
                    const undonePages = getPagesAfterUndo.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    );
                    expect(undonePages.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );

                    const marcherPagesAfterUndo =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterUndo.success).toBe(true);
                    expect(marcherPagesAfterUndo.data.length).toBe(12);

                    // Redo the deletion
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the pages and marcher pages are deleted again
                    const getPagesAfterRedo = PageTable.getPages({ db });
                    expect(getPagesAfterRedo.success).toBe(true);
                    expect(
                        getPagesAfterRedo.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(0);

                    const marcherPagesAfterRedo =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterRedo.success).toBe(true);
                    expect(marcherPagesAfterRedo.data.length).toBe(3);

                    // Undo the deletion again
                    const undoResult2 = History.performUndo(db);
                    expect(undoResult2.success).toBe(true);

                    // Verify the pages and marcher pages are back in the database again
                    const getPagesAfterUndo2 = PageTable.getPages({ db });
                    expect(getPagesAfterUndo2.success).toBe(true);
                    expect(
                        getPagesAfterUndo2.data.filter(
                            (p) => p.id !== PageTable.FIRST_PAGE_ID,
                        ).length,
                    ).toBe(3);
                    const undonePages2 = getPagesAfterUndo2.data.filter(
                        (p) => p.id !== PageTable.FIRST_PAGE_ID,
                    );
                    expect(undonePages2.map((page) => page.id).sort()).toEqual(
                        createdPages.map((page) => page.id).sort(),
                    );

                    const marcherPagesAfterUndo2 =
                        MarcherPageTable.getMarcherPages({ db });
                    expect(marcherPagesAfterUndo2.success).toBe(true);
                    expect(marcherPagesAfterUndo2.data.length).toBe(12);
                });
            });
        });
    });

    describe("generatePageNames", () => {
        it('should generate a list with just "0" when input is empty', () => {
            const result = generatePageNames([]);
            expect(result).toEqual(["0"]);
        });

        it("should generate sequential page numbers for non-subset pages", () => {
            const result = generatePageNames([false, false, false, false]);
            expect(result).toEqual(["0", "1", "2", "3"]);
        });

        it("should generate alphabetical subsets when encountering true values", () => {
            const result = generatePageNames([false, true, true, false]);
            expect(result).toEqual(["0", "0A", "0B", "1"]);
        });

        it("should handle example case from documentation", () => {
            const result = generatePageNames([
                false,
                false,
                true,
                false,
                true,
                true,
                false,
            ]);
            expect(result).toEqual(["0", "1", "1A", "2", "2A", "2B", "3"]);
        });

        it("should handle case where first page is subset", () => {
            const result = generatePageNames([
                true,
                true,
                true,
                false,
                true,
                true,
                false,
            ]);
            // First page always evaluate to false
            expect(result).toEqual(["0", "0A", "0B", "1", "1A", "1B", "2"]);
        });

        it("should handle multiple consecutive subset sequences", () => {
            const result = generatePageNames([
                false, // 0
                true, // 0A
                true, // 0B
                false, // 1
                false, // 2
                true, // 2A
                true, // 2B
                true, // 2C
                false, // 3
            ]);
            expect(result).toEqual([
                "0",
                "0A",
                "0B",
                "1",
                "2",
                "2A",
                "2B",
                "2C",
                "3",
            ]);
        });

        it('should ignore the first boolean and always start with "0"', () => {
            // Test documentation note: "the first page will always evaluate to false no matter what is provided"
            const result = generatePageNames([true, false, false]);
            expect(result).toEqual(["0", "1", "2"]);
        });

        it("should handle many consecutive subsets with correct lettering", () => {
            const isSubsetArr = [
                false, // 0
                true, // 0A
                true, // 0B
                true, // 0C
                true, // 0D
                true, // 0E
                true, // 0F
                true, // 0G
            ];
            const result = generatePageNames(isSubsetArr);
            expect(result).toEqual([
                "0",
                "0A",
                "0B",
                "0C",
                "0D",
                "0E",
                "0F",
                "0G",
            ]);
        });

        it("should handle alphabetical rollover from Z to AA", () => {
            // Create an array with 27 true values to force rollover (A-Z then AA)
            const isSubsetArr = [false, ...Array(27).fill(true)];
            const result = generatePageNames(isSubsetArr);

            // Expected: ['0', '0A', '0B', ..., '0Z', '0AA']
            expect(result.length).toBe(28);
            expect(result[0]).toBe("0");
            expect(result[26]).toBe("0Z");
            expect(result[27]).toBe("0AA");
        });

        it("should handle mixed sequences of pages and subsets", () => {
            const result = generatePageNames([
                false, // 0
                false, // 1
                true, // 1A
                false, // 2
                true, // 2A
                false, // 3
                false, // 4
                true, // 4A
                true, // 4B
                true, // 4C
            ]);
            expect(result).toEqual([
                "0",
                "1",
                "1A",
                "2",
                "2A",
                "3",
                "4",
                "4A",
                "4B",
                "4C",
            ]);
        });

        it("should handle subset letters wrapping from Z to AA", () => {
            // Create array with many consecutive true values
            const isSubsetArr = Array(56).fill(true);
            isSubsetArr.push(false); // Add a non-subset page
            isSubsetArr[0] = false; // First page is non-subset

            const result = generatePageNames(isSubsetArr);

            // Check Z to AA transition
            expect(result[26]).toBe("0Z");
            expect(result[27]).toBe("0AA");
            expect(result[53]).toBe("0BA");
            expect(result[54]).toBe("0BB");
            expect(result[56]).toBe("1");
        });
    });

    describe("fromDatabasePages", () => {
        it("should return an empty array when no database pages are provided", () => {
            const result = PageTable.fromDatabasePages({
                databasePages: [],
                allMeasures: [],
                allBeats: [],
            });

            expect(result).toEqual([]);
        });

        it("should convert database pages to Page objects with correct properties", () => {
            // Mock data
            const mockBeats: Beat[] = [
                {
                    id: 1,
                    position: 0,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
                {
                    id: 2,
                    position: 1,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
                {
                    id: 3,
                    position: 2,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
                {
                    id: 4,
                    position: 3,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
            ];

            const mockMeasures: Measure[] = [
                {
                    id: 1,
                    number: 1,
                    startBeat: { id: 1, position: 0 } as Beat,
                    beats: [mockBeats[0], mockBeats[1]],
                } as Measure,
                {
                    id: 2,
                    number: 2,
                    startBeat: { id: 3, position: 2 } as Beat,
                    beats: [mockBeats[2], mockBeats[3]],
                } as Measure,
            ];

            const mockDatabasePages: PageTable.DatabasePage[] = [
                { id: 1, start_beat: 1, is_subset: false, notes: "First page" },
                {
                    id: 2,
                    start_beat: 3,
                    is_subset: false,
                    notes: "Second page",
                },
            ];

            const result = PageTable.fromDatabasePages({
                databasePages: mockDatabasePages,
                allMeasures: mockMeasures,
                allBeats: mockBeats,
            });

            // Assertions
            expect(result).toHaveLength(2);

            // First page
            expect(result[0].id).toBe(1);
            expect(result[0].name).toBe("0");
            expect(result[0].counts).toBe(2);
            expect(result[0].notes).toBe("First page");
            expect(result[0].order).toBe(0);
            expect(result[0].isSubset).toBe(false);
            expect(result[0].duration).toBe(2000);
            expect(result[0].beats).toHaveLength(2);
            expect(result[0].measures).toHaveLength(1);
            expect(result[0].previousPageId).toBeNull();
            expect(result[0].nextPageId).toBe(2);

            // Second page
            expect(result[1].id).toBe(2);
            expect(result[1].name).toBe("1");
            expect(result[1].counts).toBe(2);
            expect(result[1].notes).toBe("Second page");
            expect(result[1].order).toBe(1);
            expect(result[1].isSubset).toBe(false);
            expect(result[1].duration).toBe(2000);
            expect(result[1].beats).toHaveLength(2);
            expect(result[1].measures).toHaveLength(1);
            expect(result[1].previousPageId).toBe(1);
            expect(result[1].nextPageId).toBeNull();
        });

        it("should handle subset pages correctly", () => {
            // Mock data
            const mockBeats: Beat[] = [
                {
                    id: 1,
                    position: 0,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                } satisfies Beat,
                {
                    id: 2,
                    position: 1,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                } satisfies Beat,
                {
                    id: 3,
                    position: 2,
                    duration: 1000,
                    includeInMeasure: true,
                    notes: null,
                } satisfies Beat,
            ];

            const mockMeasures: Measure[] = [
                {
                    id: 1,
                    number: 1,
                    startBeat: { id: 1, position: 0 } as Beat,
                    beats: [mockBeats[0], mockBeats[1], mockBeats[2]],
                    counts: 3,
                    notes: null,
                    rehearsalMark: null,
                    duration: 3000,
                } satisfies Measure,
            ];

            const mockDatabasePages: PageTable.DatabasePage[] = [
                { id: 1, start_beat: 1, is_subset: false, notes: "Main page" },
                { id: 2, start_beat: 3, is_subset: true, notes: "Subset page" },
            ];

            const result = PageTable.fromDatabasePages({
                databasePages: mockDatabasePages,
                allMeasures: mockMeasures,
                allBeats: mockBeats,
            });

            // Assertions for page names
            expect(result[0].name).toBe("0");
            expect(result[0].counts).toBe(2);
            expect(result[0].measureBeatToStartOn).toBe(1);
            expect(result[0].measureBeatToEndOn).toBe(2);
            expect(result[0].measures).toEqual(mockMeasures);
            expect(result[0].beats).toEqual([mockBeats[0], mockBeats[1]]);
            expect(result[0].isSubset).toBe(false);

            expect(result[1].name).toBe("0A");
            expect(result[1].counts).toBe(1);
            expect(result[1].measureBeatToStartOn).toBe(3);
            expect(result[1].measureBeatToEndOn).toBe(3);
            expect(result[1].measures).toEqual(mockMeasures);
            expect(result[1].beats).toEqual([mockBeats[2]]);
            expect(result[1].isSubset).toBe(true);
        });

        it("should handle pages that span multiple measures", () => {
            // Mock data
            const mockBeats: Beat[] = [
                {
                    id: 1,
                    position: 0,
                    duration: 1000,
                    count: 1,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
                {
                    id: 2,
                    position: 1,
                    duration: 1000,
                    count: 2,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
                {
                    id: 3,
                    position: 2,
                    duration: 1000,
                    count: 3,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
                {
                    id: 4,
                    position: 3,
                    duration: 1000,
                    count: 4,
                    includeInMeasure: true,
                    notes: null,
                } as Beat,
            ];

            const mockMeasures: Measure[] = [
                {
                    id: 1,
                    number: 1,
                    startBeat: { id: 1, position: 0 } as Beat,
                    beats: [mockBeats[0], mockBeats[1]],
                } as Measure,
                {
                    id: 2,
                    number: 2,
                    startBeat: { id: 3, position: 2 } as Beat,
                    beats: [mockBeats[2], mockBeats[3]],
                } as Measure,
            ];

            const mockDatabasePages: PageTable.DatabasePage[] = [
                {
                    id: 1,
                    start_beat: 1,
                    is_subset: false,
                    notes: "Page spanning measures",
                },
            ];

            const result = PageTable.fromDatabasePages({
                databasePages: mockDatabasePages,
                allMeasures: mockMeasures,
                allBeats: mockBeats,
            });

            // Assertions
            expect(result[0].measures).toHaveLength(2);
            expect(result[0].measures[0].id).toBe(1);
            expect(result[0].measures[1].id).toBe(2);
            expect(result[0].duration).toBe(4000); // Sum of all beat durations
        });
    });

    describe.skip("error handling", () => {
        /* This needs to make sure that when there is an error during creation, updating, or deletion,
            the changes are rolled back, the redo table doesn't have those actions in it, and no other data
            is affected by accident
            */
    });
});
