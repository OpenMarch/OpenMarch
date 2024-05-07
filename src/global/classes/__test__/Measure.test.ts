import BeatUnit from '../BeatUnit';
import Measure from '../Measure';
import TimeSignature from '../TimeSignature';

describe('Measure', () => {
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
});
