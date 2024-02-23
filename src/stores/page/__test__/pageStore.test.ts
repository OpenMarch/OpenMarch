import { act, renderHook } from '@testing-library/react';
import { usePageStore } from "../usePageStore";
import { mockPages } from './mocks';
import * as api from '@/api/api';
import { Page } from '@/global/Interfaces';

jest.mock('@/api/api');

describe('pageStore', () => {
    afterEach(async () => {
        jest.clearAllMocks();
        const { result } = renderHook(() => usePageStore());
        jest.spyOn(api, 'getPages').mockResolvedValue([]);
        await act(async () => { result.current.fetchPages() });
        jest.clearAllMocks();
    });

    it('pageStore - initial state []', async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => usePageStore());
        expect(result.current.pages).toEqual([]);
    });

    it('pageStore - fetches pages', async () => {
        const mockToUse = mockPages;
        jest.spyOn(api, 'getPages').mockResolvedValue(mockToUse);

        // Expect the initial state to be an empty array
        const { result } = renderHook(() => usePageStore());
        expect(result.current.pages).toEqual([]);

        await act(async () => { result.current.fetchPages() });

        // Copy the mockPages array to avoid reference equality issues
        const expectedPages = [...mockToUse];
        expect(result.current.pages).toEqual(expectedPages);
    });

    it('pageStore - fetches single page', async () => {
        const mockToUse = [mockPages[0]];
        jest.spyOn(api, 'getPages').mockResolvedValue(mockToUse);

        // Expect the initial state to be an empty array
        const { result } = renderHook(() => usePageStore());
        expect(result.current.pages).toEqual([]);

        await act(async () => { result.current.fetchPages() });

        // Copy the mockPages array to avoid reference equality issues
        const expectedPages = [...mockToUse];
        expect(result.current.pages).toEqual(expectedPages);
    });

    it('pageStore - fetch no pages', async () => {
        const mockToUse: Page[] = [];
        jest.spyOn(api, 'getPages').mockResolvedValue(mockToUse);

        const { result } = renderHook(() => usePageStore());
        await act(async () => { result.current.fetchPages() });

        // Copy the mockPages array to avoid reference equality issues
        const expectedPages = [...mockToUse];
        expect(result.current.pages).toEqual(expectedPages);
    });
});
