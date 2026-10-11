import { describe, expect, it } from "vitest";
import { buildCountClock, countAt, msAtCount } from "../countClock";

// beat 0 has no duration (the first page's start), then 4 at 120 bpm and 2 at 60
const beats = [
    { timestamp: 0, duration: 0 },
    { timestamp: 0, duration: 0.5 },
    { timestamp: 0.5, duration: 0.5 },
    { timestamp: 1, duration: 0.5 },
    { timestamp: 1.5, duration: 0.5 },
    { timestamp: 2, duration: 1 },
    { timestamp: 3, duration: 1 },
];
const clock = buildCountClock(beats);

describe("count clock", () => {
    it("has one count per beat with a duration, and its tempo", () => {
        expect(clock.counts).toBe(6);
        expect([...clock.bpm]).toEqual([120, 120, 120, 120, 60, 60]);
        expect([...clock.boundariesMs]).toEqual([
            0, 500, 1000, 1500, 2000, 3000, 4000,
        ]);
    });

    it("counts beats at each beat's own tempo", () => {
        expect(countAt(clock, 0)).toBe(0);
        expect(countAt(clock, 250)).toBeCloseTo(0.5, 12);
        expect(countAt(clock, 1750)).toBeCloseTo(3.5, 12);
        expect(countAt(clock, 2500)).toBeCloseTo(4.5, 12); // a 60 bpm beat: half of it
        expect(countAt(clock, 3999)).toBeCloseTo(5.999, 12);
    });

    it("clamps before the start and after the end", () => {
        expect(countAt(clock, -100)).toBe(0);
        expect(countAt(clock, 9999)).toBe(6);
        expect(countAt(clock, Number.NaN)).toBe(0);
    });

    it("gives the same answer with any hint", () => {
        for (const hint of [0, 2, 5, 99, -3])
            expect(countAt(clock, 2500, hint)).toBeCloseTo(4.5, 12);
    });
});

describe("show time at a count", () => {
    it("inverts countAt across tempos", () => {
        for (const c of [0, 0.5, 2.25, 4.5, 5.999])
            expect(countAt(clock, msAtCount(clock, c))).toBeCloseTo(c, 9);
        expect(msAtCount(clock, 4.5)).toBeCloseTo(2500, 9);
    });

    it("clamps to the show's start and end", () => {
        expect(msAtCount(clock, -1)).toBe(0);
        expect(msAtCount(clock, 99)).toBe(4000);
    });
});
