import { Measure } from '../Measure';
import { TimeSignature } from '../TimeSignature';
import { BeatUnit } from '../TimeSignature';

describe('Measure', () => {
    it('should create a measure object', () => {
        const measure = new Measure(
            {
                number: 1, rehearsalMark: "A", bpm: 120, tempoBeatUnit: BeatUnit.QUARTER, tempoBeatUnitDots: 0,
                timeSignature: TimeSignature.fromString('4/4')
            }
        );
        expect(measure.number).toBe(1);
        expect(measure.bpm).toBe(120);
        expect(measure.tempoBeatUnit).toBe(BeatUnit.QUARTER);
        expect(measure.tempoBeatUnitDots).toBe(0);
        expect(measure.timeSignature).toEqual(TimeSignature.fromString('4/4'));
    })

    it('should create a measure object with correct duration for 4/4 time signature and quarter beat unit', () => {
        const measure = new Measure(
            {
                number: 1, bpm: 120, tempoBeatUnit: BeatUnit.QUARTER, tempoBeatUnitDots: 0,
                timeSignature: TimeSignature.fromString('4/4')
            }
        );
        expect(measure.duration).toBe(2);
        expect(measure.rehearsalMark).toBeNull();
    });

    it('should create a measure object with correct duration for 6/8 time signature and dotted quarter beat unit', () => {
        const measure = new Measure(
            {
                number: 1, rehearsalMark: "A", bpm: 120, tempoBeatUnit: BeatUnit.QUARTER, tempoBeatUnitDots: 1,
                timeSignature: TimeSignature.fromString('6/8')
            }
        );
        expect(measure.duration).toBe(1);
    });

    it('should create a measure object with correct duration for 2/2 time signature and half note beat unit', () => {
        const measure = new Measure(
            {
                number: 1, rehearsalMark: "A", bpm: 120, tempoBeatUnit: BeatUnit.HALF, tempoBeatUnitDots: 0,
                timeSignature: TimeSignature.fromString('2/2')
            }
        );
        expect(measure.duration).toBe(1);
    });


    it('should create a measure object with correct duration for 7/4 time signature and half note beat unit', () => {
        const measure = new Measure(
            {
                number: 1, rehearsalMark: "A", bpm: 120, tempoBeatUnit: BeatUnit.SIXTEENTH, tempoBeatUnitDots: 2,
                timeSignature: TimeSignature.fromString('7/16')
            }
        );
        expect(measure.duration).toBe(2);
    });

    // Add more test cases for different time signatures and beat units

    it('should throw an error if measure number is not an integer', () => {
        expect(() => {
            new Measure({ number: 1.5, bpm: 120, tempoBeatUnit: BeatUnit.QUARTER, tempoBeatUnitDots: 0, timeSignature: TimeSignature.fromString('4/4') });
        }).toThrow();
    });

    it('should throw an error if beatUnitDots is not an integer', () => {
        expect(() => {
            new Measure({ number: 1, rehearsalMark: "A", bpm: 120, tempoBeatUnit: BeatUnit.WHOLE, tempoBeatUnitDots: 1.5, timeSignature: TimeSignature.fromString('4/4') });
        }).toThrow();
    });
});
