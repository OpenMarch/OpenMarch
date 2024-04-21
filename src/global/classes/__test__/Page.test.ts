import { Page, NewPageContainer, ModifiedPageArgs, NewPageArgs, ModifiedPageContainer } from '../Page';
import { mockPages } from '@/__mocks__/globalMocks';
import { TimeSignature } from '../TimeSignature';
import { ElectronApi } from 'electron/preload';

describe('Page', () => {
    beforeEach(() => {
        window.electron = {
            getPages: jest.fn().mockResolvedValue(mockPages),
            createPages: jest.fn().mockResolvedValue({ success: true }),
            updatePages: jest.fn().mockResolvedValue({ success: true }),
            deletePage: jest.fn().mockResolvedValue({ success: true }),
        } as Partial<ElectronApi> as ElectronApi;

        Page.fetchPages = jest.fn();
        Page.checkForFetchPages = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should create a page object', () => {
        const pageData = {
            id: 1,
            id_for_html: 'page_1',
            name: '2A',
            counts: 16,
            order: 1,
            tempo: 120,
            time_signature: '4/4',
            notes: 'Some notes',
        };

        const page = new Page(pageData);

        expect(page).toBeInstanceOf(Page);
        expect(page.id).toBe(1);
        expect(page.id_for_html).toBe('page_1');
        expect(page.name).toBe('2A');
        expect(page.counts).toBe(16);
        expect(page.order).toBe(1);
        expect(page.tempo).toBe(120);
        expect(page.time_signature).toBeInstanceOf(TimeSignature);
        expect(page.time_signature.toString()).toBe('4/4');
        expect(page.notes).toBe('Some notes');
    });

    it('should fetch all pages from the database', async () => {
        const getPagesSpy = jest.spyOn(Page, 'getPages');
        getPagesSpy.mockResolvedValue(mockPages);

        const pages = await Page.getPages();

        expect(pages).toEqual(mockPages);
        expect(getPagesSpy).toHaveBeenCalled();
    });

    describe('creating pages', () => {
        let newPageArgs: NewPageArgs[], newPageContainers: NewPageContainer[];
        beforeEach(() => {
            newPageArgs = [
                {
                    rehearsal_mark: 'A',
                    isSubset: false,
                    counts: 16,
                    tempo: 120,
                    time_signature: TimeSignature.fromString('4/4'),
                    notes: 'Some notes',
                },
                {
                    counts: 8,
                    tempo: 140,
                    isSubset: false,
                    time_signature: TimeSignature.fromString('3/4'),
                    notes: 'Other notes',
                },
                {
                    counts: 32,
                    tempo: 100,
                    isSubset: true,
                    time_signature: TimeSignature.fromString('5/8'),
                },
                {
                    rehearsal_mark: 'B',
                    counts: 1,
                    tempo: 100,
                    isSubset: true,
                    time_signature: TimeSignature.fromString('4/8'),
                },
                {
                    counts: 1,
                    tempo: 100,
                    isSubset: true,
                    time_signature: TimeSignature.fromString('4/8'),
                },
                {
                    counts: 1,
                    tempo: 100,
                    isSubset: false,
                    time_signature: TimeSignature.fromString('4/4'),
                }
            ]

            newPageContainers = [
                {
                    name: '1',
                    rehearsal_mark: 'A',
                    order: 0,
                    counts: 16,
                    tempo: 120,
                    time_signature: '4/4',
                    notes: 'Some notes',
                },
                {
                    name: '2',
                    order: 1,
                    counts: 8,
                    tempo: 140,
                    time_signature: '3/4',
                    notes: 'Other notes',
                },
                {
                    name: '2A',
                    order: 2,
                    counts: 32,
                    tempo: 100,
                    time_signature: '5/8',
                },
                {
                    name: '2B',
                    rehearsal_mark: 'B',
                    order: 3,
                    counts: 1,
                    tempo: 100,
                    time_signature: '4/8',
                },
                {
                    name: '2C',
                    order: 4,
                    counts: 1,
                    tempo: 100,
                    time_signature: '4/8',
                },
                {
                    name: '3',
                    order: 5,
                    counts: 1,
                    tempo: 100,
                    time_signature: '4/4',
                }
            ];
        });

        it('should create a new page in the database', async () => {
            const mockResponse = { success: true, newPages: [newPageContainers[0]] };

            jest.spyOn(Page, 'getPages').mockResolvedValue([]);

            const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
            const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');
            const electronCreatePagesSpy = jest.spyOn(window.electron, 'createPages');
            const electronUpdatePagesSpy = jest.spyOn(window.electron, 'updatePages');

            const response = await Page.createPages([newPageArgs[0]]);
            expect(response).toEqual(mockResponse);
            expect(electronCreatePagesSpy).toHaveBeenCalledWith([newPageContainers[0]]);
            expect(electronUpdatePagesSpy).toHaveBeenCalledWith([], false, true);
            expect(checkForFetchPagesSpy).toHaveBeenCalled();
            expect(fetchPagesSpy).toHaveBeenCalled();
        });

        it('should create multiple new pages in the database', async () => {
            const mockResponse = { success: true, newPages: newPageContainers };

            jest.spyOn(Page, 'getPages').mockResolvedValue([]);

            const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
            const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');
            const electronCreatePagesSpy = jest.spyOn(window.electron, 'createPages');
            const electronUpdatePagesSpy = jest.spyOn(window.electron, 'updatePages');
            const response = await Page.createPages(newPageArgs)

            expect(response).toEqual(mockResponse);
            expect(electronCreatePagesSpy).toHaveBeenCalledWith(newPageContainers);
            expect(electronUpdatePagesSpy).toHaveBeenCalledWith([], false, true);
            expect(checkForFetchPagesSpy).toHaveBeenCalled();
            expect(fetchPagesSpy).toHaveBeenCalled();
        });

        it('should update all page names when a page is added in the middle', async () => {
            const existingPages = newPageContainers.map((page, index) => {
                return new Page({
                    ...page,
                    // Reverse index to test non-sequential ID order
                    id: newPageContainers.length - index,
                    id_for_html: `page_${index + 1}`,
                })
            });

            const newPage = {
                previousPage: existingPages[0],
                counts: 1,
                tempo: 99,
                isSubset: false,
                time_signature: TimeSignature.fromString('4/8'),
            }

            jest.spyOn(Page, 'getPages').mockResolvedValue(existingPages);

            const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
            const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');
            const electronCreatePagesSpy = jest.spyOn(window.electron, 'createPages');
            const electronUpdatePagesSpy = jest.spyOn(window.electron, 'updatePages');
            const response = await Page.createPages([newPage]);

            const expectedNewPages: NewPageContainer[] = [
                {
                    name: '2',
                    order: 1,
                    counts: 1,
                    tempo: 99,
                    time_signature: '4/8',
                },
            ];
            const expectedModifiedPages: ModifiedPageContainer[] = [
                {
                    id: 5,
                    name: '3',
                    order: 2,
                },
                {
                    id: 4,
                    name: '3A',
                    order: 3,
                },
                {
                    id: 3,
                    name: '3B',
                    order: 4,
                },
                {
                    id: 2,
                    name: '3C',
                    order: 5,
                },
                {
                    id: 1,
                    name: '4',
                    order: 6,
                }
            ];
            const mockResponse = { success: true, newPages: expectedNewPages };

            expect(response).toEqual(mockResponse);
            expect(electronCreatePagesSpy).toHaveBeenCalledWith(expectedNewPages);
            expect(electronUpdatePagesSpy).toHaveBeenCalledWith(expectedModifiedPages, false, true);
            expect(checkForFetchPagesSpy).toHaveBeenCalled();
            expect(fetchPagesSpy).toHaveBeenCalled();
        })

        it('should update some page names when a subset page is added in the middle', async () => {
            const existingPages = newPageContainers.map((page, index) => {
                return new Page({
                    ...page,
                    id: index + 1,
                    id_for_html: `page_${index + 1}`,
                })
            });

            const newPage = {
                previousPage: existingPages[2],
                counts: 2,
                tempo: 99,
                isSubset: true,
                time_signature: TimeSignature.fromString('4/8'),
            }

            jest.spyOn(Page, 'getPages').mockResolvedValue(existingPages);

            const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
            const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');
            const electronCreatePagesSpy = jest.spyOn(window.electron, 'createPages');
            const electronUpdatePagesSpy = jest.spyOn(window.electron, 'updatePages');
            const response = await Page.createPages([newPage]);

            const expectedNewPages: NewPageContainer[] = [
                {
                    name: '2B',
                    order: 3,
                    counts: 2,
                    tempo: 99,
                    time_signature: '4/8',
                },
            ];

            const expectedModifiedPages: ModifiedPageContainer[] = [
                {
                    id: 4,
                    name: '2C',
                    order: 4,
                },
                {
                    id: 5,
                    name: '2D',
                    order: 5,
                },
                {
                    id: 6,
                    name: '3',
                    order: 6,
                },
            ]
            const mockResponse = { success: true, newPages: expectedNewPages };

            expect(response).toEqual(mockResponse);
            expect(electronCreatePagesSpy).toHaveBeenCalledWith(expectedNewPages);
            expect(electronUpdatePagesSpy).toHaveBeenCalledWith(expectedModifiedPages, false, true);
            expect(checkForFetchPagesSpy).toHaveBeenCalled();
            expect(fetchPagesSpy).toHaveBeenCalled();
        })

        it('should update all page names when multiple types of pages are added', async () => {
            const existingPages = newPageContainers.map((page, index) => {
                return new Page({
                    ...page,
                    id: index + 1,
                    id_for_html: `page_${index + 1}`,
                })
            });

            const newPages: NewPageArgs[] = [
                {
                    previousPage: existingPages[0],
                    counts: 6,
                    tempo: 90,
                    isSubset: false,
                    time_signature: TimeSignature.fromString('2/4'),
                },
                {
                    previousPage: existingPages[2],
                    counts: 2,
                    tempo: 99,
                    isSubset: true,
                    time_signature: TimeSignature.fromString('4/8'),
                },
                {
                    previousPage: existingPages[2],
                    counts: 3,
                    tempo: 98,
                    isSubset: true,
                    time_signature: TimeSignature.fromString('4/4'),
                    notes: 'Some notes for this page',
                },
                {
                    previousPage: existingPages[3],
                    counts: 17,
                    tempo: 120,
                    isSubset: false,
                    time_signature: TimeSignature.fromString('4/4'),
                },
                {
                    previousPage: existingPages[4],
                    counts: 3,
                    tempo: 98,
                    isSubset: false,
                    time_signature: TimeSignature.fromString('4/4'),
                },
            ]

            jest.spyOn(Page, 'getPages').mockResolvedValue(existingPages);

            const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
            const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');
            const electronCreatePagesSpy = jest.spyOn(window.electron, 'createPages');
            const electronUpdatePagesSpy = jest.spyOn(window.electron, 'updatePages');
            const response = await Page.createPages(newPages);

            const expectedNewPages: NewPageContainer[] = newPageContainers = [
                {
                    name: '2',
                    order: 1,
                    counts: 6,
                    tempo: 90,
                    time_signature: '2/4',
                },
                {
                    name: '3B',
                    order: 4,
                    counts: 2,
                    tempo: 99,
                    time_signature: '4/8',
                },
                {
                    name: '3C',
                    order: 5,
                    counts: 3,
                    tempo: 98,
                    time_signature: '4/4',
                    notes: 'Some notes for this page',
                },
                {
                    name: '4',
                    order: 7,
                    counts: 17,
                    tempo: 120,
                    time_signature: '4/4',
                },
                {
                    name: '5',
                    order: 9,
                    counts: 3,
                    tempo: 98,
                    time_signature: '4/4',
                }
            ];
            const expectedModifiedPages: ModifiedPageContainer[] = [
                {
                    id: 2,
                    name: '3',
                    order: 2,
                },
                {
                    id: 3,
                    name: '3A',
                    order: 3,
                },
                {
                    id: 4,
                    name: '3D',
                    order: 6,
                },
                {
                    id: 5,
                    name: '4A',
                    order: 8,
                },
                {
                    id: 6,
                    name: '6',
                    order: 10,
                }
            ];
            const mockResponse = { success: true, newPages: expectedNewPages };

            expect(response).toEqual(mockResponse);
            expect(electronCreatePagesSpy).toHaveBeenCalledWith(expectedNewPages);
            expect(electronUpdatePagesSpy).toHaveBeenCalledWith(expectedModifiedPages, false, true);
            expect(checkForFetchPagesSpy).toHaveBeenCalled();
            expect(fetchPagesSpy).toHaveBeenCalled();
        })

        it('should update one or many pages in the database', async () => {
            const modifiedPages: ModifiedPageArgs[] = [
                { id: 1, counts: 8 },
                { id: 2, tempo: 140, time_signature: TimeSignature.fromString('3/4') },
            ];

            const mockResponse = { success: true };

            const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
            const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');

            const electronUpdatePagesSpy = jest.spyOn(window.electron, 'updatePages');
            const response = await Page.updatePages(modifiedPages);

            const modifiedPagesContainers: ModifiedPageContainer[] = [
                { id: 1, counts: 8 },
                { id: 2, tempo: 140, time_signature: '3/4' },
            ]

            expect(response).toEqual(mockResponse);
            expect(electronUpdatePagesSpy).toHaveBeenCalledWith(modifiedPagesContainers);
            expect(checkForFetchPagesSpy).toHaveBeenCalled();
            expect(fetchPagesSpy).toHaveBeenCalled();
        });
    });

    describe('deleting pages', () => {
        const existingPagesMock: Page[] = [
            new Page({
                id: 1,
                id_for_html: 'page_1',
                name: '1',
                counts: 16,
                order: 0,
                tempo: 120,
                time_signature: TimeSignature.fromString('4/4'),
                notes: 'Some notes',
            }),
            new Page({
                id: 2,
                id_for_html: 'page_2',
                name: '2',
                counts: 8,
                order: 1,
                tempo: 140,
                time_signature: TimeSignature.fromString('3/4'),
                notes: 'Other notes',
            }),
            new Page({
                id: 3,
                id_for_html: 'page_3',
                name: '3',
                counts: 32,
                order: 2,
                tempo: 100,
                time_signature: TimeSignature.fromString('5/8'),
            }),
            new Page({
                id: 4,
                id_for_html: 'page_4',
                name: '3A',
                counts: 90,
                order: 3,
                tempo: 34,
                time_signature: TimeSignature.fromString('8/8'),
            }),
            new Page({
                id: 5,
                id_for_html: 'page_5',
                name: '3B',
                counts: 39,
                order: 4,
                tempo: 110,
                time_signature: TimeSignature.fromString('4/4'),
            }),
            new Page({
                id: 6,
                id_for_html: 'page_6',
                name: '4',
                counts: 29,
                order: 5,
                tempo: 102,
                time_signature: TimeSignature.fromString('6/4'),
            }),
        ] as const;
        it('should delete a page from the database', async () => {
            const pageIdToDelete = existingPagesMock[1].id;
            const expectedModifiedPages: ModifiedPageContainer[] = [
                {
                    id: 3,
                    name: '2',
                    order: 1,
                },
                {
                    id: 4,
                    name: '2A',
                    order: 2,
                },
                {
                    id: 5,
                    name: '2B',
                    order: 3,
                },
                {
                    id: 6,
                    name: '3',
                    order: 4,
                },
            ]

            jest.spyOn(Page, 'getPages').mockResolvedValue(existingPagesMock);
            const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
            const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');
            const electronUpdatePagesSpy = jest.spyOn(window.electron, 'updatePages');
            const mockResponse = { success: true };
            const deletePageSpy = jest.spyOn(Page, 'deletePage');
            const response = await Page.deletePage(pageIdToDelete);

            expect(response).toEqual(mockResponse);
            expect(deletePageSpy).toHaveBeenCalledWith(pageIdToDelete);
            expect(electronUpdatePagesSpy).toHaveBeenCalledWith(expectedModifiedPages, false);
            expect(checkForFetchPagesSpy).toHaveBeenCalled();
            expect(fetchPagesSpy).toHaveBeenCalled();
        });
        it('should delete a subset page from the database', async () => {
            const pageIdToDelete = existingPagesMock[3].id;
            const expectedModifiedPages: ModifiedPageContainer[] = [
                {
                    id: 5,
                    name: '3A',
                    order: 3,
                },
                {
                    id: 6,
                    name: '4',
                    order: 4,
                },
            ]

            jest.spyOn(Page, 'getPages').mockResolvedValue(existingPagesMock);
            const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
            const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');
            const electronUpdatePagesSpy = jest.spyOn(window.electron, 'updatePages');
            const mockResponse = { success: true };
            const deletePageSpy = jest.spyOn(Page, 'deletePage');
            const response = await Page.deletePage(pageIdToDelete);

            expect(response).toEqual(mockResponse);
            expect(deletePageSpy).toHaveBeenCalledWith(pageIdToDelete);
            expect(electronUpdatePagesSpy).toHaveBeenCalledWith(expectedModifiedPages, false);
            expect(checkForFetchPagesSpy).toHaveBeenCalled();
            expect(fetchPagesSpy).toHaveBeenCalled();
        });
    });

    it('should sort pages by order', () => {
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
            expect(sortedPages[i].order).toBeLessThan(sortedPages[i + 1].order);
        }
    });

    describe('getNextPage', () => {
        it('should get the next page, sequential order', () => {
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

        it('should get the next page, non-sequential order', () => {
            const firstPage = mockPages[0];
            const nextPage1 = mockPages[1];
            const nextPage2 = mockPages[2];
            let mocksToUse = [mockPages[0], mockPages[1], mockPages[2]];

            let nextPage = firstPage.getNextPage(mocksToUse);
            expect(nextPage).toEqual(nextPage1);
            nextPage = nextPage!.getNextPage(mocksToUse);
            expect(nextPage).toEqual(nextPage2);
            // Return null on last page
            nextPage = nextPage!.getNextPage(mocksToUse);
            expect(nextPage).toEqual(null);

            mocksToUse = [mockPages[2], mockPages[0], mockPages[1]];
            nextPage = firstPage.getNextPage(mocksToUse);
            expect(nextPage).toEqual(nextPage1);
            nextPage = nextPage!.getNextPage(mocksToUse);
            expect(nextPage).toEqual(nextPage2);
            // Return null on last page
            nextPage = nextPage!.getNextPage(mocksToUse);
            expect(nextPage).toEqual(null);

            mocksToUse = [mockPages[0], mockPages[2]];
            nextPage = firstPage.getNextPage(mocksToUse);
            expect(nextPage).toEqual(nextPage2);
            // Return null on last page
            nextPage = nextPage!.getNextPage(mocksToUse);
            expect(nextPage).toEqual(null);
        });
    });

    describe('getPreviousPage', () => {
        it('should get the previous page, sequential order', () => {
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

        it('should get the previous page, non-sequential order', () => {
            const lastPage = mockPages[2];
            const previousPage1 = mockPages[1];
            const previousPage2 = mockPages[0];
            let mocksToUse = [mockPages[0], mockPages[1], mockPages[2]];

            let previousPage = lastPage.getPreviousPage(mocksToUse);
            expect(previousPage).toEqual(previousPage1);
            previousPage = previousPage!.getPreviousPage(mocksToUse);
            expect(previousPage).toEqual(previousPage2);
            // Return null on first page
            previousPage = previousPage!.getPreviousPage(mocksToUse);
            expect(previousPage).toEqual(null);

            mocksToUse = [mockPages[2], mockPages[0], mockPages[1]];
            previousPage = lastPage.getPreviousPage(mocksToUse);
            expect(previousPage).toEqual(previousPage1);
            previousPage = previousPage!.getPreviousPage(mocksToUse);
            expect(previousPage).toEqual(previousPage2);
            // Return null on last page
            previousPage = previousPage!.getPreviousPage(mocksToUse);
            expect(previousPage).toEqual(null);

            mocksToUse = [mockPages[0], mockPages[2]];
            previousPage = lastPage.getPreviousPage(mocksToUse);
            expect(previousPage).toEqual(previousPage2);
            // Return null on last page
            previousPage = previousPage!.getPreviousPage(mocksToUse);
            expect(previousPage).toEqual(null);
        });
    });

    it('should get the first page', () => {
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

    it('should get the last page', () => {
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
});
