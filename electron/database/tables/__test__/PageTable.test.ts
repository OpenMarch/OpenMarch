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
const sort = (items: PageTable.DatabasePage[]): PageTable.DatabasePage[] => {
    // Create a map to access items by their id
    const itemMap = new Map<number, PageTable.DatabasePage>();
    const nextIdMap = new Map<number, number>(); // Map from id to next_page_id

    // Populate maps
    for (const item of items) {
        itemMap.set(item.id, item);
        if (item.next_page_id) {
            nextIdMap.set(item.id, item.next_page_id);
        }
    }

    // Find the starting item (it has no previous reference as next_page_id)
    const startItem = items.find(
        (item) => !Array.from(nextIdMap.values()).includes(item.id),
    );

    if (!startItem) {
        throw new Error("Could not find the start of the linked list.");
    }

    // Build the sorted list by following the `next_page_id` links
    const sortedList: PageTable.DatabasePage[] = [];
    let currentItem: PageTable.DatabasePage | undefined = startItem;

    while (currentItem) {
        sortedList.push(currentItem);
        currentItem = currentItem.next_page_id
            ? itemMap.get(currentItem.next_page_id)
            : undefined;
    }

    return sortedList;
};

const trimData = (data: any[]) =>
    data.map((page: any) => {
        const { created_at, updated_at, ...rest } = page;
        return { ...rest, notes: rest.notes ? rest.notes : null };
    });

function firstPage(nextPageId: number | null = null): PageTable.DatabasePage {
    return {
        id: 0,
        counts: 0,
        is_subset: false,
        notes: null,
        next_page_id: nextPageId,
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
                Constants.PageTableName,
            );
        });

        it("Page 1 should exist at table creation with zero counts", () => {
            const createTableResponse = PageTable.createPageTable(db);
            expect(createTableResponse.success).toBeTruthy();

            const allPages = PageTable.getPages({ db });
            expect(allPages.success).toBeTruthy();
            expect(trimData(allPages.data)).toEqual([
                {
                    id: 0,
                    is_subset: false,
                    notes: null,
                    counts: 0,
                    next_page_id: null,
                },
            ]);
        });

        it("should throw an error if table creation fails", () => {
            try {
                PageTable.createPageTable(db);
                // Should throw an error
                expect(true).toBe(false);
            } catch (error) {
                expect(true).toBe(true);
            }
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
                const newPages = [
                    { counts: 10, isSubset: false, previousPageId: 0 },
                ];
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
                let newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false, previousPageId: 0 },
                ];
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
                expect(addFirstPage(createResult.data)).toEqual(
                    addFirstPage(expectedCreatedPages),
                );
                expect(trimAndSort(getResult.data)).toEqual(
                    addFirstPage(expectedCreatedPages),
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
                expect(trimAndSort(createResult.data)).toEqual([
                    expectedCreatedPages[1],
                ]);
                expect(trimAndSort(getResult.data)).toEqual(
                    addFirstPage(expectedCreatedPages),
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
                expect(trimAndSort(createResult.data)).toEqual([
                    expectedCreatedPages[2],
                ]);
                expect(trimAndSort(getResult.data)).toEqual(
                    addFirstPage(expectedCreatedPages),
                );
            });

            it("should insert new pages at the start of the database with no previous page defined", () => {
                let newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false, previousPageId: 0 },
                ];
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
                expect(trimAndSort(createResult.data)).toEqual(
                    expectedCreatedPages,
                );
                expect(addFirstPage(createResult.data)).toEqual(
                    trimAndSort(getResult.data),
                );

                // NEW PAGE 2
                newPages = [
                    {
                        counts: 10,
                        isSubset: true,
                        previousPageId: 0,
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
                expect(trimAndSort(createResult.data)).toEqual([
                    expectedCreatedPages[1],
                ]);
                expect(addFirstPage(expectedCreatedPages)).toEqual(
                    trimAndSort(getResult.data),
                );

                // NEW PAGE 3
                newPages = [
                    {
                        counts: 16,
                        isSubset: false,
                        notes: "jeff notes",
                        previousPageId: 0,
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
                expect(trimAndSort(createResult.data)).toEqual([
                    expectedCreatedPages[2],
                ]);
                expect(addFirstPage(expectedCreatedPages)).toEqual(
                    trimAndSort(getResult.data),
                );
            });

            it("should insert new pages into the database at the same time", () => {
                const newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false, previousPageId: 0 },
                    { counts: 10, isSubset: true, previousPageId: 0 },
                    {
                        counts: 16,
                        isSubset: false,
                        notes: "jeff notes",
                        previousPageId: 0,
                    },
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
                expect(trimAndSort(createResult.data)).toEqual(
                    trimAndSort(expectedCreatedPages),
                );
                expect(trimAndSort(getResult.data)).toEqual(
                    addFirstPage(expectedCreatedPages),
                );
            });

            it("should insert new pages into the middle of the database at the same time", () => {
                let newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false, previousPageId: 0 },
                    { counts: 10, isSubset: true, previousPageId: 0 },
                    {
                        counts: 16,
                        isSubset: false,
                        previousPageId: 0,
                        notes: "jeff notes",
                    },
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
                    expectedCreatedPages.sort(sorter),
                );
                expect(sort(trimmedGetData)).toEqual(
                    addFirstPage(expectedCreatedPages.sort(sorter)),
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
                    expectedCreated.sort(sorter),
                );
                expect(sort(trimmedGetData)).toEqual(
                    addFirstPage(expectedCreatedPages.sort(sorter)),
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
                    { counts: 12, isSubset: false, previousPageId: 0 },
                    { counts: 10, isSubset: true, previousPageId: 0 },
                    {
                        counts: 16,
                        isSubset: false,
                        previousPageId: 0,
                        notes: "jeff notes",
                    },
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
                    expectedCreatedPages.sort(sorter),
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
                        counts: 32,
                        isSubset: true,
                        previousPageId: 0,
                        notes: "do not touch",
                    },
                    {
                        counts: 12,
                        isSubset: false,
                        previousPageId: 0,
                        notes: "notes jeff",
                    },
                    { counts: 10, isSubset: true, previousPageId: 0 },
                    {
                        counts: 16,
                        isSubset: false,
                        previousPageId: 0,
                        notes: "jeff notes",
                    },
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
                    expectedCreatedPages.sort(sorter),
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
                    expectedUpdatedPages.sort(sorter),
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
                    addFirstPage(expectedAllPages.sort(sorter)),
                );
            });

            it("should only update notes or next_page_id on page with id 0", () => {
                const newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false, previousPageId: 0 },
                    { counts: 10, isSubset: true, previousPageId: 0 },
                    {
                        counts: 16,
                        isSubset: false,
                        previousPageId: 0,
                        notes: "jeff notes",
                    },
                ];

                const createResult = PageTable.createPages({ newPages, db });
                expect(createResult.success).toBe(true);
                expect(createResult.data.length).toBe(3);

                const updatedPage: ModifiedPageArgs = {
                    id: 0,
                    notes: "updated notes",
                    counts: 100, // Should not be updated
                    is_subset: true, // Should not be updated
                };

                const updateResult = PageTable.updatePages({
                    modifiedPages: [updatedPage],
                    db,
                });
                expect(updateResult.success).toBe(true);
                expect(updateResult.data.length).toBe(1);

                const updatedPageResult = updateResult.data[0];
                expect(updatedPageResult.id).toBe(0);
                expect(updatedPageResult.notes).toBe("updated notes");
                expect(updatedPageResult.next_page_id).toBe(3);
                expect(updatedPageResult.counts).toBe(0); // Should remain unchanged
                expect(updatedPageResult.is_subset).toBe(false); // Should remain unchanged
            });
        });

        describe("deletePage", () => {
            it("should delete a page by id from the database", async () => {
                const newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false, previousPageId: 0 },
                    { counts: 10, isSubset: true, previousPageId: 0 },
                    {
                        counts: 16,
                        isSubset: false,
                        previousPageId: 0,
                        notes: "jeff notes",
                    },
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
                expect(trimAndSort(getResult.data)).toEqual(
                    addFirstPage(expectedCreatedPages.sort(sorter)),
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
                    { counts: 12, isSubset: false, previousPageId: 0 },
                    { counts: 10, isSubset: true, previousPageId: 0 },
                    {
                        counts: 16,
                        isSubset: false,
                        previousPageId: 0,
                        notes: "jeff notes",
                    },
                    { counts: 45, isSubset: true, previousPageId: 0 },
                    {
                        counts: 14,
                        isSubset: false,
                        previousPageId: 0,
                        notes: "bad notes",
                    },
                    {
                        counts: 90,
                        isSubset: true,
                        previousPageId: 0,
                        notes: "nice notes",
                    },
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
                    expectedCreatedPages.sort(sorter),
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
                    trimData(expectedDeletedPages).sort(sorter),
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
                    { counts: 12, isSubset: false, previousPageId: 0 },
                    { counts: 10, isSubset: true, previousPageId: 0 },
                    {
                        counts: 16,
                        isSubset: false,
                        previousPageId: 0,
                        notes: "jeff notes",
                    },
                    { counts: 45, isSubset: true, previousPageId: 0 },
                    {
                        counts: 14,
                        isSubset: false,
                        previousPageId: 0,
                        notes: "bad notes",
                    },
                    {
                        counts: 90,
                        isSubset: true,
                        previousPageId: 0,
                        notes: "nice notes",
                    },
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
                    expectedCreatedPages.sort(sorter),
                );

                expectMarcherPagesLengthToBe(
                    expectedCreatedPages.length * marchers.length,
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
                    trimData(expectedDeletedPages).sort(sorter),
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

            it("should not delete the page with id of 0", () => {
                const newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false, previousPageId: 0 },
                    { counts: 10, isSubset: true, previousPageId: 0 },
                    {
                        counts: 16,
                        isSubset: false,
                        previousPageId: 0,
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

                // Attempt to delete the page with id 0
                const deleteResult = PageTable.deletePages({
                    pageIds: new Set<number>([
                        0,
                        ...createdPages.map((page) => page.id),
                    ]),
                    db,
                });
                expect(deleteResult.success).toBe(true);
                expect(deleteResult.data.length).toBe(3); // Only 3 pages should be deleted

                const deletedPages = deleteResult.data;
                expect(deletedPages.map((page) => page.id).sort()).toEqual(
                    createdPages.map((page) => page.id).sort(),
                );

                // Verify the page with id 0 still exists
                const allPages = PageTable.getPages({ db });
                expect(allPages.success).toBe(true);
                const remainingPages = allPages.data;
                expect(remainingPages.length).toBe(1);
                expect(remainingPages[0].id).toBe(0);
            });
        });
    });

    describe("undo/redo", () => {
        let db: Database.Database;

        beforeEach(() => {
            db = new Database(":memory:");
            History.createHistoryTables(db);
            PageTable.createPageTable(db);
            MarcherPageTable.createMarcherPageTable(db);
            MarcherTable.createMarcherTable(db);
        });
        describe("CreatePages", () => {
            describe("without any marchers", () => {
                it("should undo and redo a single created page correctly", () => {
                    const newPage: NewPageArgs = {
                        counts: 12,
                        isSubset: false,
                        previousPageId: 0,
                    };

                    // Create a new page
                    const createResult = PageTable.createPages({
                        newPages: [newPage],
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(1);

                    const createdPage = createResult.data[0];
                    expect(createdPage.counts).toBe(12);
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
                    const redonePage = getPagesAfterRedo.data.sort(sorter)[1];
                    expect(redonePage.counts).toBe(12);
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
                        { counts: 12, isSubset: false, previousPageId: 0 },
                        { counts: 10, isSubset: true, previousPageId: 0 },
                        {
                            counts: 16,
                            isSubset: false,
                            previousPageId: 0,
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
                    expect(createdPages[0].counts).toBe(16);
                    expect(createdPages[0].is_subset).toBe(false);
                    expect(createdPages[0].notes).toBe("jeff notes");
                    expect(createdPages[1].counts).toBe(10);
                    expect(createdPages[1].is_subset).toBe(true);
                    expect(createdPages[2].counts).toBe(12);
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
                    expect(redonePages[0].counts).toBe(16);
                    expect(redonePages[0].is_subset).toBe(false);
                    expect(redonePages[0].notes).toBe("jeff notes");
                    expect(redonePages[1].counts).toBe(10);
                    expect(redonePages[1].is_subset).toBe(true);
                    expect(redonePages[2].counts).toBe(12);
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
                        { counts: 5, isSubset: false, previousPageId: 0 },
                        { counts: 8, isSubset: true, previousPageId: 0 },
                    ];

                    // Create existing pages
                    const createExistingResult = PageTable.createPages({
                        newPages: existingPages,
                        db,
                    });
                    expect(createExistingResult.success).toBe(true);
                    expect(createExistingResult.data.length).toBe(2);

                    const newPages: NewPageArgs[] = [
                        { counts: 12, isSubset: false, previousPageId: 0 },
                        { counts: 10, isSubset: true, previousPageId: 0 },
                        {
                            counts: 16,
                            isSubset: false,
                            previousPageId: 0,
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
                    expect(createdPages[0].counts).toBe(16);
                    expect(createdPages[0].is_subset).toBe(false);
                    expect(createdPages[0].notes).toBe("jeff notes");
                    expect(createdPages[1].counts).toBe(10);
                    expect(createdPages[1].is_subset).toBe(true);
                    expect(createdPages[2].counts).toBe(12);
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
                    expect(redonePages[0].counts).toBe(16);
                    expect(redonePages[0].is_subset).toBe(false);
                    expect(redonePages[0].notes).toBe("jeff notes");
                    expect(redonePages[1].counts).toBe(10);
                    expect(redonePages[1].is_subset).toBe(true);
                    expect(redonePages[2].counts).toBe(12);
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
                        counts: 12,
                        isSubset: false,
                        previousPageId: 0,
                    };

                    // Create a new page
                    const createResult = PageTable.createPages({
                        newPages: [newPage],
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(1);

                    const createdPage = createResult.data[0];
                    expect(createdPage.counts).toBe(12);
                    expect(createdPage.is_subset).toBe(false);

                    // Verify marcher pages are created
                    const marcherPages = MarcherPageTable.getMarcherPages({
                        db,
                    });
                    expect(marcherPages.success).toBe(true);
                    expect(marcherPages.data.length).toBe(6);

                    // Undo the creation
                    const undoResult = History.performUndo(db);
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
                    expect(redonePage.counts).toBe(12);
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
                        { counts: 12, isSubset: false, previousPageId: 0 },
                        { counts: 10, isSubset: true, previousPageId: 0 },
                        {
                            counts: 16,
                            isSubset: false,
                            previousPageId: 0,
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
                    expect(createdPages[0].counts).toBe(16);
                    expect(createdPages[0].is_subset).toBe(false);
                    expect(createdPages[0].notes).toBe("jeff notes");
                    expect(createdPages[1].counts).toBe(10);
                    expect(createdPages[1].is_subset).toBe(true);
                    expect(createdPages[2].counts).toBe(12);
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
                    expect(redonePages[0].counts).toBe(16);
                    expect(redonePages[0].is_subset).toBe(false);
                    expect(redonePages[0].notes).toBe("jeff notes");
                    expect(redonePages[1].counts).toBe(10);
                    expect(redonePages[1].is_subset).toBe(true);
                    expect(redonePages[2].counts).toBe(12);
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
                    counts: 12,
                    isSubset: false,
                    previousPageId: 0,
                };

                // Create a new page
                const createResult = PageTable.createPages({
                    newPages: [newPage],
                    db,
                });
                expect(createResult.success).toBe(true);
                expect(createResult.data.length).toBe(1);

                const createdPage = createResult.data[0];
                expect(createdPage.counts).toBe(12);
                expect(createdPage.is_subset).toBe(false);

                // Update the page
                const updatedPage: ModifiedPageArgs = {
                    id: createdPage.id,
                    counts: 15,
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
                expect(updatedPageResult.counts).toBe(15);
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
                expect(revertedPage.counts).toBe(12);
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
                expect(redonePage.counts).toBe(15);
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
                expect(revertedPage2.counts).toBe(12);
                expect(revertedPage2.is_subset).toBe(false);
                expect(revertedPage2.notes).toBeNull();
            });

            it("can undo, redo, and undo the updating of multiple pages at once", () => {
                const newPages: NewPageArgs[] = [
                    { counts: 12, isSubset: false, previousPageId: 0 },
                    { counts: 10, isSubset: true, previousPageId: 0 },
                    {
                        counts: 16,
                        isSubset: false,
                        previousPageId: 0,
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

                // Update the pages
                const updatedPages: ModifiedPageArgs[] = [
                    {
                        id: createdPages[0].id,
                        counts: 15,
                        is_subset: true,
                        notes: "updated notes 1",
                    },
                    {
                        id: createdPages[1].id,
                        counts: 11,
                        is_subset: false,
                        notes: "updated notes 2",
                    },
                    {
                        id: createdPages[2].id,
                        counts: 17,
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

                const updatedPageResults = updateResult.data;
                expect(updatedPageResults[0].counts).toBe(15);
                expect(updatedPageResults[0].is_subset).toBe(true);
                expect(updatedPageResults[0].notes).toBe("updated notes 1");
                expect(updatedPageResults[1].counts).toBe(11);
                expect(updatedPageResults[1].is_subset).toBe(false);
                expect(updatedPageResults[1].notes).toBe("updated notes 2");
                expect(updatedPageResults[2].counts).toBe(17);
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
                expect(revertedPages[0].counts).toBe(16);
                expect(revertedPages[0].is_subset).toBe(false);
                expect(revertedPages[0].notes).toBe("jeff notes");
                expect(revertedPages[1].counts).toBe(10);
                expect(revertedPages[1].is_subset).toBe(true);
                expect(revertedPages[1].notes).toBeNull();
                expect(revertedPages[2].counts).toBe(12);
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
                expect(redonePages[0].counts).toBe(15);
                expect(redonePages[0].is_subset).toBe(true);
                expect(redonePages[0].notes).toBe("updated notes 1");
                expect(redonePages[1].counts).toBe(11);
                expect(redonePages[1].is_subset).toBe(false);
                expect(redonePages[1].notes).toBe("updated notes 2");
                expect(redonePages[2].counts).toBe(17);
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
                expect(revertedPages2[0].counts).toBe(16);
                expect(revertedPages2[0].is_subset).toBe(false);
                expect(revertedPages2[0].notes).toBe("jeff notes");
                expect(revertedPages2[1].counts).toBe(10);
                expect(revertedPages2[1].is_subset).toBe(true);
                expect(revertedPages2[1].notes).toBeNull();
                expect(revertedPages2[2].counts).toBe(12);
                expect(revertedPages2[2].is_subset).toBe(false);
                expect(revertedPages2[2].notes).toBeNull();
            });
        });

        describe("deletePages", () => {
            describe("without any marchers", () => {
                it("should undo, redo, and undo a single page being deleted", () => {
                    const newPage: NewPageArgs = {
                        counts: 12,
                        isSubset: false,
                        previousPageId: 0,
                    };

                    // Create a new page
                    const createResult = PageTable.createPages({
                        newPages: [newPage],
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    expect(createResult.data.length).toBe(1);

                    const createdPage = createResult.data[0];
                    expect(createdPage.counts).toBe(12);
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
                    expect(undonePage.counts).toBe(12);
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
                    expect(undonePage2.counts).toBe(12);
                    expect(undonePage2.is_subset).toBe(false);
                });

                it("should undo, redo, and undo multiple pages being deleted", () => {
                    const newPages: NewPageArgs[] = [
                        { counts: 12, isSubset: false, previousPageId: 0 },
                        { counts: 10, isSubset: true, previousPageId: 0 },
                        {
                            counts: 16,
                            isSubset: false,
                            previousPageId: 0,
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
                        { counts: 5, isSubset: false, previousPageId: 0 },
                        { counts: 8, isSubset: true, previousPageId: 0 },
                    ];

                    // Create existing pages
                    const createExistingResult = PageTable.createPages({
                        newPages: existingPages,
                        db,
                    });
                    expect(createExistingResult.success).toBe(true);
                    expect(createExistingResult.data.length).toBe(2);

                    const newPages: NewPageArgs[] = [
                        { counts: 12, isSubset: false, previousPageId: 0 },
                        { counts: 10, isSubset: true, previousPageId: 0 },
                        {
                            counts: 16,
                            isSubset: false,
                            previousPageId: 0,
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
                        { counts: 12, isSubset: false, previousPageId: 0 },
                        { counts: 10, isSubset: true, previousPageId: 0 },
                        {
                            counts: 16,
                            isSubset: false,
                            previousPageId: 0,
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
                        { counts: 12, isSubset: false, previousPageId: 0 },
                        { counts: 10, isSubset: true, previousPageId: 0 },
                        {
                            counts: 16,
                            isSubset: false,
                            previousPageId: 0,
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

    describe.skip("error handling", () => {
        /* This needs to make sure that when there is an error during creation, updating, or deletion,
            the changes are rolled back, the redo table doesn't have those actions in it, and no other data
            is affected by accident
            */
    });
});
