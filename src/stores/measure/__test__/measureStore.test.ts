import { act, renderHook } from '@testing-library/react';
import { useMeasureStore } from "../useMeasureStore";
import { mockMeasures } from '@/__mocks__/globalMocks';
import Measure from '@/global/classes/Measure';

jest.mock('@/global/classes/Measure');

describe('measureStore', () => {
    afterEach(async () => {
        jest.clearAllMocks();
        const { result } = renderHook(() => useMeasureStore());
        jest.spyOn(Measure, 'getMeasures').mockResolvedValue([]);
        await act(async () => { result.current.fetchMeasures() });
        jest.clearAllMocks();
    });

    it('measureStore - initial state', async () => {
        // Expect the initial state to be an empty array
        const { result } = renderHook(() => useMeasureStore());
        expect(result.current.measures).toEqual([]);
    });

    // TODO - These aren't working for some reason, don't know why
    // it('measureStore - fetches measures', async () => {
    //     const mockToUse = mockMeasures;
    //     console.log("mockToUse", mockMeasures);
    //     jest.spyOn(Measure, 'getMeasures').mockResolvedValue(mockToUse);

    //     // Expect the initial state to be an empty array
    //     const { result } = renderHook(() => useMeasureStore());
    //     expect(result.current.measures).toEqual([]);
    //     await act(async () => { result.current.fetchMeasures() });

    //     // Copy the mockMeasures array to avoid reference equality issues
    //     const expectedMeasures = [...mockToUse];
    //     // console.log("expectedMeasures", expectedMeasures);
    //     // console.log("result.current.measures", result.current.measures);
    //     const sortedResultMeasures = result.current.measures.sort((a, b) => a.compareTo(b));
    //     const sortedExpectedMeasures = expectedMeasures.sort((a, b) => a.compareTo(b));

    //     // for (let i = 0; i < sortedResultMeasures.length; i++) {
    //     //     console.log(Measure.equals(sortedResultMeasures[i], sortedExpectedMeasures[i]));
    //     // }
    // });

    // it('measureStore - fetches single measure', async () => {
    //     const mockToUse = [mockMeasures[0]];
    //     jest.spyOn(Measure, 'getMeasures').mockResolvedValue(mockToUse);

    //     const { result } = renderHook(() => useMeasureStore());
    //     await act(async () => { result.current.fetchMeasures() });

    //     // Copy the mockMeasures array to avoid reference equality issues
    //     const expectedMeasures = [...mockToUse];
    //     expect(result.current.measures).toEqual(expectedMeasures);
    // });

    it('measureStore - fetch no measures', async () => {
        const mockToUse: Measure[] = [];
        jest.spyOn(Measure, 'getMeasures').mockResolvedValue(mockToUse);

        const { result } = renderHook(() => useMeasureStore());
        await act(async () => { result.current.fetchMeasures() });

        // Copy the mockMeasures array to avoid reference equality issues
        const expectedMeasures = [...mockToUse];
        expect(result.current.measures).toEqual(expectedMeasures);
    });
});
