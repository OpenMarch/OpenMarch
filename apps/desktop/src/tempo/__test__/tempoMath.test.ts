import { describe, expect, it } from "vitest";
import {
    keepInPlaceLengths,
    MAX_COUNT_SECONDS,
    MIN_COUNT_SECONDS,
    newCountLength,
    rampLengths,
    regroupMeasures,
    retime,
    startsOf,
    tempoSegments,
} from "../tempoMath";

/** beat 0 plus n counts of `len` seconds */
const even = (n: number, len = 0.5) => [0, ...Array<number>(n).fill(len)];

describe("retime", () => {
    it("re-times the edited counts and slides everything after", () => {
        const r = retime(even(8), 1, 3, rampLengths(2, 60));
        expect(r.durations[1]).toBeCloseTo(1);
        expect(r.durations[2]).toBeCloseTo(1);
        expect(r.durations[3]).toBeCloseTo(0.5);
        expect(startsOf(r.durations)[8]).toBeCloseTo(4.5);
    });
    it("leaves fixed counts (holds) in the edit alone", () => {
        const d = even(8);
        d[2] = 4; // a hold inside the edit
        const r = retime(d, 1, 4, rampLengths(3, 100), {
            fixed: new Set([2]),
        });
        expect(r.durations[2]).toBe(4);
        expect(r.durations[1]).toBeCloseTo(0.6);
        expect(r.durations[3]).toBeCloseTo(0.6);
    });
    it("keeps counts between 400 and 20 BPM, but lets a hold be any length", () => {
        const r = retime(even(4), 1, 3, [0.01, 10]);
        expect(r.durations[1]).toBeCloseTo(MIN_COUNT_SECONDS);
        expect(r.durations[2]).toBeCloseTo(MAX_COUNT_SECONDS);
        expect(retime(even(4), 2, 3, [12], { hold: true }).durations[2]).toBe(
            12,
        );
    });
});

describe("tempoSegments", () => {
    it("finds steady runs and ramps", () => {
        const d = [
            0,
            ...rampLengths(8, 120),
            ...rampLengths(8, 120, 80),
            ...rampLengths(8, 80),
        ];
        const segs = tempoSegments(d);
        expect(segs[0]).toMatchObject({ from: 1, to: 10, ramp: false });
        expect(segs.some((s) => s.ramp)).toBe(true);
        expect(segs[segs.length - 1]!.to).toBe(25);
    });
});

describe("regroupMeasures", () => {
    it("regroups a run of 4-count measures into 3s", () => {
        const r = regroupMeasures([1, 5, 9, 13, 17, 19], 21, 5, 3);
        expect(r).toEqual({
            from: 5,
            to: 17,
            starts: [5, 8, 11, 14],
            leftover: 0,
        });
    });
});

describe("guards", () => {
    it("regroupMeasures refuses measures of no counts instead of looping", () => {
        expect(() => regroupMeasures([1, 5], 9, 1, 0)).toThrow(RangeError);
    });
});

describe("newCountLength", () => {
    // counts 1–4 at 0.5 s, count 3 a 2 s hold
    const durations = [0, 0.5, 0.5, 2, 0.5];
    it("is the count before's length", () => {
        expect(newCountLength(durations, new Set(), 3)).toBe(0.5);
    });
    it("skips a hold before it: a fermata isn't the tempo", () => {
        expect(newCountLength(durations, new Set([3]), 4)).toBe(0.5);
        expect(newCountLength([0, 0.6, 2], new Set([2]), 3)).toBe(0.6);
    });
    it("looks after it when every count before is a hold", () => {
        expect(newCountLength([0, 2, 0.4], new Set([1]), 2)).toBe(0.4);
    });
});

describe("keepInPlaceLengths", () => {
    it("fills the measure's seconds with one more count", () => {
        const r = keepInPlaceLengths(
            [0, 0.5, 0.5, 0.5, 0.5],
            new Set(),
            { a: 1, e: 5 },
            { kind: "insert", at: 3, count: 1, len: 0.5 },
        );
        expect(r.from).toBe(1);
        expect(r.lengths).toHaveLength(5);
        expect(r.lengths.reduce((a, b) => a + b, 0)).toBeCloseTo(2);
    });
    it("keeps a hold's seconds; the other counts make up the time", () => {
        const r = keepInPlaceLengths(
            [0, 0.5, 2, 0.5, 0.5],
            new Set([2]),
            { a: 1, e: 5 },
            { kind: "delete", from: 4, to: 5 },
        );
        expect(r.lengths).toHaveLength(3);
        expect(r.lengths[1]).toBe(2);
        expect(r.lengths.reduce((a, b) => a + b, 0)).toBeCloseTo(3.5);
        expect(r.lengths[0]).toBeCloseTo(0.75);
    });
    it("puts added counts at the end of the measure when added after its last count", () => {
        const r = keepInPlaceLengths(
            [0, 0.5, 0.5],
            new Set(),
            { a: 1, e: 3 },
            { kind: "insert", at: 3, count: 1, len: 0.5 },
        );
        expect(r.lengths).toHaveLength(3);
        expect(r.lengths.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    });
});
