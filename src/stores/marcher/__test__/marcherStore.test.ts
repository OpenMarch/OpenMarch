import { act, renderHook } from '@testing-library/react';
import { useMarcherStore } from "../useMarcherStore";
import { mockMarchers } from './mocks';
import { Marcher } from '@/global/classes/Marcher';

jest.mock('@/global/classes/Marcher');

describe('marcherStore', () => {
    afterEach(async () => {
        jest.clearAllMocks();
        const { result } = renderHook(() => useMarcherStore());
        jest.spyOn(Marcher, 'getMarchers').mockResolvedValue([]);
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
        jest.spyOn(Marcher, 'getMarchers').mockResolvedValue(mockToUse);

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
        jest.spyOn(Marcher, 'getMarchers').mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherStore());
        await act(async () => { result.current.fetchMarchers() });

        // Copy the mockMarchers array to avoid reference equality issues
        const expectedMarchers = [...mockToUse];
        expect(result.current.marchers).toEqual(expectedMarchers);
    });

    it('marcherStore - fetch no marchers', async () => {
        const mockToUse: Marcher[] = [];
        jest.spyOn(Marcher, 'getMarchers').mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMarcherStore());
        await act(async () => { result.current.fetchMarchers() });

        // Copy the mockMarchers array to avoid reference equality issues
        const expectedMarchers = [...mockToUse];
        expect(result.current.marchers).toEqual(expectedMarchers);
    });
});
