import { ElectronApi } from 'electron/preload';
import BeatUnit from '../BeatUnit';
import Measure from '../Measure';
import TimeSignature from '../TimeSignature';

describe('Measure', () => {
    beforeEach(() => {
        Measure.fetchMeasures = jest.fn();
        Measure.checkForFetchMeasures = jest.fn();
    });
    afterEach(() => jest.clearAllMocks());

    it('should create a measure object', () => {
        const measure = new Measure(
            {
                number: 1, rehearsalMark: "A", tempo: 120, beatUnit: BeatUnit.QUARTER,
                timeSignature: TimeSignature.fromString('4/4')
            }
        );
        expect(measure.number).toBe(1);
        expect(measure.tempo).toBe(120);
        expect(measure.beatUnit).toBe(BeatUnit.QUARTER);
        expect(measure.timeSignature).toEqual(TimeSignature.fromString('4/4'));
    })

    it('should create a measure object with correct duration for 4/4 time signature and quarter beat unit', () => {
        const measure = new Measure(
            {
                number: 1, tempo: 120, beatUnit: BeatUnit.QUARTER,
                timeSignature: TimeSignature.fromString('4/4'),
            }
        );
        expect(measure.duration).toBe(2);
        expect(measure.rehearsalMark).toBeNull();
    });

    it('should create a measure object with correct duration for 6/8 time signature and dotted quarter beat unit', () => {
        const measure = new Measure(
            {
                number: 1, rehearsalMark: "A", tempo: 120, beatUnit: BeatUnit.DOTTED_QUARTER,
                timeSignature: TimeSignature.fromString('6/8'),
            }
        );
        expect(measure.duration).toBe(1);
    });

    it('should create a measure object with correct duration for 2/2 time signature and half note beat unit', () => {
        const measure = new Measure(
            {
                number: 1, rehearsalMark: "A", tempo: 120, beatUnit: BeatUnit.HALF,
                timeSignature: TimeSignature.fromString('2/2'),
            }
        );
        expect(measure.duration).toBe(1);
    });

    it('should create a measure object with correct duration for 6/16 time signature and dotted sixteenth beat unit', () => {
        const measure = new Measure(
            {
                number: 1, rehearsalMark: "A", tempo: 120, beatUnit: BeatUnit.DOTTED_SIXTEENTH,
                timeSignature: TimeSignature.fromString('10/16')
            }
        );
        expect(measure.duration).toBeCloseTo(10 / 3);
    });

    it('gets the correct number of big beats for a measure', () => {
        const measure = new Measure(
            {
                number: 1, rehearsalMark: "A", tempo: 120, beatUnit: BeatUnit.QUARTER,
                timeSignature: TimeSignature.fromString('4/4')
            }
        );
        expect(measure.getBigBeats()).toBe(4);

        const measure2 = new Measure(
            {
                number: 1, rehearsalMark: "A", tempo: 120, beatUnit: BeatUnit.DOTTED_QUARTER,
                timeSignature: TimeSignature.fromString('6/8')
            }
        );
        expect(measure2.getBigBeats()).toBe(2);

        const measure3 = new Measure(
            {
                number: 1, rehearsalMark: "A", tempo: 120, beatUnit: BeatUnit.EIGHTH,
                timeSignature: TimeSignature.fromString('6/8')
            }
        );
        expect(measure3.getBigBeats()).toBe(6);
    })

    describe('expected errors', () => {

        // Add more test cases for different time signatures and beat units

        it('should throw an error if measure number is not an integer', () => {
            expect(() => {
                new Measure({
                    number: 1.5, tempo: 120, beatUnit: BeatUnit.QUARTER,
                    timeSignature: TimeSignature.fromString('4/4')
                });
            }).toThrow();
        });
    })

    describe("abcToMeasures", () => {
        beforeEach(() => Measure.fetchMeasures = jest.fn());
        afterEach(() => jest.clearAllMocks());

        it("Returns empty when no measure", async () => {
            const abcString = `
X:1
T:Untitled score
C:Composer   / arranger
%%measurenb 1
L:1/4
Q:1/4=100
M:4/4`;
            window.electron = {
                getMeasuresAbcString: jest.fn().mockResolvedValue(abcString)
            } as Partial<ElectronApi> as ElectronApi;

            expect(await Measure.getMeasures(true)).toEqual([]);
        });

        it("parses multiple measures with same time signature and tempo", async () => {
            const abcString = `
X:1
T:Untitled score
C:Composer   / arranger
%%measurenb 2
L:1/4
Q:1/4=100
M:4/4
I:linebreak  $
K:C
V:1 treble nm="Oboe" snm="Ob."
V:1 G z z2   | z4
|  %6
      `;
            window.electron = {
                getMeasuresAbcString: jest.fn().mockResolvedValue(abcString)
            } as Partial<ElectronApi> as ElectronApi;

            const expectedMeasures = [
                new Measure({
                    number: 1,
                    timeSignature: TimeSignature.fromString("4/4"),
                    tempo: 100,
                    beatUnit: BeatUnit.QUARTER,
                }), new Measure({
                    number: 2,
                    timeSignature: TimeSignature.fromString("4/4"),
                    tempo: 100,
                    beatUnit: BeatUnit.QUARTER,
                })
            ];
            expect(await Measure.getMeasures(true)).toEqual(expectedMeasures);
        });

        it("parses multiple measures with different time signatures and tempos", async () => {
            const abcString = `
X:1
T:Untitled score
C:Composer   / arranger
%%measurenb 3
L:1/4
Q:1/4=100
M:4/4
I:linebreak  $
K:C
V:1 treble nm="Oboe" snm="Ob."
V:1
G z z2   | z4   |[M:3/4][Q:1/4=120]"^A" z3 | %3
| z3  |[M:2/2][Q:1/2=144]"^12" z4   | z4  |[M:6/8][Q:3/8=80]"^12" z3  | z3 |  %6
      `;

            window.electron = {
                getMeasuresAbcString: jest.fn().mockResolvedValue(abcString)
            } as Partial<ElectronApi> as ElectronApi;

            const expectedMeasures = [
                new Measure({
                    number: 1,
                    timeSignature: TimeSignature.fromString("4/4"),
                    tempo: 100,
                    beatUnit: BeatUnit.QUARTER,
                }), new Measure({
                    number: 2,
                    timeSignature: TimeSignature.fromString("4/4"),
                    tempo: 100,
                    beatUnit: BeatUnit.QUARTER,
                }), new Measure({
                    number: 3,
                    timeSignature: TimeSignature.fromString("3/4"),
                    tempo: 120,
                    beatUnit: BeatUnit.QUARTER,
                }), new Measure({
                    number: 4,
                    timeSignature: TimeSignature.fromString("3/4"),
                    tempo: 120,
                    beatUnit: BeatUnit.QUARTER,
                }), new Measure({
                    number: 5,
                    timeSignature: TimeSignature.fromString("2/2"),
                    tempo: 144,
                    beatUnit: BeatUnit.HALF,
                }), new Measure({
                    number: 6,
                    timeSignature: TimeSignature.fromString("2/2"),
                    tempo: 144,
                    beatUnit: BeatUnit.HALF,
                }), new Measure({
                    number: 7,
                    timeSignature: TimeSignature.fromString("6/8"),
                    tempo: 80,
                    beatUnit: BeatUnit.DOTTED_QUARTER,
                }), new Measure({
                    number: 8,
                    timeSignature: TimeSignature.fromString("6/8"),
                    tempo: 80,
                    beatUnit: BeatUnit.DOTTED_QUARTER,
                })
            ];
            expect(await Measure.getMeasures(true)).toEqual(expectedMeasures);
        });

        it("Handles multiple voices", async () => {
            const abcString = `
X:1
T:Untitled score
C:Composer   / arranger
%%measurenb 2
L:1/4
Q:1/4=100
M:4/4
I:linebreak  $
K:C
V:1 treble nm="Oboe" snm="Ob."
V:2 treble nm="Clarinet" snm="Cl."
V:1 G z z2   | z4 |  %6
V:2
G z z2  | z4 |  %2
      `;

            window.electron = {
                getMeasuresAbcString: jest.fn().mockResolvedValue(abcString)
            } as Partial<ElectronApi> as ElectronApi;

            const expectedMeasures = [
                new Measure({
                    number: 1,
                    timeSignature: TimeSignature.fromString("4/4"),
                    tempo: 100,
                    beatUnit: BeatUnit.QUARTER,
                }), new Measure({
                    number: 2,
                    timeSignature: TimeSignature.fromString("4/4"),
                    tempo: 100,
                    beatUnit: BeatUnit.QUARTER,
                })
            ];
            expect(await Measure.getMeasures(true)).toEqual(expectedMeasures);
        });
    });

    describe('insertMeasure', () => {
        describe('no existing measures', () => {
            it('should insert a single measure when there are none', async () => {
                window.electron = {
                    updateMeasureAbcString: jest.fn().mockResolvedValue({ success: true }),
                    getMeasuresAbcString: jest.fn().mockResolvedValue('')
                } as Partial<ElectronApi> as ElectronApi;
                // Spies
                const checkForFetchMeasuresSpy = jest.spyOn(Measure, 'checkForFetchMeasures');
                const fetchMeasuresSpy = jest.spyOn(Measure, 'fetchMeasures');
                const electronUpdateMeasuresSpy = jest.spyOn(window.electron, 'updateMeasureAbcString');

                let newMeasure = new Measure(
                    {
                        number: 1, tempo: 120, beatUnit: BeatUnit.QUARTER,
                        timeSignature: TimeSignature.fromString('4/4')
                    }
                );
                let expectedAbcString = 'X:1\nM:4/4\nQ:1/4=120\nV:1 baritone\nV:1\nz4 | ';

                let response = await Measure.insertMeasure({ newMeasure, existingMeasures: [] });

                // Checks
                expect(response).toEqual({ success: true });
                expect(electronUpdateMeasuresSpy).toHaveBeenCalledWith(expectedAbcString);
                expect(checkForFetchMeasuresSpy).toHaveBeenCalled();
                expect(fetchMeasuresSpy).toHaveBeenCalled();

                newMeasure = new Measure(
                    {
                        number: 1, rehearsalMark: "A", tempo: 80, beatUnit: BeatUnit.DOTTED_QUARTER,
                        timeSignature: TimeSignature.fromString('6/8')
                    }
                );
                expectedAbcString = 'X:1\nM:6/8\nQ:3/8=80\nV:1 baritone\nV:1\n"^A" z2 | ';

                response = await Measure.insertMeasure({ newMeasure, existingMeasures: [] });

                // Checks
                expect(response).toEqual({ success: true });
                expect(electronUpdateMeasuresSpy).toHaveBeenCalledWith(expectedAbcString);
                expect(checkForFetchMeasuresSpy).toHaveBeenCalled();
                expect(fetchMeasuresSpy).toHaveBeenCalled();
            });

            it('should insert multiple measures when there are none', async () => {
                const measures: { measure: Measure, abcString: string }[] = [
                    {
                        measure: new Measure(
                            {
                                number: 1, tempo: 144, beatUnit: BeatUnit.QUARTER,
                                timeSignature: TimeSignature.fromString('3/4')
                            }
                        ), abcString: 'X:1\nM:3/4\nQ:1/4=144\nV:1 baritone\nV:1\nz3 | '
                    },
                    {
                        measure: new Measure(
                            {
                                number: 2, tempo: 144, beatUnit: BeatUnit.QUARTER,
                                timeSignature: TimeSignature.fromString('3/4')
                            }
                        ), abcString: 'z3 | '
                    },
                    {
                        measure: new Measure(
                            {
                                number: 3, tempo: 144, rehearsalMark: 'A', beatUnit: BeatUnit.QUARTER,
                                timeSignature: TimeSignature.fromString('2/4')
                            }
                        ), abcString: '"^A" [M:2/4] z2 | '
                    },
                    {
                        measure: new Measure(
                            {
                                number: 4, tempo: 72, beatUnit: BeatUnit.HALF,
                                timeSignature: TimeSignature.fromString('2/2')
                            }
                        ), abcString: '[M:2/2] [Q:1/2=72] z2 | '
                    },
                    {
                        measure: new Measure(
                            {
                                number: 5, tempo: 72, rehearsalMark: '5', beatUnit: BeatUnit.HALF,
                                timeSignature: TimeSignature.fromString('2/2')
                            }
                        ), abcString: '"^5" z2 | '
                    },
                ];
                let expectedAbcString = '';
                let existingMeasures: Measure[] = [];
                for (const measureData of measures) {
                    window.electron = {
                        updateMeasureAbcString: jest.fn().mockResolvedValue({ success: true }),
                        getMeasuresAbcString: jest.fn().mockResolvedValue(expectedAbcString)
                    } as Partial<ElectronApi> as ElectronApi;
                    // Spies
                    const checkForFetchMeasuresSpy = jest.spyOn(Measure, 'checkForFetchMeasures');
                    const fetchMeasuresSpy = jest.spyOn(Measure, 'fetchMeasures');
                    const electronUpdateMeasuresSpy = jest.spyOn(window.electron, 'updateMeasureAbcString');

                    const response = await Measure.insertMeasure({ newMeasure: measureData.measure, existingMeasures });

                    expectedAbcString += measureData.abcString;
                    existingMeasures.push(measureData.measure)

                    // Checks
                    expect(response).toEqual({ success: true });
                    expect(electronUpdateMeasuresSpy).toHaveBeenCalledWith(expectedAbcString);
                    expect(checkForFetchMeasuresSpy).toHaveBeenCalled();
                    expect(fetchMeasuresSpy).toHaveBeenCalled();
                }
            });
        });

        describe('existing measures', () => {
            it('should insert a single measure at the end when there are existing measures', async () => {
                const newMeasure = new Measure(
                    {
                        number: 4, tempo: 120, beatUnit: BeatUnit.QUARTER,
                        timeSignature: TimeSignature.fromString('4/4')
                    }
                );

                let existingMeasuresAbcString = 'X:1\nM:4/4\nQ:1/4=120\nV:1 baritone\nV:1\nz4 | z4 | z4 | ';
                window.electron = {
                    updateMeasureAbcString: jest.fn().mockResolvedValue({ success: true }),
                    getMeasuresAbcString: jest.fn().mockResolvedValue(existingMeasuresAbcString)
                } as Partial<ElectronApi> as ElectronApi;
                // Spies
                const checkForFetchMeasuresSpy = jest.spyOn(Measure, 'checkForFetchMeasures');
                const fetchMeasuresSpy = jest.spyOn(Measure, 'fetchMeasures');
                const electronUpdateMeasuresSpy = jest.spyOn(window.electron, 'updateMeasureAbcString');

                const response = await Measure.insertMeasure({ newMeasure });

                // Checks
                expect(response).toEqual({ success: true });
                expect(electronUpdateMeasuresSpy).toHaveBeenCalledWith(existingMeasuresAbcString + 'z4 | ');
                expect(checkForFetchMeasuresSpy).toHaveBeenCalled();
                expect(fetchMeasuresSpy).toHaveBeenCalled();
            });

            it('should insert a single measure in the middle with a new tempo and time signature when there are existing measures', async () => {
                const newMeasure = new Measure(
                    {
                        number: 2, tempo: 60, beatUnit: BeatUnit.HALF,
                        timeSignature: TimeSignature.fromString('2/2')
                    }
                );

                let existingMeasuresAbcString = 'X:1\nM:4/4\nQ:1/4=120\nV:1 baritone\nV:1\nz4 | z4 | z4 | ';
                window.electron = {
                    updateMeasureAbcString: jest.fn().mockResolvedValue({ success: true }),
                    getMeasuresAbcString: jest.fn().mockResolvedValue(existingMeasuresAbcString)
                } as Partial<ElectronApi> as ElectronApi;
                // Spies
                const checkForFetchMeasuresSpy = jest.spyOn(Measure, 'checkForFetchMeasures');
                const fetchMeasuresSpy = jest.spyOn(Measure, 'fetchMeasures');
                const electronUpdateMeasuresSpy = jest.spyOn(window.electron, 'updateMeasureAbcString');

                const response = await Measure.insertMeasure({ newMeasure });

                // Checks
                const expectedAbcString = 'X:1\nM:4/4\nQ:1/4=120\nV:1 baritone\nV:1\nz4 | [M:2/2] [Q:1/2=60] z2 | [M:4/4] [Q:1/4=120] z4 | z4 | ';
                expect(response).toEqual({ success: true });
                expect(electronUpdateMeasuresSpy).toHaveBeenCalledWith(expectedAbcString);
                expect(checkForFetchMeasuresSpy).toHaveBeenCalled();
                expect(fetchMeasuresSpy).toHaveBeenCalled();
            });

            it('should insert multiple measures when there are existing measures', async () => { });
        });
    });

    describe('updateMeasure', () => {

        it('should update a single measure at the end when there are existing measures', async () => {
            const modifiedMeasure = new Measure(
                {
                    number: 2, tempo: 90, beatUnit: BeatUnit.DOTTED_QUARTER,
                    timeSignature: TimeSignature.fromString('9/8')
                }
            );

            let existingMeasuresAbcString = 'X:1\nM:4/4\nQ:1/4=120\nV:1 baritone\nV:1\nz4 | z4 | z4 | ';
            window.electron = {
                updateMeasureAbcString: jest.fn().mockResolvedValue({ success: true }),
                getMeasuresAbcString: jest.fn().mockResolvedValue(existingMeasuresAbcString)
            } as Partial<ElectronApi> as ElectronApi;
            // Spies
            const checkForFetchMeasuresSpy = jest.spyOn(Measure, 'checkForFetchMeasures');
            const fetchMeasuresSpy = jest.spyOn(Measure, 'fetchMeasures');
            const electronUpdateMeasuresSpy = jest.spyOn(window.electron, 'updateMeasureAbcString');

            const response = await Measure.updateMeasure({ modifiedMeasure });

            // Checks
            expect(response).toEqual({ success: true });
            expect(electronUpdateMeasuresSpy).toHaveBeenCalledWith('X:1\nM:4/4\nQ:1/4=120\nV:1 baritone\nV:1\nz4 | [M:9/8] [Q:3/8=90] z3 | [M:4/4] [Q:1/4=120] z4 | ');
            expect(checkForFetchMeasuresSpy).toHaveBeenCalled();
            expect(fetchMeasuresSpy).toHaveBeenCalled();
        });
    });

    describe('deleteMeasure', () => {
        it('should return success when there are no measures to delete', async () => {
            window.electron = {
                updateMeasureAbcString: jest.fn().mockResolvedValue({ success: true }),
                getMeasuresAbcString: jest.fn().mockResolvedValue('')
            } as Partial<ElectronApi> as ElectronApi;

            // Couldn't find a way to test if an error is thrown with toThrow()
            try {
                await Measure.deleteMeasure({ measureNumber: 1 });
                expect(true).toBe(false); // Error should be thrown
            } catch (error) {
                expect(true).toBe(true);
            }
        });

        describe('existing measures', () => {
            it('should delete a single measure at the end when there are existing measures', async () => {
                let existingMeasuresAbcString = 'X:1\nM:4/4\nQ:1/4=120\nV:1 baritone\nV:1\nz4 | z4 | z4 | ';
                window.electron = {
                    updateMeasureAbcString: jest.fn().mockResolvedValue({ success: true }),
                    getMeasuresAbcString: jest.fn().mockResolvedValue(existingMeasuresAbcString)
                } as Partial<ElectronApi> as ElectronApi;
                // Spies
                const checkForFetchMeasuresSpy = jest.spyOn(Measure, 'checkForFetchMeasures');
                const fetchMeasuresSpy = jest.spyOn(Measure, 'fetchMeasures');
                const electronUpdateMeasuresSpy = jest.spyOn(window.electron, 'updateMeasureAbcString');

                const response = await Measure.deleteMeasure({ measureNumber: 3 });

                // Checks
                expect(response).toEqual({ success: true });
                expect(electronUpdateMeasuresSpy).toHaveBeenCalledWith('X:1\nM:4/4\nQ:1/4=120\nV:1 baritone\nV:1\nz4 | z4 | ');
                expect(checkForFetchMeasuresSpy).toHaveBeenCalled();
                expect(fetchMeasuresSpy).toHaveBeenCalled();
            });

            it('should delete a single measure at the end when there are existing measures with different time signatures and tempos', async () => {
                let existingMeasuresAbcString = 'X:1\nM:4/4\nQ:1/4=120\nV:1 baritone\nV:1\nz4 | [M:2/2] [Q:1/2=60] z2 | [M:4/4] [Q:1/4=120] z4 | z4 | ';
                window.electron = {
                    updateMeasureAbcString: jest.fn().mockResolvedValue({ success: true }),
                    getMeasuresAbcString: jest.fn().mockResolvedValue(existingMeasuresAbcString)
                } as Partial<ElectronApi> as ElectronApi;
                // Spies
                const checkForFetchMeasuresSpy = jest.spyOn(Measure, 'checkForFetchMeasures');
                const fetchMeasuresSpy = jest.spyOn(Measure, 'fetchMeasures');
                const electronUpdateMeasuresSpy = jest.spyOn(window.electron, 'updateMeasureAbcString');

                const response = await Measure.deleteMeasure({ measureNumber: 2 });

                // Checks
                expect(response).toEqual({ success: true });
                expect(electronUpdateMeasuresSpy).toHaveBeenCalledWith('X:1\nM:4/4\nQ:1/4=120\nV:1 baritone\nV:1\nz4 | z4 | z4 | ');
                expect(checkForFetchMeasuresSpy).toHaveBeenCalled();
                expect(fetchMeasuresSpy).toHaveBeenCalled();
            });
        });
    });
});
