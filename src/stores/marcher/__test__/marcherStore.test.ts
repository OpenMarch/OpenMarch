import { act, renderHook } from '@testing-library/react';
import { useMarcherStore } from "../useMarcherStore";
import { mockMarchers } from './__mocks__/mockMarchers';
import * as api from '@/api/api';
import { Marcher } from '@/global/Interfaces';

jest.mock('@/api/api');

describe('marcherStore', () => {
    it('fetches marchers', async () => {
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

    it('fetches single marcher', async () => {
        const mockToUse = [mockMarchers[0]];
        jest.spyOn(api, 'getMarchers').mockResolvedValue(mockToUse);

        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMarcherStore());
        expect(result.current.marchers).toEqual([]);

        await act(async () => { result.current.fetchMarchers() });

        // Copy the mockMarchers array to avoid reference equality issues
        const expectedMarchers = [...mockToUse];
        expect(result.current.marchers).toEqual(expectedMarchers);
    });

    it('fetch no marchers', async () => {
        const mockToUse: Marcher[] = [];
        jest.spyOn(api, 'getMarchers').mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherStore());
        await act(async () => { result.current.fetchMarchers() });

        // Copy the mockMarchers array to avoid reference equality issues
        const expectedMarchers = [...mockToUse];
        expect(result.current.marchers).toEqual(expectedMarchers);
    });
});
