import { act, renderHook } from '@testing-library/react';
import { useMarcherPageStore } from "../useMarcherPageStore";
import { mockMarcherPages } from './mocks';
import * as api from '@/api/api';
import { MarcherPage } from '@/global/Interfaces';

jest.mock('@/api/api');

describe('marcherPageStore', () => {
    afterEach(async () => {
        jest.clearAllMocks();
        const { result } = renderHook(() => useMarcherPageStore());
        jest.spyOn(api, 'getMarcherPages').mockResolvedValue([]);
        await act(async () => { result.current.fetchMarcherPages() });
        jest.clearAllMocks();
    });

    it('marcherPagesStore - initial state', async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMarcherPageStore());
        expect(result.current.marcherPages).toEqual([]);
    });

    it('marcherPagesStore - fetch all', async () => {
        const mockToUse = mockMarcherPages;
        jest.spyOn(api, 'getMarcherPages').mockResolvedValue(mockToUse);

        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMarcherPageStore());
        expect(result.current.marcherPages).toEqual([]);
        await act(async () => { result.current.fetchMarcherPages() });

        // Copy the mockMarcherPages array to avoid reference equality issues
        const expectedMarcherPages = [...mockToUse];
        expect(result.current.marcherPages).toEqual(expectedMarcherPages);
    });

    it('marcherPagesStore - fetches single marcherPage', async () => {
        const mockToUse = [mockMarcherPages[0]];
        jest.spyOn(api, 'getMarcherPages').mockResolvedValue(mockToUse);

        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMarcherPageStore());
        expect(result.current.marcherPages).toEqual([]);
        await act(async () => { result.current.fetchMarcherPages() });

        // Copy the mockMarcherPages array to avoid reference equality issues
        const expectedMarcherPages = [...mockToUse];
        expect(result.current.marcherPages).toEqual(expectedMarcherPages);
    });

    it('marcherPagesStore - fetch no marcherPages', async () => {
        const mockToUse: MarcherPage[] = [];
        jest.spyOn(api, 'getMarcherPages').mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherPageStore());
        await act(async () => { result.current.fetchMarcherPages() });

        // Copy the mockMarcherPages array to avoid reference equality issues
        const expectedMarcherPages = [...mockToUse];
        expect(result.current.marcherPages).toEqual(expectedMarcherPages);
    });
});
