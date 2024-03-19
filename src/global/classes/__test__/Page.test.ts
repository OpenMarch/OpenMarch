import { Page, NewPageArgs, ModifiedPageArgs } from '../Page';
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
        const mockResponse = [
            { id: 1, name: '1' },
            { id: 2, name: '2' }
        ];
        const getPagesSpy = jest.spyOn(Page, 'getPages');

        getPagesSpy.mockResolvedValue(mockResponse as Page[]);

        const pages = await Page.getPages();

        expect(pages).toEqual(mockResponse);
        expect(getPagesSpy).toHaveBeenCalled();
    });

    it('should create a new page in the database', async () => {
        const newPage: NewPageArgs = {
            name: 'Page 1',
            counts: 16,
            tempo: 120,
            time_signature: '4/4',
            notes: 'Some notes',
        };

        const mockResponse = { success: true };

        const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
        const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');
        const createPageSpy = jest.spyOn(Page, 'createPage');

        const response = await Page.createPage(newPage);

        expect(response).toEqual(mockResponse);
        expect(createPageSpy).toHaveBeenCalledWith(newPage);
        expect(checkForFetchPagesSpy).toHaveBeenCalled();
        expect(fetchPagesSpy).toHaveBeenCalled();
    });

    it('should create multiple new pages in the database', async () => {
        const newPages: NewPageArgs[] = [
            {
                name: 'Page 1',
                counts: 16,
                tempo: 120,
                time_signature: '4/4',
                notes: 'Some notes',
            },
            {
                name: 'Page 2',
                counts: 8,
                tempo: 140,
                time_signature: '3/4',
                notes: 'Other notes',
            },
        ];

        const mockResponse = { success: true };

        const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
        const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');

        const createPagesSpy = jest.spyOn(Page, 'createPages');
        const response = await Page.createPages(newPages);

        expect(response).toEqual(mockResponse);
        expect(createPagesSpy).toHaveBeenCalledWith(newPages);
        expect(checkForFetchPagesSpy).toHaveBeenCalled();
        expect(fetchPagesSpy).toHaveBeenCalled();
    });

    it('should update one or many pages in the database', async () => {
        const modifiedPages: ModifiedPageArgs[] = [
            { id: 1, counts: 8 },
            { id: 2, tempo: 140, time_signature: '3/4' },
        ];

        const mockResponse = { success: true };

        const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
        const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');

        const updatePagesSpy = jest.spyOn(Page, 'updatePages');
        const response = await Page.updatePages(modifiedPages);

        expect(response).toEqual(mockResponse);
        expect(updatePagesSpy).toHaveBeenCalledWith(modifiedPages);
        expect(checkForFetchPagesSpy).toHaveBeenCalled();
        expect(fetchPagesSpy).toHaveBeenCalled();
    });

    it('should delete a page from the database', async () => {
        const pageId = 1;

        const mockResponse = { success: true };

        const checkForFetchPagesSpy = jest.spyOn(Page, 'checkForFetchPages');
        const fetchPagesSpy = jest.spyOn(Page, 'fetchPages');

        const deletePageSpy = jest.spyOn(Page, 'deletePage');
        const response = await Page.deletePage(pageId);

        expect(response).toEqual(mockResponse);
        expect(deletePageSpy).toHaveBeenCalledWith(pageId);
        expect(checkForFetchPagesSpy).toHaveBeenCalled();
        expect(fetchPagesSpy).toHaveBeenCalled();
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

    it('should validate time signatures and convert them to strings when updating and creating', () => {
        const newPages = [
            { name: 'Page 1', time_signature: new TimeSignature({ numerator: 5, denominator: 4 }) },
            { name: 'Page 2', time_signature: '3/4' },
        ];
        const expectedValidatedNewPages = [
            { name: 'Page 1', time_signature: '5/4' },
            { name: 'Page 2', time_signature: '3/4' },
        ];
        const createPagesSpy = jest.spyOn(Page, "createPages");
        Page.createPages(newPages as NewPageArgs[]);
        expect(createPagesSpy).toHaveBeenCalledWith(expectedValidatedNewPages);

        const modifiedPages = [{ ...newPages[0], id: 1 }, { ...newPages[1], id: 2 }];
        const expectedValidatedPages = [
            { ...expectedValidatedNewPages[0], id: 1 },
            { ...expectedValidatedNewPages[1], id: 2 },
        ];
        const updatePagesSpy = jest.spyOn(Page, "updatePages");
        Page.updatePages(modifiedPages as ModifiedPageArgs[]);
        expect(updatePagesSpy).toHaveBeenCalledWith(expectedValidatedPages);
    });

    describe('getNextPage', () => {
        it('should get the next page, sequential order', () => {
            const firstPage = mockPages[0];
            const nextPage1 = mockPages[1];
            const nextPage2 = mockPages[2];
            let mocksToUse = mockPages.slice(0, 3);

            let nextPage = Page.getNextPage(firstPage, mocksToUse);
            expect(nextPage).toBe(nextPage1);
            nextPage = Page.getNextPage(nextPage!, mocksToUse);
            expect(nextPage).toBe(nextPage2);
            // Return null on last page
            nextPage = Page.getNextPage(nextPage!, mocksToUse);
            expect(nextPage).toBe(null);
        });

        it('should get the next page, non-sequential order', () => {
            const firstPage = mockPages[0];
            const nextPage1 = mockPages[1];
            const nextPage2 = mockPages[2];
            let mocksToUse = [mockPages[0], mockPages[1], mockPages[2]];

            let nextPage = Page.getNextPage(firstPage, mocksToUse);
            expect(nextPage).toEqual(nextPage1);
            nextPage = Page.getNextPage(nextPage!, mocksToUse);
            expect(nextPage).toEqual(nextPage2);
            // Return null on last page
            nextPage = Page.getNextPage(nextPage!, mocksToUse);
            expect(nextPage).toEqual(null);

            mocksToUse = [mockPages[2], mockPages[0], mockPages[1]];
            nextPage = Page.getNextPage(firstPage, mocksToUse);
            expect(nextPage).toEqual(nextPage1);
            nextPage = Page.getNextPage(nextPage!, mocksToUse);
            expect(nextPage).toEqual(nextPage2);
            // Return null on last page
            nextPage = Page.getNextPage(nextPage!, mocksToUse);
            expect(nextPage).toEqual(null);

            mocksToUse = [mockPages[0], mockPages[2]];
            nextPage = Page.getNextPage(firstPage, mocksToUse);
            expect(nextPage).toEqual(nextPage2);
            // Return null on last page
            nextPage = Page.getNextPage(nextPage!, mocksToUse);
            expect(nextPage).toEqual(null);
        });
    });

    describe('getPreviousPage', () => {
        it('should get the previous page, sequential order', () => {
            const lastPage = mockPages[2];
            const previousPage1 = mockPages[1];
            const previousPage2 = mockPages[0];
            let mocksToUse = mockPages.slice(0, 3);

            let previousPage = Page.getPreviousPage(lastPage, mocksToUse);
            expect(previousPage).toBe(previousPage1);
            previousPage = Page.getPreviousPage(previousPage!, mocksToUse);
            expect(previousPage).toBe(previousPage2);
            // Return null on first page
            previousPage = Page.getPreviousPage(previousPage!, mocksToUse);
            expect(previousPage).toBe(null);
        });

        it('should get the previous page, non-sequential order', () => {
            const lastPage = mockPages[2];
            const previousPage1 = mockPages[1];
            const previousPage2 = mockPages[0];
            let mocksToUse = [mockPages[0], mockPages[1], mockPages[2]];

            let previousPage = Page.getPreviousPage(lastPage, mocksToUse);
            expect(previousPage).toEqual(previousPage1);
            previousPage = Page.getPreviousPage(previousPage!, mocksToUse);
            expect(previousPage).toEqual(previousPage2);
            // Return null on first page
            previousPage = Page.getPreviousPage(previousPage!, mocksToUse);
            expect(previousPage).toEqual(null);

            mocksToUse = [mockPages[2], mockPages[0], mockPages[1]];
            previousPage = Page.getPreviousPage(lastPage, mocksToUse);
            expect(previousPage).toEqual(previousPage1);
            previousPage = Page.getPreviousPage(previousPage!, mocksToUse);
            expect(previousPage).toEqual(previousPage2);
            // Return null on last page
            previousPage = Page.getPreviousPage(previousPage!, mocksToUse);
            expect(previousPage).toEqual(null);

            mocksToUse = [mockPages[0], mockPages[2]];
            previousPage = Page.getPreviousPage(lastPage, mocksToUse);
            expect(previousPage).toEqual(previousPage2);
            // Return null on last page
            previousPage = Page.getPreviousPage(previousPage!, mocksToUse);
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
