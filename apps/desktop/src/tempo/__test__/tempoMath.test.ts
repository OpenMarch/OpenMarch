import { describe, expect, it } from "vitest";
import {
    MAX_COUNT_SECONDS,
    moveBeatTo,
    moveLimits,
    movePinsWithMusic,
    rampLengths,
    regroupMeasures,
    retime,
    startsOf,
    tempoSegments,
} from "../tempoMath";

/** beat 0 plus n counts of `len` seconds */
const even = (n: number, len = 0.5) => [0, ...Array<number>(n).fill(len)];

describe("moveBeatTo", () => {
    it("stretches the counts before and slides the rest when nothing is locked after", () => {
        const r = moveBeatTo(even(8), new Set(), 5, 2.4)!;
        const s = startsOf(r.durations);
        expect(s[5]).toBeCloseTo(2.4);
        expect(s[3]).toBeCloseTo(1.2);
        expect(r.durations[6]).toBeCloseTo(0.5);
        expect(r.locks.has(5)).toBe(true);
    });
    it("keeps the next lock where it is", () => {
        const r = moveBeatTo(even(8), new Set([7]), 5, 2.4)!;
        const s = startsOf(r.durations);
        expect(s[7]).toBeCloseTo(3);
        expect(s[6]).toBeCloseTo(2.7);
    });
    it("refuses a move past 400 BPM", () => {
        expect(moveBeatTo(even(8), new Set([4]), 5, 1.55)).toBeNull();
    });
});

describe("retime", () => {
    it("absorbs a tempo change before the next lock", () => {
        const r = retime(even(8), new Set([8]), 1, 3, rampLengths(2, 100));
        expect(startsOf(r.durations)[8]).toBeCloseTo(3.5);
        expect(r.pin).toMatchObject({ at: 8, held: false, from: 3 });
    });
    it("scales the edit when the lock is right after it", () => {
        const r = retime(even(8), new Set([3]), 1, 3, rampLengths(2, 100));
        expect(startsOf(r.durations)[3]).toBeCloseTo(1);
        expect(r.pin).toMatchObject({ at: 3, held: true });
    });
    it("offers the same edit with the pin released", () => {
        const r = retime(even(8), new Set([3, 6]), 1, 3, rampLengths(2, 100));
        const free = r.pin!.free();
        expect([...free.locks]).toEqual([6]);
        expect(free.durations[1]).toBeCloseTo(0.6);
        expect(free.durations[2]).toBeCloseTo(0.6);
        // the next pin still holds: the counts up to it make room
        expect(startsOf(free.durations)[6]).toBeCloseTo(2.5);
        expect(free.pin).toMatchObject({ at: 6, held: false });
    });
    it("cancels an even slowdown that runs right up to a pin (owner's m. 5–8 case)", () => {
        const r = retime(even(40), new Set([33]), 17, 33, rampLengths(16, 80));
        r.durations.slice(17, 33).forEach((d) => expect(d).toBeCloseTo(0.5));
        expect(r.pin).toMatchObject({ at: 33, held: true });
        expect(startsOf(r.pin!.free().durations)[33]).toBeCloseTo(20); // 16 s + 16 counts × 0.25 s
    });
    it("says nothing when no pin had to make room", () => {
        expect(
            retime(even(8), new Set([8]), 1, 3, rampLengths(2, 120)).pin,
        ).toBeUndefined();
        expect(
            retime(even(8), new Set(), 1, 3, rampLengths(2, 60)).pin,
        ).toBeUndefined();
    });
    it("slides everything with no lock after", () => {
        const r = retime(even(8), new Set(), 1, 3, rampLengths(2, 60));
        expect(startsOf(r.durations)[8]).toBeCloseTo(4.5);
    });
    it("leaves fixed counts (holds) alone, in the edit and in the stretch to the lock", () => {
        const d = even(8);
        d[2] = 4; // a hold inside the edit
        d[5] = 3; // a hold between the edit and the lock
        const r = retime(d, new Set([8]), 1, 4, rampLengths(3, 100), {
            fixed: new Set([2, 5]),
        });
        expect(r.durations[2]).toBe(4);
        expect(r.durations[5]).toBe(3);
        expect(r.durations[1]).toBeCloseTo(0.6);
        expect(startsOf(r.durations)[8]).toBeCloseTo(startsOf(d)[8]!);
        expect(r.pin).toMatchObject({ at: 8, held: false });
    });
    it("fits the edit to a lock right after it without touching a hold in it", () => {
        const d = even(8);
        d[2] = 4;
        const r = retime(d, new Set([3]), 1, 3, rampLengths(2, 100), {
            fixed: new Set([2]),
        });
        expect(r.durations[2]).toBe(4);
        expect(startsOf(r.durations)[3]).toBeCloseTo(4.5);
        expect(r.pin).toMatchObject({ at: 3, held: true });
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

describe("movePinsWithMusic", () => {
    it("moves every pinned count earlier with the music, the counts before the first pin taking it up", () => {
        // pins at counts 5 and 9; the music moves 0.4 s earlier
        const d = movePinsWithMusic(even(12), new Set([5, 9]), 0.4)!;
        const s = startsOf(d);
        expect(s[1]).toBeCloseTo(0);
        expect(s[5]).toBeCloseTo(2 - 0.4);
        expect(s[9]).toBeCloseTo(4 - 0.4);
        expect(d[6]).toBeCloseTo(0.5);
    });

    it("does nothing without pins", () => {
        expect(movePinsWithMusic(even(8), new Set(), 0.4)).toBeNull();
    });
});

describe("holds while dragging a count", () => {
    it("moveBeatTo keeps a hold between the pin before and the dragged count", () => {
        const d = even(8);
        d[3] = 6; // a hold
        const r = moveBeatTo(d, new Set(), 5, 9, new Set([3]))!;
        expect(r.durations[3]).toBe(6);
        expect(startsOf(r.durations)[5]).toBeCloseTo(9);
        expect(r.durations[1]).toBeCloseTo(1);
        expect(r.durations[4]).toBeCloseTo(1);
    });
    it("moveBeatTo keeps a hold between the dragged count and the pin after", () => {
        const d = even(10);
        d[7] = 5; // a hold
        const r = moveBeatTo(d, new Set([9]), 5, 2.4, new Set([7]))!;
        expect(r.durations[7]).toBe(5);
        expect(startsOf(r.durations)[9]).toBeCloseTo(startsOf(d)[9]!);
        expect(startsOf(r.durations)[5]).toBeCloseTo(2.4);
    });
    it("a 12 s hold doesn't stop a count after it from staying where it is", () => {
        const d = even(8);
        d[3] = 12;
        const holds = new Set([3]);
        const now = startsOf(d)[5]!; // 13.5
        const r = moveBeatTo(d, new Set(), 5, now, holds);
        expect(r).not.toBeNull();
        expect(r!.durations).toEqual(d);
        const lim = moveLimits(d, new Set(), 5, holds);
        expect(lim.min).toBeLessThanOrEqual(now);
        expect(lim.max).toBeGreaterThanOrEqual(now);
        expect(lim.min).toBeCloseTo(12 + 3 * 0.15);
        expect(lim.max).toBeCloseTo(12 + 3 * MAX_COUNT_SECONDS);
    });
    it("moveLimits leaves a hold before the pin after out of the room", () => {
        const d = even(10);
        d[7] = 5;
        const lim = moveLimits(d, new Set([9]), 5, new Set([7]));
        // counts 5, 6 and 8 may each go down to 0.15 s: the hold keeps its 5 s
        expect(lim.max).toBeCloseTo(startsOf(d)[9]! - 5 - 3 * 0.15);
    });
});

describe("guards", () => {
    it("retime ignores a lock past the last count", () => {
        const r = retime(even(8), new Set([20]), 1, 3, rampLengths(2, 100));
        expect(r.durations.every((x) => Number.isFinite(x))).toBe(true);
        expect(r.pin).toBeUndefined();
        expect(r.durations[1]).toBeCloseTo(0.6);
    });
    it("regroupMeasures refuses measures of no counts instead of looping", () => {
        expect(() => regroupMeasures([1, 5], 9, 1, 0)).toThrow(RangeError);
    });
    it("retime doesn't squeeze one count of an uneven stretch past the limits to keep a pin", () => {
        // count 4 is near the 20 BPM limit; stretching the counts to the pin would push it past
        const d = even(8);
        d[4] = 2.9;
        const r = retime(d, new Set([6]), 1, 3, rampLengths(2, 150));
        r.durations
            .slice(1)
            .forEach((x) =>
                expect(x).toBeLessThanOrEqual(MAX_COUNT_SECONDS + 1e-9),
            );
        expect(startsOf(r.durations)[6]).toBeCloseTo(startsOf(d)[6]!);
        expect(r.pin).toMatchObject({ at: 6, held: true });
    });
});
