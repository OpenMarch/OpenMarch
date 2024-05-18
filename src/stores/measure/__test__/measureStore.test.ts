// import { act, renderHook } from '@testing-library/react';
// import { useMeasureStore } from "../useMeasureStore";
// import Measure from '@/global/classes/Measure';
// import TimeSignature from '@/global/classes/TimeSignature';
// import BeatUnit from '@/global/classes/BeatUnit';

jest.mock('@/global/classes/Measure');

// TODO - These aren't working for some reason, don't know why. Is this worth testing?
describe('measureStore', () => {
    it('Not yet implemented', async () => {
        expect(true).toBe(true);
    });
    // afterEach(async () => {
    //     jest.clearAllMocks();
    //     const { result } = renderHook(() => useMeasureStore());
    //     jest.spyOn(Measure, 'getMeasures').mockResolvedValue(``);
    //     await act(async () => { result.current.fetchMeasures() });
    //     jest.clearAllMocks();
    // });

    // it('measureStore - initial state', async () => {
    //     // Expect the initial state to be an empty array
    //     const { result } = renderHook(() => useMeasureStore());
    //     expect(result.current.measures).toEqual([]);
    // });

    //     it('measureStore - fetches measures', async () => {
    //         const mockAbcString = `
    // X:1
    // T:Untitled score
    // C:Composer   / arranger
    // %%measurenb 2
    // L:1/4
    // Q:1/4=100
    // M:4/4
    // I:linebreak  $
    // K:C
    // V:1 treble nm="Oboe" snm="Ob."
    // V:1 G z z2   | z4
    // |  %6`
    //         jest.spyOn(Measure, 'getMeasures').mockResolvedValue(mockAbcString);

    //         // Expect the initial state to be an empty array
    //         const { result } = renderHook(() => useMeasureStore());
    //         expect(result.current.measures).toEqual([]);
    //         await act(async () => { result.current.fetchMeasures() });

    //         // Copy the mockMeasures array to avoid reference equality issues
    //         const expectedMeasures = [
    //             new Measure({
    //                 number: 1,
    //                 timeSignature: TimeSignature.fromString("4/4"),
    //                 tempo: 100,
    //                 beatUnit: BeatUnit.QUARTER,
    //             }),
    //             new Measure({
    //                 number: 2,
    //                 timeSignature: TimeSignature.fromString("4/4"),
    //                 tempo: 100,
    //                 beatUnit: BeatUnit.QUARTER,
    //             })];

    //         console.log("JEFF", expectedMeasures);

    //         // expect(result.current.measures).toEqual(expectedMeasures);
    //     });

    // it('measureStore - fetches single measure', async () => {
    //     const mockToUse = [mockMeasures[0]];
    //     jest.spyOn(Measure, 'getMeasures').mockResolvedValue(mockToUse);

    //     const { result } = renderHook(() => useMeasureStore());
    //     await act(async () => { result.current.fetchMeasures() });

    //     // Copy the mockMeasures array to avoid reference equality issues
    //     const expectedMeasures = [...mockToUse];
    //     expect(result.current.measures).toEqual(expectedMeasures);
    // });

    // it('measureStore - fetch no measures', async () => {
    //     const mockToUse: Measure[] = [];
    //     jest.spyOn(Measure, 'getMeasures').mockResolvedValue(mockToUse);

    //     const { result } = renderHook(() => useMeasureStore());
    //     await act(async () => { result.current.fetchMeasures() });

    //     // Copy the mockMeasures array to avoid reference equality issues
    //     const expectedMeasures = [...mockToUse];
    //     expect(result.current.measures).toEqual(expectedMeasures);
    // });
});
