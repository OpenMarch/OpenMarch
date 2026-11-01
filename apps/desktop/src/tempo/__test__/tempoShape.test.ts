import { describe, expect, it } from "vitest";
import {
    changesFrom,
    curveAt,
    curveThrough,
    endTempo,
    rampMiddle,
    rampTempos,
    shapeOf,
    stretchesOf,
    temposOf,
} from "../tempoShape";

/** beat 0 unused, then the tempos */
const show = (...runs: number[][]) => [0, ...runs.flat()];

describe("curves", () => {
    it("0 is a straight ramp, and a ramp starts and ends on its tempos", () => {
        expect(rampTempos(5, 120, 80)).toEqual([120, 110, 100, 90, 80]);
        const curved = rampTempos(5, 120, 80, 1.5);
        expect(curved[0]).toBe(120);
        expect(curved[4]).toBe(80);
        // above 0 the change comes late
        expect(curved[2]).toBeGreaterThan(100);
        expect(rampTempos(5, 120, 80, -1.5)[2]).toBeLessThan(100);
    });

    it("the handle puts the ramp's middle under the pointer, snapping straight near halfway", () => {
        expect(curveThrough(0.53)).toBe(0);
        for (const u of [0.1, 0.3, 0.7, 0.9]) {
            const c = curveThrough(u);
            expect(curveAt(0.5, c)).toBeCloseTo(u, 6);
            expect(rampMiddle(100, 200, c)).toBeCloseTo(100 + 100 * u, 6);
        }
    });

    it("stays in range at the extremes", () => {
        expect(Number.isFinite(curveThrough(0))).toBe(true);
        expect(Number.isFinite(curveThrough(1))).toBe(true);
    });
});

describe("shapeOf", () => {
    it("reads a steady stretch", () => {
        expect(shapeOf([120, 120, 120])).toEqual({ kind: "steady", bpm: 120 });
        // the last bits of a length don't make it uneven
        expect(shapeOf([120, 120.000001, 119.99999])).toMatchObject({
            kind: "steady",
        });
    });

    it("reads back the ramp the lane wrote, straight or curved", () => {
        expect(shapeOf(rampTempos(8, 144, 120))).toEqual({
            kind: "ramp",
            from: 144,
            to: 120,
            curve: 0,
        });
        for (const curve of [-2.5, -0.7, 0.4, 1.8]) {
            const s = shapeOf(rampTempos(12, 100, 160, curve));
            expect(s.kind).toBe("ramp");
            if (s.kind === "ramp") expect(s.curve).toBeCloseTo(curve, 2);
        }
    });

    it("calls fitted wobble uneven", () => {
        expect(shapeOf([120, 121.3, 119.2, 120.8, 118.9])).toEqual({
            kind: "uneven",
        });
        // goes up then down: no ramp does that
        expect(shapeOf([100, 110, 120, 110])).toEqual({ kind: "uneven" });
        expect(shapeOf([100, 110])).toEqual({ kind: "uneven" });
    });
});

describe("stretchesOf", () => {
    it("splits at the changes, count 1 always starting one", () => {
        const bpms = show([120, 120, 120], rampTempos(4, 120, 90), [90, 90]);
        const s = stretchesOf(bpms, new Set([4, 8]), bpms.length);
        expect(s.map((x) => [x.from, x.to, x.shape.kind])).toEqual([
            [1, 4, "steady"],
            [4, 8, "ramp"],
            [8, 10, "steady"],
        ]);
    });

    it("ignores changes on count 1 or past the end", () => {
        const bpms = show([120, 120, 120]);
        expect(stretchesOf(bpms, new Set([1, 9]), bpms.length)).toEqual([
            { from: 1, to: 4, shape: { kind: "steady", bpm: 120 } },
        ]);
    });
});

describe("changesFrom", () => {
    it("finds where the tempo changes, not the wobble", () => {
        const bpms = show([120, 120.4, 119.8, 120.2], [96, 96.5, 95.9, 96.1]);
        expect([...changesFrom(bpms)]).toEqual([5]);
    });

    it("works on a range only", () => {
        const bpms = show([120, 120, 100, 100, 80, 80]);
        expect([...changesFrom(bpms, 3, 7)].sort()).toEqual([3, 5]);
    });
});

describe("temposOf", () => {
    it("fills a steady or ramp shape over a new length", () => {
        expect(temposOf({ kind: "steady", bpm: 100 }, 3, [], "end")).toEqual([
            100, 100, 100,
        ]);
        expect(
            temposOf(
                { kind: "ramp", from: 120, to: 60, curve: 0 },
                3,
                [],
                "end",
            ),
        ).toEqual([120, 90, 60]);
    });

    it("keeps an uneven stretch's own tempos, growing or shrinking at one end", () => {
        const own = [100, 103, 98];
        expect(temposOf({ kind: "uneven" }, 5, own, "end")).toEqual([
            100, 103, 98, 98, 98,
        ]);
        expect(temposOf({ kind: "uneven" }, 4, own, "start")).toEqual([
            100, 100, 103, 98,
        ]);
        expect(temposOf({ kind: "uneven" }, 2, own, "start")).toEqual([
            103, 98,
        ]);
    });

    it("endTempo is what carries on", () => {
        expect(endTempo({ kind: "steady", bpm: 90 }, [])).toBe(90);
        expect(endTempo({ kind: "ramp", from: 1, to: 2, curve: 0 }, [])).toBe(
            2,
        );
        expect(endTempo({ kind: "uneven" }, [1, 5, 3])).toBe(3);
    });
});
