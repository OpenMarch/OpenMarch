import { describe, expect, it } from "vitest";
import {
    countSeconds,
    defaultGrouping,
    meterLabel,
    meterOfMeasure,
    parseMeter,
    quarterBpmOf,
} from "../meters";

import { planMeter } from "../meterPlan";
import { parseMeter as parse } from "../meters";
import { startsOf } from "../tempoMath";

describe("meters", () => {
    it("counts the usual meters the usual way", () => {
        expect(defaultGrouping(4, 4)).toEqual([2, 2, 2, 2]);
        expect(defaultGrouping(6, 8)).toEqual([3, 3]);
        expect(defaultGrouping(12, 8)).toEqual([3, 3, 3, 3]);
        expect(defaultGrouping(7, 8)).toEqual([2, 2, 3]);
        expect(defaultGrouping(5, 8)).toEqual([2, 3]);
        expect(defaultGrouping(3, 2)).toEqual([2, 2, 2, 2, 2, 2]);
        expect(defaultGrouping(3, 8)).toEqual([3]);
    });
    it("reads meters with groupings and refuses ones that don't add up", () => {
        expect(parseMeter("7/8 2+2+3")).toEqual({
            top: 7,
            bottom: 8,
            grouping: [2, 2, 3],
        });
        expect(parseMeter("5/8 (3+2)")).toEqual({
            top: 5,
            bottom: 8,
            grouping: [3, 2],
        });
        expect(parseMeter("3/2")?.grouping.length).toBe(6);
        expect(parseMeter("7/8 2+2+2")).toBeNull();
        expect(parseMeter("7/7")).toBeNull();
        expect(parseMeter("fast")).toBeNull();
    });
    it("labels and reads stored measures", () => {
        expect(meterLabel(parseMeter("7/8 3+2+2")!, true)).toBe("7/8 (3+2+2)");
        expect(meterLabel(parseMeter("7/8")!, true)).toBe("7/8");
        expect(
            meterOfMeasure({ meter: "7/8", grouping: "2+2+3", counts: 3 })
                .grouping,
        ).toEqual([2, 2, 3]);
        // a stored meter that no longer matches the counts falls back to n/4
        expect(
            meterOfMeasure({ meter: "7/8", grouping: "2+2+3", counts: 4 }),
        ).toEqual({ top: 4, bottom: 4, grouping: [2, 2, 2, 2] });
    });
    it("keeps the quarter-note tempo across uneven counts", () => {
        const long = countSeconds(3, 176);
        expect(countSeconds(2, 176)).toBeCloseTo(60 / 176);
        expect(long).toBeCloseTo(1.5 * (60 / 176));
        expect(quarterBpmOf(long, 3)).toBeCloseTo(176);
    });
});

describe("planMeter", () => {
    it("keeps every count's tempo: a rit. and an a tempo survive 4/4 to 2/4", () => {
        // 4/4 at 120, a rit. to 90 over m. 2 and 3, a tempo at m. 4 (counts 13–16)
        const bpm = [
            0,
            ...Array<number>(4).fill(120),
            ...Array.from({ length: 8 }, (_, i) => 120 - (30 * i) / 7),
            ...Array<number>(8).fill(120),
        ];
        const durations = bpm.map((b) => (b ? 60 / b : 0));
        const plan = planMeter({
            durations,
            locks: new Set(),
            measureStarts: [1, 5, 9, 13, 17],
            beatCount: durations.length,
            start: 9,
            meter: parse("2/4")!,
            units: [],
        });
        expect(plan.steps[0]!.starts).toEqual([9, 11, 13, 15, 17, 19]);
        expect(plan.result.durations).toEqual(durations);
    });
    it("a longer count keeps its own tempo inside a rit.", () => {
        const durations = [0, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75];
        const plan = planMeter({
            durations,
            locks: new Set(),
            measureStarts: [1, 4],
            beatCount: durations.length,
            start: 1,
            meter: parse("7/8 2+2+3")!,
            units: [],
        });
        expect(plan.result.durations.slice(1)).toEqual([
            0.5,
            0.55,
            0.6 * 1.5,
            0.65,
            0.7,
            0.75 * 1.5,
        ]);
    });
    it("regroups a run of 3-count measures as 7/8 2+2+3 at the same quarter tempo, keeping the next pin", () => {
        // beat 0, 8 counts of 4/4 at 120 (measures at 1, 5), 6 counts in 3s (measures at 9, 12), 4 more (15)
        const durations = [0, ...Array<number>(18).fill(0.5)];
        const plan = planMeter({
            durations,
            locks: new Set([15]),
            measureStarts: [1, 5, 9, 12, 15],
            beatCount: 19,
            start: 9,
            meter: parse("7/8 2+2+3")!,
            units: [],
        });
        expect(plan.steps).toMatchObject([
            { from: 9, to: 15, starts: [9, 12] },
        ]);
        expect(plan.shift).toBeNull();
        // 2, 2, 3 eighths at ♩=120: 0.5, 0.5, 0.75 — but pin 15 is held, so the stretch is scaled to fit
        const d = plan.result.durations.slice(9, 15);
        expect(d[2]! / d[0]!).toBeCloseTo(1.5);
        expect(startsOf(plan.result.durations)[15]).toBeCloseTo(
            startsOf(durations)[15]!,
        );
    });
});

describe("planMeter, just this measure", () => {
    // 8 bars of 4/4 (counts 1–32), then 3/4 bars from 33 to 41
    const durations = [0, ...Array<number>(41).fill(0.5)];
    const measureStarts = [1, 5, 9, 13, 17, 21, 25, 29, 33, 36, 39];
    const base = {
        durations,
        locks: new Set<number>(),
        measureStarts,
        beatCount: durations.length,
        units: [],
    };
    const four = parse("4/4")!;

    it("one 2/4 bar: the measures after keep their meters and start 2 counts earlier", () => {
        const plan = planMeter({
            ...base,
            start: 1,
            meter: parse("2/4")!,
            only: { old: four },
        });
        expect(plan.steps).toMatchObject([{ from: 1, to: 5, starts: [1] }]);
        expect(plan.shift).toEqual({ from: 5, by: -2 });
        expect(plan.result.durations).toEqual(durations);
    });

    it("keeps pins where nothing changes length", () => {
        const plan = planMeter({
            ...base,
            locks: new Set([7, 11]),
            start: 5,
            meter: parse("2/4")!,
            only: { old: four },
        });
        expect([...plan.result.locks].sort((a, b) => a - b)).toEqual([7, 11]);
    });

    it("one 5/4 bar moves the measures after 1 count later", () => {
        const plan = planMeter({
            ...base,
            start: 29,
            meter: parse("5/4")!,
            only: { old: four },
        });
        expect(plan.shift).toEqual({ from: 33, by: 1 });
    });

    it("the last stored measure: what's left of it is the old meter again", () => {
        const plan = planMeter({
            ...base,
            measureStarts: [1, 5],
            beatCount: 9,
            durations: durations.slice(0, 9),
            start: 5,
            meter: parse("2/4")!,
            only: { old: four },
        });
        expect(plan.shift).toBeNull();
        expect(plan.steps).toMatchObject([
            { from: 5, to: 9, starts: [5] },
            { from: 7, to: 9, starts: [7], meter: four },
        ]);
    });
});

describe("planMeter leaves no short measure before the next change (owner, 2026-11-02)", () => {
    // 8 bars of 4/4 (counts 1–32), then 3/4 bars from 33 to 41
    const durations = [0, ...Array<number>(41).fill(0.5)];
    const base = {
        durations,
        locks: new Set<number>(),
        beatCount: durations.length,
        units: [],
    };

    it("2/4 to the next change, then 4/4 from the measure after, is one 2/4 bar", () => {
        const first = planMeter({
            ...base,
            measureStarts: [1, 5, 9, 13, 17, 21, 25, 29, 33, 36, 39],
            start: 1,
            meter: parse("2/4")!,
        });
        expect(first.shift).toBeNull();
        const twos = first.steps[0]!.starts;
        expect(twos).toEqual([
            1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31,
        ]);
        const second = planMeter({
            ...base,
            measureStarts: [...twos, 33, 36, 39],
            start: 3,
            meter: parse("4/4")!,
        });
        // 30 counts: seven bars of 4/4 and 2 left over, which the 3/4 bars start with
        expect(second.steps[0]!.starts).toEqual([3, 7, 11, 15, 19, 23, 27]);
        expect(second.shift).toEqual({ from: 33, by: -2 });
        const only = planMeter({
            ...base,
            measureStarts: [1, 5, 9, 13, 17, 21, 25, 29, 33, 36, 39],
            start: 1,
            meter: parse("2/4")!,
            only: { old: parse("4/4")! },
        });
        // the same downbeats: 1, 3, 7 … 27, then the 3/4 bars from 31
        expect(only.shift).toEqual({ from: 5, by: -2 });
    });

    it("a lone 2-count measure set to 4/4 takes 2 counts from after it", () => {
        const plan = planMeter({
            ...base,
            measureStarts: [1, 5, 9, 11, 15],
            start: 9,
            meter: parse("4/4")!,
        });
        expect(plan.steps[0]!.starts).toEqual([9]);
        expect(plan.shift).toEqual({ from: 11, by: 2 });
    });

    it("a run that fills whole measures moves nothing", () => {
        const plan = planMeter({
            ...base,
            measureStarts: [1, 5, 9, 13, 17, 21, 25, 29, 33, 36, 39],
            start: 1,
            meter: parse("2/4")!,
        });
        expect(plan.shift).toBeNull();
    });

    it("the show's last measures may end short", () => {
        // ten bars of 4/4 to the end of the stored counts
        const plan = planMeter({
            ...base,
            durations: durations.slice(0, 41),
            beatCount: 41,
            measureStarts: [1, 5, 9, 13, 17, 21, 25, 29, 33, 37],
            start: 1,
            meter: parse("3/4")!,
        });
        expect(plan.shift).toBeNull();
        expect(plan.steps[0]!.starts).toEqual([
            1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40,
        ]);
    });
});

describe("planMeter keeps pins", () => {
    it("4/4 to 2/4 lets go of no pin", () => {
        const durations = [0, ...Array<number>(16).fill(0.5)];
        const plan = planMeter({
            durations,
            locks: new Set([7, 11]),
            measureStarts: [1, 5, 9, 13],
            beatCount: durations.length,
            start: 5,
            meter: parse("2/4")!,
            units: [],
        });
        expect([...plan.result.locks].sort((a, b) => a - b)).toEqual([7, 11]);
    });
});
