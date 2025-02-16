import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import * as PageTable from "../PageTable";
import * as MarcherTable from "../MarcherTable";
import * as MarcherPageTable from "../MarcherPageTable";
import * as History from "../../database.history";
import { NewPageArgs } from "@/global/classes/Page";
import { ModifiedMarcherArgs, NewMarcherArgs } from "@/global/classes/Marcher";
import MarcherPage from "@/global/classes/MarcherPage";
import Constants from "@/global/Constants";
import { initTestDatabase } from "./testUtils";

describe("MarcherTable", () => {
    describe("createMarcherTable", () => {
        let db: Database.Database;

        beforeEach(() => {
            db = initTestDatabase();
        });

        it("should create the marcher table if it does not exist", () => {
            // Expect the marcher table to not exist
            let tableInfo = db
                .prepare(`PRAGMA table_info(${Constants.MarcherTableName})`)
                .all() as { name: string }[];
            expect(tableInfo.length).toBe(9);

            // Expect the marcher table to be created
            tableInfo = db
                .prepare(`PRAGMA table_info(${Constants.MarcherTableName})`)
                .all() as { name: string }[];
            const expectedColumns = [
                "id",
                "name",
                "section",
                "year",
                "notes",
                "drill_prefix",
                "drill_order",
                "created_at",
                "updated_at",
            ];
            const columnNames = tableInfo.map((column) => column.name);
            expect(columnNames).toEqual(expectedColumns);
        });
    });

    describe("database interactions", () => {
        let db: Database.Database;

        beforeEach(() => {
            db = initTestDatabase();
        });

        describe("createMarchers", () => {
            it("should insert a new marcher into the database", () => {
                const newMarcher: NewMarcherArgs = {
                    name: "John Doe",
                    section: "Brass",
                    year: "Senior",
                    notes: "New marcher",
                    drill_prefix: "B",
                    drill_order: 1,
                };

                const createResult = MarcherTable.createMarchers({
                    newMarchers: [newMarcher],
                    db,
                });

                expect(createResult.success).toBe(true);
                const createdMarcher = createResult.data[0];
                expect(createdMarcher.name).toBe(newMarcher.name);
                expect(createdMarcher.section).toBe(newMarcher.section);
                expect(createdMarcher.year).toBe(newMarcher.year);
                expect(createdMarcher.notes).toBe(newMarcher.notes);
                expect(createdMarcher.drill_prefix).toBe(
                    newMarcher.drill_prefix,
                );
                expect(createdMarcher.drill_order).toBe(newMarcher.drill_order);

                const getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(1);
                const fetchedMarcher = getResult.data[0];
                expect(fetchedMarcher.name).toBe(newMarcher.name);
                expect(fetchedMarcher.section).toBe(newMarcher.section);
                expect(fetchedMarcher.year).toBe(newMarcher.year);
                expect(fetchedMarcher.notes).toBe(newMarcher.notes);
                expect(fetchedMarcher.drill_prefix).toBe(
                    newMarcher.drill_prefix,
                );
                expect(fetchedMarcher.drill_order).toBe(newMarcher.drill_order);
            });

            it("should insert 5 marchers into the database", () => {
                const newMarchers: NewMarcherArgs[] = [
                    {
                        name: "John Doe",
                        section: "Brass",
                        notes: null,
                        drill_prefix: "B",
                        drill_order: 1,
                    },
                    {
                        section: "Woodwind",
                        drill_prefix: "W",
                        drill_order: 2,
                    },
                    {
                        name: null,
                        section: "Percussion",
                        year: null,
                        notes: null,
                        drill_prefix: "P",
                        drill_order: 3,
                    },
                    {
                        name: "Bob Brown",
                        section: "Brass",
                        year: "Freshman",
                        notes: "New recruit",
                        drill_prefix: "B",
                        drill_order: 4,
                    },
                    {
                        name: "Charlie Davis",
                        section: "Color Guard",
                        year: null,
                        drill_prefix: "C",
                        drill_order: 5,
                    },
                ];

                const createResult = MarcherTable.createMarchers({
                    newMarchers,
                    db,
                });

                expect(createResult.success).toBe(true);
                expect(createResult.data.length).toBe(5);

                const getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(5);

                newMarchers.forEach((newMarcher, index) => {
                    const fetchedMarcher = getResult.data[index];
                    expect(fetchedMarcher.name).toBe(newMarcher.name ?? null);
                    expect(fetchedMarcher.section).toBe(
                        newMarcher.section ?? null,
                    );
                    expect(fetchedMarcher.year).toBe(newMarcher.year ?? null);
                    expect(fetchedMarcher.notes).toBe(newMarcher.notes ?? null);
                    expect(fetchedMarcher.drill_prefix).toBe(
                        newMarcher.drill_prefix,
                    );
                    expect(fetchedMarcher.drill_order).toBe(
                        newMarcher.drill_order,
                    );
                });
            });

            it("inserts marchers and their marcherPages when there are pages in the database", () => {
                const pages: NewPageArgs[] = [
                    {
                        counts: 32,
                        isSubset: true,
                        previousPageId: 0,
                        notes: "Page 1",
                    },
                ];

                const createPagesResponse = PageTable.createPages({
                    newPages: pages,
                    db,
                });
                expect(createPagesResponse.success).toBe(true);

                const allMarcherPages = () =>
                    MarcherPageTable.getMarcherPages({ db });
                expect(allMarcherPages().data.length).toBe(0);

                const newMarchers: NewMarcherArgs[] = [
                    {
                        name: "John Doe",
                        section: "Brass",
                        notes: null,
                        drill_prefix: "B",
                        drill_order: 1,
                    },
                    {
                        section: "Woodwind",
                        drill_prefix: "W",
                        drill_order: 2,
                    },
                    {
                        name: null,
                        section: "Percussion",
                        year: null,
                        notes: null,
                        drill_prefix: "P",
                        drill_order: 3,
                    },
                    {
                        name: "Bob Brown",
                        section: "Brass",
                        year: "Freshman",
                        notes: "New recruit",
                        drill_prefix: "B",
                        drill_order: 4,
                    },
                    {
                        name: "Charlie Davis",
                        section: "Color Guard",
                        year: null,
                        drill_prefix: "C",
                        drill_order: 5,
                    },
                ];

                const createMarchersResponse = MarcherTable.createMarchers({
                    newMarchers,
                    db,
                });
                expect(createMarchersResponse.success).toBe(true);
                expect(createMarchersResponse.data.length).toBe(5);

                expect(allMarcherPages().data.length).toBe(10); // 5 marchers * 2 pages

                const marcherPages = MarcherPageTable.getMarcherPages({
                    db,
                });
                expect(marcherPages.success).toBe(true);
                const marcherPagesMap = new Map<number, MarcherPage>(
                    marcherPages.data.map((marcherPage) => [
                        marcherPage.id,
                        marcherPage,
                    ]),
                );

                // Check that there is a marcherPage for every marcher and page combination
                for (const marcher of createMarchersResponse.data) {
                    for (const page of createPagesResponse.data) {
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
                expect(marcherPagesMap.size).toBe(5);
            });
        });

        describe("updateMarchers", () => {
            it("should update a single marcher in the database", () => {
                const newMarcher: NewMarcherArgs = {
                    name: "John Doe",
                    section: "Brass",
                    year: "Senior",
                    notes: "New marcher",
                    drill_prefix: "B",
                    drill_order: 1,
                };

                const createResult = MarcherTable.createMarchers({
                    newMarchers: [newMarcher],
                    db,
                });

                expect(createResult.success).toBe(true);
                const createdMarcher = createResult.data[0];

                const updatedMarcher = {
                    ...createdMarcher,
                    name: "Jane Doe",
                    section: "Woodwind",
                    year: "Junior",
                    notes: "Updated marcher",
                    drill_prefix: "W",
                    drill_order: 2,
                };

                const updateResult = MarcherTable.updateMarchers({
                    modifiedMarchers: [updatedMarcher],
                    db,
                });

                expect(updateResult.success).toBe(true);
                const fetchedMarcher = MarcherTable.getMarchers({ db }).data[0];
                expect(fetchedMarcher.name).toBe(updatedMarcher.name);
                expect(fetchedMarcher.section).toBe(updatedMarcher.section);
                expect(fetchedMarcher.year).toBe(updatedMarcher.year);
                expect(fetchedMarcher.notes).toBe(updatedMarcher.notes);
                expect(fetchedMarcher.drill_prefix).toBe(
                    updatedMarcher.drill_prefix,
                );
                expect(fetchedMarcher.drill_order).toBe(
                    updatedMarcher.drill_order,
                );
            });

            it("should update optional values to null when null is defined", () => {
                const newMarcher: NewMarcherArgs = {
                    name: "John Doe",
                    section: "Brass",
                    year: "Senior",
                    notes: "New marcher",
                    drill_prefix: "B",
                    drill_order: 1,
                };

                const createResult = MarcherTable.createMarchers({
                    newMarchers: [newMarcher],
                    db,
                });

                expect(createResult.success).toBe(true);
                const createdMarcher = createResult.data[0];

                const updatedMarcher: ModifiedMarcherArgs = {
                    id: createdMarcher.id,
                    name: null,
                    year: null,
                    notes: null,
                };

                const updateResult = MarcherTable.updateMarchers({
                    modifiedMarchers: [updatedMarcher],
                    db,
                });

                expect(updateResult.success).toBe(true);
                const fetchedMarcher = MarcherTable.getMarchers({ db }).data[0];
                expect(fetchedMarcher.name).toBeNull();
                expect(fetchedMarcher.year).toBeNull();
                expect(fetchedMarcher.notes).toBeNull();
            });

            it("should not change values on optional arguments when they are not provided", () => {
                const newMarcher: NewMarcherArgs = {
                    name: "John Doe",
                    section: "Brass",
                    year: "Senior",
                    notes: "New marcher",
                    drill_prefix: "B",
                    drill_order: 1,
                };

                const createResult = MarcherTable.createMarchers({
                    newMarchers: [newMarcher],
                    db,
                });

                expect(createResult.success).toBe(true);
                const createdMarcher = createResult.data[0];

                const updatedMarcher: ModifiedMarcherArgs = {
                    id: createdMarcher.id,
                    name: "Jane Doe",
                };

                const updateResult = MarcherTable.updateMarchers({
                    modifiedMarchers: [updatedMarcher],
                    db,
                });

                expect(updateResult.success).toBe(true);
                const fetchedMarcher = MarcherTable.getMarchers({ db }).data[0];
                expect(fetchedMarcher.name).toBe(updatedMarcher.name);
                expect(fetchedMarcher.section).toBe(newMarcher.section);
                expect(fetchedMarcher.year).toBe(newMarcher.year);
                expect(fetchedMarcher.notes).toBe(newMarcher.notes);
                expect(fetchedMarcher.drill_prefix).toBe(
                    newMarcher.drill_prefix,
                );
                expect(fetchedMarcher.drill_order).toBe(newMarcher.drill_order);
            });

            it("should update multiple marchers in the database", () => {
                const newMarchers: NewMarcherArgs[] = [
                    {
                        name: "John Doe",
                        section: "Brass",
                        year: "Senior",
                        notes: "New marcher",
                        drill_prefix: "B",
                        drill_order: 1,
                    },
                    {
                        name: "Jane Smith",
                        section: "Woodwind",
                        year: "Junior",
                        notes: "New marcher",
                        drill_prefix: "W",
                        drill_order: 2,
                    },
                    {
                        name: "Bob Brown",
                        section: "Percussion",
                        year: "Sophomore",
                        notes: "New marcher",
                        drill_prefix: "P",
                        drill_order: 3,
                    },
                    {
                        name: "Alice Johnson",
                        section: "Color Guard",
                        year: "Freshman",
                        notes: "New marcher",
                        drill_prefix: "C",
                        drill_order: 4,
                    },
                    {
                        name: "Charlie Davis",
                        section: "Brass",
                        year: "Senior",
                        notes: "New marcher",
                        drill_prefix: "B",
                        drill_order: 5,
                    },
                ];

                const createResult = MarcherTable.createMarchers({
                    newMarchers,
                    db,
                });

                expect(createResult.success).toBe(true);

                const updatedMarchers: ModifiedMarcherArgs[] =
                    createResult.data.map((marcher, index) => ({
                        id: marcher.id,
                        name: `Updated ${marcher.name}`,
                        section: `Updated ${marcher.section}`,
                        year: `Updated ${marcher.year}`,
                        notes: `Updated ${marcher.notes}`,
                        drill_prefix: `Updated ${marcher.drill_prefix}`,
                        drill_order: marcher.drill_order + 10,
                    }));

                const updateResult = MarcherTable.updateMarchers({
                    modifiedMarchers: updatedMarchers,
                    db,
                });

                expect(updateResult.success).toBe(true);

                const getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(5);

                updatedMarchers.forEach((updatedMarcher, index) => {
                    const fetchedMarcher = getResult.data[index];
                    expect(fetchedMarcher.name).toBe(updatedMarcher.name);
                    expect(fetchedMarcher.section).toBe(updatedMarcher.section);
                    expect(fetchedMarcher.year).toBe(updatedMarcher.year);
                    expect(fetchedMarcher.notes).toBe(updatedMarcher.notes);
                    expect(fetchedMarcher.drill_prefix).toBe(
                        updatedMarcher.drill_prefix,
                    );
                    expect(fetchedMarcher.drill_order).toBe(
                        updatedMarcher.drill_order,
                    );
                });
            });
        });

        describe("deleteMarchers", () => {
            it("should delete a single marcher from the database", () => {
                const newMarcher: NewMarcherArgs = {
                    name: "John Doe",
                    section: "Brass",
                    year: "Senior",
                    notes: "New marcher",
                    drill_prefix: "B",
                    drill_order: 1,
                };

                const createResult = MarcherTable.createMarchers({
                    newMarchers: [newMarcher],
                    db,
                });

                expect(createResult.success).toBe(true);
                const createdMarcher = createResult.data[0];

                const deleteResult = MarcherTable.deleteMarchers({
                    marcherIds: new Set<number>([createdMarcher.id]),
                    db,
                });

                expect(deleteResult.success).toBe(true);
                expect(deleteResult.data.length).toBe(1);
                expect(deleteResult.data[0].id).toBe(createdMarcher.id);

                const getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(0);
            });

            it("should delete multiple marchers from the database", () => {
                const newMarchers: NewMarcherArgs[] = [
                    {
                        name: "John Doe",
                        section: "Brass",
                        year: "Senior",
                        notes: "New marcher",
                        drill_prefix: "B",
                        drill_order: 1,
                    },
                    {
                        name: "Jane Smith",
                        section: "Woodwind",
                        year: "Junior",
                        notes: "New marcher",
                        drill_prefix: "W",
                        drill_order: 2,
                    },
                    {
                        name: "Bob Brown",
                        section: "Percussion",
                        year: "Sophomore",
                        notes: "New marcher",
                        drill_prefix: "P",
                        drill_order: 3,
                    },
                ];

                const createResult = MarcherTable.createMarchers({
                    newMarchers,
                    db,
                });

                expect(createResult.success).toBe(true);

                const createdMarcherIds = createResult.data.map(
                    (marcher) => marcher.id,
                );

                const deleteResult = MarcherTable.deleteMarchers({
                    marcherIds: new Set<number>(createdMarcherIds),
                    db,
                });

                expect(deleteResult.success).toBe(true);
                expect(deleteResult.data.length).toBe(3);
                expect(
                    deleteResult.data.map((marcher) => marcher.id).sort(),
                ).toEqual(createdMarcherIds.sort());

                const getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(0);
            });

            it("should delete multiple but not all marchers from the database", () => {
                const newMarchers: NewMarcherArgs[] = [
                    {
                        name: "John Doe",
                        section: "Brass",
                        year: "Senior",
                        notes: "New marcher",
                        drill_prefix: "B",
                        drill_order: 1,
                    },
                    {
                        name: "Jane Smith",
                        section: "Woodwind",
                        year: "Junior",
                        notes: "New marcher",
                        drill_prefix: "W",
                        drill_order: 2,
                    },
                    {
                        name: "Bob Brown",
                        section: "Percussion",
                        year: "Sophomore",
                        notes: "New marcher",
                        drill_prefix: "P",
                        drill_order: 3,
                    },
                    {
                        name: "Alice Johnson",
                        section: "Color Guard",
                        year: "Freshman",
                        notes: "New marcher",
                        drill_prefix: "C",
                        drill_order: 4,
                    },
                    {
                        name: "Charlie Davis",
                        section: "Brass",
                        year: "Senior",
                        notes: "New marcher",
                        drill_prefix: "B",
                        drill_order: 5,
                    },
                ];

                const createResult = MarcherTable.createMarchers({
                    newMarchers,
                    db,
                });

                expect(createResult.success).toBe(true);

                const createdMarcherIds = createResult.data.map(
                    (marcher) => marcher.id,
                );
                const deleteIds = new Set<number>([
                    createdMarcherIds[1],
                    createdMarcherIds[3],
                ]);

                const deleteResult = MarcherTable.deleteMarchers({
                    marcherIds: deleteIds,
                    db,
                });

                expect(deleteResult.success).toBe(true);
                expect(deleteResult.data.length).toBe(2);
                expect(
                    deleteResult.data.map((marcher) => marcher.id).sort(),
                ).toEqual(Array.from(deleteIds).sort());

                const getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(3);

                const remainingIds = createdMarcherIds.filter(
                    (id) => !deleteIds.has(id),
                );
                expect(
                    getResult.data.map((marcher) => marcher.id).sort(),
                ).toEqual(remainingIds.sort());
            });

            it("should delete multiple but not all marchers and their marcherPages when 2 pages exist", () => {
                const pages: NewPageArgs[] = [
                    {
                        counts: 32,
                        isSubset: true,
                        previousPageId: 0,
                        notes: "Page 1",
                    },
                ];

                const createPagesResponse = PageTable.createPages({
                    newPages: pages,
                    db,
                });
                expect(createPagesResponse.success).toBe(true);

                const newMarchers: NewMarcherArgs[] = [
                    {
                        name: "John Doe",
                        section: "Brass",
                        notes: null,
                        drill_prefix: "B",
                        drill_order: 1,
                    },
                    {
                        section: "Woodwind",
                        drill_prefix: "W",
                        drill_order: 2,
                    },
                    {
                        name: null,
                        section: "Percussion",
                        year: null,
                        notes: null,
                        drill_prefix: "P",
                        drill_order: 3,
                    },
                    {
                        name: "Bob Brown",
                        section: "Brass",
                        year: "Freshman",
                        notes: "New recruit",
                        drill_prefix: "B",
                        drill_order: 4,
                    },
                    {
                        name: "Charlie Davis",
                        section: "Color Guard",
                        year: null,
                        drill_prefix: "C",
                        drill_order: 5,
                    },
                ];

                const createMarchersResponse = MarcherTable.createMarchers({
                    newMarchers,
                    db,
                });
                expect(createMarchersResponse.success).toBe(true);
                expect(createMarchersResponse.data.length).toBe(5);

                const deleteIds = new Set<number>([
                    createMarchersResponse.data[1].id,
                    createMarchersResponse.data[3].id,
                ]);

                const deleteResult = MarcherTable.deleteMarchers({
                    marcherIds: deleteIds,
                    db,
                });

                expect(deleteResult.success).toBe(true);
                expect(deleteResult.data.length).toBe(2);
                expect(
                    deleteResult.data.map((marcher) => marcher.id).sort(),
                ).toEqual(Array.from(deleteIds).sort());

                const getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(3);

                const remainingIds = createMarchersResponse.data
                    .map((marcher) => marcher.id)
                    .filter((id) => !deleteIds.has(id));
                expect(
                    getResult.data.map((marcher) => marcher.id).sort(),
                ).toEqual(remainingIds.sort());

                const allMarcherPages = MarcherPageTable.getMarcherPages({
                    db,
                });
                expect(allMarcherPages.success).toBe(true);
                expect(allMarcherPages.data.length).toBe(6); // 3 remaining marchers * 2 pages

                const marcherPagesMap = new Map<number, MarcherPage>(
                    allMarcherPages.data.map((marcherPage) => [
                        marcherPage.id,
                        marcherPage,
                    ]),
                );

                // Check that there is a marcherPage for every remaining marcher and page combination
                for (const marcher of getResult.data) {
                    for (const page of createPagesResponse.data) {
                        const marcherPage = allMarcherPages.data.find(
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
                expect(marcherPagesMap.size).toBe(3);
            });
        });
    });

    describe("undoRedo", () => {
        let db: Database.Database;

        beforeEach(() => {
            db = initTestDatabase();
        });

        describe("createMarchers", () => {
            describe("without any pages in the database", () => {
                it("should undo, redo, and undo a single marcher being created", () => {
                    const newMarcher: NewMarcherArgs = {
                        name: "John Doe",
                        section: "Brass",
                        year: "Senior",
                        notes: "New marcher",
                        drill_prefix: "B",
                        drill_order: 1,
                    };

                    // Create the marcher
                    const createResult = MarcherTable.createMarchers({
                        newMarchers: [newMarcher],
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    const createdMarcher = createResult.data[0];

                    // Verify the marcher was created
                    let getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(1);
                    expect(getResult.data[0].id).toBe(createdMarcher.id);

                    // Undo the creation
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the marcher was undone
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);

                    // Redo the creation
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the marcher was redone
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(1);
                    expect(getResult.data[0].id).toBe(createdMarcher.id);

                    // Undo the creation again
                    const undoResultAgain = History.performUndo(db);
                    expect(undoResultAgain.success).toBe(true);

                    // Verify the marcher was undone again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);
                });

                it("should undo, redo, and undo multiple marchers being created", () => {
                    const newMarchers: NewMarcherArgs[] = [
                        {
                            name: "John Doe",
                            section: "Brass",
                            year: "Senior",
                            notes: "New marcher",
                            drill_prefix: "B",
                            drill_order: 1,
                        },
                        {
                            name: "Jane Smith",
                            section: "Woodwind",
                            year: "Junior",
                            notes: "New marcher",
                            drill_prefix: "W",
                            drill_order: 2,
                        },
                    ];

                    // Create the marchers
                    const createResult = MarcherTable.createMarchers({
                        newMarchers,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    const createdMarchers = createResult.data;

                    // Verify the marchers were created
                    let getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        createdMarchers.map((marcher) => marcher.id),
                    );

                    // Undo the creation
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the marchers were undone
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);

                    // Redo the creation
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the marchers were redone
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        createdMarchers.map((marcher) => marcher.id),
                    );

                    // Undo the creation again
                    const undoResultAgain = History.performUndo(db);
                    expect(undoResultAgain.success).toBe(true);

                    // Verify the marchers were undone again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);
                });

                it("should undo, redo, and undo multiple marchers being created while other marchers already exist", () => {
                    const existingMarchers: NewMarcherArgs[] = [
                        {
                            name: "Alice Johnson",
                            section: "Color Guard",
                            year: "Freshman",
                            notes: "Existing marcher",
                            drill_prefix: "C",
                            drill_order: 1,
                        },
                        {
                            name: "Bob Brown",
                            section: "Brass",
                            year: "Sophomore",
                            notes: "Existing marcher",
                            drill_prefix: "B",
                            drill_order: 2,
                        },
                    ];

                    // Create the existing marchers
                    let createResult = MarcherTable.createMarchers({
                        newMarchers: existingMarchers,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    const createdExistingMarchers = createResult.data;

                    // Verify the existing marchers were created
                    let getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        createdExistingMarchers.map((marcher) => marcher.id),
                    );

                    const newMarchers: NewMarcherArgs[] = [
                        {
                            name: "John Doe",
                            section: "Brass",
                            year: "Senior",
                            notes: "New marcher",
                            drill_prefix: "B",
                            drill_order: 3,
                        },
                        {
                            name: "Jane Smith",
                            section: "Woodwind",
                            year: "Junior",
                            notes: "New marcher",
                            drill_prefix: "W",
                            drill_order: 4,
                        },
                    ];

                    // Create the new marchers
                    createResult = MarcherTable.createMarchers({
                        newMarchers,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    const createdNewMarchers = createResult.data;

                    // Verify the new marchers were created
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(4);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        [...createdExistingMarchers, ...createdNewMarchers].map(
                            (marcher) => marcher.id,
                        ),
                    );

                    // Undo the creation of new marchers
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the new marchers were undone
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        createdExistingMarchers.map((marcher) => marcher.id),
                    );

                    // Redo the creation of new marchers
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the new marchers were redone
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(4);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        [...createdExistingMarchers, ...createdNewMarchers].map(
                            (marcher) => marcher.id,
                        ),
                    );

                    // Undo the creation of new marchers again
                    const undoResultAgain = History.performUndo(db);
                    expect(undoResultAgain.success).toBe(true);

                    // Verify the new marchers were undone again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        createdExistingMarchers.map((marcher) => marcher.id),
                    );
                });
            });

            describe("with pages in the database", () => {
                it("should undo, redo, and undo the creation of multiple marchers and their MarcherPages when pages exist", () => {
                    const pages: NewPageArgs[] = [
                        {
                            counts: 32,
                            isSubset: true,
                            previousPageId: 0,
                            notes: "Page 1",
                        },
                    ];

                    const createPagesResponse = PageTable.createPages({
                        newPages: pages,
                        db,
                    });
                    expect(createPagesResponse.success).toBe(true);

                    const newMarchers: NewMarcherArgs[] = [
                        {
                            name: "John Doe",
                            section: "Brass",
                            notes: null,
                            drill_prefix: "B",
                            drill_order: 1,
                        },
                        {
                            section: "Woodwind",
                            drill_prefix: "W",
                            drill_order: 2,
                        },
                        {
                            name: null,
                            section: "Percussion",
                            year: null,
                            notes: null,
                            drill_prefix: "P",
                            drill_order: 3,
                        },
                        {
                            name: "Bob Brown",
                            section: "Brass",
                            year: "Freshman",
                            notes: "New recruit",
                            drill_prefix: "B",
                            drill_order: 4,
                        },
                        {
                            name: "Charlie Davis",
                            section: "Color Guard",
                            year: null,
                            drill_prefix: "C",
                            drill_order: 5,
                        },
                    ];

                    // Create the marchers
                    const createMarchersResponse = MarcherTable.createMarchers({
                        newMarchers,
                        db,
                    });
                    expect(createMarchersResponse.success).toBe(true);
                    expect(createMarchersResponse.data.length).toBe(5);

                    const allMarcherPages = () =>
                        MarcherPageTable.getMarcherPages({ db });
                    expect(allMarcherPages().data.length).toBe(10); // 5 marchers * 2 pages

                    // Undo the creation
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the marchers and their MarcherPages were undone
                    let getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);
                    expect(allMarcherPages().data.length).toBe(0);

                    // Redo the creation
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the marchers and their MarcherPages were redone
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(5);
                    expect(allMarcherPages().data.length).toBe(10); // 5 marchers * 2 pages

                    // Undo the creation again
                    const undoResultAgain = History.performUndo(db);
                    expect(undoResultAgain.success).toBe(true);

                    // Verify the marchers and their MarcherPages were undone again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);
                    expect(allMarcherPages().data.length).toBe(0);
                });

                it("should undo, redo, and undo the creation of multiple marchers and their MarcherPages when pages and marchers exist", () => {
                    const existingPages: NewPageArgs[] = [
                        {
                            counts: 32,
                            isSubset: true,
                            previousPageId: 0,
                            notes: "Existing Page 1",
                        },
                    ];

                    const createExistingPagesResponse = PageTable.createPages({
                        newPages: existingPages,
                        db,
                    });
                    expect(createExistingPagesResponse.success).toBe(true);

                    const existingMarchers: NewMarcherArgs[] = [
                        {
                            name: "Alice Johnson",
                            section: "Color Guard",
                            year: "Freshman",
                            notes: "Existing marcher",
                            drill_prefix: "C",
                            drill_order: 1,
                        },
                        {
                            name: "Bob Brown",
                            section: "Brass",
                            year: "Sophomore",
                            notes: "Existing marcher",
                            drill_prefix: "B",
                            drill_order: 2,
                        },
                    ];

                    const createExistingMarchersResponse =
                        MarcherTable.createMarchers({
                            newMarchers: existingMarchers,
                            db,
                        });
                    expect(createExistingMarchersResponse.success).toBe(true);
                    expect(createExistingMarchersResponse.data.length).toBe(2);

                    const newMarchers: NewMarcherArgs[] = [
                        {
                            name: "John Doe",
                            section: "Brass",
                            notes: null,
                            drill_prefix: "B",
                            drill_order: 3,
                        },
                        {
                            section: "Woodwind",
                            drill_prefix: "W",
                            drill_order: 4,
                        },
                        {
                            name: null,
                            section: "Percussion",
                            year: null,
                            notes: null,
                            drill_prefix: "P",
                            drill_order: 5,
                        },
                        {
                            name: "Bob Brown",
                            section: "Brass",
                            year: "Freshman",
                            notes: "New recruit",
                            drill_prefix: "B",
                            drill_order: 6,
                        },
                        {
                            name: "Charlie Davis",
                            section: "Color Guard",
                            year: null,
                            drill_prefix: "C",
                            drill_order: 7,
                        },
                    ];

                    // Create the new marchers
                    const createMarchersResponse = MarcherTable.createMarchers({
                        newMarchers,
                        db,
                    });
                    expect(createMarchersResponse.success).toBe(true);
                    expect(createMarchersResponse.data.length).toBe(5);

                    const allMarcherPages = () =>
                        MarcherPageTable.getMarcherPages({ db });
                    expect(allMarcherPages().data.length).toBe(14); // 7 marchers * 2 pages

                    // Undo the creation
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the new marchers and their MarcherPages were undone
                    let getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2); // Only existing marchers should remain
                    expect(allMarcherPages().data.length).toBe(4); // 2 existing marchers * 2 pages

                    // Redo the creation
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the new marchers and their MarcherPages were redone
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(7); // 2 existing + 5 new marchers
                    expect(allMarcherPages().data.length).toBe(14); // 7 marchers * 2 pages

                    // Undo the creation again
                    const undoResultAgain = History.performUndo(db);
                    expect(undoResultAgain.success).toBe(true);

                    // Verify the new marchers and their MarcherPages were undone again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2); // Only existing marchers should remain
                    expect(allMarcherPages().data.length).toBe(4); // 2 existing marchers * 2 pages
                });
            });
        });

        describe("updateMarchers", () => {
            it("should undo, redo, and undo the updating of multiple marchers", () => {
                const newMarchers: NewMarcherArgs[] = [
                    {
                        name: "John Doe",
                        section: "Brass",
                        year: "Senior",
                        notes: "New marcher",
                        drill_prefix: "B",
                        drill_order: 1,
                    },
                    {
                        name: "Jane Smith",
                        section: "Woodwind",
                        year: "Junior",
                        notes: "New marcher",
                        drill_prefix: "W",
                        drill_order: 2,
                    },
                ];

                // Create the marchers
                const createResult = MarcherTable.createMarchers({
                    newMarchers,
                    db,
                });
                expect(createResult.success).toBe(true);
                const createdMarchers = createResult.data;

                // Verify the marchers were created
                let getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(2);
                expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                    createdMarchers.map((marcher) => marcher.id),
                );

                const updatedMarchers: ModifiedMarcherArgs[] =
                    createdMarchers.map((marcher) => ({
                        id: marcher.id,
                        name: `Updated ${marcher.name}`,
                        section: `Updated ${marcher.section}`,
                        year: `Updated ${marcher.year}`,
                        notes: `Updated ${marcher.notes}`,
                        drill_prefix: `Updated ${marcher.drill_prefix}`,
                        drill_order: marcher.drill_order + 10,
                    }));

                // Update the marchers
                const updateResult = MarcherTable.updateMarchers({
                    modifiedMarchers: updatedMarchers,
                    db,
                });
                expect(updateResult.success).toBe(true);

                // Verify the marchers were updated
                getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(2);
                expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                    updatedMarchers.map((marcher) => marcher.id),
                );
                updatedMarchers.forEach((updatedMarcher, index) => {
                    const fetchedMarcher = getResult.data[index];
                    expect(fetchedMarcher.name).toBe(updatedMarcher.name);
                    expect(fetchedMarcher.section).toBe(updatedMarcher.section);
                    expect(fetchedMarcher.year).toBe(updatedMarcher.year);
                    expect(fetchedMarcher.notes).toBe(updatedMarcher.notes);
                    expect(fetchedMarcher.drill_prefix).toBe(
                        updatedMarcher.drill_prefix,
                    );
                    expect(fetchedMarcher.drill_order).toBe(
                        updatedMarcher.drill_order,
                    );
                });

                // Undo the update
                const undoResult = History.performUndo(db);
                expect(undoResult.success).toBe(true);

                // Verify the marchers were reverted to their original state
                getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(2);
                expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                    createdMarchers.map((marcher) => marcher.id),
                );
                createdMarchers.forEach((createdMarcher, index) => {
                    const fetchedMarcher = getResult.data[index];
                    expect(fetchedMarcher.name).toBe(createdMarcher.name);
                    expect(fetchedMarcher.section).toBe(createdMarcher.section);
                    expect(fetchedMarcher.year).toBe(createdMarcher.year);
                    expect(fetchedMarcher.notes).toBe(createdMarcher.notes);
                    expect(fetchedMarcher.drill_prefix).toBe(
                        createdMarcher.drill_prefix,
                    );
                    expect(fetchedMarcher.drill_order).toBe(
                        createdMarcher.drill_order,
                    );
                });

                // Redo the update
                const redoResult = History.performRedo(db);
                expect(redoResult.success).toBe(true);

                // Verify the marchers were updated again
                getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(2);
                expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                    updatedMarchers.map((marcher) => marcher.id),
                );
                updatedMarchers.forEach((updatedMarcher, index) => {
                    const fetchedMarcher = getResult.data[index];
                    expect(fetchedMarcher.name).toBe(updatedMarcher.name);
                    expect(fetchedMarcher.section).toBe(updatedMarcher.section);
                    expect(fetchedMarcher.year).toBe(updatedMarcher.year);
                    expect(fetchedMarcher.notes).toBe(updatedMarcher.notes);
                    expect(fetchedMarcher.drill_prefix).toBe(
                        updatedMarcher.drill_prefix,
                    );
                    expect(fetchedMarcher.drill_order).toBe(
                        updatedMarcher.drill_order,
                    );
                });

                // Undo the update again
                const undoResultAgain = History.performUndo(db);
                expect(undoResultAgain.success).toBe(true);

                // Verify the marchers were reverted to their original state again
                getResult = MarcherTable.getMarchers({ db });
                expect(getResult.success).toBe(true);
                expect(getResult.data.length).toBe(2);
                expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                    createdMarchers.map((marcher) => marcher.id),
                );
                createdMarchers.forEach((createdMarcher, index) => {
                    const fetchedMarcher = getResult.data[index];
                    expect(fetchedMarcher.name).toBe(createdMarcher.name);
                    expect(fetchedMarcher.section).toBe(createdMarcher.section);
                    expect(fetchedMarcher.year).toBe(createdMarcher.year);
                    expect(fetchedMarcher.notes).toBe(createdMarcher.notes);
                    expect(fetchedMarcher.drill_prefix).toBe(
                        createdMarcher.drill_prefix,
                    );
                    expect(fetchedMarcher.drill_order).toBe(
                        createdMarcher.drill_order,
                    );
                });
            });
        });

        describe("deleteMarchers", () => {
            describe("without any pages in the database", () => {
                it("should undo, redo, and undo a single marcher being deleted", () => {
                    const newMarcher: NewMarcherArgs = {
                        name: "John Doe",
                        section: "Brass",
                        year: "Senior",
                        notes: "New marcher",
                        drill_prefix: "B",
                        drill_order: 1,
                    };

                    // Create the marcher
                    const createResult = MarcherTable.createMarchers({
                        newMarchers: [newMarcher],
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    const createdMarcher = createResult.data[0];

                    // Verify the marcher was created
                    let getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(1);
                    expect(getResult.data[0].id).toBe(createdMarcher.id);

                    // Delete the marcher
                    const deleteResult = MarcherTable.deleteMarchers({
                        marcherIds: new Set<number>([createdMarcher.id]),
                        db,
                    });
                    expect(deleteResult.success).toBe(true);

                    // Verify the marcher was deleted
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);

                    // Undo the deletion
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the marcher was restored
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(1);
                    expect(getResult.data[0].id).toBe(createdMarcher.id);

                    // Redo the deletion
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the marcher was deleted again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);

                    // Undo the deletion again
                    const undoResultAgain = History.performUndo(db);
                    expect(undoResultAgain.success).toBe(true);

                    // Verify the marcher was restored again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(1);
                    expect(getResult.data[0].id).toBe(createdMarcher.id);
                });

                it("should undo, redo, and undo multiple marchers being deleted", () => {
                    const newMarchers: NewMarcherArgs[] = [
                        {
                            name: "John Doe",
                            section: "Brass",
                            year: "Senior",
                            notes: "New marcher",
                            drill_prefix: "B",
                            drill_order: 1,
                        },
                        {
                            name: "Jane Smith",
                            section: "Woodwind",
                            year: "Junior",
                            notes: "New marcher",
                            drill_prefix: "W",
                            drill_order: 2,
                        },
                    ];

                    // Create the marchers
                    const createResult = MarcherTable.createMarchers({
                        newMarchers,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    const createdMarchers = createResult.data;

                    // Verify the marchers were created
                    let getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        createdMarchers.map((marcher) => marcher.id),
                    );

                    // Delete the marchers
                    const deleteResult = MarcherTable.deleteMarchers({
                        marcherIds: new Set<number>(
                            createdMarchers.map((marcher) => marcher.id),
                        ),
                        db,
                    });
                    expect(deleteResult.success).toBe(true);

                    // Verify the marchers were deleted
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);

                    // Undo the deletion
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the marchers were restored
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        createdMarchers.map((marcher) => marcher.id),
                    );

                    // Redo the deletion
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the marchers were deleted again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);

                    // Undo the deletion again
                    const undoResultAgain = History.performUndo(db);
                    expect(undoResultAgain.success).toBe(true);

                    // Verify the marchers were restored again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        createdMarchers.map((marcher) => marcher.id),
                    );
                });

                it("should undo, redo, and undo multiple marchers being deleted while other marchers already exist", () => {
                    const existingMarchers: NewMarcherArgs[] = [
                        {
                            name: "Alice Johnson",
                            section: "Color Guard",
                            year: "Freshman",
                            notes: "Existing marcher",
                            drill_prefix: "C",
                            drill_order: 1,
                        },
                        {
                            name: "Bob Brown",
                            section: "Brass",
                            year: "Sophomore",
                            notes: "Existing marcher",
                            drill_prefix: "B",
                            drill_order: 2,
                        },
                    ];

                    // Create the existing marchers
                    let createResult = MarcherTable.createMarchers({
                        newMarchers: existingMarchers,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    const createdExistingMarchers = createResult.data;

                    // Verify the existing marchers were created
                    let getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        createdExistingMarchers.map((marcher) => marcher.id),
                    );

                    const newMarchers: NewMarcherArgs[] = [
                        {
                            name: "John Doe",
                            section: "Brass",
                            year: "Senior",
                            notes: "New marcher",
                            drill_prefix: "B",
                            drill_order: 3,
                        },
                        {
                            name: "Jane Smith",
                            section: "Woodwind",
                            year: "Junior",
                            notes: "New marcher",
                            drill_prefix: "W",
                            drill_order: 4,
                        },
                    ];

                    // Create the new marchers
                    createResult = MarcherTable.createMarchers({
                        newMarchers,
                        db,
                    });
                    expect(createResult.success).toBe(true);
                    const createdNewMarchers = createResult.data;

                    // Verify the new marchers were created
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(4);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        [...createdExistingMarchers, ...createdNewMarchers].map(
                            (marcher) => marcher.id,
                        ),
                    );

                    // Delete the new marchers
                    const deleteResult = MarcherTable.deleteMarchers({
                        marcherIds: new Set<number>(
                            createdNewMarchers.map((marcher) => marcher.id),
                        ),
                        db,
                    });
                    expect(deleteResult.success).toBe(true);

                    // Verify the new marchers were deleted
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        createdExistingMarchers.map((marcher) => marcher.id),
                    );

                    // Undo the deletion
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the new marchers were restored
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(4);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        [...createdExistingMarchers, ...createdNewMarchers].map(
                            (marcher) => marcher.id,
                        ),
                    );

                    // Redo the deletion
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the new marchers were deleted again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        createdExistingMarchers.map((marcher) => marcher.id),
                    );

                    // Undo the deletion again
                    const undoResultAgain = History.performUndo(db);
                    expect(undoResultAgain.success).toBe(true);

                    // Verify the new marchers were restored again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(4);
                    expect(getResult.data.map((marcher) => marcher.id)).toEqual(
                        [...createdExistingMarchers, ...createdNewMarchers].map(
                            (marcher) => marcher.id,
                        ),
                    );
                });
            });

            describe("with pages in the database", () => {
                it("should undo, redo, and undo the deletion of multiple pages and their MarcherPages when marchers exist", () => {
                    const pages: NewPageArgs[] = [
                        {
                            counts: 32,
                            isSubset: true,
                            previousPageId: 0,
                            notes: "Page 1",
                        },
                    ];

                    const createPagesResponse = PageTable.createPages({
                        newPages: pages,
                        db,
                    });
                    expect(createPagesResponse.success).toBe(true);

                    const newMarchers: NewMarcherArgs[] = [
                        {
                            name: "John Doe",
                            section: "Brass",
                            notes: null,
                            drill_prefix: "B",
                            drill_order: 1,
                        },
                        {
                            section: "Woodwind",
                            drill_prefix: "W",
                            drill_order: 2,
                        },
                        {
                            name: null,
                            section: "Percussion",
                            year: null,
                            notes: null,
                            drill_prefix: "P",
                            drill_order: 3,
                        },
                        {
                            name: "Bob Brown",
                            section: "Brass",
                            year: "Freshman",
                            notes: "New recruit",
                            drill_prefix: "B",
                            drill_order: 4,
                        },
                        {
                            name: "Charlie Davis",
                            section: "Color Guard",
                            year: null,
                            drill_prefix: "C",
                            drill_order: 5,
                        },
                    ];

                    // Create the marchers
                    const createMarchersResponse = MarcherTable.createMarchers({
                        newMarchers,
                        db,
                    });
                    expect(createMarchersResponse.success).toBe(true);
                    expect(createMarchersResponse.data.length).toBe(5);

                    const allMarcherPages = () =>
                        MarcherPageTable.getMarcherPages({ db });
                    expect(allMarcherPages().data.length).toBe(10); // 5 marchers * 2 pages

                    // Delete the marchers
                    const deleteResult = MarcherTable.deleteMarchers({
                        marcherIds: new Set<number>(
                            createMarchersResponse.data.map(
                                (marcher) => marcher.id,
                            ),
                        ),
                        db,
                    });
                    expect(deleteResult.success).toBe(true);

                    // Verify the marchers and their MarcherPages were deleted
                    let getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);
                    expect(allMarcherPages().data.length).toBe(0);

                    // Undo the deletion
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the marchers and their MarcherPages were restored
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(5);
                    expect(allMarcherPages().data.length).toBe(10); // 5 marchers * 2 pages

                    // Redo the deletion
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the marchers and their MarcherPages were deleted again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(0);
                    expect(allMarcherPages().data.length).toBe(0);

                    // Undo the deletion again
                    const undoResultAgain = History.performUndo(db);
                    expect(undoResultAgain.success).toBe(true);

                    // Verify the marchers and their MarcherPages were restored again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(5);
                    expect(allMarcherPages().data.length).toBe(10); // 5 marchers * 2 pages
                });

                it("should undo, redo, and undo the deletion of multiple marchers and their MarcherPages when pages and marchers exist", () => {
                    const existingPages: NewPageArgs[] = [
                        {
                            counts: 16,
                            isSubset: false,
                            previousPageId: 0,
                            notes: "Existing Page 2",
                        },
                    ];

                    const createExistingPagesResponse = PageTable.createPages({
                        newPages: existingPages,
                        db,
                    });
                    expect(createExistingPagesResponse.success).toBe(true);

                    const existingMarchers: NewMarcherArgs[] = [
                        {
                            name: "Alice Johnson",
                            section: "Color Guard",
                            year: "Freshman",
                            notes: "Existing marcher",
                            drill_prefix: "C",
                            drill_order: 1,
                        },
                        {
                            name: "Bob Brown",
                            section: "Brass",
                            year: "Sophomore",
                            notes: "Existing marcher",
                            drill_prefix: "B",
                            drill_order: 2,
                        },
                    ];

                    const createExistingMarchersResponse =
                        MarcherTable.createMarchers({
                            newMarchers: existingMarchers,
                            db,
                        });
                    expect(createExistingMarchersResponse.success).toBe(true);
                    expect(createExistingMarchersResponse.data.length).toBe(2);

                    const newMarchers: NewMarcherArgs[] = [
                        {
                            name: "John Doe",
                            section: "Brass",
                            notes: null,
                            drill_prefix: "B",
                            drill_order: 3,
                        },
                        {
                            section: "Woodwind",
                            drill_prefix: "W",
                            drill_order: 4,
                        },
                        {
                            name: null,
                            section: "Percussion",
                            year: null,
                            notes: null,
                            drill_prefix: "P",
                            drill_order: 5,
                        },
                        {
                            name: "Bob Brown",
                            section: "Brass",
                            year: "Freshman",
                            notes: "New recruit",
                            drill_prefix: "B",
                            drill_order: 6,
                        },
                        {
                            name: "Charlie Davis",
                            section: "Color Guard",
                            year: null,
                            drill_prefix: "C",
                            drill_order: 7,
                        },
                    ];

                    // Create the new marchers
                    const createMarchersResponse = MarcherTable.createMarchers({
                        newMarchers,
                        db,
                    });
                    expect(createMarchersResponse.success).toBe(true);
                    expect(createMarchersResponse.data.length).toBe(5);

                    const allMarcherPages = () =>
                        MarcherPageTable.getMarcherPages({ db });
                    expect(allMarcherPages().data.length).toBe(14); // 7 marchers * 2 pages

                    // Delete the new marchers
                    const deleteResult = MarcherTable.deleteMarchers({
                        marcherIds: new Set<number>(
                            createMarchersResponse.data.map(
                                (marcher) => marcher.id,
                            ),
                        ),
                        db,
                    });
                    expect(deleteResult.success).toBe(true);

                    // Verify the new marchers and their MarcherPages were deleted
                    let getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2); // Only existing marchers should remain
                    expect(allMarcherPages().data.length).toBe(4); // 2 existing marchers * 2 pages

                    // Undo the deletion
                    const undoResult = History.performUndo(db);
                    expect(undoResult.success).toBe(true);

                    // Verify the new marchers and their MarcherPages were restored
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(7); // 2 existing + 5 new marchers
                    expect(allMarcherPages().data.length).toBe(14); // 7 marchers * 2 pages

                    // Redo the deletion
                    const redoResult = History.performRedo(db);
                    expect(redoResult.success).toBe(true);

                    // Verify the new marchers and their MarcherPages were deleted again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(2); // Only existing marchers should remain
                    expect(allMarcherPages().data.length).toBe(4); // 2 existing marchers * 2 pages

                    // Undo the deletion again
                    const undoResultAgain = History.performUndo(db);
                    expect(undoResultAgain.success).toBe(true);

                    // Verify the new marchers and their MarcherPages were restored again
                    getResult = MarcherTable.getMarchers({ db });
                    expect(getResult.success).toBe(true);
                    expect(getResult.data.length).toBe(7); // 2 existing + 5 new marchers
                    expect(allMarcherPages().data.length).toBe(14); // 7 marchers * 2 pages
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
