import { mockMarcherPages } from '@/__mocks__/globalMocks';
import { MarcherPage, ModifiedMarcherPageArgs } from '../MarcherPage';
import { ElectronApi } from 'electron/preload';
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

describe('MarcherPage', () => {
    beforeEach(() => {
        window.electron = {
            getMarcherPages: vi.fn().mockResolvedValue(mockMarcherPages),
            createPages: vi.fn().mockResolvedValue({ success: true }),
            updateMarcherPages: vi.fn().mockResolvedValue({ success: true }),
            deletePage: vi.fn().mockResolvedValue({ success: true }),
        } as Partial<ElectronApi> as ElectronApi;

        MarcherPage.fetchMarcherPages = vi.fn();
        MarcherPage.checkForFetchMarcherPages = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create a valid MarcherPage object', () => {
            const marcherPageData = {
                id: 1,
                id_for_html: 'marcherPage_1',
                marcher_id: 2,
                page_id: 3,
                x: 10,
                y: 20,
                notes: 'Some notes',
            };

            const marcherPage = new MarcherPage(marcherPageData);

            expect(marcherPage).toBeInstanceOf(MarcherPage);
            expect(marcherPage.id).toBe(1);
            expect(marcherPage.id_for_html).toBe('marcherPage_1');
            expect(marcherPage.marcher_id).toBe(2);
            expect(marcherPage.page_id).toBe(3);
            expect(marcherPage.x).toBe(10);
            expect(marcherPage.y).toBe(20);
            expect(marcherPage.notes).toBe('Some notes');
        });
    });
    it('should fetch all MarcherPages from the database', async () => {
        const mockResponse = mockMarcherPages;
        const getMarcherPagesSpy = vi.spyOn(MarcherPage, 'getMarcherPages');

        getMarcherPagesSpy.mockResolvedValue(mockResponse as MarcherPage[]);

        const pages = await MarcherPage.getMarcherPages();

        expect(pages).toEqual(mockResponse);
        expect(getMarcherPagesSpy).toHaveBeenCalled();
    });

    it('should update one or many MarcherPages in the database', async () => {
        const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [
            { marcher_id: 1, page_id: 2, x: 8, y: 10 },
            { marcher_id: 2, page_id: 2, x: 54.6, y: -456 },
            { marcher_id: 1, page_id: 3, x: 0, y: 10.123021 },
            { marcher_id: 2, page_id: 3, x: -239.09, y: 10 },
        ];

        const mockResponse = { success: true };

        const checkForFetchMarcherPagesSpy = vi.spyOn(MarcherPage, 'checkForFetchMarcherPages');
        const fetchMarcherPagesSpy = vi.spyOn(MarcherPage, 'fetchMarcherPages');

        const updatePagesSpy = vi.spyOn(MarcherPage, 'updateMarcherPages');
        const response = await MarcherPage.updateMarcherPages(modifiedMarcherPages);

        expect(response).toEqual(mockResponse);
        expect(updatePagesSpy).toHaveBeenCalledWith(modifiedMarcherPages);
        expect(checkForFetchMarcherPagesSpy).toHaveBeenCalled();
        expect(fetchMarcherPagesSpy).toHaveBeenCalled();
    });
});
