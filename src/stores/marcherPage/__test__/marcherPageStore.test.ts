import { renderHook, act } from '@testing-library/react';
import { useMarcherPageStore } from "../useMarcherPageStore";
import { mockMarcherPages } from '@/__mocks__/globalMocks';
import { MarcherPage } from '@/global/classes/MarcherPage';
import { describe, expect, it, vi, afterEach } from "vitest";

describe('marcherPageStore', () => {
    afterEach(async () => {
        vi.clearAllMocks();
        const { result } = renderHook(() => useMarcherPageStore());
        vi.spyOn(MarcherPage, 'getMarcherPages').mockResolvedValue([]);
        await act(async () => { result.current.fetchMarcherPages() });
        vi.clearAllMocks();
    });

    it('marcherPagesStore - initial state', async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMarcherPageStore());
        expect(result.current.marcherPages).toEqual([]);
    });

    it('marcherPagesStore - fetch all', async () => {
        const mockToUse = mockMarcherPages;
        vi.spyOn(MarcherPage, 'getMarcherPages').mockResolvedValue(mockToUse);

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
        vi.spyOn(MarcherPage, 'getMarcherPages').mockResolvedValue(mockToUse);

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
        vi.spyOn(MarcherPage, 'getMarcherPages').mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherPageStore());
        await act(async () => { result.current.fetchMarcherPages() });

        // Copy the mockMarcherPages array to avoid reference equality issues
        const expectedMarcherPages = [...mockToUse];
        expect(result.current.marcherPages).toEqual(expectedMarcherPages);
    });
});
