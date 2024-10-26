import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import * as PageTable from "../PageTable";
import * as MarcherTable from "../MarcherTable";
import * as MarcherPageTable from "../MarcherPageTable";
import * as History from "../../database.history";
import { ModifiedPageArgs, NewPageArgs } from "@/global/classes/Page";
import { NewMarcherArgs } from "@/global/classes/Marcher";
import MarcherPage from "@/global/classes/MarcherPage";
import Constants from "@/global/Constants";

const sorter = (a: any, b: any) => a.id - b.id;
const trimData = (data: any[]) =>
    data.map((page: any) => {
        const { created_at, updated_at, ...rest } = page;
        return { ...rest, notes: rest.notes ? rest.notes : null };
    });

it("passes", () => {
    expect(true).toBe(true);
});

describe("PageTable", () => {
    describe("createPageTable", () => {
        let db: Database.Database;

        beforeEach(() => {
            db = new Database(":memory:");
            History.createHistoryTables(db);
        });

        it("should create the page table if it does not exist", () => {
            // Expect the page table to not exist
            let tableInfo = db
                .prepare(`PRAGMA table_info(${Constants.PageTableName})`)
                .all() as { name: string }[];
            expect(tableInfo.length).toBe(0);
            const triggerSpy = vi.spyOn(History, "createUndoTriggers");
            const createTableResponse = PageTable.createPageTable(db);
            expect(createTableResponse.success).toBeTruthy();

            // Expect the page table to be created
            tableInfo = db
                .prepare(`PRAGMA table_info(${Constants.PageTableName})`)
                .all() as { name: string }[];
            const expectedColumns = [
                "id",
                "is_subset",
                "next_page_id",
                "notes",
                "counts",
                "created_at",
                "updated_at",
            ];
            const columnNames = tableInfo.map((column) => column.name);
            expect(columnNames.sort()).toEqual(expectedColumns.sort());

            expect(triggerSpy).toHaveBeenCalledWith(
                db,
                Constants.PageTableName
            );
        });

        it("should log an error if table creation fails", () => {
            const error = new Error("Test error");
            const prepareSpy = vi
                .spyOn(db, "prepare")
                .mockImplementation(() => {
                    throw error;
                });
            const consoleErrorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});

            const response = PageTable.createPageTable(db);
            expect(response.success).toBeFalsy();
            expect(response.error).toEqual({
                message: error,
                stack: error.stack,
            });

            expect(prepareSpy).toHaveBeenCalled();
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "Failed to create page table:",
                error
            );
        });
    });

    describe("database interactions", () => {
        let db: Database.Database;

        beforeEach(() => {
            db = new Database(":memory:");
            History.createHistoryTables(db);
            PageTable.createPageTable(db);
            MarcherPageTable.createMarcherPageTable(db);
            MarcherTable.createMarcherTable(db);
        });

        describe("createPages", () => {
            it("should insert a new page into the database", () => {
                const newPages = [{ counts: 10, isSubset: false }];
                const expectedCreatedPages = [
                    {
                        id: 1,
                        counts: 10,
                        is_subset: false,
                        next_page_id: null,
                        notes: null,
                    },
                ];

                const result = PageTable.createPages({ newPages, db });

                expect(result.success).toBe(true);
                const trimmedData = result.data.map((page: any, index) => {
                    const { created_at, updated_at, ...rest } = page;
                    return { ...rest, id: index + 1 };
                });
                expect(trimmedData).toEqual(expectedCreatedPages);

                const allMarchers = PageTable.getPages({ db });
                expect(allMarchers.success).toBe(true);
            });

            it("should insert sequential pages into the database with previous page defined", () => {
                let newPages: NewPageArgs[] = [{ counts: 12, isSubset: false }];
                let expectedCreatedPages: PageTable.DatabasePage[] = [
                    {
                        id: 1,
                        counts: 12,
                        is_subset: false,
                        next_page_id: null,
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
                let trimmedGetData = getResult.data.map((page: any, index) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                        id: index + 1,
                    };
                });
                expect(trimmedCreateData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort((page: any) => page.id)
                );
                expect(trimmedGetData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort((page: any) => page.id)
                );

                // NEW PAGE 2
                newPages = [
                    {
                        counts: 10,
                        isSubset: true,
                        previousPageId: 1,
                    },
                ];
                expectedCreatedPages = [
                    {
                        id: 1,
                        counts: 12,
                        is_subset: false,
                        next_page_id: 2,
                        notes: null,
                    },
                    {
                        id: 2,
                        counts: 10,
                        is_subset: true,
                        next_page_id: null,
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
                trimmedGetData = getResult.data.map((page: any, index) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                        id: index + 1,
                    };
                });
                expect(trimmedCreateData).toEqual([expectedCreatedPages[1]]);
                expect(trimmedGetData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort((page: any) => page.id)
                );

                // NEW PAGE 3
                newPages = [
                    {
                        counts: 16,
                        isSubset: false,
                        previousPageId: 2,
                        notes: "jeff notes",
                    },
                ];
                expectedCreatedPages = [
                    {
                        id: 1,
                        counts: 12,
                        is_subset: false,
                        next_page_id: 2,
                        notes: null,
                    },
                    {
                        id: 2,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 3,
                        notes: null,
                    },
                    {
                        id: 3,
                        counts: 16,
                        is_subset: false,
                        next_page_id: null,
                        notes: "jeff notes",
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
                trimmedGetData = getResult.data.map((page: any, index) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                        id: index + 1,
                    };
                });
                expect(trimmedCreateData).toEqual([expectedCreatedPages[2]]);
                expect(trimmedGetData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort((page: any) => page.id)
                );
            });

            it("should insert new pages at the start of the database with no previous page defined", () => {
                let newPages: NewPageArgs[] = [{ counts: 12, isSubset: false }];
                let expectedCreatedPages: PageTable.DatabasePage[] = [
                    {
                        id: 1,
                        counts: 12,
                        is_subset: false,
                        next_page_id: null,
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
                let trimmedGetData = getResult.data.map((page: any, index) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                        id: index + 1,
                    };
                });
                expect(trimmedCreateData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort((page: any) => page.id)
                );
                expect(trimmedGetData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort((page: any) => page.id)
                );

                // NEW PAGE 2
                newPages = [
                    {
                        counts: 10,
                        isSubset: true,
                    },
                ];
                expectedCreatedPages = [
                    {
                        id: 1,
                        counts: 12,
                        is_subset: false,
                        next_page_id: null,
                        notes: null,
                    },
                    {
                        id: 2,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 1,
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
                trimmedGetData = getResult.data.map((page: any, index) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                        id: index + 1,
                    };
                });
                expect(trimmedCreateData).toEqual([expectedCreatedPages[1]]);
                expect(trimmedGetData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort((page: any) => page.id)
                );

                // NEW PAGE 3
                newPages = [
                    {
                        counts: 16,
                        isSubset: false,
                        notes: "jeff notes",
                    },
                ];
                expectedCreatedPages = [
                    {
                        id: 1,
                        counts: 12,
                        is_subset: false,
                        next_page_id: null,
                        notes: null,
                    },
                    {
                        id: 2,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 1,
                        notes: null,
                    },
                    {
                        id: 3,
                        counts: 16,
                        is_subset: false,
                        next_page_id: 2,
                        notes: "jeff notes",
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
                trimmedGetData = getResult.data.map((page: any, index) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                        id: index + 1,
                    };
                });
                expect(trimmedCreateData).toEqual([expectedCreatedPages[2]]);
                expect(trimmedGetData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort((page: any) => page.id)
                );
            });

            it("should insert new pages into the database at the same time", () => {
                const newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false },
                    { counts: 10, isSubset: true },
                    { counts: 16, isSubset: false, notes: "jeff notes" },
                ];
                const expectedCreatedPages = [
                    {
                        id: 1,
                        counts: 16,
                        is_subset: false,
                        next_page_id: null,
                        notes: "jeff notes",
                    },
                    {
                        id: 2,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 1,
                        notes: null,
                    },
                    {
                        id: 3,
                        counts: 12,
                        is_subset: false,
                        next_page_id: 2,
                        notes: null,
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });
                const getResult = PageTable.getPages({ db });

                expect(createResult.success).toBe(true);
                const trimmedCreateData = createResult.data.map((page: any) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                    };
                });
                const trimmedGetData = getResult.data.map((page: any) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                    };
                });
                expect(trimmedCreateData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort(sorter)
                );
                expect(trimmedGetData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort(sorter)
                );
            });

            it("should insert new pages into the middle of the database at the same time", () => {
                let newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false },
                    { counts: 10, isSubset: true },
                    { counts: 16, isSubset: false, notes: "jeff notes" },
                ];
                let expectedCreatedPages: PageTable.DatabasePage[] = [
                    {
                        id: 1,
                        counts: 16,
                        is_subset: false,
                        next_page_id: null,
                        notes: "jeff notes",
                    },
                    {
                        id: 2,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 1,
                        notes: null,
                    },
                    {
                        id: 3,
                        counts: 12,
                        is_subset: false,
                        next_page_id: 2,
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
                expect(trimmedCreateData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort(sorter)
                );
                expect(trimmedGetData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort(sorter)
                );

                // NEW PAGES IN MIDDLE
                newPages = [
                    { counts: 13, isSubset: false, previousPageId: 2 },
                    { counts: 11, isSubset: true, previousPageId: 2 },
                    {
                        counts: 17,
                        isSubset: false,
                        notes: "jeff notes 2",
                        previousPageId: 1,
                    },
                ];
                expectedCreatedPages = [
                    {
                        id: 4,
                        counts: 17,
                        is_subset: false,
                        next_page_id: null,
                        notes: "jeff notes 2",
                    },
                    {
                        id: 1,
                        counts: 16,
                        is_subset: false,
                        next_page_id: 4,
                        notes: "jeff notes",
                    },
                    {
                        id: 5,
                        counts: 11,
                        is_subset: true,
                        next_page_id: 1,
                        notes: null,
                    },
                    {
                        id: 6,
                        counts: 13,
                        is_subset: false,
                        next_page_id: 5,
                        notes: null,
                    },
                    {
                        id: 2,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 6,
                        notes: null,
                    },
                    {
                        id: 3,
                        counts: 12,
                        is_subset: false,
                        next_page_id: 2,
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
                expect(trimmedCreateData.sort(sorter)).toEqual(
                    expectedCreated.sort(sorter)
                );
                expect(trimmedGetData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort(sorter)
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
                expect(allMarcherPages().data.length).toBe(0);

                const newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false },
                    { counts: 10, isSubset: true },
                    { counts: 16, isSubset: false, notes: "jeff notes" },
                ];
                const expectedCreatedPages = [
                    {
                        id: 1,
                        counts: 16,
                        is_subset: false,
                        next_page_id: null,
                        notes: "jeff notes",
                    },
                    {
                        id: 2,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 1,
                        notes: null,
                    },
                    {
                        id: 3,
                        counts: 12,
                        is_subset: false,
                        next_page_id: 2,
                        notes: null,
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
                expect(trimmedCreateData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort(sorter)
                );

                const marcherPages = MarcherPageTable.getMarcherPages({ db });
                expect(marcherPages.success).toBe(true);
                const marcherPagesMap = new Map<number, MarcherPage>(
                    marcherPages.data.map((marcherPage) => [
                        marcherPage.id,
                        marcherPage,
                    ])
                );

                // Check that there is a marcherPage for every marcher and page combination
                for (const marcher of createMarchersResponse.data) {
                    for (const page of createResult.data) {
                        const marcherPage = marcherPages.data.find(
                            (marcherPage) =>
                                marcherPage.page_id === page.id &&
                                marcherPage.marcher_id === marcher.id
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

        it("updates multiple pages", () => {
            const newPages: NewPageArgs[] = [
                { counts: 32, isSubset: true, notes: "do not touch" },
                { counts: 12, isSubset: false, notes: "notes jeff" },
                { counts: 10, isSubset: true },
                { counts: 16, isSubset: false, notes: "jeff notes" },
            ];
            const expectedCreatedPages = [
                {
                    id: 1,
                    counts: 16,
                    is_subset: false,
                    next_page_id: null,
                    notes: "jeff notes",
                },
                {
                    id: 2,
                    counts: 10,
                    is_subset: true,
                    next_page_id: 1,
                    notes: null,
                },
                {
                    id: 3,
                    counts: 12,
                    is_subset: false,
                    next_page_id: 2,
                    notes: "notes jeff",
                },
                {
                    id: 4,
                    counts: 32,
                    is_subset: true,
                    next_page_id: 3,
                    notes: "do not touch",
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
            expect(trimmedCreateData.sort(sorter)).toEqual(
                expectedCreatedPages.sort(sorter)
            );

            const updatedPages: ModifiedPageArgs[] = [
                {
                    id: 1,
                    counts: 17,
                    is_subset: true,
                    notes: null,
                },
                {
                    id: 2,
                    counts: 11,
                    is_subset: false,
                    notes: "new note",
                },
                {
                    id: 3,
                },
            ];

            const expectedUpdatedPages = [
                {
                    id: 1,
                    counts: 17,
                    is_subset: true,
                    next_page_id: null,
                    notes: null,
                },
                {
                    id: 2,
                    counts: 11,
                    is_subset: false,
                    next_page_id: 1,
                    notes: "new note",
                },
                {
                    id: 3,
                    counts: 12,
                    is_subset: false,
                    next_page_id: 2,
                    notes: "notes jeff",
                },
            ];
            const expectedAllPages = [
                ...expectedUpdatedPages,
                expectedCreatedPages[3],
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
            expect(trimmedUpdateData.sort(sorter)).toEqual(
                expectedUpdatedPages.sort(sorter)
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
            expect(trimmedAllData.sort(sorter)).toEqual(
                expectedAllPages.sort(sorter)
            );
        });

        describe("deletePage", () => {
            it("should delete a page by id from the database", async () => {
                const newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false },
                    { counts: 10, isSubset: true },
                    { counts: 16, isSubset: false, notes: "jeff notes" },
                ];
                const expectedCreatedPages = [
                    {
                        id: 1,
                        counts: 16,
                        is_subset: false,
                        next_page_id: null,
                        notes: "jeff notes",
                    },
                    {
                        id: 2,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 1,
                        notes: null,
                    },
                    {
                        id: 3,
                        counts: 12,
                        is_subset: false,
                        next_page_id: 2,
                        notes: null,
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });
                const getResult = PageTable.getPages({ db });

                expect(createResult.success).toBe(true);
                const trimmedGetData = getResult.data.map((page: any) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                    };
                });
                expect(trimmedGetData.sort(sorter)).toEqual(
                    expectedCreatedPages.sort(sorter)
                );

                let expectedDeletedPage = {
                    id: 2,
                    counts: 10,
                    is_subset: true,
                    next_page_id: null,
                    notes: null,
                };
                let expectedPages = [
                    {
                        id: 1,
                        counts: 16,
                        is_subset: false,
                        next_page_id: null,
                        notes: "jeff notes",
                    },
                    {
                        id: 3,
                        counts: 12,
                        is_subset: false,
                        next_page_id: 1,
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
                    }
                );
                expect(trimmedDeleteData).toEqual([expectedDeletedPage]);
                const allPages = PageTable.getPages({ db });
                expect(allPages.success).toBe(true);
                const trimmedAllData = allPages.data.map((page: any) => {
                    const { created_at, updated_at, ...rest } = page;
                    return {
                        ...rest,
                        notes: rest.notes ? rest.notes : null,
                    };
                });
                expect(trimmedAllData.sort(sorter)).toEqual(expectedPages);
            });
            it("should delete multiple pages by id from the database", async () => {
                const newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false },
                    { counts: 10, isSubset: true },
                    { counts: 16, isSubset: false, notes: "jeff notes" },
                    { counts: 45, isSubset: true },
                    { counts: 14, isSubset: false, notes: "bad notes" },
                    { counts: 90, isSubset: true, notes: "nice notes" },
                ];

                const expectedCreatedPages = [
                    {
                        id: 6,
                        counts: 12,
                        is_subset: false,
                        next_page_id: 5,
                        notes: null,
                    },
                    {
                        id: 5,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 4,
                        notes: null,
                    },
                    {
                        id: 4,
                        counts: 16,
                        is_subset: false,
                        next_page_id: 3,
                        notes: "jeff notes",
                    },
                    {
                        id: 3,
                        counts: 45,
                        is_subset: true,
                        next_page_id: 2,
                        notes: null,
                    },
                    {
                        id: 2,
                        counts: 14,
                        is_subset: false,
                        next_page_id: 1,
                        notes: "bad notes",
                    },
                    {
                        id: 1,
                        counts: 90,
                        is_subset: true,
                        next_page_id: null,
                        notes: "nice notes",
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });
                expect(createResult.success).toBe(true);
                expect(trimData(createResult.data).sort(sorter)).toEqual(
                    expectedCreatedPages.sort(sorter)
                );

                const expectedDeletedPages = [
                    {
                        id: 6,
                        counts: 12,
                        is_subset: false,
                        next_page_id: null,
                        notes: null,
                    },
                    {
                        id: 4,
                        counts: 16,
                        is_subset: false,
                        next_page_id: null,
                        notes: "jeff notes",
                    },
                    {
                        id: 3,
                        counts: 45,
                        is_subset: true,
                        next_page_id: null,
                        notes: null,
                    },
                    {
                        id: 1,
                        counts: 90,
                        is_subset: true,
                        next_page_id: null,
                        notes: "nice notes",
                    },
                ];
                const expectedPages = [
                    {
                        id: 5,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 2,
                        notes: null,
                    },
                    {
                        id: 2,
                        counts: 14,
                        is_subset: false,
                        next_page_id: null,
                        notes: "bad notes",
                    },
                ];
                const deletePageResponse = PageTable.deletePages({
                    pageIds: new Set<number>([1, 3, 4, 6]),
                    db,
                });
                expect(deletePageResponse.success).toBe(true);
                expect(trimData(deletePageResponse.data).sort(sorter)).toEqual(
                    trimData(expectedDeletedPages).sort(sorter)
                );
                const allPages = PageTable.getPages({ db });
                expect(allPages.success).toBe(true);
                expect(trimData(allPages.data).sort(sorter)).toEqual(
                    expectedPages.sort(sorter)
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
                    expect(marcherPages.data.length).toBe(length);
                };
                expectMarcherPagesLengthToBe(0);

                const newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false },
                    { counts: 10, isSubset: true },
                    { counts: 16, isSubset: false, notes: "jeff notes" },
                    { counts: 45, isSubset: true },
                    { counts: 14, isSubset: false, notes: "bad notes" },
                    { counts: 90, isSubset: true, notes: "nice notes" },
                ];

                const expectedCreatedPages = [
                    {
                        id: 6,
                        counts: 12,
                        is_subset: false,
                        next_page_id: 5,
                        notes: null,
                    },
                    {
                        id: 5,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 4,
                        notes: null,
                    },
                    {
                        id: 4,
                        counts: 16,
                        is_subset: false,
                        next_page_id: 3,
                        notes: "jeff notes",
                    },
                    {
                        id: 3,
                        counts: 45,
                        is_subset: true,
                        next_page_id: 2,
                        notes: null,
                    },
                    {
                        id: 2,
                        counts: 14,
                        is_subset: false,
                        next_page_id: 1,
                        notes: "bad notes",
                    },
                    {
                        id: 1,
                        counts: 90,
                        is_subset: true,
                        next_page_id: null,
                        notes: "nice notes",
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });
                expect(createResult.success).toBe(true);
                expect(trimData(createResult.data).sort(sorter)).toEqual(
                    expectedCreatedPages.sort(sorter)
                );

                expectMarcherPagesLengthToBe(
                    expectedCreatedPages.length * marchers.length
                );

                const expectedDeletedPages = [
                    {
                        id: 6,
                        counts: 12,
                        is_subset: false,
                        next_page_id: null,
                        notes: null,
                    },
                    {
                        id: 4,
                        counts: 16,
                        is_subset: false,
                        next_page_id: null,
                        notes: "jeff notes",
                    },
                    {
                        id: 3,
                        counts: 45,
                        is_subset: true,
                        next_page_id: null,
                        notes: null,
                    },
                    {
                        id: 1,
                        counts: 90,
                        is_subset: true,
                        next_page_id: null,
                        notes: "nice notes",
                    },
                ];
                const expectedPages = [
                    {
                        id: 5,
                        counts: 10,
                        is_subset: true,
                        next_page_id: 2,
                        notes: null,
                    },
                    {
                        id: 2,
                        counts: 14,
                        is_subset: false,
                        next_page_id: null,
                        notes: "bad notes",
                    },
                ];
                const deletePageResponse = PageTable.deletePages({
                    pageIds: new Set<number>([1, 3, 4, 6]),
                    db,
                });
                expect(deletePageResponse.success).toBe(true);
                expect(trimData(deletePageResponse.data).sort(sorter)).toEqual(
                    trimData(expectedDeletedPages).sort(sorter)
                );
                const allPages = PageTable.getPages({ db });
                expect(allPages.success).toBe(true);
                expect(trimData(allPages.data).sort(sorter)).toEqual(
                    expectedPages.sort(sorter)
                );

                expectMarcherPagesLengthToBe(
                    marchers.length * expectedPages.length
                );
                const marcherPages = MarcherPageTable.getMarcherPages({ db });
                const marcherPagesMap = new Map<number, MarcherPage>(
                    marcherPages.data.map((marcherPage) => [
                        marcherPage.id,
                        marcherPage,
                    ])
                );
                // Check that there is a marcherPage for every marcher and page combination
                for (const marcher of createMarchersResponse.data) {
                    for (const page of allPages.data) {
                        const marcherPage = marcherPages.data.find(
                            (marcherPage) =>
                                marcherPage.page_id === page.id &&
                                marcherPage.marcher_id === marcher.id
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
});
