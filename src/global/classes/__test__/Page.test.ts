import Page, { NewPageArgs } from "../Page";
import { mockPages } from "@/__mocks__/globalMocks";
import { ElectronApi } from "electron/preload";
import Measure from "../Measure";
import TimeSignature from "../TimeSignature";
import BeatUnit from "../BeatUnit";
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { DatabasePage } from "electron/database/tables/PageTable";

const sortPages = (pages: { order: number }[]) => {
    return pages.sort((a, b) => a.order - b.order);
};

describe("Page", () => {
    beforeEach(() => {
        window.electron = {
            getPages: vi.fn(),
            createPages: vi.fn(),
            updatePages: vi.fn(),
            deletePage: vi.fn(),
        } as Partial<ElectronApi> as ElectronApi;
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it("should create a page object", () => {
        const pageData = {
            id: 1,
            id_for_html: "page_1",
            name: "2A",
            counts: 16,
            order: 1,
            notes: "Some notes",
            nextPageId: 2,
            previousPageId: null,
        };

        const page = new Page(pageData);

        expect(page).toBeInstanceOf(Page);
        expect(page.id).toBe(1);
        expect(page.name).toBe("2A");
        expect(page.counts).toBe(16);
        expect(page.order).toBe(1);
        expect(page.notes).toBe("Some notes");
    });

    describe("creating pages", () => {
        let newPageArgs: NewPageArgs[], databasePages: DatabasePage[];
        beforeEach(() => {
            newPageArgs = [
                {
                    previousPageId: null,
                    isSubset: false,
                    counts: 16,
                    notes: "Some notes",
                },
                {
                    previousPageId: null,
                    counts: 8,
                    isSubset: false,
                    notes: "Other notes",
                },
                {
                    previousPageId: null,
                    counts: 32,
                    isSubset: true,
                },
                {
                    previousPageId: null,
                    counts: 1,
                    isSubset: true,
                },
                {
                    previousPageId: null,
                    counts: 1,
                    isSubset: true,
                },
                {
                    previousPageId: null,
                    counts: 1,
                    isSubset: false,
                },
            ];
            databasePages = [
                {
                    is_subset: false,
                    id: 6,
                    next_page_id: 5,
                    counts: 16,
                    notes: "Some notes",
                },
                {
                    counts: 8,
                    is_subset: false,
                    id: 5,
                    next_page_id: 4,
                    notes: "Other notes",
                },
                {
                    counts: 32,
                    is_subset: true,
                    id: 4,
                    next_page_id: 3,
                    notes: null,
                },
                {
                    counts: 1,
                    is_subset: true,
                    id: 3,
                    next_page_id: 2,
                    notes: null,
                },
                {
                    counts: 1,
                    is_subset: true,
                    id: 2,
                    next_page_id: 1,
                    notes: null,
                },
                {
                    counts: 1,
                    is_subset: false,
                    id: 1,
                    next_page_id: null,
                    notes: null,
                },
            ];
        });

        it("should create a new page in the database", async () => {
            const mockResponse = {
                success: true,
                data: [databasePages[0]],
            };

            const checkForFetchPagesSpy = vi.spyOn(Page, "checkForFetchPages");
            const fetchPagesSpy = vi.spyOn(Page, "fetchPages");
            const electronCreatePagesSpy = vi
                .spyOn(window.electron, "createPages")
                .mockResolvedValue(mockResponse);

            const createResponse = await Page.createPages([newPageArgs[0]]);

            expect(createResponse).toEqual({
                success: true,
                data: Page.fromDatabasePages([databasePages[0]]),
            });
            expect(electronCreatePagesSpy).toHaveBeenCalledWith([
                newPageArgs[0],
            ]);
            expect(checkForFetchPagesSpy).toHaveBeenCalled();
            expect(fetchPagesSpy).toHaveBeenCalled();
        });

        it("should create multiple new pages in the database", async () => {
            const mockResponse = {
                success: true,
                data: databasePages,
            };

            const checkForFetchPagesSpy = vi.spyOn(Page, "checkForFetchPages");
            const fetchPagesSpy = vi.spyOn(Page, "fetchPages");
            const electronCreatePagesSpy = vi
                .spyOn(window.electron, "createPages")
                .mockResolvedValue(mockResponse);

            const createResponse = await Page.createPages(newPageArgs);

            expect(createResponse).toEqual({
                success: true,
                data: Page.fromDatabasePages(databasePages),
            });
            expect(electronCreatePagesSpy).toHaveBeenCalledWith(newPageArgs);
            expect(checkForFetchPagesSpy).toHaveBeenCalled();
            expect(fetchPagesSpy).toHaveBeenCalled();
        });
    });

    describe("databasePage to page", () => {
        it("should convert a database page to a page", async () => {
            vi.clearAllMocks();
            const databasePage: DatabasePage = {
                id: 1,
                is_subset: false,
                counts: 16,
                notes: "Some notes",
                next_page_id: null,
            };
            vi.spyOn(window.electron, "getPages").mockResolvedValue({
                success: true,
                data: [databasePage],
            });
            const pages = await Page.getPages();
            expect(pages.length).toBe(1);
            const expectedPage = new Page({
                id: 1,
                name: "1",
                counts: 16,
                order: 0,
                notes: "Some notes",
                nextPageId: null,
                previousPageId: null,
            });
            expect(pages[0]).toEqual(expectedPage);
        });

        it("should convert many database pages to many pages", async () => {
            vi.clearAllMocks();
            const databasePages: DatabasePage[] = [
                {
                    id: 1,
                    is_subset: false,
                    counts: 16,
                    notes: "Some notes",
                    next_page_id: 2,
                },
                {
                    id: 2,
                    is_subset: false,
                    counts: 32,
                    notes: null,
                    next_page_id: 3,
                },
                {
                    id: 3,
                    is_subset: false,
                    counts: 8,
                    notes: "no notes",
                    next_page_id: 4,
                },
                {
                    id: 4,
                    is_subset: false,
                    counts: 7,
                    notes: "Some notes",
                    next_page_id: 7,
                },
                {
                    id: 7,
                    is_subset: false,
                    counts: 20,
                    notes: "asdf\nasdf",
                    next_page_id: null,
                },
            ];
            vi.spyOn(window.electron, "getPages").mockResolvedValue({
                success: true,
                data: databasePages,
            });

            const pages = await Page.getPages();
            const expectedPages = [
                new Page({
                    id: 1,
                    name: "1",
                    counts: 16,
                    order: 0,
                    notes: "Some notes",
                    nextPageId: 2,
                    previousPageId: null,
                }),
                new Page({
                    id: 2,
                    name: "2",
                    counts: 32,
                    order: 1,
                    nextPageId: 3,
                    previousPageId: 1,
                }),
                new Page({
                    id: 3,
                    name: "3",
                    counts: 8,
                    order: 2,
                    notes: "no notes",
                    nextPageId: 4,
                    previousPageId: 2,
                }),
                new Page({
                    id: 4,
                    name: "4",
                    counts: 7,
                    order: 3,
                    notes: "Some notes",
                    nextPageId: 7,
                    previousPageId: 3,
                }),
                new Page({
                    id: 7,
                    name: "5",
                    counts: 20,
                    order: 4,
                    notes: "asdf\nasdf",
                    nextPageId: null,
                    previousPageId: 4,
                }),
            ];
            expect(sortPages(pages)).toEqual(sortPages(expectedPages));
        });

        it("should convert many database pages to many pages with subsets", async () => {
            vi.clearAllMocks();
            const databasePages: DatabasePage[] = [
                {
                    id: 1,
                    is_subset: false,
                    counts: 16,
                    notes: "Some notes",
                    next_page_id: 2,
                },
                {
                    id: 2,
                    is_subset: true,
                    counts: 32,
                    notes: null,
                    next_page_id: 3,
                },
                {
                    id: 3,
                    is_subset: false,
                    counts: 8,
                    notes: "no notes",
                    next_page_id: 4,
                },
                {
                    id: 4,
                    is_subset: true,
                    counts: 7,
                    notes: "Some notes",
                    next_page_id: 7,
                },
                {
                    id: 7,
                    is_subset: true,
                    counts: 20,
                    notes: "asdf\nasdf",
                    next_page_id: 0,
                },
                {
                    id: 0,
                    is_subset: false,
                    counts: 1,
                    notes: null,
                    next_page_id: null,
                },
            ];

            vi.spyOn(window.electron, "getPages").mockResolvedValue({
                success: true,
                data: databasePages,
            });

            const pages = await Page.getPages();
            const expectedPages = [
                new Page({
                    id: 1,
                    name: "1",
                    counts: 16,
                    order: 0,
                    notes: "Some notes",
                    nextPageId: 2,
                    previousPageId: null,
                }),
                new Page({
                    id: 2,
                    isSubset: true,
                    name: "1A",
                    counts: 32,
                    order: 1,
                    nextPageId: 3,
                    previousPageId: 1,
                }),
                new Page({
                    id: 3,
                    name: "2",
                    counts: 8,
                    order: 2,
                    notes: "no notes",
                    nextPageId: 4,
                    previousPageId: 2,
                }),
                new Page({
                    id: 4,
                    name: "2A",
                    isSubset: true,
                    counts: 7,
                    order: 3,
                    notes: "Some notes",
                    nextPageId: 7,
                    previousPageId: 3,
                }),
                new Page({
                    id: 7,
                    name: "2B",
                    isSubset: true,
                    counts: 20,
                    order: 4,
                    notes: "asdf\nasdf",
                    nextPageId: 0,
                    previousPageId: 4,
                }),
                new Page({
                    id: 0,
                    name: "3",
                    counts: 1,
                    order: 5,
                    nextPageId: null,
                    previousPageId: 7,
                }),
            ];
            expect(sortPages(pages)).toEqual(sortPages(expectedPages));
        });

        it("should go to double digits of subsets", async () => {
            const databasePages: DatabasePage[] = [];
            const alphabet = "abcdefghijklmnopqrstuvwxyz";

            databasePages.push({
                id: 1,
                is_subset: false,
                counts: 16,
                notes: "Some notes",
                next_page_id: 2,
            });

            for (let i = 0; i < 100; i++) {
                const name =
                    i < 26
                        ? alphabet[i]
                        : alphabet[Math.floor(i / 26) - 1] + alphabet[i % 26];
                databasePages.push({
                    id: i + 1,
                    is_subset: true,
                    counts: 16,
                    notes: `Notes for page ${name}`,
                    next_page_id: i < 99 ? i + 2 : null,
                });
            }

            vi.spyOn(window.electron, "getPages").mockResolvedValue({
                success: true,
                data: databasePages,
            });

            const pages = await Page.getPages();

            const expectedNames = [
                "1",
                "1A",
                "1B",
                "1C",
                "1D",
                "1E",
                "1F",
                "1G",
                "1H",
                "1I",
                "1J",
                "1K",
                "1L",
                "1M",
                "1N",
                "1O",
                "1P",
                "1Q",
                "1R",
                "1S",
                "1T",
                "1U",
                "1V",
                "1W",
                "1X",
                "1Y",
                "1Z",
                "1AA",
                "1AB",
                "1AC",
                "1AD",
                "1AE",
                "1AF",
                "1AG",
                "1AH",
                "1AI",
                "1AJ",
                "1AK",
                "1AL",
                "1AM",
                "1AN",
                "1AO",
                "1AP",
                "1AQ",
                "1AR",
                "1AS",
                "1AT",
                "1AU",
                "1AV",
                "1AW",
                "1AX",
                "1AY",
                "1AZ",
                "1BA",
                "1BB",
                "1BC",
                "1BD",
                "1BE",
                "1BF",
                "1BG",
                "1BH",
                "1BI",
                "1BJ",
                "1BK",
                "1BL",
                "1BM",
                "1BN",
                "1BO",
                "1BP",
                "1BQ",
                "1BR",
                "1BS",
                "1BT",
                "1BU",
                "1BV",
                "1BW",
                "1BX",
                "1BY",
                "1BZ",
                "1CA",
                "1CB",
                "1CC",
                "1CD",
                "1CE",
                "1CF",
                "1CG",
                "1CH",
                "1CI",
                "1CJ",
                "1CK",
                "1CL",
                "1CM",
                "1CN",
                "1CO",
                "1CP",
                "1CQ",
                "1CR",
                "1CS",
                "1CT",
                "1CU",
            ];
            const names = pages.map((page) => page.name);
            expect(names).toEqual(expectedNames);
        });

        // TODO reimplement this with the new page structure
        // describe.skip("deleting pages", () => {
        //     const existingPagesMock: Page[] = [
        //         new Page({
        //             id: 1,
        //             name: "1",
        //             counts: 16,
        //             order: 0,
        //             notes: "Some notes",
        //             nextPageId: 2,
        //             previousPageId: null,
        //         }),
        //         new Page({
        //             id: 2,
        //             name: "2",
        //             counts: 8,
        //             order: 1,
        //             notes: "Other notes",
        //             nextPageId: 3,
        //             previousPageId: 1,
        //         }),
        //         new Page({
        //             id: 3,
        //             name: "3",
        //             counts: 32,
        //             order: 2,
        //             nextPageId: 4,
        //             previousPageId: 2,
        //         }),
        //         new Page({
        //             id: 4,
        //             name: "3A",
        //             counts: 90,
        //             order: 3,
        //             nextPageId: 5,
        //             previousPageId: 3,
        //         }),
        //         new Page({
        //             id: 5,
        //             name: "3B",
        //             counts: 39,
        //             order: 4,
        //             nextPageId: 6,
        //             previousPageId: 4,
        //         }),
        //         new Page({
        //             id: 6,
        //             name: "4",
        //             counts: 29,
        //             order: 5,
        //             nextPageId: null,
        //             previousPageId: 5,
        //         }),
        //     ] as const;
        //     it("should delete a page from the database", async () => {
        //         const pageIdToDelete = existingPagesMock[1].id;
        //         const expectedModifiedPages: ModifiedPageContainer[] = [
        //             {
        //                 id: 3,
        //                 name: "2",
        //                 order: 1,
        //             },
        //             {
        //                 id: 4,
        //                 name: "2A",
        //                 order: 2,
        //             },
        //             {
        //                 id: 5,
        //                 name: "2B",
        //                 order: 3,
        //             },
        //             {
        //                 id: 6,
        //                 name: "3",
        //                 order: 4,
        //             },
        //         ];

        //         vi.spyOn(Page, "getPages").mockResolvedValue(existingPagesMock);
        //         const checkForFetchPagesSpy = vi.spyOn(Page, "checkForFetchPages");
        //         const fetchPagesSpy = vi.spyOn(Page, "fetchPages");
        //         const electronUpdatePagesSpy = vi.spyOn(
        //             window.electron,
        //             "updatePages"
        //         );
        //         const mockResponse = { success: true };
        //         const deletePageSpy = vi.spyOn(Page, "deletePage");
        //         const response = await Page.deletePage(pageIdToDelete);

        //         expect(response).toEqual(mockResponse);
        //         expect(deletePageSpy).toHaveBeenCalledWith(pageIdToDelete);
        //         expect(electronUpdatePagesSpy).toHaveBeenCalledWith(
        //             expectedModifiedPages,
        //             false
        //         );
        //         expect(checkForFetchPagesSpy).toHaveBeenCalled();
        //         expect(fetchPagesSpy).toHaveBeenCalled();
        //     });
        //     it("should delete a subset page from the database", async () => {
        //         const pageIdToDelete = existingPagesMock[3].id;
        //         const expectedModifiedPages: ModifiedPageContainer[] = [
        //             {
        //                 id: 5,
        //                 name: "3A",
        //                 order: 3,
        //             },
        //             {
        //                 id: 6,
        //                 name: "4",
        //                 order: 4,
        //             },
        //         ];

        //         vi.spyOn(Page, "getPages").mockResolvedValue(existingPagesMock);
        //         const checkForFetchPagesSpy = vi.spyOn(Page, "checkForFetchPages");
        //         const fetchPagesSpy = vi.spyOn(Page, "fetchPages");
        //         const electronUpdatePagesSpy = vi.spyOn(
        //             window.electron,
        //             "updatePages"
        //         );
        //         const mockResponse = { success: true };
        //         const deletePageSpy = vi.spyOn(Page, "deletePage");
        //         const response = await Page.deletePage(pageIdToDelete);

        //         expect(response).toEqual(mockResponse);
        //         expect(deletePageSpy).toHaveBeenCalledWith(pageIdToDelete);
        //         expect(electronUpdatePagesSpy).toHaveBeenCalledWith(
        //             expectedModifiedPages,
        //             false
        //         );
        //         expect(checkForFetchPagesSpy).toHaveBeenCalled();
        //         expect(fetchPagesSpy).toHaveBeenCalled();
        //     });
        // });

        it("should sort pages by order", () => {
            // validate that mockPages is already sorted
            for (let i = 0; i < mockPages.length - 1; i++) {
                expect(mockPages[i].order).toBeLessThan(mockPages[i + 1].order);
            }

            const shuffledPages = [...mockPages];
            for (let i = 0; i < mockPages.length; i++) {
                shuffledPages[i] = mockPages[mockPages.length - 1 - i];
            }

            // validate that shuffledPages is not sorted
            let isSorted = true;
            for (let i = 0; i < shuffledPages.length - 1; i++) {
                if (shuffledPages[i].order > shuffledPages[i + 1].order) {
                    isSorted = false;
                    break;
                }
            }
            expect(isSorted).toBe(false);

            // sort shuffledPages and validate that it is sorted
            const sortedPages = Page.sortPagesByOrder(shuffledPages);
            for (let i = 0; i < sortedPages.length - 1; i++) {
                expect(sortedPages[i].order).toBeLessThan(
                    sortedPages[i + 1].order
                );
            }
        });

        describe("getNextPage", () => {
            it("should get the next page, sequential order", () => {
                const firstPage = mockPages[0];
                const nextPage1 = mockPages[1];
                const nextPage2 = mockPages[2];
                let mocksToUse = mockPages.slice(0, 3);

                let nextPage = firstPage.getNextPage(mocksToUse);
                expect(nextPage).toBe(nextPage1);
                nextPage = nextPage!.getNextPage(mocksToUse);
                expect(nextPage).toBe(nextPage2);
                // Return null on last page
                nextPage = nextPage!.getNextPage(mocksToUse);
                expect(nextPage).toBe(null);
            });
        });

        describe("getPreviousPage", () => {
            it("should get the previous page, sequential order", () => {
                const lastPage = mockPages[2];
                const previousPage1 = mockPages[1];
                const previousPage2 = mockPages[0];
                let mocksToUse = mockPages.slice(0, 3);

                let previousPage = lastPage.getPreviousPage(mocksToUse);
                expect(previousPage).toBe(previousPage1);
                previousPage = previousPage!.getPreviousPage(mocksToUse);
                expect(previousPage).toBe(previousPage2);
                // Return null on first page
                previousPage = previousPage!.getPreviousPage(mocksToUse);
                expect(previousPage).toBe(null);
            });
        });

        it("should get the first page", () => {
            const firstPage = mockPages[0];
            let mocksToUse = [mockPages[0], mockPages[1], mockPages[2]];

            let testFirstPage = Page.getFirstPage(mocksToUse);
            expect(testFirstPage).toBe(firstPage);

            mocksToUse = [mockPages[2], mockPages[0], mockPages[1]];
            testFirstPage = Page.getFirstPage(mocksToUse);
            expect(testFirstPage).toBe(firstPage);

            mocksToUse = [mockPages[2], mockPages[1], mockPages[0]];
            testFirstPage = Page.getFirstPage(mocksToUse);
            expect(testFirstPage).toBe(firstPage);
        });

        it("should get the last page", () => {
            const lastPage = mockPages[2];
            let mocksToUse = [mockPages[0], mockPages[1], mockPages[2]];

            let testLastPage = Page.getLastPage(mocksToUse);
            expect(testLastPage).toBe(lastPage);

            mocksToUse = [mockPages[2], mockPages[0], mockPages[1]];
            testLastPage = Page.getLastPage(mocksToUse);
            expect(testLastPage).toBe(lastPage);

            mocksToUse = [mockPages[2], mockPages[1], mockPages[0]];
            testLastPage = Page.getLastPage(mocksToUse);
            expect(testLastPage).toBe(lastPage);
        });

        describe("alignWithMeasures", () => {
            it("should align simple pages with simple measures and set their durations", () => {
                const measures = [
                    new Measure({
                        number: 1,
                        timeSignature: TimeSignature.fromString("4/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                    new Measure({
                        number: 2,
                        timeSignature: TimeSignature.fromString("4/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                    new Measure({
                        number: 3,
                        timeSignature: TimeSignature.fromString("4/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                    new Measure({
                        number: 3,
                        timeSignature: TimeSignature.fromString("4/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                ];
                const pages = [
                    new Page({
                        id: 0,
                        name: "0",
                        counts: 0,
                        order: 0,
                        nextPageId: 1,
                        previousPageId: null,
                    }),
                    new Page({
                        id: 1,
                        name: "1",
                        counts: 8,
                        order: 1,
                        nextPageId: 2,
                        previousPageId: 0,
                    }),
                    new Page({
                        id: 2,
                        name: "2",
                        counts: 4,
                        order: 2,
                        nextPageId: 3,
                        previousPageId: 1,
                    }),
                    new Page({
                        id: 3,
                        name: "3",
                        counts: 4,
                        order: 3,
                        nextPageId: null,
                        previousPageId: 2,
                    }),
                ];
                const alignedPages = Page.alignWithMeasures(pages, measures);

                expect(alignedPages.length).toBe(pages.length);

                // Check the duration of each page
                expect(alignedPages[0].duration).toBe(0);
                expect(alignedPages[1].duration).toBe(4); // 8 counts * 500 ms per count = 4 seconds
                expect(alignedPages[2].duration).toBe(2); // 4 counts * 500 ms per count = 2 seconds
                expect(alignedPages[3].duration).toBe(2); // 4 counts * 500 ms per count = 2 seconds

                // Check that the timestamps are inserted correctly
                expect(alignedPages[0].timestamp).toEqual(0);
                expect(alignedPages[1].timestamp).toEqual(4);
                expect(alignedPages[2].timestamp).toEqual(6);
                expect(alignedPages[3].timestamp).toEqual(8);

                // Check that the measures are inserted correctly
                expect(alignedPages[0].measures).toEqual([]);
                expect(alignedPages[1].measures).toEqual([
                    measures[0],
                    measures[1],
                ]);
                expect(alignedPages[2].measures).toEqual([measures[2]]);
                expect(alignedPages[3].measures).toEqual([measures[3]]);

                // expect all measure beats to be 1 (as in the first beat of the measure)
                expect(alignedPages[0].measureBeatToStartOn).toBe(1);
                expect(alignedPages[1].measureBeatToStartOn).toBe(1);
                expect(alignedPages[2].measureBeatToStartOn).toBe(1);
                expect(alignedPages[3].measureBeatToStartOn).toBe(1);
            });

            it("should align pages with measures and set their durations when measures and page counts don't align", () => {
                const measures = [
                    new Measure({
                        number: 1,
                        timeSignature: TimeSignature.fromString("4/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                    new Measure({
                        number: 2,
                        timeSignature: TimeSignature.fromString("4/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                    new Measure({
                        number: 3,
                        timeSignature: TimeSignature.fromString("3/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                    new Measure({
                        number: 4,
                        timeSignature: TimeSignature.fromString("5/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                ];
                const pages = [
                    new Page({
                        id: 1,
                        name: "1",
                        counts: 0,
                        order: 0,
                        nextPageId: 2,
                        previousPageId: null,
                    }),
                    new Page({
                        id: 2,
                        name: "2",
                        counts: 6,
                        order: 1,
                        nextPageId: 3,
                        previousPageId: 1,
                    }),
                    new Page({
                        id: 3,
                        name: "3",
                        counts: 3,
                        order: 2,
                        nextPageId: 4,
                        previousPageId: 2,
                    }),
                    new Page({
                        id: 4,
                        name: "4",
                        counts: 7,
                        order: 3,
                        nextPageId: null,
                        previousPageId: 3,
                    }),
                ];
                const alignedPages = Page.alignWithMeasures(pages, measures);

                expect(alignedPages.length).toBe(pages.length);

                // Check the duration of each page
                expect(alignedPages[0].duration).toBe(0);
                expect(alignedPages[1].duration).toBe(3); // 6 counts * 500 ms per count = 3 seconds
                expect(alignedPages[2].duration).toBe(1.5); // 3 counts * 500 ms per count = 1.5 seconds
                expect(alignedPages[3].duration).toBe(3.5); // 7 counts * 500 ms per count = 3.5 seconds

                // Check that the timestamps are inserted correctly
                expect(alignedPages[0].timestamp).toEqual(0);
                expect(alignedPages[1].timestamp).toEqual(3);
                expect(alignedPages[2].timestamp).toEqual(4.5);
                expect(alignedPages[3].timestamp).toEqual(8);

                // Check that the measures are inserted correctly
                expect(alignedPages[0].measures).toEqual([]);
                expect(alignedPages[1].measures).toEqual([
                    measures[0],
                    measures[1],
                ]);
                expect(alignedPages[2].measures).toEqual([
                    measures[1],
                    measures[2],
                ]);
                expect(alignedPages[3].measures).toEqual([
                    measures[2],
                    measures[3],
                ]);

                // expect all measure offsets to be 0
                expect(alignedPages[0].measureBeatToStartOn).toBe(1);
                expect(alignedPages[1].measureBeatToStartOn).toBe(1);
                expect(alignedPages[2].measureBeatToStartOn).toBe(3);
                expect(alignedPages[3].measureBeatToStartOn).toBe(2);
            });

            it("When the last page goes beyond the last measure, adjust so that it assumes it stays the same tempo", () => {
                const measures = [
                    new Measure({
                        number: 1,
                        timeSignature: TimeSignature.fromString("4/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                    new Measure({
                        number: 2,
                        timeSignature: TimeSignature.fromString("4/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                    new Measure({
                        number: 3,
                        timeSignature: TimeSignature.fromString("4/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                    new Measure({
                        number: 3,
                        timeSignature: TimeSignature.fromString("4/4"),
                        tempo: 120,
                        beatUnit: BeatUnit.QUARTER,
                    }),
                ];
                const pages = [
                    new Page({
                        id: 0,
                        name: "0",
                        counts: 0,
                        order: 0,
                        nextPageId: 1,
                        previousPageId: null,
                    }),
                    new Page({
                        id: 1,
                        name: "1",
                        counts: 8,
                        order: 1,
                        nextPageId: 2,
                        previousPageId: 0,
                    }),
                    new Page({
                        id: 2,
                        name: "2",
                        counts: 4,
                        order: 2,
                        nextPageId: 3,
                        previousPageId: 1,
                    }),
                    new Page({
                        id: 3,
                        name: "3",
                        counts: 16,
                        order: 3,
                        nextPageId: null,
                        previousPageId: 2,
                    }),
                ];
                const alignedPages = Page.alignWithMeasures(pages, measures);

                expect(alignedPages.length).toBe(pages.length);

                // Check the duration of each page
                expect(alignedPages[0].duration).toBe(0);
                expect(alignedPages[1].duration).toBe(4); // 16 counts * 500 ms per count = 4 seconds
                expect(alignedPages[2].duration).toBe(2); // 8 counts * 500 ms per count = 2 seconds
                expect(alignedPages[3].duration).toBe(8); // 16 counts * 500 ms per count = 8 seconds

                // Check that the timestamps are inserted correctly
                expect(alignedPages[0].timestamp).toEqual(0);
                expect(alignedPages[1].timestamp).toEqual(4);
                expect(alignedPages[2].timestamp).toEqual(6);
                expect(alignedPages[3].timestamp).toEqual(14);

                // Check that the measures are inserted correctly
                expect(alignedPages[0].measures).toEqual([]);
                expect(alignedPages[1].measures).toEqual([
                    measures[0],
                    measures[1],
                ]);
                expect(alignedPages[2].measures).toEqual([measures[2]]);
                expect(alignedPages[3].measures).toEqual([measures[3]]);

                // expect all measure beats to be 1 (as in the first beat of the measure)
                expect(alignedPages[0].measureBeatToStartOn).toBe(1);
                expect(alignedPages[1].measureBeatToStartOn).toBe(1);
                expect(alignedPages[2].measureBeatToStartOn).toBe(1);
                expect(alignedPages[3].measureBeatToStartOn).toBe(1);
            });
        });
    });
});
