import { act, renderHook } from '@testing-library/react';
import { mockMarchers } from './mocks';
import { useSelectedMarchers, SelectedMarchersProvider } from "@/context/SelectedMarchersContext";
import { ElectronApi } from 'electron/preload';
import { Marcher } from '@/global/classes/Marcher';

// Mock the electron api
window.electron = {
    sendSelectedMarchers: jest.fn(),
} as Partial<ElectronApi> as ElectronApi;

describe('SelectedMarchersContext', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Marcher, 'getMarchers').mockResolvedValue(mockMarchers);
    });

    it('initial selected marchers should be []', async () => {
        const { result } = renderHook(() => useSelectedMarchers(), { wrapper: SelectedMarchersProvider });
        expect(result.current?.selectedMarchers).toEqual([]);
    })

    it('set selected marcher - single marcher', async () => {
        const { result } = renderHook(() => useSelectedMarchers(), { wrapper: SelectedMarchersProvider });
        const marchers = await Marcher.getMarchers();

        // copy the first marcher to avoid reference equality issues
        act(() => result.current?.setSelectedMarchers([[...marchers][0]]));
        expect(result.current?.selectedMarchers).toEqual([marchers[0]]);
    });

    it('set selected marcher - multiple marchers', async () => {
        const { result } = renderHook(() => useSelectedMarchers(), { wrapper: SelectedMarchersProvider });
        const marchers = await Marcher.getMarchers();

        // copy the first marcher to avoid reference equality issues
        const multipleMarchers = [[...marchers][0], [...marchers][2]];
        act(() => result.current?.setSelectedMarchers([...multipleMarchers]));
        expect(result.current?.selectedMarchers).toEqual([...multipleMarchers]);
    });

    it('set selected marcher - multiple changes', async () => {
        const { result } = renderHook(() => useSelectedMarchers(), { wrapper: SelectedMarchersProvider });
        const marchers = await Marcher.getMarchers();

        // copy the first marcher to avoid reference equality issues
        let expectedMarchers = [[...marchers][0], [...marchers][2]];
        act(() => result.current?.setSelectedMarchers([...expectedMarchers]));
        expect(result.current?.selectedMarchers).toEqual([...expectedMarchers]);

        // copy the first marcher to avoid reference equality issues
        expectedMarchers = [[...marchers][0]];
        act(() => result.current?.setSelectedMarchers([...expectedMarchers]));
        expect(result.current?.selectedMarchers).toEqual([...expectedMarchers]);

        // no marchers
        expectedMarchers = [];
        act(() => result.current?.setSelectedMarchers([...expectedMarchers]));
        expect(result.current?.selectedMarchers).toEqual([...expectedMarchers]);
    });

});
