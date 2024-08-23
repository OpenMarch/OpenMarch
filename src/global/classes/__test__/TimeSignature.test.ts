import TimeSignature from '../TimeSignature';
import { describe, expect, it } from "vitest";

describe('TimeSignature', () => {
    describe('constructor', () => {
        it('should create a valid time signature object', () => {
            const timeSignature = new TimeSignature({ numerator: 4, denominator: 4 });

            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(4);
            expect(timeSignature.denominator).toBe(4);
        });

        it('should create a valid time signature object with many kinds of numerators and denominators', () => {
            let timeSignature = new TimeSignature({ numerator: 5, denominator: 4 });
            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(5);
            expect(timeSignature.denominator).toBe(4);

            timeSignature = new TimeSignature({ numerator: 20, denominator: 4 });
            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(20);
            expect(timeSignature.denominator).toBe(4);

            timeSignature = new TimeSignature({ numerator: 2, denominator: 8 });
            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(2);
            expect(timeSignature.denominator).toBe(8);

            timeSignature = new TimeSignature({ numerator: 3, denominator: 16 });
            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(3);
            expect(timeSignature.denominator).toBe(16);

            timeSignature = new TimeSignature({ numerator: 1, denominator: 1 });
            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(1);
            expect(timeSignature.denominator).toBe(1);
        });

        it('should throw an error for invalid numerator', () => {
            expect(() => {
                new TimeSignature({ numerator: 0, denominator: 4 });
            }).toThrow();

            expect(() => {
                new TimeSignature({ numerator: -3, denominator: 4 });
            }).toThrow();

            expect(() => {
                new TimeSignature({ numerator: 2.5, denominator: 4 });
            }).toThrow();
        });
    });

    describe('fromString', () => {
        it('should create a valid time signature object from a string', () => {
            const timeSignature = TimeSignature.fromString('4/4');

            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(4);
            expect(timeSignature.denominator).toBe(4);
        });

        it('should create a valid time signature object with many kinds of numerators and denominators from string', () => {
            let timeSignature = TimeSignature.fromString('5/4');
            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(5);
            expect(timeSignature.denominator).toBe(4);

            timeSignature = TimeSignature.fromString('20/4');
            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(20);
            expect(timeSignature.denominator).toBe(4);

            timeSignature = TimeSignature.fromString('2/8');
            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(2);
            expect(timeSignature.denominator).toBe(8);

            timeSignature = TimeSignature.fromString('3/16');
            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(3);
            expect(timeSignature.denominator).toBe(16);

            timeSignature = TimeSignature.fromString('1/1');
            expect(timeSignature).toBeInstanceOf(TimeSignature);
            expect(timeSignature.numerator).toBe(1);
            expect(timeSignature.denominator).toBe(1);
        });

        it('should throw an error for invalid time signature string', () => {
            expect(() => {
                TimeSignature.fromString('4');
            }).toThrow();

            expect(() => {
                TimeSignature.fromString('4/4/4');
            }).toThrow();

            expect(() => {
                TimeSignature.fromString('-4/4');
            }).toThrow();

            expect(() => {
                TimeSignature.fromString('4/-4');
            }).toThrow();

            expect(() => {
                TimeSignature.fromString('4/0');
            }).toThrow();

            expect(() => {
                TimeSignature.fromString('4/3');
            }).toThrow();

            expect(() => {
                TimeSignature.fromString('4/5');
            }).toThrow();

            expect(() => {
                TimeSignature.fromString('4/-2');
            }).toThrow();
        });
    });

    describe('toString', () => {
        it('should return a string representation of the time signature', () => {
            const timeSignature = new TimeSignature({ numerator: 4, denominator: 4 });
            const timeSignatureString = timeSignature.toString();

            expect(timeSignatureString).toBe('4/4');
        });
    });

    describe('beatUnit', () => {
        it('should return the beat unit of the time signature x/4', () => {
            const timeSignature = new TimeSignature({ numerator: 4, denominator: 4 });
            const beatUnit = timeSignature.getBeatUnit();

            expect(beatUnit.name).toBe('QUARTER');
            expect(beatUnit.value).toBe(1 / 4);
        });

        it('should return the beat unit of the time signature x/2', () => {
            const timeSignature = new TimeSignature({ numerator: 1, denominator: 2 });
            const beatUnit = timeSignature.getBeatUnit();

            expect(beatUnit.name).toBe('HALF');
            expect(beatUnit.value).toBe(1 / 2);
        });

        it('should return the beat unit of the time signature x/8', () => {
            const timeSignature = new TimeSignature({ numerator: 7, denominator: 8 });
            const beatUnit = timeSignature.getBeatUnit();

            expect(beatUnit.name).toBe('EIGHTH');
            expect(beatUnit.value).toBe(1 / 8);
        });

        it('should return the beat unit of the time signature x/16', () => {
            const timeSignature = new TimeSignature({ numerator: 4, denominator: 16 });
            const beatUnit = timeSignature.getBeatUnit();

            expect(beatUnit.name).toBe('SIXTEENTH');
            expect(beatUnit.value).toBe(1 / 16);
        });
    });
});
