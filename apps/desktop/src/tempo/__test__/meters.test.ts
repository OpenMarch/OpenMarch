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
        expect(plan.starts).toEqual([9, 11, 13, 15, 17, 19]);
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
        expect(plan.from).toBe(9);
        expect(plan.to).toBe(15);
        expect(plan.starts).toEqual([9, 12]);
        // 2, 2, 3 eighths at ♩=120: 0.5, 0.5, 0.75 — but pin 15 is held, so the stretch is scaled to fit
        const d = plan.result.durations.slice(9, 15);
        expect(d[2]! / d[0]!).toBeCloseTo(1.5);
        expect(startsOf(plan.result.durations)[15]).toBeCloseTo(
            startsOf(durations)[15]!,
        );
    });
});
