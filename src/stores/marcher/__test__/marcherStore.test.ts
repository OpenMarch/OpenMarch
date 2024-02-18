import { act, renderHook } from '@testing-library/react';
import { useMarcherStore } from "../useMarcherStore";
import { mockMarchers } from './__mocks__/mockMarchers';
import * as api from '@/api/api';
import { Marcher } from '@/global/Interfaces';

jest.mock('@/api/api');

describe('marcherStore', () => {
    afterEach(async () => {
        jest.clearAllMocks();
        const { result } = renderHook(() => useMarcherStore());
        jest.spyOn(api, 'getMarchers').mockResolvedValue([]);
        await act(async () => { result.current.fetchMarchers() });
        jest.clearAllMocks();
    });

    it('marcherStore - initial state', async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMarcherStore());
        expect(result.current.marchers).toEqual([]);
    });

    it('marcherStore - fetches marchers', async () => {
        const mockToUse = mockMarchers;
        jest.spyOn(api, 'getMarchers').mockResolvedValue(mockToUse);

        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMarcherStore());
        expect(result.current.marchers).toEqual([]);
        await act(async () => { result.current.fetchMarchers() });

        // Copy the mockMarchers array to avoid reference equality issues
        const expectedMarchers = [...mockToUse];
        expect(result.current.marchers).toEqual(expectedMarchers);
    });

    it('marcherStore - fetches single marcher', async () => {
        const mockToUse = [mockMarchers[0]];
        jest.spyOn(api, 'getMarchers').mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherStore());
        await act(async () => { result.current.fetchMarchers() });

        // Copy the mockMarchers array to avoid reference equality issues
        const expectedMarchers = [...mockToUse];
        expect(result.current.marchers).toEqual(expectedMarchers);
    });

    it('marcherStore - fetch no marchers', async () => {
        const mockToUse: Marcher[] = [];
        jest.spyOn(api, 'getMarchers').mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherStore());
        await act(async () => { result.current.fetchMarchers() });

        // Copy the mockMarchers array to avoid reference equality issues
        const expectedMarchers = [...mockToUse];
        expect(result.current.marchers).toEqual(expectedMarchers);
    });
});
