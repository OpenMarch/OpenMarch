import { act, renderHook } from '@testing-library/react';
import { useMarcherPageStore } from "../useMarcherPageStore";
import { mockMarcherPages } from '../../../__mocks__/data/mockMarcherPages';
import * as api from '@/api/api';
import { MarcherPage } from '@/global/Interfaces';

jest.mock('@/api/api');

describe('marcherPageStore', () => {
    it('fetches marcherPages', async () => {
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

    it('fetches single marcherPage', async () => {
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

    it('fetch no marcherPages', async () => {
        const mockToUse: MarcherPage[] = [];
        jest.spyOn(api, 'getMarcherPages').mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherPageStore());
        await act(async () => { result.current.fetchMarcherPages() });

        // Copy the mockMarcherPages array to avoid reference equality issues
        const expectedMarcherPages = [...mockToUse];
        expect(result.current.marcherPages).toEqual(expectedMarcherPages);
    });
});
