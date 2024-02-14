import { create as createMockStore, StateCreator } from "zustand";
import { act, renderHook, RenderHookResult } from '@testing-library/react';
import { useMarcherStore } from "../useMarcherStore";
import { mockMarchers } from "./__mocks__/mockMarchers";


jest.mock('@/api/api', () => ({
    getMarchers: jest.fn().mockResolvedValue(require('./__mocks__/mockMarchers'))
}));

describe('marcherStore', () => {
    it('fetches marchers', async () => {
        const { result } = renderHook(() => useMarcherStore());
        await act(async () => { result.current.fetchMarchers() });
        expect(result.current.marchers).toEqual(require('./__mocks__/mockMarchers'));
    });
});


// test('simple truthy test', () => {
//     expect(true).toBe(true);
// });
