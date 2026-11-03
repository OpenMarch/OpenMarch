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
import { readMeters } from "../meters";
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

/** Stored measures from starts and written time signatures ("" for none) */
const stored = (spec: [number, string][]) =>
    spec.map(([start, text]) => {
        const m = text ? parse(text)! : null;
        return {
            start,
            meter: m ? `${m.top}/${m.bottom}` : null,
            grouping: m ? m.grouping.join("+") : null,
        };
    });
/** A plan's measures back as stored measures */
const asStored = (plan: ReturnType<typeof planMeter>) =>
    plan.measures.map((m) => ({
        start: m.start,
        meter: m.meter ? `${m.meter.top}/${m.meter.bottom}` : null,
        grouping: m.meter ? m.meter.grouping.join("+") : null,
    }));
/** "start:meter" for each measure, "-" where none is written */
const show = (ms: { start: number; meter: string | null }[]) =>
    ms.map((m) => `${m.start}:${m.meter ?? "-"}`).join(" ");

describe("readMeters", () => {
    it("carries a written time signature on to the next one", () => {
        const read = readMeters([
            { counts: 4, meter: "4/4" },
            { counts: 4 },
            { counts: 3, meter: "3/4" },
            { counts: 3 },
            { counts: 2 },
            { counts: 3, meter: "3/4" },
        ]);
        expect(read.map((r) => r.written)).toEqual([
            true,
            false,
            true,
            false,
            false,
            true,
        ]);
        expect(read.map((r) => r.meter.top)).toEqual([4, 4, 3, 3, 3, 3]);
        expect(read.map((r) => r.short)).toEqual([
            false,
            false,
            false,
            false,
            true,
            false,
        ]);
    });
    it("reads older shows (nothing stored) from measure lengths", () => {
        const read = readMeters([
            { counts: 4 },
            { counts: 4 },
            { counts: 2 },
            { counts: 4 },
        ]);
        expect(read.map((r) => r.written)).toEqual([true, false, true, true]);
        expect(read.map((r) => r.meter.top)).toEqual([4, 4, 2, 4]);
    });
    it("gives each count of a grouping its eighths", () => {
        expect(
            readMeters([{ counts: 3, meter: "7/8", grouping: "2+2+3" }])[0]!
                .units,
        ).toEqual([2, 2, 3]);
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
            measures: stored([
                [1, "4/4"],
                [5, ""],
                [9, ""],
                [13, ""],
                [17, ""],
            ]),
            beatCount: durations.length,
            start: 9,
            meter: parse("2/4")!,
        });
        expect(show(asStored(plan))).toBe(
            "1:4/4 5:- 9:2/4 11:- 13:- 15:- 17:- 19:-",
        );
        expect(plan.result.durations).toEqual(durations);
    });
    it("a longer count keeps its own tempo inside a rit.", () => {
        const durations = [0, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75];
        const plan = planMeter({
            durations,
            measures: stored([
                [1, "3/4"],
                [4, ""],
            ]),
            beatCount: durations.length,
            start: 1,
            meter: parse("7/8 2+2+3")!,
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
    it("7/8 2+2+3 on a 3/4 section stops at the next time signature", () => {
        // 4/4 (1, 5), 3/4 (9, 12), 4/4 again at 15
        const durations = [0, ...Array<number>(18).fill(0.5)];
        const plan = planMeter({
            durations,
            measures: stored([
                [1, "4/4"],
                [5, ""],
                [9, "3/4"],
                [12, ""],
                [15, "4/4"],
            ]),
            beatCount: 19,
            start: 9,
            meter: parse("7/8 2+2+3")!,
        });
        expect(show(asStored(plan))).toBe("1:4/4 5:- 9:7/8 12:- 15:4/4");
        const d = plan.result.durations.slice(9, 15);
        expect(d[2]! / d[0]!).toBeCloseTo(1.5);
    });
});

describe("planMeter: written time signatures (owner, 2026-11-02)", () => {
    // 4/4 bars from 1 to 20, a 3/4 section from 21, 4/4 again from 33; 44 counts stored
    const durations = [0, ...Array<number>(44).fill(0.5)];
    const start = stored([
        [1, "4/4"],
        [5, ""],
        [9, ""],
        [13, ""],
        [17, ""],
        [21, "3/4"],
        [24, ""],
        [27, ""],
        [30, ""],
        [33, "4/4"],
        [37, ""],
        [41, ""],
    ]);
    const set = (
        measures: ReturnType<typeof stored>,
        at: number,
        text: string,
        only = false,
        lengths: readonly number[] = durations,
    ) =>
        planMeter({
            durations: lengths,
            measures,
            beatCount: 45,
            start: at,
            meter: parse(text)!,
            only,
        });

    it("until the next written one: the 3/4 section after it never moves", () => {
        const plan = set(start, 9, "3/4");
        // 12 counts of 3/4 run straight into the written 3/4: two sections, both kept
        expect(show(asStored(plan))).toBe(
            "1:4/4 5:- 9:3/4 12:- 15:- 18:- 21:3/4 24:- 27:- 30:- 33:4/4 37:- 41:-",
        );
        expect(plan.short).toBeNull();
        expect(plan.shift).toBe(0);
    });

    it("counts that don't divide leave the last measure before it short", () => {
        const plan = set(start, 13, "3/4");
        expect(show(asStored(plan))).toBe(
            "1:4/4 5:- 9:- 13:3/4 16:- 19:- 21:3/4 24:- 27:- 30:- 33:4/4 37:- 41:-",
        );
        expect(plan.short).toEqual({ start: 19, counts: 2 });
    });

    it("just this measure moves every measure after it, written ones too", () => {
        const plan = set(start, 9, "2/4", true);
        expect(show(asStored(plan))).toBe(
            "1:4/4 5:- 9:2/4 11:4/4 15:- 19:3/4 22:- 25:- 28:- 31:4/4 35:- 39:- 43:-",
        );
        expect(plan.shift).toBe(-2);
        expect(plan.short).toBeNull();
    });

    // any time signature, at any measure, then the old one back at that measure: exactly as before
    const cases: [number, string, boolean][] = [];
    for (const at of [1, 9, 17, 21, 27, 33])
        for (const text of ["2/4", "3/4", "5/4", "6/8", "7/8 2+2+3", "4/4"])
            for (const only of [false, true]) cases.push([at, text, only]);
    it.each(cases)(
        "at %i, %s (just this measure: %s), then back",
        (at, text, only) => {
            const read = readMeters(
                start.map((m, i) => ({
                    ...m,
                    counts: (start[i + 1]?.start ?? 45) - m.start,
                })),
            );
            const old = read[start.findIndex((m) => m.start === at)]!.meter;
            const oldText = `${old.top}/${old.bottom} ${old.grouping.join("+")}`;
            const there = set(start, at, text, only);
            const back = set(
                asStored(there),
                at,
                oldText,
                only,
                there.result.durations,
            );
            expect(show(asStored(back))).toBe(show(start));
            expect(back.result.durations.map((d) => +d.toFixed(9))).toEqual(
                durations,
            );
        },
    );

    // two changes, then each put back in turn: the show after each step back is the one before
    const nested: [number, string, boolean, number, string, boolean][] = [];
    for (const [a, ta] of [
        [9, "3/4"],
        [17, "2/4"],
        [21, "5/4"],
    ] as const)
        for (const [b, tb] of [
            [1, "6/8"],
            [13, "2/4"],
            [33, "3/4"],
        ] as const)
            for (const oa of [false, true])
                for (const ob of [false, true])
                    nested.push([a, ta, oa, b, tb, ob]);
    it.each(nested)(
        "%i to %s (only: %s), then %i to %s (only: %s), then each back",
        (a, ta, oa, b, tb, ob) => {
            const backText = (ms: ReturnType<typeof stored>, at: number) => {
                const read = readMeters(
                    ms.map((m, i) => ({
                        ...m,
                        counts: (ms[i + 1]?.start ?? 45) - m.start,
                    })),
                );
                const i = ms.findIndex((m) => m.start === at);
                if (i < 0) return null;
                const o = read[i]!.meter;
                return `${o.top}/${o.bottom} ${o.grouping.join("+")}`;
            };
            const oldA = backText(start, a)!;
            const one = set(start, a, ta, oa);
            const s1 = asStored(one);
            const oldB = backText(s1, b);
            if (oldB === null) return; // b isn't a measure start any more
            const two = set(s1, b, tb, ob, one.result.durations);
            const backB = set(asStored(two), b, oldB, ob, two.result.durations);
            expect(show(asStored(backB))).toBe(show(s1));
            const backA = set(
                asStored(backB),
                a,
                oldA,
                oa,
                backB.result.durations,
            );
            expect(show(asStored(backA))).toBe(show(start));
            expect(backA.result.durations.map((d) => +d.toFixed(9))).toEqual(
                durations,
            );
        },
    );

    it("older shows get their time signatures written in", () => {
        const plan = planMeter({
            durations: durations.slice(0, 19),
            measures: stored([
                [1, ""],
                [5, ""],
                [9, ""],
                [11, ""],
                [15, ""],
            ]),
            beatCount: 19,
            start: 1,
            meter: parse("2/4")!,
        });
        // 4/4 4/4 then 2/4 then 4/4: the 2/4 and the 4/4 after it are written now, and stay
        expect(show(asStored(plan))).toBe(
            "1:2/4 3:- 5:- 7:- 9:2/4 11:4/4 15:-",
        );
    });
});

describe("parseMeter edge cases", () => {
    it("reads 1/8 as one count of one eighth", () => {
        expect(parseMeter("1/8")).toEqual({ top: 1, bottom: 8, grouping: [1] });
        expect(defaultGrouping(1, 8)).toEqual([1]);
    });
    it("refuses odd sixteenths cleanly (not yet supported)", () => {
        for (const text of ["5/16", "7/16", "3/16", "1/16"])
            expect(parseMeter(text)).toBeNull();
        expect(parseMeter("6/16")?.grouping).toEqual([1, 1, 1]);
    });
});

describe("planMeter: holds, exactness and errors", () => {
    /** 4/4 measures from 1, `n` counts of `len` */
    const fourFour = (n: number) =>
        stored(
            Array.from({ length: Math.ceil(n / 4) }, (_, i) => [
                1 + i * 4,
                i === 0 ? "4/4" : "",
            ]),
        );
    const round = (d: readonly number[]) => d.map((x) => +x.toFixed(9));

    it("7/8 from count 9, and 4/4 back restores all", () => {
        const durations = [0, ...Array<number>(24).fill(0.5)];
        const measures = fourFour(24);
        const there = planMeter({
            durations,
            measures,
            beatCount: 25,
            start: 9,
            meter: parse("7/8 2+2+3")!,
        });
        // the 3 of 2+2+3 is still half as long again as the 2s around it
        const d = there.result.durations;
        expect(d[11]! / d[10]!).toBeCloseTo(1.5);
        const back = planMeter({
            durations: there.result.durations,
            measures: asStored(there),
            beatCount: 25,
            start: 9,
            meter: parse("4/4")!,
        });
        expect(show(asStored(back))).toBe(show(measures));
        expect(round(back.result.durations)).toEqual(round(durations));
    });

    it("a 2/4 bar (just this one) before a 6/8 section, and 4/4 back restores all", () => {
        // 4/4 (1, 5), 6/8 at ♩=80 (9, 11, 13, 15), 4/4 again from 17 to 36
        const durations = [
            0,
            ...Array<number>(8).fill(0.5),
            ...Array<number>(8).fill(1.125),
            ...Array<number>(20).fill(0.5),
        ];
        const measures = stored([
            [1, "4/4"],
            [5, ""],
            [9, "6/8"],
            [11, ""],
            [13, ""],
            [15, ""],
            [17, "4/4"],
            [21, ""],
            [25, ""],
            [29, ""],
            [33, ""],
        ]);
        const there = planMeter({
            durations,
            measures,
            beatCount: 37,
            start: 1,
            meter: parse("2/4")!,
            only: true,
        });
        const back = planMeter({
            durations: there.result.durations,
            measures: asStored(there),
            beatCount: 37,
            start: 1,
            meter: parse("4/4")!,
            only: true,
        });
        expect(show(asStored(back))).toBe(show(measures));
        expect(round(back.result.durations)).toEqual(round(durations));
    });

    it("a hold inside the change keeps its length", () => {
        const durations = [0, ...Array<number>(24).fill(0.5)];
        durations[10] = 4;
        const there = planMeter({
            durations,
            holds: new Set([10]),
            measures: fourFour(24),
            beatCount: 25,
            start: 9,
            meter: parse("7/8 2+2+3")!,
        });
        expect(there.result.durations[10]).toBe(4);
    });

    it("leaves a long count it doesn't change exactly as it is (no clamping)", () => {
        // 4/4 bars, 3/4 from 21: 7/8 from count 1 to 20. Count 4 (a 2 in 7/8) is a 4.5 s
        // fermata that was never flagged, count 7 a 0.1 s flam
        const durations = [0, ...Array<number>(28).fill(0.5)];
        durations[4] = 4.5;
        durations[7] = 0.1;
        const measures = stored([
            [1, "4/4"],
            [5, ""],
            [9, ""],
            [13, ""],
            [17, ""],
            [21, "3/4"],
            [24, ""],
            [27, ""],
        ]);
        const there = planMeter({
            durations,
            measures,
            beatCount: 29,
            start: 1,
            meter: parse("7/8 2+2+3")!,
        });
        expect(there.result.durations[4]).toBe(4.5);
        expect(there.result.durations[7]).toBe(0.1);
        const back = planMeter({
            durations: there.result.durations,
            measures: asStored(there),
            beatCount: 29,
            start: 1,
            meter: parse("4/4")!,
        });
        expect(round(back.result.durations)).toEqual(round(durations));
    });

    it("4/4 to 6/8 and back at ♩=25 is exact", () => {
        const durations = [0, ...Array<number>(16).fill(2.4)];
        const measures = fourFour(16);
        const there = planMeter({
            durations,
            measures,
            beatCount: 17,
            start: 9,
            meter: parse("6/8")!,
        });
        // a 3-eighth count at ♩=25 is 3.6 s: longer than a 20 BPM count, and right
        expect(there.result.durations[9]).toBeCloseTo(3.6);
        const back = planMeter({
            durations: there.result.durations,
            measures: asStored(there),
            beatCount: 17,
            start: 9,
            meter: parse("4/4")!,
        });
        expect(round(back.result.durations)).toEqual(round(durations));
        expect(startsOf(back.result.durations)[17]).toBeCloseTo(38.4);
    });

    it("refuses a start that isn't a measure start with a clear error", () => {
        expect(() =>
            planMeter({
                durations: [0, ...Array<number>(8).fill(0.5)],
                measures: fourFour(8),
                beatCount: 9,
                start: 3,
                meter: parse("3/4")!,
            }),
        ).toThrow(/measure/);
    });
});

describe("planMeter: any time signature set and set back", () => {
    // the written fixture: 4/4 1–20, 3/4 21–32, 4/4 33–44
    const durations = [0, ...Array<number>(44).fill(0.5)];
    const start = stored([
        [1, "4/4"],
        [5, ""],
        [9, ""],
        [13, ""],
        [17, ""],
        [21, "3/4"],
        [24, ""],
        [27, ""],
        [30, ""],
        [33, "4/4"],
        [37, ""],
        [41, ""],
    ]);
    const oldText = (at: number) => {
        const read = readMeters(
            start.map((m, i) => ({
                ...m,
                counts: (start[i + 1]?.start ?? 45) - m.start,
            })),
        );
        const o = read[start.findIndex((m) => m.start === at)]!.meter;
        return `${o.top}/${o.bottom} ${o.grouping.join("+")}`;
    };
    const cases: [number, string, boolean][] = [];
    for (const at of [1, 9, 21, 33])
        for (const text of ["2/4", "6/8", "7/8 2+2+3", "5/4"])
            for (const only of [false, true]) cases.push([at, text, only]);
    it.each(cases)("at %i, %s (only: %s): back is exact", (at, text, only) => {
        const there = planMeter({
            durations,
            measures: start,
            beatCount: 45,
            start: at,
            meter: parse(text)!,
            only,
        });
        const back = planMeter({
            durations: there.result.durations,
            measures: asStored(there),
            beatCount: 45,
            start: at,
            meter: parse(oldText(at))!,
            only,
        });
        expect(show(asStored(back))).toBe(show(start));
        expect(back.result.durations.map((d) => +d.toFixed(9))).toEqual(
            durations,
        );
    });
});
