import { describe, expect } from "vitest";
import { createPages, NewPageArgs } from "../page";
import { describeDbTests, schema } from "@/test/base";
import { DatabasePage } from "../page";
import { DbTransaction } from "..";
import {
    DatabaseBeat,
    FIRST_BEAT_ID,
} from "../../../electron/database/tables/BeatTable";
import { getTableName } from "drizzle-orm";
import {
    performRedo,
    performUndo,
} from "../../../electron/database/database.history";
import { getTestWithHistory } from "@/test/history";

describeDbTests("pages", (it) => {
    describe("database interactions", () => {
        const sort = async (
            tx: DbTransaction,
            items: DatabasePage[],
        ): Promise<DatabasePage[]> => {
            // Create a map to access items by their id
            const beats = await tx.query.beats.findMany();
            const beatMap = new Map<number, DatabaseBeat>(
                beats.map((beat) => [beat.id, beat]),
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
                const {
                    created_at: _created_at,
                    updated_at: _updated_at,
                    ...rest
                } = page;
                return { ...rest, notes: rest.notes ? rest.notes : null };
            });

        function firstPage(): DatabasePage {
            return {
                id: 0,
                start_beat: FIRST_BEAT_ID,
                is_subset: false,
                notes: null,
            };
        }

        async function trimAndSort(tx: DbTransaction, pages: DatabasePage[]) {
            return trimData(await sort(tx, pages));
        }

        async function addFirstPage(
            tx: DbTransaction,
            currentPages: DatabasePage[],
        ): Promise<DatabasePage[]> {
            const sortedPages = await trimAndSort(tx, currentPages);
            return [firstPage(), ...sortedPages];
        }

        describe("createPages", () => {
            const testWithHistory = getTestWithHistory(it, [
                schema.pages,
                schema.beats,
                schema.marchers,
                schema.marcher_pages,
            ]);

            testWithHistory.only(
                "should insert a new page into the database",
                async ({ db, beats }) => {
                    const newPages: NewPageArgs[] = [
                        {
                            is_subset: false,
                            notes: null,
                            start_beat: beats.expectedBeats[0].id,
                        },
                    ];
                    const expectedCreatedPages = [
                        {
                            id: 1,
                            start_beat: beats.expectedBeats[0].id,
                            is_subset: false,
                            notes: null,
                        },
                    ];

                    const result = await createPages({ newPages, db });
                    expect(result).toMatchObject(expectedCreatedPages);

                    const allPages = await db.query.pages.findMany();
                    expect(allPages.length).toEqual(
                        expectedCreatedPages.length,
                    );
                    expect(allPages).toMatchObject([
                        {
                            ...expectedCreatedPages[0],
                            is_subset: 0,
                        },
                    ]);
                },
            );

            // it("should insert sequential pages into the database with previous page defined", async () => {
            //     let newPages: NewPageArgs[] = [
            //         { start_beat: 12, is_subset: false },
            //     ];
            //     let expectedCreatedPages: DatabasePage[] = [
            //         {
            //             id: 1,
            //             start_beat: 12,
            //             is_subset: false,
            //             notes: null,
            //         },
            //     ];

            //     let createResult = await createPages({
            //         newPages,
            //         db,
            //     });
            //     let getResult = await PageTable.getPages({ db });

            //     // expect(createResult.success).toBe(true);
            //     expect(addFirstPage(createResult)).toMatchObject(
            //         addFirstPage(expectedCreatedPages),
            //     );
            //     expect(trimAndSort(getResult)).toMatchObject(
            //         addFirstPage(expectedCreatedPages),
            //     );

            //     // NEW PAGE 2
            //     newPages = [
            //         {
            //             start_beat: 15,
            //             is_subset: true,
            //         },
            //     ];
            //     expectedCreatedPages = [
            //         {
            //             id: 1,
            //             start_beat: 12,
            //             is_subset: false,
            //             notes: null,
            //         },
            //         {
            //             id: 2,
            //             start_beat: 15,
            //             is_subset: true,
            //             notes: null,
            //         },
            //     ];

            //     createResult = await createPages({ newPages, db });
            //     getResult = await PageTable.getPages({ db });
            //     expect(trimAndSort(createResult)).toMatchObject([
            //         expectedCreatedPages[1],
            //     ]);
            //     expect(trimAndSort(getResult)).toMatchObject(
            //         addFirstPage(expectedCreatedPages),
            //     );

            //     // NEW PAGE 3
            //     newPages = [
            //         {
            //             start_beat: 16,
            //             is_subset: false,
            //             notes: "jeff notes",
            //         },
            //     ];
            //     expectedCreatedPages = [
            //         {
            //             id: 1,
            //             start_beat: 12,
            //             is_subset: false,
            //             notes: null,
            //         },
            //         {
            //             id: 2,
            //             start_beat: 15,
            //             is_subset: true,
            //             notes: null,
            //         },
            //         {
            //             id: 3,
            //             start_beat: 16,
            //             is_subset: false,
            //             notes: "jeff notes",
            //         },
            //     ];

            //     createResult = await createPages({ newPages, db });
            //     getResult = await PageTable.getPages({ db });
            //     // expect(createResult.success).toBe(true);
            //     expect(trimAndSort(createResult)).toEqual([
            //         expectedCreatedPages[2],
            //     ]);
            //     expect(trimAndSort(getResult)).toEqual(
            //         addFirstPage(expectedCreatedPages),
            //     );
            // });

            // it("should fail to insert a page with duplicate start_beat", async () => {
            //     const firstPage: NewPageArgs[] = [
            //         {
            //             start_beat: 5,
            //             is_subset: false,
            //             notes: null,
            //         },
            //     ];

            //     // Insert first page successfully
            //     await createPages({
            //         newPages: firstPage,
            //         db,
            //     });

            //     // Attempt to insert page with same start_beat
            //     const duplicatePage: NewPageArgs[] = [
            //         {
            //             start_beat: 5,
            //             is_subset: true,
            //             notes: "This should fail",
            //         },
            //     ];
            //     await expect(
            //         createPages({
            //             newPages: duplicatePage,
            //             db,
            //         }),
            //     ).rejects.toThrow();
            // });

            // it("should insert new pages at the start of the database with no previous page defined", async () => {
            //     let newPages: NewPageArgs[] = [
            //         { start_beat: 12, is_subset: false },
            //     ];
            //     let expectedCreatedPages: DatabasePage[] = [
            //         {
            //             id: 1,
            //             start_beat: 12,
            //             is_subset: false,
            //             notes: null,
            //         },
            //     ];

            //     let createResult = await createPages({
            //         newPages,
            //         db,
            //     });
            //     let getResult = await PageTable.getPages({ db });

            //     // expect(createResult.success).toBe(true);
            //     expect(trimAndSort(createResult)).toEqual(expectedCreatedPages);
            //     expect(addFirstPage(createResult)).toEqual(
            //         trimAndSort(getResult),
            //     );

            //     // NEW PAGE 2
            //     newPages = [
            //         {
            //             start_beat: 10,
            //             is_subset: true,
            //         },
            //     ];
            //     expectedCreatedPages = [
            //         {
            //             id: 1,
            //             start_beat: 12,
            //             is_subset: false,
            //             notes: null,
            //         },
            //         {
            //             id: 2,
            //             start_beat: 10,
            //             is_subset: true,
            //             notes: null,
            //         },
            //     ];

            //     createResult = await createPages({ newPages, db });
            //     getResult = await PageTable.getPages({ db });

            //     // expect(createResult.success).toBe(true);
            //     expect(trimAndSort(createResult)).toEqual([
            //         expectedCreatedPages[1],
            //     ]);
            //     expect(addFirstPage(expectedCreatedPages)).toEqual(
            //         trimAndSort(getResult),
            //     );

            //     // NEW PAGE 3
            //     newPages = [
            //         {
            //             start_beat: 16,
            //             is_subset: false,
            //             notes: "jeff notes",
            //         },
            //     ];
            //     expectedCreatedPages = [
            //         {
            //             id: 1,
            //             start_beat: 12,
            //             is_subset: false,
            //             notes: null,
            //         },
            //         {
            //             id: 2,
            //             start_beat: 10,
            //             is_subset: true,
            //             notes: null,
            //         },
            //         {
            //             id: 3,
            //             start_beat: 16,
            //             is_subset: false,
            //             notes: "jeff notes",
            //         },
            //     ];

            //     createResult = await createPages({ newPages, db });
            //     getResult = await PageTable.getPages({ db });

            //     // expect(createResult.success).toBe(true);
            //     expect(trimAndSort(createResult)).toEqual([
            //         expectedCreatedPages[2],
            //     ]);
            //     expect(addFirstPage(expectedCreatedPages)).toEqual(
            //         trimAndSort(getResult),
            //     );
            // });

            // it("should insert new pages into the database at the same time", async () => {
            //     const newPages: NewPageArgs[] = [
            //         { start_beat: 12, is_subset: false },
            //         { start_beat: 10, is_subset: true },
            //         {
            //             start_beat: 16,
            //             is_subset: false,
            //             notes: "jeff notes",
            //         },
            //     ];
            //     const expectedCreatedPages: DatabasePage[] = [
            //         {
            //             id: 3,
            //             start_beat: 16,
            //             is_subset: false,
            //             notes: "jeff notes",
            //         },
            //         {
            //             id: 2,
            //             start_beat: 10,
            //             is_subset: true,
            //             notes: null,
            //         },
            //         {
            //             id: 1,
            //             start_beat: 12,
            //             is_subset: false,
            //             notes: null,
            //         },
            //     ];

            //     const createResult = await createPages({
            //         newPages,
            //         db,
            //     });
            //     const getResult = await PageTable.getPages({ db });

            //     // expect(createResult.success).toBe(true);
            //     expect(trimAndSort(createResult)).toEqual(
            //         trimAndSort(expectedCreatedPages),
            //     );
            //     expect(trimAndSort(getResult)).toEqual(
            //         addFirstPage(expectedCreatedPages),
            //     );
            // });

            // it("should insert new pages into the middle of the database at the same time", async () => {
            //     let newPages: NewPageArgs[] = [
            //         { start_beat: 12, is_subset: false },
            //         { start_beat: 10, is_subset: true },
            //         {
            //             start_beat: 16,
            //             is_subset: false,

            //             notes: "jeff notes",
            //         },
            //     ];
            //     let expectedCreatedPages: DatabasePage[] = [
            //         {
            //             id: 3,
            //             start_beat: 16,
            //             is_subset: false,
            //             notes: "jeff notes",
            //         },
            //         {
            //             id: 2,
            //             start_beat: 10,
            //             is_subset: true,
            //             notes: null,
            //         },
            //         {
            //             id: 1,
            //             start_beat: 12,
            //             is_subset: false,
            //             notes: null,
            //         },
            //     ];

            //     let createResult = await createPages({
            //         newPages,
            //         db,
            //     });
            //     let getResult = await PageTable.getPages({ db });

            //     // expect(createResult.success).toBe(true);
            //     let trimmedCreateData = createResult.map((page: any) => {
            //         const {
            //             created_at: _created_at,
            //             updated_at: _updated_at,
            //             ...rest
            //         } = page;
            //         return {
            //             ...rest,
            //             notes: rest.notes ? rest.notes : null,
            //         };
            //     });
            //     let trimmedGetData = getResult.map((page: any) => {
            //         const {
            //             created_at: _created_at,
            //             updated_at: _updated_at,
            //             ...rest
            //         } = page;
            //         return {
            //             ...rest,
            //             notes: rest.notes ? rest.notes : null,
            //         };
            //     });
            //     expect(sort(trimmedCreateData)).toEqual(
            //         sort(expectedCreatedPages),
            //     );
            //     expect(sort(trimmedGetData)).toEqual(
            //         addFirstPage(sort(expectedCreatedPages)),
            //     );

            //     // NEW PAGES IN MIDDLE
            //     newPages = [
            //         { start_beat: 13, is_subset: false },
            //         { start_beat: 11, is_subset: true },
            //         {
            //             start_beat: 9,
            //             is_subset: false,
            //             notes: "jeff notes 2",
            //         },
            //     ];
            //     expectedCreatedPages = [
            //         {
            //             id: 6,
            //             start_beat: 9,
            //             is_subset: false,
            //             notes: "jeff notes 2",
            //         },
            //         {
            //             id: 3,
            //             start_beat: 16,
            //             is_subset: false,
            //             notes: "jeff notes",
            //         },
            //         {
            //             id: 5,
            //             start_beat: 11,
            //             is_subset: true,
            //             notes: null,
            //         },
            //         {
            //             id: 4,
            //             start_beat: 13,
            //             is_subset: false,
            //             notes: null,
            //         },
            //         {
            //             id: 2,
            //             start_beat: 10,
            //             is_subset: true,
            //             notes: null,
            //         },
            //         {
            //             id: 1,
            //             start_beat: 12,
            //             is_subset: false,
            //             notes: null,
            //         },
            //     ];

            //     createResult = await createPages({ newPages, db });
            //     getResult = await PageTable.getPages({ db });

            //     // expect(createResult.success).toBe(true);
            //     trimmedCreateData = createResult.map((page: any) => {
            //         const {
            //             created_at: _created_at,
            //             updated_at: _updated_at,
            //             ...rest
            //         } = page;
            //         return {
            //             ...rest,
            //             notes: rest.notes ? rest.notes : null,
            //         };
            //     });
            //     trimmedGetData = getResult.map((page: any) => {
            //         const {
            //             created_at: _created_at,
            //             updated_at: _updated_at,
            //             ...rest
            //         } = page;
            //         return {
            //             ...rest,
            //             notes: rest.notes ? rest.notes : null,
            //         };
            //     });
            //     const expectedCreated = [
            //         expectedCreatedPages[0],
            //         expectedCreatedPages[2],
            //         expectedCreatedPages[3],
            //     ];
            //     expect(sort(trimmedCreateData)).toEqual(sort(expectedCreated));
            //     expect(sort(trimmedGetData)).toEqual(
            //         addFirstPage(sort(expectedCreatedPages)),
            //     );
            // });

            // it("should also create marcherPages when marchers exist in the database", async () => {
            //     const marchers: NewMarcherArgs[] = [
            //         {
            //             name: "jeff",
            //             section: "brass",
            //             drill_prefix: "B",
            //             drill_order: 1,
            //         },
            //         {
            //             name: "ana",
            //             section: "brass",
            //             drill_prefix: "B",
            //             drill_order: 2,
            //         },
            //         {
            //             name: "qwerty",
            //             section: "wood",
            //             drill_prefix: "W",
            //             drill_order: 3,
            //         },
            //         {
            //             name: "pal",
            //             section: "brass",
            //             drill_prefix: "B",
            //             drill_order: 4,
            //         },
            //     ];
            //     const createMarchersResponse = MarcherTable.createMarchers({
            //         newMarchers: marchers,
            //         db,
            //     });
            //     // expect(createMarchersResponse.success).toBe(true);
            //     let allMarcherPages = () =>
            //         MarcherPageTable.getMarcherPages({ db });
            //     expect(allMarcherPages().length).toBe(4);

            //     const newPages: NewPageArgs[] = [
            //         { start_beat: 12, is_subset: false },
            //         { start_beat: 10, is_subset: true },
            //         {
            //             start_beat: 16,
            //             is_subset: false,

            //             notes: "jeff notes",
            //         },
            //     ];
            //     const expectedCreatedPages: DatabasePage[] = [
            //         {
            //             id: 1,
            //             start_beat: 12,
            //             is_subset: false,
            //             notes: null,
            //         },
            //         {
            //             id: 2,
            //             start_beat: 10,
            //             is_subset: true,
            //             notes: null,
            //         },
            //         {
            //             id: 3,
            //             start_beat: 16,
            //             is_subset: false,
            //             notes: "jeff notes",
            //         },
            //     ];

            //     const createResult = await createPages({
            //         newPages,
            //         db,
            //     });

            //     // expect(createResult.success).toBe(true);
            //     const trimmedCreateData = createResult.map((page: any) => {
            //         const {
            //             created_at: _created_at,
            //             updated_at: _updated_at,
            //             ...rest
            //         } = page;
            //         return {
            //             ...rest,
            //             notes: rest.notes ? rest.notes : null,
            //         };
            //     });
            //     expect(sort(trimmedCreateData)).toEqual(
            //         sort(expectedCreatedPages),
            //     );

            //     const marcherPages = MarcherPageTable.getMarcherPages({ db });
            //     // expect(marcherPages.success).toBe(true);
            //     const marcherPagesMap = new Map<
            //         number,
            //         (typeof marcherPages)[0]
            //     >(
            //         marcherPages.map((marcherPage) => [
            //             marcherPage.id,
            //             marcherPage,
            //         ]),
            //     );

            //     // Check that there is a marcherPage for every marcher and page combination
            //     for (const marcher of createMarchersResponse) {
            //         for (const page of createResult) {
            //             const marcherPage = marcherPages.find(
            //                 (marcherPage) =>
            //                     marcherPage.page_id === page.id &&
            //                     marcherPage.marcher_id === marcher.id,
            //             );
            //             expect(marcherPage).toBeDefined();
            //             if (!marcherPage) continue;
            //             // Check that the marcherPage is in the map
            //             expect(marcherPagesMap.has(marcherPage.id)).toBe(true);
            //             // Remove the marcherPage from the map
            //             marcherPagesMap.delete(marcherPage.id);
            //         }
            //     }
            //     expect(marcherPagesMap.size).toBe(4);
            // });
            // });

            // describe("updatePages", () => {
            //     it("updates multiple pages", async () => {
            //         const newPages: NewPageArgs[] = [
            //             {
            //                 start_beat: 8,
            //                 is_subset: true,

            //                 notes: "do not touch",
            //             },
            //             {
            //                 start_beat: 12,
            //                 is_subset: false,

            //                 notes: "notes jeff",
            //             },
            //             { start_beat: 10, is_subset: true },
            //             {
            //                 start_beat: 16,
            //                 is_subset: false,

            //                 notes: "jeff notes",
            //             },
            //         ];
            //         const expectedCreatedPages: DatabasePage[] = [
            //             {
            //                 id: 4,
            //                 start_beat: 16,
            //                 is_subset: false,
            //                 notes: "jeff notes",
            //             },
            //             {
            //                 id: 2,
            //                 start_beat: 12,
            //                 is_subset: false,
            //                 notes: "notes jeff",
            //             },
            //             {
            //                 id: 3,
            //                 start_beat: 10,
            //                 is_subset: true,
            //                 notes: null,
            //             },
            //             {
            //                 id: 1,
            //                 start_beat: 8,
            //                 is_subset: true,
            //                 notes: "do not touch",
            //             },
            //         ];

            //         const createResult = await createPages({ newPages, db });

            //         // expect(createResult.success).toBe(true);
            //         expect(trimAndSort(createResult)).toEqual(
            //             sort(expectedCreatedPages),
            //         );

            //         const updatedPages: PageTable.ModifiedPageArgs[] = [
            //             {
            //                 id: 1,
            //                 start_beat: 15,
            //                 is_subset: true,
            //                 notes: null,
            //             },
            //             {
            //                 id: 2,
            //                 start_beat: 11,
            //                 is_subset: false,
            //                 notes: "new note",
            //             },
            //             {
            //                 id: 4,
            //             },
            //         ];

            //         const expectedUpdatedPages: DatabasePage[] = [
            //             {
            //                 id: 1,
            //                 start_beat: 15,
            //                 is_subset: true,
            //                 notes: null,
            //             },
            //             {
            //                 id: 2,
            //                 start_beat: 11,
            //                 is_subset: false,
            //                 notes: "new note",
            //             },
            //             {
            //                 id: 4,
            //                 start_beat: 16,
            //                 is_subset: false,
            //                 notes: "jeff notes",
            //             },
            //         ];
            //         const expectedAllPages: DatabasePage[] = [
            //             ...expectedUpdatedPages,
            //             expectedCreatedPages.find((page) => page.id === 3)!,
            //         ];

            //         const updateResult = await PageTable.updatePages({
            //             modifiedPages: updatedPages,
            //             db,
            //         });
            //         // expect(updateResult.success).toBe(true);
            //         const trimmedUpdateData = updateResult.map((page: any) => {
            //             const {
            //                 created_at: _created_at,
            //                 updated_at: _updated_at,
            //                 ...rest
            //             } = page;
            //             return {
            //                 ...rest,
            //                 notes: rest.notes ? rest.notes : null,
            //             };
            //         });
            //         expect(sort(trimmedUpdateData)).toEqual(
            //             sort(expectedUpdatedPages),
            //         );

            //         const allPages = await PageTable.getPages({ db });
            //         // expect(allPages.success).toBe(true);
            //         const trimmedAllData = allPages.map((page: any) => {
            //             const {
            //                 created_at: _created_at,
            //                 updated_at: _updated_at,
            //                 ...rest
            //             } = page;
            //             return {
            //                 ...rest,
            //                 notes: rest.notes ? rest.notes : null,
            //             };
            //         });
            //         expect(sort(trimmedAllData)).toEqual(
            //             addFirstPage(sort(expectedAllPages)),
            //         );
            //     });

            //     it("should not update values if it is undefined in the updatedPageArgs", async () => {
            //         const newPages: NewPageArgs[] = [
            //             { start_beat: 12, is_subset: true },
            //             { start_beat: 10, is_subset: true },
            //             {
            //                 start_beat: 16,
            //                 is_subset: true,

            //                 notes: "jeff notes",
            //             },
            //         ];

            //         const createResult = await createPages({ newPages, db });
            //         // expect(createResult.success).toBe(true);
            //         expect(createResult.length).toBe(3);

            //         const updatedPage: PageTable.ModifiedPageArgs = {
            //             id: 3,
            //         };

            //         const updateResult = await PageTable.updatePages({
            //             modifiedPages: [updatedPage],
            //             db,
            //         });
            //         // expect(updateResult.success).toBe(true);
            //         expect(updateResult.length).toBe(1);

            //         const updatedPageResult = updateResult[0];
            //         expect(updatedPageResult.id).toBe(3);
            //         expect(updatedPageResult.notes).toBe("jeff notes");
            //         expect(updatedPageResult.start_beat).toBe(16); // Should update
            //         expect(updatedPageResult.is_subset).toBe(true); // Should update
            //     });
        });

        //     it.only("should fail to create pages with duplicate start_beat values", async () => {
        //         const newPages: NewPageArgs[] = [
        //             { start_beat: 12, is_subset: true },
        //             { start_beat: 12, is_subset: false }, // Duplicate start_beat
        //         ];

        //         expect(
        //             async () => await createPages({ newPages, db }),
        //         ).toThrowError();
        //     });

        //     it("should fail to update page with existing start_beat value", async () => {
        //         const newPages: NewPageArgs[] = [
        //             { start_beat: 12, is_subset: true },
        //             { start_beat: 14, is_subset: true },
        //         ];

        //         const createResult = await createPages({ newPages, db });
        //         // expect(createResult.success).toBe(true);

        //         const updatedPage: PageTable.ModifiedPageArgs = {
        //             id: 2,
        //             start_beat: 12, // Trying to update to existing start_beat
        //         };

        //         const updateResult = await PageTable.updatePages({
        //             modifiedPages: [updatedPage],
        //             db,
        //         });
        //         // expect(updateResult.success).toBe(false);
        //         expect(updateResult.error).toBeDefined();
        //     });

        //     it("should fail to update the first page", async () => {
        //         const updateFirstBeat = () => {
        //             db.update(schema.pages)
        //                 .set({ is_subset: 1 })
        //                 .where(eq(schema.pages.id, FIRST_PAGE_ID))
        //                 .run();
        //         };
        //         expect(updateFirstBeat).toThrow();
        //     });

        //     it("should not fail to update the first page's notes", async () => {
        //         const updateFirstBeat = () => {
        //             db.update(schema.pages)
        //                 .set({ notes: "test" })
        //                 .where(eq(schema.pages.id, FIRST_PAGE_ID))
        //                 .run();
        //         };
        //         expect(updateFirstBeat).not.toThrow();
        //         const getResult = await PageTable.getPages({ db });
        //         // expect(getResult.success).toBe(true);
        //         const firstPage = getResult.find(
        //             (page) => page.id === FIRST_PAGE_ID,
        //         );
        //         expect(firstPage?.notes).toBe("test");
        //     });

        //     describe("deletePage", () => {
        //         it("should delete a page by id from the database", async () => {
        //             const newPages: NewPageArgs[] = [
        //                 {
        //                     start_beat: 16,
        //                     is_subset: false,

        //                     notes: "jeff notes",
        //                 },
        //                 { start_beat: 10, is_subset: true },
        //                 { start_beat: 12, is_subset: false },
        //             ];
        //             const expectedCreatedPages = [
        //                 {
        //                     id: 1,
        //                     start_beat: 16,
        //                     is_subset: false,
        //                     notes: "jeff notes",
        //                 },
        //                 {
        //                     id: 2,
        //                     start_beat: 10,
        //                     is_subset: true,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 3,
        //                     start_beat: 12,
        //                     is_subset: false,
        //                     notes: null,
        //                 },
        //             ];

        //             const createResult = await createPages({ newPages, db });
        //             const getResult = await PageTable.getPages({ db });

        //             // expect(createResult.success).toBe(true);
        //             expect(trimAndSort(getResult)).toEqual(
        //                 addFirstPage(sort(expectedCreatedPages)),
        //             );

        //             let expectedDeletedPage = {
        //                 id: 2,
        //                 start_beat: 10,
        //                 is_subset: true,
        //                 notes: null,
        //             };
        //             let expectedPages = [
        //                 {
        //                     id: 1,
        //                     start_beat: 16,
        //                     is_subset: false,
        //                     notes: "jeff notes",
        //                 },
        //                 {
        //                     id: 3,
        //                     start_beat: 12,
        //                     is_subset: false,
        //                     notes: null,
        //                 },
        //             ];
        //             const deletePageResponse = await PageTable.deletePages({
        //                 pageIds: new Set<number>([2]),
        //                 db,
        //             });
        //             // expect(deletePageResponse.success).toBe(true);
        //             const trimmedDeleteData = deletePageResponse.map(
        //                 (page: any) => {
        //                     const {
        //                         created_at: _created_at,
        //                         updated_at: _updated_at,
        //                         ...rest
        //                     } = page;
        //                     return {
        //                         ...rest,
        //                         notes: rest.notes ? rest.notes : null,
        //                     };
        //                 },
        //             );
        //             expect(trimmedDeleteData).toEqual([expectedDeletedPage]);
        //             const allPages = await PageTable.getPages({ db });
        //             // expect(allPages.success).toBe(true);
        //             expect(trimAndSort(allPages)).toEqual(
        //                 addFirstPage(expectedPages),
        //             );
        //         });
        //         it("should delete multiple pages by id from the database", async () => {
        //             const newPages: NewPageArgs[] = [
        //                 { start_beat: 12, is_subset: false },
        //                 { start_beat: 10, is_subset: true },
        //                 {
        //                     start_beat: 16,
        //                     is_subset: false,

        //                     notes: "jeff notes",
        //                 },
        //                 { start_beat: 13, is_subset: true },
        //                 {
        //                     start_beat: 14,
        //                     is_subset: false,

        //                     notes: "bad notes",
        //                 },
        //                 {
        //                     start_beat: 11,
        //                     is_subset: true,

        //                     notes: "nice notes",
        //                 },
        //             ];

        //             const expectedCreatedPages = [
        //                 {
        //                     id: 1,
        //                     start_beat: 12,
        //                     is_subset: false,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 2,
        //                     start_beat: 10,
        //                     is_subset: true,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 3,
        //                     start_beat: 16,
        //                     is_subset: false,
        //                     notes: "jeff notes",
        //                 },
        //                 {
        //                     id: 4,
        //                     start_beat: 13,
        //                     is_subset: true,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 5,
        //                     start_beat: 14,
        //                     is_subset: false,
        //                     notes: "bad notes",
        //                 },
        //                 {
        //                     id: 6,
        //                     start_beat: 11,
        //                     is_subset: true,
        //                     notes: "nice notes",
        //                 },
        //             ];

        //             const createResult = await createPages({ newPages, db });
        //             // expect(createResult.success).toBe(true);
        //             expect(trimData(createResult)).toEqual(
        //                 sort(expectedCreatedPages),
        //             );

        //             const expectedDeletedPages = [
        //                 {
        //                     id: 1,
        //                     start_beat: 12,
        //                     is_subset: false,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 3,
        //                     start_beat: 16,
        //                     is_subset: false,
        //                     notes: "jeff notes",
        //                 },
        //                 {
        //                     id: 4,
        //                     start_beat: 13,
        //                     is_subset: true,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 6,
        //                     start_beat: 11,
        //                     is_subset: true,
        //                     notes: "nice notes",
        //                 },
        //             ];
        //             const expectedPages = [
        //                 {
        //                     id: 2,
        //                     start_beat: 10,
        //                     is_subset: true,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 5,
        //                     start_beat: 14,
        //                     is_subset: false,
        //                     notes: "bad notes",
        //                 },
        //             ];
        //             const deletePageResponse = await PageTable.deletePages({
        //                 pageIds: new Set<number>([1, 3, 4, 6]),
        //                 db,
        //             });
        //             // expect(deletePageResponse.success).toBe(true);
        //             expect(trimData(deletePageResponse)).toEqual(
        //                 trimData(expectedDeletedPages),
        //             );
        //             const allPages = await PageTable.getPages({ db });
        //             // expect(allPages.success).toBe(true);
        //             expect(trimAndSort(allPages)).toEqual(
        //                 addFirstPage(expectedPages),
        //             );
        //         });

        //         it("should delete pages and their associated marcherPages", async () => {
        //             const marchers: NewMarcherArgs[] = [
        //                 {
        //                     name: "jeff",
        //                     section: "brass",
        //                     drill_prefix: "B",
        //                     drill_order: 1,
        //                 },
        //                 {
        //                     name: "ana",
        //                     section: "brass",
        //                     drill_prefix: "B",
        //                     drill_order: 2,
        //                 },
        //                 {
        //                     name: "qwerty",
        //                     section: "wood",
        //                     drill_prefix: "W",
        //                     drill_order: 3,
        //                 },
        //                 {
        //                     name: "pal",
        //                     section: "brass",
        //                     drill_prefix: "B",
        //                     drill_order: 4,
        //                 },
        //             ];
        //             const createMarchersResponse = MarcherTable.createMarchers({
        //                 newMarchers: marchers,
        //                 db,
        //             });
        //             // expect(createMarchersResponse.success).toBe(true);
        //             expect(createMarchersResponse.length).toBe(4);
        //             const expectMarcherPagesLengthToBe = (length: number) => {
        //                 const marcherPages = MarcherPageTable.getMarcherPages({
        //                     db,
        //                 });
        //                 // expect(marcherPages.success).toBe(true);
        //                 expect(marcherPages.length).toBe(length + 4);
        //             };
        //             expectMarcherPagesLengthToBe(0);

        //             const newPages: NewPageArgs[] = [
        //                 { start_beat: 12, is_subset: false },
        //                 { start_beat: 10, is_subset: true },
        //                 {
        //                     start_beat: 16,
        //                     is_subset: false,

        //                     notes: "jeff notes",
        //                 },
        //                 { start_beat: 4, is_subset: true },
        //                 {
        //                     start_beat: 14,
        //                     is_subset: false,

        //                     notes: "bad notes",
        //                 },
        //                 {
        //                     start_beat: 9,
        //                     is_subset: true,

        //                     notes: "nice notes",
        //                 },
        //             ];

        //             const expectedCreatedPages = [
        //                 {
        //                     id: 1,
        //                     start_beat: 12,
        //                     is_subset: false,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 2,
        //                     start_beat: 10,
        //                     is_subset: true,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 3,
        //                     start_beat: 16,
        //                     is_subset: false,
        //                     notes: "jeff notes",
        //                 },
        //                 {
        //                     id: 4,
        //                     start_beat: 4,
        //                     is_subset: true,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 5,
        //                     start_beat: 14,
        //                     is_subset: false,
        //                     notes: "bad notes",
        //                 },
        //                 {
        //                     id: 6,
        //                     start_beat: 9,
        //                     is_subset: true,
        //                     notes: "nice notes",
        //                 },
        //             ];

        //             const createResult = await createPages({ newPages, db });
        //             // expect(createResult.success).toBe(true);
        //             expect(trimData(createResult)).toEqual(
        //                 sort(expectedCreatedPages),
        //             );

        //             expectMarcherPagesLengthToBe(
        //                 expectedCreatedPages.length * marchers.length,
        //             );

        //             const expectedDeletedPages = [
        //                 {
        //                     id: 1,
        //                     start_beat: 12,
        //                     is_subset: false,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 3,
        //                     start_beat: 16,
        //                     is_subset: false,
        //                     notes: "jeff notes",
        //                 },
        //                 {
        //                     id: 4,
        //                     start_beat: 4,
        //                     is_subset: true,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 6,
        //                     start_beat: 9,
        //                     is_subset: true,
        //                     notes: "nice notes",
        //                 },
        //             ];
        //             const expectedPages = [
        //                 {
        //                     id: 2,
        //                     start_beat: 10,
        //                     is_subset: true,
        //                     notes: null,
        //                 },
        //                 {
        //                     id: 5,
        //                     start_beat: 14,
        //                     is_subset: false,
        //                     notes: "bad notes",
        //                 },
        //             ];
        //             const deletePageResponse = await PageTable.deletePages({
        //                 pageIds: new Set<number>([1, 3, 4, 6]),
        //                 db,
        //             });
        //             // expect(deletePageResponse.success).toBe(true);
        //             expect(trimData(deletePageResponse)).toEqual(
        //                 trimData(expectedDeletedPages),
        //             );
        //             const allPages = await PageTable.getPages({ db });
        //             // expect(allPages.success).toBe(true);
        //             expect(trimAndSort(allPages)).toEqual(
        //                 addFirstPage(expectedPages),
        //             );

        //             expectMarcherPagesLengthToBe(
        //                 marchers.length * expectedPages.length,
        //             );
        //             const marcherPages = MarcherPageTable.getMarcherPages({ db });
        //             const marcherPagesMap = new Map<
        //                 number,
        //                 (typeof marcherPages)[0]
        //             >(
        //                 marcherPages.map((marcherPage) => [
        //                     marcherPage.id,
        //                     marcherPage,
        //                 ]),
        //             );
        //             // Check that there is a marcherPage for every marcher and page combination
        //             for (const marcher of createMarchersResponse) {
        //                 for (const page of allPages) {
        //                     const marcherPage = marcherPages.find(
        //                         (marcherPage) =>
        //                             marcherPage.page_id === page.id &&
        //                             marcherPage.marcher_id === marcher.id,
        //                     );
        //                     expect(marcherPage).toBeDefined();
        //                     if (!marcherPage) continue;
        //                     // Check that the marcherPage is in the map
        //                     expect(marcherPagesMap.has(marcherPage.id)).toBe(true);
        //                     // Remove the marcherPage from the map
        //                     marcherPagesMap.delete(marcherPage.id);
        //                 }
        //             }
        //             expect(marcherPagesMap.size).toBe(0);
        //         });
        //     });
        // });

        // describe.skip("undo/redo", () => {
        //     let db: Database.Database;
        //     const sort = (
        //         items: DatabasePage[],
        //     ): DatabasePage[] => {
        //         // Create a map to access items by their id
        //         const beats = getBeats({ db });
        //         const beatMap = new Map<number, DatabaseBeat>(
        //             beats.map((beat) => [beat.id, beat]),
        //         );

        //         return items.sort((a, b) => {
        //             const aBeat = beatMap.get(a.start_beat);
        //             const bBeat = beatMap.get(b.start_beat);
        //             if (!aBeat || !bBeat) {
        //                 console.log("aBeat", a.start_beat, aBeat);
        //                 console.log("bBeat", b.start_beat, bBeat);
        //                 throw new Error(
        //                     `Beat not found: ${a.start_beat} ${aBeat} - ${b.start_beat} ${bBeat}`,
        //                 );
        //             }
        //             return aBeat!.position - bBeat!.position;
        //         });
        //     };

        //     beforeEach(async () => {
        //         db = await initTestDatabase();
        //     });
        //     describe("CreatePages", () => {
        //         describe("without any marchers", async () => {
        //             it("should undo and redo a single created page correctly", async () => {
        //                 const newPage: NewPageArgs = {
        //                     start_beat: 12,
        //                     is_subset: false,
        //                 };

        //                 // Create a new page
        //                 const createResult = await createPages({
        //                     newPages: [newPage],
        //                     db,
        //                 });
        //                 // expect(createResult.success).toBe(true);
        //                 expect(createResult.length).toBe(1);

        //                 const createdPage = createResult[0];
        //                 expect(createdPage.start_beat).toBe(12);
        //                 expect(createdPage.is_subset).toBe(false);

        //                 // Undo the creation
        //                 const undoResult = History.performUndo(db);
        //                 // expect(undoResult.success).toBe(true);

        //                 // Verify the page is no longer in the database
        //                 const getPagesAfterUndo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo.success).toBe(true);
        //                 expect(getPagesAfterUndo.length).toBe(1);

        //                 // Redo the creation
        //                 const redoResult = History.performRedo(db);
        //                 // expect(redoResult.success).toBe(true);

        //                 // Verify the page is back in the database
        //                 const getPagesAfterRedo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterRedo.success).toBe(true);
        //                 expect(getPagesAfterRedo.length).toBe(2);
        //                 const redonePage = sort(getPagesAfterRedo)[1];
        //                 expect(redonePage.start_beat).toBe(12);
        //                 expect(redonePage.is_subset).toBe(false);

        //                 // Undo the creation again
        //                 const undoResult2 = History.performUndo(db);
        //                 // expect(undoResult2.success).toBe(true);

        //                 // Verify the page is no longer in the database
        //                 const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo2.success).toBe(true);
        //                 expect(getPagesAfterUndo2.length).toBe(1);
        //             });

        //             it("should undo and redo multiple created pages correctly", async () => {
        //                 const newPages: NewPageArgs[] = [
        //                     {
        //                         start_beat: 16,
        //                         is_subset: false,

        //                         notes: "jeff notes",
        //                     },
        //                     { start_beat: 10, is_subset: true },
        //                     { start_beat: 12, is_subset: false },
        //                 ];

        //                 // Create new pages
        //                 const createResult = await createPages({
        //                     newPages,
        //                     db,
        //                 });
        //                 // expect(createResult.success).toBe(true);
        //                 expect(createResult.length).toBe(3);

        //                 const createdPages = createResult.sort(
        //                     (a, b) => a.id - b.id,
        //                 );
        //                 expect(createdPages[0].start_beat).toBe(16);
        //                 expect(createdPages[0].is_subset).toBe(false);
        //                 expect(createdPages[0].notes).toBe("jeff notes");
        //                 expect(createdPages[1].start_beat).toBe(10);
        //                 expect(createdPages[1].is_subset).toBe(true);
        //                 expect(createdPages[2].start_beat).toBe(12);
        //                 expect(createdPages[2].is_subset).toBe(false);

        //                 // Undo the creation
        //                 const undoResult = History.performUndo(db);
        //                 // expect(undoResult.success).toBe(true);

        //                 // Verify the pages are no longer in the database
        //                 const getPagesAfterUndo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo.success).toBe(true);
        //                 expect(getPagesAfterUndo.length).toBe(1);

        //                 // Redo the creation
        //                 const redoResult = History.performRedo(db);
        //                 // expect(redoResult.success).toBe(true);

        //                 // Verify the pages are back in the database
        //                 const getPagesAfterRedo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterRedo.success).toBe(true);
        //                 expect(getPagesAfterRedo.length).toBe(4);
        //                 const redonePages = getPagesAfterRedo.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 );
        //                 expect(redonePages[0].start_beat).toBe(16);
        //                 expect(redonePages[0].is_subset).toBe(false);
        //                 expect(redonePages[0].notes).toBe("jeff notes");
        //                 expect(redonePages[1].start_beat).toBe(10);
        //                 expect(redonePages[1].is_subset).toBe(true);
        //                 expect(redonePages[2].start_beat).toBe(12);
        //                 expect(redonePages[2].is_subset).toBe(false);

        //                 // Undo the creation again
        //                 const undoResult2 = History.performUndo(db);
        //                 // expect(undoResult2.success).toBe(true);

        //                 // Verify the pages are no longer in the database
        //                 const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo2.success).toBe(true);
        //                 expect(getPagesAfterUndo2.length).toBe(1);
        //             });

        //             it("can undo, redo, and undo the creation of multiple pages while other pages exist in the database", async () => {
        //                 const existingPages: NewPageArgs[] = [
        //                     { start_beat: 5, is_subset: false },
        //                     { start_beat: 8, is_subset: true },
        //                 ];

        //                 // Create existing pages
        //                 const createExistingResult = await createPages({
        //                     newPages: existingPages,
        //                     db,
        //                 });
        //                 // expect(createExistingResult.success).toBe(true);
        //                 expect(createExistingResult.length).toBe(2);

        //                 const newPages: NewPageArgs[] = [
        //                     {
        //                         start_beat: 16,
        //                         is_subset: false,

        //                         notes: "jeff notes",
        //                     },
        //                     { start_beat: 10, is_subset: true },
        //                     { start_beat: 12, is_subset: false },
        //                 ];

        //                 // Create new pages
        //                 const createResult = await createPages({
        //                     newPages,
        //                     db,
        //                 });
        //                 // expect(createResult.success).toBe(true);
        //                 expect(createResult.length).toBe(3);

        //                 const createdPages = createResult.sort(
        //                     (a, b) => a.id - b.id,
        //                 );
        //                 expect(createdPages[0].start_beat).toBe(16);
        //                 expect(createdPages[0].is_subset).toBe(false);
        //                 expect(createdPages[0].notes).toBe("jeff notes");
        //                 expect(createdPages[1].start_beat).toBe(10);
        //                 expect(createdPages[1].is_subset).toBe(true);
        //                 expect(createdPages[2].start_beat).toBe(12);
        //                 expect(createdPages[2].is_subset).toBe(false);

        //                 // Undo the creation
        //                 const undoResult = History.performUndo(db);
        //                 // expect(undoResult.success).toBe(true);

        //                 // Verify the new pages are no longer in the database
        //                 const getPagesAfterUndo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo.success).toBe(true);
        //                 expect(getPagesAfterUndo.length).toBe(3);

        //                 // Redo the creation
        //                 const redoResult = History.performRedo(db);
        //                 // expect(redoResult.success).toBe(true);

        //                 // Verify the new pages are back in the database
        //                 const getPagesAfterRedo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterRedo.success).toBe(true);
        //                 expect(getPagesAfterRedo.length).toBe(6);
        //                 const redonePages = getPagesAfterRedo
        //                     .filter((p) => p.id !== FIRST_PAGE_ID)
        //                     .slice(2);
        //                 expect(redonePages[0].start_beat).toBe(16);
        //                 expect(redonePages[0].is_subset).toBe(false);
        //                 expect(redonePages[0].notes).toBe("jeff notes");
        //                 expect(redonePages[1].start_beat).toBe(10);
        //                 expect(redonePages[1].is_subset).toBe(true);
        //                 expect(redonePages[2].start_beat).toBe(12);
        //                 expect(redonePages[2].is_subset).toBe(false);

        //                 // Undo the creation again
        //                 const undoResult2 = History.performUndo(db);
        //                 // expect(undoResult2.success).toBe(true);

        //                 // Verify the new pages are no longer in the database again
        //                 const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo2.success).toBe(true);
        //                 expect(getPagesAfterUndo2.length).toBe(3);
        //             });
        //         });
        //         describe("with marchers", async () => {
        //             it("should undo, redo, and undo the creation of a single page and the associated marcher pages when 3 marchers exist", async () => {
        //                 const marchers: NewMarcherArgs[] = [
        //                     {
        //                         name: "jeff",
        //                         section: "brass",
        //                         drill_prefix: "B",
        //                         drill_order: 1,
        //                     },
        //                     {
        //                         name: "ana",
        //                         section: "brass",
        //                         drill_prefix: "B",
        //                         drill_order: 2,
        //                     },
        //                     {
        //                         name: "qwerty",
        //                         section: "wood",
        //                         drill_prefix: "W",
        //                         drill_order: 3,
        //                     },
        //                 ];

        //                 // Create marchers
        //                 const createMarchersResponse = MarcherTable.createMarchers({
        //                     newMarchers: marchers,
        //                     db,
        //                 });
        //                 // expect(createMarchersResponse.success).toBe(true);
        //                 expect(createMarchersResponse.length).toBe(3);

        //                 const newPage: NewPageArgs = {
        //                     start_beat: 12,
        //                     is_subset: false,
        //                 };

        //                 // Create a new page
        //                 const createResult = await createPages({
        //                     newPages: [newPage],
        //                     db,
        //                 });
        //                 // expect(createResult.success).toBe(true);
        //                 expect(createResult.length).toBe(1);

        //                 const createdPage = createResult[0];
        //                 expect(createdPage.start_beat).toBe(12);
        //                 expect(createdPage.is_subset).toBe(false);

        //                 // Verify marcher pages are created
        //                 const marcherPages = MarcherPageTable.getMarcherPages({
        //                     db,
        //                 });
        //                 // expect(marcherPages.success).toBe(true);
        //                 expect(marcherPages.length).toBe(6);

        //                 // Undo the creation
        //                 const undoResult = History.performUndo(db);
        //                 // History.performUndo(db);
        //                 // expect(undoResult.success).toBe(true);

        //                 // Verify the page and marcher pages are no longer in the database
        //                 const getPagesAfterUndo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo.success).toBe(true);
        //                 expect(getPagesAfterUndo.length).toBe(1);

        //                 const marcherPagesAfterUndo =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterUndo.success).toBe(true);
        //                 expect(marcherPagesAfterUndo.length).toBe(3);

        //                 // Redo the creation
        //                 const redoResult = History.performRedo(db);
        //                 // expect(redoResult.success).toBe(true);

        //                 // Verify the page and marcher pages are back in the database
        //                 const getPagesAfterRedo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterRedo.success).toBe(true);
        //                 expect(getPagesAfterRedo.length).toBe(2);
        //                 const redonePage = getPagesAfterRedo.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 )[0];
        //                 expect(redonePage.start_beat).toBe(12);
        //                 expect(redonePage.is_subset).toBe(false);

        //                 const marcherPagesAfterRedo =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterRedo.success).toBe(true);
        //                 expect(marcherPagesAfterRedo.length).toBe(6);

        //                 // Undo the creation again
        //                 const undoResult2 = History.performUndo(db);
        //                 // expect(undoResult2.success).toBe(true);

        //                 // Verify the page and marcher pages are no longer in the database again
        //                 const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo2.success).toBe(true);
        //                 expect(
        //                     getPagesAfterUndo2.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(0);

        //                 const marcherPagesAfterUndo2 =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterUndo2.success).toBe(true);
        //                 expect(marcherPagesAfterUndo2.length).toBe(3);
        //             });

        //             it("should undo, redo, and undo the creation of multiple pages and the associated marcher pages when 3 marchers exist", async () => {
        //                 const marchers: NewMarcherArgs[] = [
        //                     {
        //                         name: "jeff",
        //                         section: "brass",
        //                         drill_prefix: "B",
        //                         drill_order: 1,
        //                     },
        //                     {
        //                         name: "ana",
        //                         section: "brass",
        //                         drill_prefix: "B",
        //                         drill_order: 2,
        //                     },
        //                     {
        //                         name: "qwerty",
        //                         section: "wood",
        //                         drill_prefix: "W",
        //                         drill_order: 3,
        //                     },
        //                 ];

        //                 // Create marchers
        //                 const createMarchersResponse = MarcherTable.createMarchers({
        //                     newMarchers: marchers,
        //                     db,
        //                 });
        //                 // expect(createMarchersResponse.success).toBe(true);
        //                 expect(createMarchersResponse.length).toBe(3);

        //                 const newPages: NewPageArgs[] = [
        //                     {
        //                         start_beat: 16,
        //                         is_subset: false,

        //                         notes: "jeff notes",
        //                     },
        //                     { start_beat: 10, is_subset: true },
        //                     { start_beat: 12, is_subset: false },
        //                 ];

        //                 // Create new pages
        //                 const createResult = await createPages({
        //                     newPages,
        //                     db,
        //                 });
        //                 // expect(createResult.success).toBe(true);
        //                 expect(createResult.length).toBe(3);

        //                 const createdPages = createResult.sort(
        //                     (a, b) => a.id - b.id,
        //                 );
        //                 expect(createdPages[0].start_beat).toBe(16);
        //                 expect(createdPages[0].is_subset).toBe(false);
        //                 expect(createdPages[0].notes).toBe("jeff notes");
        //                 expect(createdPages[1].start_beat).toBe(10);
        //                 expect(createdPages[1].is_subset).toBe(true);
        //                 expect(createdPages[2].start_beat).toBe(12);
        //                 expect(createdPages[2].is_subset).toBe(false);

        //                 // Verify marcher pages are created
        //                 const marcherPages = MarcherPageTable.getMarcherPages({
        //                     db,
        //                 });
        //                 // expect(marcherPages.success).toBe(true);
        //                 expect(marcherPages.length).toBe(12);

        //                 // Undo the creation
        //                 const undoResult = History.performUndo(db);
        //                 // expect(undoResult.success).toBe(true);

        //                 // Verify the pages and marcher pages are no longer in the database
        //                 const getPagesAfterUndo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo.success).toBe(true);
        //                 expect(getPagesAfterUndo.length).toBe(1);

        //                 const marcherPagesAfterUndo =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterUndo.success).toBe(true);
        //                 expect(marcherPagesAfterUndo.length).toBe(3);

        //                 // Redo the creation
        //                 const redoResult = History.performRedo(db);
        //                 // expect(redoResult.success).toBe(true);

        //                 // Verify the pages and marcher pages are back in the database
        //                 const getPagesAfterRedo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterRedo.success).toBe(true);
        //                 expect(
        //                     getPagesAfterRedo.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(3);
        //                 const redonePages = getPagesAfterRedo.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 );
        //                 expect(redonePages[0].start_beat).toBe(16);
        //                 expect(redonePages[0].is_subset).toBe(false);
        //                 expect(redonePages[0].notes).toBe("jeff notes");
        //                 expect(redonePages[1].start_beat).toBe(10);
        //                 expect(redonePages[1].is_subset).toBe(true);
        //                 expect(redonePages[2].start_beat).toBe(12);
        //                 expect(redonePages[2].is_subset).toBe(false);

        //                 const marcherPagesAfterRedo =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterRedo.success).toBe(true);
        //                 expect(marcherPagesAfterRedo.length).toBe(12);

        //                 // Undo the creation again
        //                 const undoResult2 = History.performUndo(db);
        //                 // expect(undoResult2.success).toBe(true);

        //                 // Verify the pages and marcher pages are no longer in the database again
        //                 const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo2.success).toBe(true);
        //                 expect(
        //                     getPagesAfterUndo2.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(0);

        //                 const marcherPagesAfterUndo2 =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterUndo2.success).toBe(true);
        //                 expect(marcherPagesAfterUndo2.length).toBe(3);
        //             });
        //         });
        //     });

        //     describe("updatePages", () => {
        //         it("can undo, redo, and undo the updating of a single page", async () => {
        //             const newPage: NewPageArgs = {
        //                 start_beat: 12,
        //                 is_subset: false,
        //                 notes: null,
        //             };

        //             // Create a new page
        //             const createResult = await createPages({
        //                 newPages: [newPage],
        //                 db,
        //             });
        //             // expect(createResult.success).toBe(true);
        //             expect(createResult.length).toBe(1);

        //             const createdPage = createResult[0];
        //             expect(createdPage.start_beat).toBe(12);
        //             expect(createdPage.is_subset).toBe(false);

        //             // Update the page
        //             const updatedPage: PageTable.ModifiedPageArgs = {
        //                 id: createdPage.id,
        //                 start_beat: 15,
        //                 is_subset: true,
        //                 notes: "updated notes",
        //             };

        //             const updateResult = await PageTable.updatePages({
        //                 modifiedPages: [updatedPage],
        //                 db,
        //             });
        //             // expect(updateResult.success).toBe(true);
        //             expect(updateResult.length).toBe(1);

        //             const updatedPageResult = updateResult[0];
        //             expect(updatedPageResult.start_beat).toBe(15);
        //             expect(updatedPageResult.is_subset).toBe(true);
        //             expect(updatedPageResult.notes).toBe("updated notes");

        //             // Undo the update
        //             const undoResult = History.performUndo(db);
        //             // expect(undoResult.success).toBe(true);

        //             // Verify the page is reverted to its original state
        //             const getPagesAfterUndo = await PageTable.getPages({ db });
        //             // expect(getPagesAfterUndo.success).toBe(true);
        //             expect(getPagesAfterUndo.length).toBe(2);
        //             const revertedPage = getPagesAfterUndo.filter(
        //                 (p) => p.id !== FIRST_PAGE_ID,
        //             )[0];
        //             expect(revertedPage.start_beat).toBe(12);
        //             expect(revertedPage.is_subset).toBe(false);
        //             expect(revertedPage.notes).toBeNull();

        //             // Redo the update
        //             const redoResult = History.performRedo(db);
        //             // expect(redoResult.success).toBe(true);

        //             // Verify the page is updated again
        //             const getPagesAfterRedo = await PageTable.getPages({ db });
        //             // expect(getPagesAfterRedo.success).toBe(true);
        //             expect(
        //                 getPagesAfterRedo.filter((p) => p.id !== FIRST_PAGE_ID)
        //                     .length,
        //             ).toBe(1);
        //             const redonePage = getPagesAfterRedo.filter(
        //                 (p) => p.id !== FIRST_PAGE_ID,
        //             )[0];
        //             expect(redonePage.start_beat).toBe(15);
        //             expect(redonePage.is_subset).toBe(true);
        //             expect(redonePage.notes).toBe("updated notes");

        //             // Undo the update again
        //             const undoResult2 = History.performUndo(db);
        //             // expect(undoResult2.success).toBe(true);

        //             // Verify the page is reverted to its original state again
        //             const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //             // expect(getPagesAfterUndo2.success).toBe(true);
        //             expect(
        //                 getPagesAfterUndo2.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 ).length,
        //             ).toBe(1);
        //             const revertedPage2 = getPagesAfterUndo2.filter(
        //                 (p) => p.id !== FIRST_PAGE_ID,
        //             )[0];
        //             expect(revertedPage2.start_beat).toBe(12);
        //             expect(revertedPage2.is_subset).toBe(false);
        //             expect(revertedPage2.notes).toBeNull();
        //         });
        //         it("can undo, redo, and undo the updating of multiple pages at once", async () => {
        //             const newPages: NewPageArgs[] = [
        //                 {
        //                     start_beat: 16,
        //                     is_subset: false,

        //                     notes: "jeff notes",
        //                 },
        //                 { start_beat: 10, is_subset: true },
        //                 { start_beat: 12, is_subset: false },
        //             ];

        //             // Create new pages
        //             const createResult = await createPages({
        //                 newPages,
        //                 db,
        //             });
        //             // expect(createResult.success).toBe(true);
        //             expect(createResult.length).toBe(3);

        //             const createdPages = createResult.sort(
        //                 (a, b) => a.id - b.id,
        //             );

        //             // Update the pages
        //             const updatedPages: PageTable.ModifiedPageArgs[] = [
        //                 {
        //                     id: createdPages[0].id,
        //                     start_beat: 15,
        //                     is_subset: true,
        //                     notes: "updated notes 1",
        //                 },
        //                 {
        //                     id: createdPages[1].id,
        //                     start_beat: 11,
        //                     is_subset: false,
        //                     notes: "updated notes 2",
        //                 },
        //                 {
        //                     id: createdPages[2].id,
        //                     start_beat: 8,
        //                     is_subset: true,
        //                     notes: "updated notes 3",
        //                 },
        //             ];

        //             const updateResult = await PageTable.updatePages({
        //                 modifiedPages: updatedPages,
        //                 db,
        //             });
        //             // expect(updateResult.success).toBe(true);
        //             expect(updateResult.length).toBe(3);

        //             const updatedPageResults = updateResult.sort(
        //                 (a, b) => a.id - b.id,
        //             );
        //             expect(updatedPageResults[0].start_beat).toBe(15);
        //             expect(updatedPageResults[0].is_subset).toBe(true);
        //             expect(updatedPageResults[0].notes).toBe("updated notes 1");
        //             expect(updatedPageResults[1].start_beat).toBe(11);
        //             expect(updatedPageResults[1].is_subset).toBe(false);
        //             expect(updatedPageResults[1].notes).toBe("updated notes 2");
        //             expect(updatedPageResults[2].start_beat).toBe(8);
        //             expect(updatedPageResults[2].is_subset).toBe(true);
        //             expect(updatedPageResults[2].notes).toBe("updated notes 3");

        //             // Undo the updates
        //             const undoResult = History.performUndo(db);
        //             // expect(undoResult.success).toBe(true);

        //             // Verify the pages are reverted to their original state
        //             const getPagesAfterUndo = await PageTable.getPages({ db });
        //             // expect(getPagesAfterUndo.success).toBe(true);
        //             expect(getPagesAfterUndo.length).toBe(4);
        //             const revertedPages = getPagesAfterUndo.filter(
        //                 (p) => p.id !== FIRST_PAGE_ID,
        //             );
        //             expect(revertedPages[0].start_beat).toBe(16);
        //             expect(revertedPages[0].is_subset).toBe(false);
        //             expect(revertedPages[0].notes).toBe("jeff notes");
        //             expect(revertedPages[1].start_beat).toBe(10);
        //             expect(revertedPages[1].is_subset).toBe(true);
        //             expect(revertedPages[1].notes).toBeNull();
        //             expect(revertedPages[2].start_beat).toBe(12);
        //             expect(revertedPages[2].is_subset).toBe(false);
        //             expect(revertedPages[2].notes).toBeNull();

        //             // Redo the updates
        //             const redoResult = History.performRedo(db);
        //             // expect(redoResult.success).toBe(true);

        //             // Verify the pages are updated again
        //             const getPagesAfterRedo = await PageTable.getPages({ db });
        //             // expect(getPagesAfterRedo.success).toBe(true);
        //             expect(
        //                 getPagesAfterRedo.filter((p) => p.id !== FIRST_PAGE_ID)
        //                     .length,
        //             ).toBe(3);
        //             const redonePages = getPagesAfterRedo.filter(
        //                 (p) => p.id !== FIRST_PAGE_ID,
        //             );
        //             expect(redonePages[0].start_beat).toBe(15);
        //             expect(redonePages[0].is_subset).toBe(true);
        //             expect(redonePages[0].notes).toBe("updated notes 1");
        //             expect(redonePages[1].start_beat).toBe(11);
        //             expect(redonePages[1].is_subset).toBe(false);
        //             expect(redonePages[1].notes).toBe("updated notes 2");
        //             expect(redonePages[2].start_beat).toBe(8);
        //             expect(redonePages[2].is_subset).toBe(true);
        //             expect(redonePages[2].notes).toBe("updated notes 3");

        //             // Undo the updates again
        //             const undoResult2 = History.performUndo(db);
        //             // expect(undoResult2.success).toBe(true);

        //             // Verify the pages are reverted to their original state again
        //             const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //             // expect(getPagesAfterUndo2.success).toBe(true);
        //             expect(
        //                 getPagesAfterUndo2.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 ).length,
        //             ).toBe(3);
        //             const revertedPages2 = getPagesAfterUndo2.filter(
        //                 (p) => p.id !== FIRST_PAGE_ID,
        //             );
        //             expect(revertedPages2[0].start_beat).toBe(16);
        //             expect(revertedPages2[0].is_subset).toBe(false);
        //             expect(revertedPages2[0].notes).toBe("jeff notes");
        //             expect(revertedPages2[1].start_beat).toBe(10);
        //             expect(revertedPages2[1].is_subset).toBe(true);
        //             expect(revertedPages2[1].notes).toBeNull();
        //             expect(revertedPages2[2].start_beat).toBe(12);
        //             expect(revertedPages2[2].is_subset).toBe(false);
        //             expect(revertedPages2[2].notes).toBeNull();
        //         });
        //     });

        //     describe("deletePages", () => {
        //         describe("without any marchers", async () => {
        //             it("should undo, redo, and undo a single page being deleted", async () => {
        //                 const newPage: NewPageArgs = {
        //                     start_beat: 12,
        //                     is_subset: false,
        //                     notes: "jeff notes",
        //                 };

        //                 // Create a new page
        //                 const createResult = await createPages({
        //                     newPages: [newPage],
        //                     db,
        //                 });
        //                 // expect(createResult.success).toBe(true);
        //                 expect(createResult.length).toBe(1);

        //                 const createdPage = createResult[0];
        //                 expect(createdPage.start_beat).toBe(12);
        //                 expect(createdPage.is_subset).toBe(false);

        //                 // Delete the page
        //                 const deleteResult = await PageTable.deletePages({
        //                     pageIds: new Set<number>([createdPage.id]),
        //                     db,
        //                 });
        //                 // expect(deleteResult.success).toBe(true);
        //                 expect(deleteResult.length).toBe(1);

        //                 const deletedPage = deleteResult[0];
        //                 expect(deletedPage.id).toBe(createdPage.id);

        //                 // Undo the deletion
        //                 const undoResult = History.performUndo(db);
        //                 // expect(undoResult.success).toBe(true);

        //                 // Verify the page is back in the database
        //                 const getPagesAfterUndo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo.success).toBe(true);
        //                 expect(getPagesAfterUndo.length).toBe(2);
        //                 const undonePage = getPagesAfterUndo.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 )[0];
        //                 expect(undonePage.start_beat).toBe(12);
        //                 expect(undonePage.is_subset).toBe(false);

        //                 // Redo the deletion
        //                 const redoResult = History.performRedo(db);
        //                 // expect(redoResult.success).toBe(true);

        //                 // Verify the page is deleted again
        //                 const getPagesAfterRedo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterRedo.success).toBe(true);
        //                 expect(
        //                     getPagesAfterRedo.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(0);

        //                 // Undo the deletion again
        //                 const undoResult2 = History.performUndo(db);
        //                 // expect(undoResult2.success).toBe(true);

        //                 // Verify the page is back in the database again
        //                 const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo2.success).toBe(true);
        //                 expect(
        //                     getPagesAfterUndo2.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(1);
        //                 const undonePage2 = getPagesAfterUndo2.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 )[0];
        //                 expect(undonePage2.start_beat).toBe(12);
        //                 expect(undonePage2.is_subset).toBe(false);
        //             });

        //             it("should undo, redo, and undo multiple pages being deleted", async () => {
        //                 const newPages: NewPageArgs[] = [
        //                     { start_beat: 12, is_subset: false },
        //                     { start_beat: 10, is_subset: true },
        //                     {
        //                         start_beat: 16,
        //                         is_subset: false,

        //                         notes: "jeff notes",
        //                     },
        //                 ];

        //                 // Create new pages
        //                 const createResult = await createPages({
        //                     newPages,
        //                     db,
        //                 });
        //                 // expect(createResult.success).toBe(true);
        //                 expect(createResult.length).toBe(3);

        //                 const createdPages = createResult;

        //                 // Delete the pages
        //                 const deleteResult = await PageTable.deletePages({
        //                     pageIds: new Set<number>(
        //                         createdPages.map((page) => page.id),
        //                     ),
        //                     db,
        //                 });
        //                 // expect(deleteResult.success).toBe(true);
        //                 expect(deleteResult.length).toBe(3);

        //                 const deletedPages = deleteResult;
        //                 expect(deletedPages.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );

        //                 // Undo the deletion
        //                 const undoResult = History.performUndo(db);
        //                 // expect(undoResult.success).toBe(true);

        //                 // Verify the pages are back in the database
        //                 const getPagesAfterUndo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo.success).toBe(true);
        //                 expect(getPagesAfterUndo.length).toBe(4);
        //                 const undonePages = getPagesAfterUndo.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 );
        //                 expect(undonePages.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );

        //                 // Redo the deletion
        //                 const redoResult = History.performRedo(db);
        //                 // expect(redoResult.success).toBe(true);

        //                 // Verify the pages are deleted again
        //                 const getPagesAfterRedo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterRedo.success).toBe(true);
        //                 expect(
        //                     getPagesAfterRedo.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(0);

        //                 // Undo the deletion again
        //                 const undoResult2 = History.performUndo(db);
        //                 // expect(undoResult2.success).toBe(true);

        //                 // Verify the pages are back in the database again
        //                 const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo2.success).toBe(true);
        //                 expect(
        //                     getPagesAfterUndo2.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(3);
        //                 const undonePages2 = getPagesAfterUndo2.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 );
        //                 expect(undonePages2.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );
        //             });

        //             it("should undo, redo, and undo multiple pages being deleted while other pages already exist", async () => {
        //                 const existingPages: NewPageArgs[] = [
        //                     { start_beat: 5, is_subset: false },
        //                     { start_beat: 8, is_subset: true },
        //                 ];

        //                 // Create existing pages
        //                 const createExistingResult = await createPages({
        //                     newPages: existingPages,
        //                     db,
        //                 });
        //                 // expect(createExistingResult.success).toBe(true);
        //                 expect(createExistingResult.length).toBe(2);

        //                 const newPages: NewPageArgs[] = [
        //                     { start_beat: 12, is_subset: false },
        //                     { start_beat: 10, is_subset: true },
        //                     {
        //                         start_beat: 16,
        //                         is_subset: false,

        //                         notes: "jeff notes",
        //                     },
        //                 ];

        //                 // Create new pages
        //                 const createResult = await createPages({
        //                     newPages,
        //                     db,
        //                 });
        //                 // expect(createResult.success).toBe(true);
        //                 expect(createResult.length).toBe(3);

        //                 const createdPages = createResult;

        //                 // Delete the new pages
        //                 const deleteResult = await PageTable.deletePages({
        //                     pageIds: new Set<number>(
        //                         createdPages.map((page) => page.id),
        //                     ),
        //                     db,
        //                 });
        //                 // expect(deleteResult.success).toBe(true);
        //                 expect(deleteResult.length).toBe(3);

        //                 const deletedPages = deleteResult;
        //                 expect(deletedPages.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );

        //                 // Undo the deletion
        //                 const undoResult = History.performUndo(db);
        //                 // expect(undoResult.success).toBe(true);

        //                 // Verify the new pages are back in the database
        //                 const getPagesAfterUndo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo.success).toBe(true);
        //                 expect(getPagesAfterUndo.length).toBe(6);
        //                 const undonePages = getPagesAfterUndo
        //                     .filter((p) => p.id !== FIRST_PAGE_ID)
        //                     .slice(2);
        //                 expect(undonePages.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );

        //                 // Redo the deletion
        //                 const redoResult = History.performRedo(db);
        //                 // expect(redoResult.success).toBe(true);

        //                 // Verify the new pages are deleted again
        //                 const getPagesAfterRedo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterRedo.success).toBe(true);
        //                 expect(
        //                     getPagesAfterRedo.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(2);

        //                 // Undo the deletion again
        //                 const undoResult2 = History.performUndo(db);
        //                 // expect(undoResult2.success).toBe(true);

        //                 // Verify the new pages are back in the database again
        //                 const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo2.success).toBe(true);
        //                 expect(
        //                     getPagesAfterUndo2.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(5);
        //                 const undonePages2 = getPagesAfterUndo2
        //                     .filter((p) => p.id !== FIRST_PAGE_ID)
        //                     .slice(2);
        //                 expect(undonePages2.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );
        //             });
        //         });

        //         describe("with marchers", async () => {
        //             it("should undo, redo, and undo the deletion of multiple pages and their MarcherPages when marchers exist", async () => {
        //                 const marchers: NewMarcherArgs[] = [
        //                     {
        //                         name: "jeff",
        //                         section: "brass",
        //                         drill_prefix: "B",
        //                         drill_order: 1,
        //                     },
        //                     {
        //                         name: "ana",
        //                         section: "brass",
        //                         drill_prefix: "B",
        //                         drill_order: 2,
        //                     },
        //                     {
        //                         name: "qwerty",
        //                         section: "wood",
        //                         drill_prefix: "W",
        //                         drill_order: 3,
        //                     },
        //                 ];

        //                 // Create marchers
        //                 const createMarchersResponse = MarcherTable.createMarchers({
        //                     newMarchers: marchers,
        //                     db,
        //                 });
        //                 // expect(createMarchersResponse.success).toBe(true);
        //                 expect(createMarchersResponse.length).toBe(3);

        //                 const newPages: NewPageArgs[] = [
        //                     { start_beat: 12, is_subset: false },
        //                     { start_beat: 10, is_subset: true },
        //                     {
        //                         start_beat: 16,
        //                         is_subset: false,

        //                         notes: "jeff notes",
        //                     },
        //                 ];

        //                 // Create new pages
        //                 const createResult = await createPages({
        //                     newPages,
        //                     db,
        //                 });
        //                 // expect(createResult.success).toBe(true);
        //                 expect(createResult.length).toBe(3);

        //                 const createdPages = createResult;

        //                 // Verify marcher pages are created
        //                 const marcherPages = MarcherPageTable.getMarcherPages({
        //                     db,
        //                 });
        //                 // expect(marcherPages.success).toBe(true);
        //                 expect(marcherPages.length).toBe(12);

        //                 // Delete the pages
        //                 const deleteResult = await PageTable.deletePages({
        //                     pageIds: new Set<number>(
        //                         createdPages.map((page) => page.id),
        //                     ),
        //                     db,
        //                 });
        //                 // expect(deleteResult.success).toBe(true);
        //                 expect(deleteResult.length).toBe(3);

        //                 const deletedPages = deleteResult;
        //                 expect(deletedPages.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );

        //                 // Verify marcher pages are deleted
        //                 const marcherPagesAfterDelete =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterDelete.success).toBe(true);
        //                 expect(marcherPagesAfterDelete.length).toBe(3);

        //                 // Undo the deletion
        //                 const undoResult = History.performUndo(db);
        //                 // expect(undoResult.success).toBe(true);

        //                 // Verify the pages and marcher pages are back in the database
        //                 const getPagesAfterUndo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo.success).toBe(true);
        //                 expect(
        //                     getPagesAfterUndo.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(3);
        //                 const undonePages = getPagesAfterUndo.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 );
        //                 expect(undonePages.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );

        //                 const marcherPagesAfterUndo =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterUndo.success).toBe(true);
        //                 expect(marcherPagesAfterUndo.length).toBe(12);

        //                 // Redo the deletion
        //                 const redoResult = History.performRedo(db);
        //                 // expect(redoResult.success).toBe(true);

        //                 // Verify the pages and marcher pages are deleted again
        //                 const getPagesAfterRedo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterRedo.success).toBe(true);
        //                 expect(
        //                     getPagesAfterRedo.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(0);

        //                 const marcherPagesAfterRedo =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterRedo.success).toBe(true);
        //                 expect(marcherPagesAfterRedo.length).toBe(3);

        //                 // Undo the deletion again
        //                 const undoResult2 = History.performUndo(db);
        //                 // expect(undoResult2.success).toBe(true);

        //                 // Verify the pages and marcher pages are back in the database again
        //                 const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo2.success).toBe(true);
        //                 expect(
        //                     getPagesAfterUndo2.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(3);
        //                 const undonePages2 = getPagesAfterUndo2.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 );
        //                 expect(undonePages2.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );

        //                 const marcherPagesAfterUndo2 =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterUndo2.success).toBe(true);
        //                 expect(marcherPagesAfterUndo2.length).toBe(12);
        //             });

        //             it("should undo, redo, and undo the deletion of multiple pages and their MarcherPages when marchers and pages exist", async () => {
        //                 const marchers: NewMarcherArgs[] = [
        //                     {
        //                         name: "jeff",
        //                         section: "brass",
        //                         drill_prefix: "B",
        //                         drill_order: 1,
        //                     },
        //                     {
        //                         name: "ana",
        //                         section: "brass",
        //                         drill_prefix: "B",
        //                         drill_order: 2,
        //                     },
        //                     {
        //                         name: "qwerty",
        //                         section: "wood",
        //                         drill_prefix: "W",
        //                         drill_order: 3,
        //                     },
        //                 ];

        //                 // Create marchers
        //                 const createMarchersResponse = MarcherTable.createMarchers({
        //                     newMarchers: marchers,
        //                     db,
        //                 });
        //                 // expect(createMarchersResponse.success).toBe(true);
        //                 expect(createMarchersResponse.length).toBe(3);

        //                 const newPages: NewPageArgs[] = [
        //                     { start_beat: 12, is_subset: false },
        //                     { start_beat: 10, is_subset: true },
        //                     {
        //                         start_beat: 16,
        //                         is_subset: false,

        //                         notes: "jeff notes",
        //                     },
        //                 ];

        //                 // Create new pages
        //                 const createResult = await createPages({
        //                     newPages,
        //                     db,
        //                 });
        //                 // expect(createResult.success).toBe(true);
        //                 expect(createResult.length).toBe(3);

        //                 const createdPages = createResult;

        //                 // Verify marcher pages are created
        //                 const marcherPages = MarcherPageTable.getMarcherPages({
        //                     db,
        //                 });
        //                 // expect(marcherPages.success).toBe(true);
        //                 expect(marcherPages.length).toBe(12);

        //                 // Delete the pages
        //                 const deleteResult = await PageTable.deletePages({
        //                     pageIds: new Set<number>(
        //                         createdPages.map((page) => page.id),
        //                     ),
        //                     db,
        //                 });
        //                 // expect(deleteResult.success).toBe(true);
        //                 expect(deleteResult.length).toBe(3);

        //                 const deletedPages = deleteResult;
        //                 expect(deletedPages.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );

        //                 // Verify marcher pages are deleted
        //                 const marcherPagesAfterDelete =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterDelete.success).toBe(true);
        //                 expect(marcherPagesAfterDelete.length).toBe(3);

        //                 // Undo the deletion
        //                 const undoResult = History.performUndo(db);
        //                 // expect(undoResult.success).toBe(true);

        //                 // Verify the pages and marcher pages are back in the database
        //                 const getPagesAfterUndo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo.success).toBe(true);
        //                 expect(
        //                     getPagesAfterUndo.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(3);
        //                 const undonePages = getPagesAfterUndo.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 );
        //                 expect(undonePages.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );

        //                 const marcherPagesAfterUndo =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterUndo.success).toBe(true);
        //                 expect(marcherPagesAfterUndo.length).toBe(12);

        //                 // Redo the deletion
        //                 const redoResult = History.performRedo(db);
        //                 // expect(redoResult.success).toBe(true);

        //                 // Verify the pages and marcher pages are deleted again
        //                 const getPagesAfterRedo = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterRedo.success).toBe(true);
        //                 expect(
        //                     getPagesAfterRedo.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(0);

        //                 const marcherPagesAfterRedo =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterRedo.success).toBe(true);
        //                 expect(marcherPagesAfterRedo.length).toBe(3);

        //                 // Undo the deletion again
        //                 const undoResult2 = History.performUndo(db);
        //                 // expect(undoResult2.success).toBe(true);

        //                 // Verify the pages and marcher pages are back in the database again
        //                 const getPagesAfterUndo2 = await PageTable.getPages({ db });
        //                 // expect(getPagesAfterUndo2.success).toBe(true);
        //                 expect(
        //                     getPagesAfterUndo2.filter(
        //                         (p) => p.id !== FIRST_PAGE_ID,
        //                     ).length,
        //                 ).toBe(3);
        //                 const undonePages2 = getPagesAfterUndo2.filter(
        //                     (p) => p.id !== FIRST_PAGE_ID,
        //                 );
        //                 expect(undonePages2.map((page) => page.id).sort()).toEqual(
        //                     createdPages.map((page) => page.id).sort(),
        //                 );

        //                 const marcherPagesAfterUndo2 =
        //                     MarcherPageTable.getMarcherPages({ db });
        //                 // expect(marcherPagesAfterUndo2.success).toBe(true);
        //                 expect(marcherPagesAfterUndo2.length).toBe(12);
        //             });
        //         });
        //     });
        // });

        // describe.skip("updateLastPageCounts", () => {
        //     let db: Database.Database;

        //     beforeEach(async () => {
        //         db = await initTestDatabase();
        //     });

        //     it("should update the last page counts in the utility record", async () => {
        //         // Initial value should be default (likely 0 or null)
        //         const initialUtilityRecord = UtilityTable.getUtilityRecord({ db });
        //         // expect(initialUtilityRecord.success).toBe(true);

        //         // Update the last page counts
        //         const lastPageCounts = 5;
        //         const updateResult = await PageTable.updateLastPageCounts({
        //             db,
        //             lastPageCounts,
        //         });

        //         // Verify the update was successful
        //         // expect(updateResult.success).toBe(true);
        //         expect(updateResult.last_page_counts).toBe(lastPageCounts);

        //         // Verify the utility record was updated in the database
        //         const updatedUtilityRecord = UtilityTable.getUtilityRecord({ db });
        //         // expect(updatedUtilityRecord.success).toBe(true);
        //         expect(updatedUtilityRecord!.last_page_counts).toBe(
        //             lastPageCounts,
        //         );
        //     });

        //     it("should update the last page counts with a different value", async () => {
        //         // Update with an initial value
        //         PageTable.updateLastPageCounts({
        //             db,
        //             lastPageCounts: 3,
        //         });

        //         // Update with a new value
        //         const newLastPageCounts = 10;
        //         const updateResult = await PageTable.updateLastPageCounts({
        //             db,
        //             lastPageCounts: newLastPageCounts,
        //         });

        //         // Verify the update was successful
        //         // expect(updateResult.success).toBe(true);
        //         expect(updateResult.last_page_counts).toBe(newLastPageCounts);

        //         // Verify the utility record was updated in the database
        //         const updatedUtilityRecord = UtilityTable.getUtilityRecord({ db });
        //         // expect(updatedUtilityRecord.success).toBe(true);
        //         expect(updatedUtilityRecord!.last_page_counts).toBe(
        //             newLastPageCounts,
        //         );
        //     });

        //     it("should not use the next undo group", async () => {
        //         // Get the current undo group
        //         const initialUndoGroup = History.incrementUndoGroup(db);

        //         // Update the last page counts
        //         PageTable.updateLastPageCounts({
        //             db,
        //             lastPageCounts: 7,
        //         });

        //         // Verify the undo group hasn't changed
        //         const currentUndoGroup = History.getCurrentUndoGroup(db);
        //         expect(currentUndoGroup).toBe(initialUndoGroup);
        //     });
        // });

        // describe.skip("error handling", () => {
        //     /* This needs to make sure that when there is an error during creation, updating, or deletion,
        //         the changes are rolled back, the redo table doesn't have those actions in it, and no other data
        //         is affected by accident
        //         */
        // });
    });
});
