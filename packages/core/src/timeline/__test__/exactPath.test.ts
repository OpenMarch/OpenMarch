/**
 * Exact paths, the format (spec Appendix M, ADR 0018): QA-EP-1 to QA-EP-5 and QA-EP-3b to 3d.
 */
import { describe, expect, it } from "vitest";
import {
    checkExactPath,
    exactPieceCount,
    exactPlayer,
    exactPointAt,
    followExactEnds,
    measureCubic,
    retimeExactPath,
    splitExactPath,
    type ExactPath,
} from "../exactPath";
import type { XY } from "../types";

const d2 = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** A cubic's length by many chords, as an independent check. */
function chordLength(p0: XY, c1: XY, c2: XY, p3: XY, n = 1_000_000): number {
    const m = measureCubic(p0, c1, c2, p3);
    let total = 0;
    let prev = p0;
    for (let i = 1; i <= n; i++) {
        const p = m.point(i / n);
        total += d2(prev, p);
        prev = p;
    }
    return total;
}

const corner: ExactPath = {
    v: 1,
    from: [0, 0],
    shapes: [
        {
            kind: "points",
            points: [
                [12, 0],
                [12, 12],
            ],
        },
    ],
    keys: [
        { tick: 0, u: 0 },
        { tick: 2880, u: 1 },
        { tick: 3840, u: 2 },
    ],
};

describe("exact paths (Appendix M)", () => {
    it("QA-EP-1: lengths of each shape, and the shape ends", () => {
        const quarter = (Math.SQRT2 - 1) / 2;
        const path: ExactPath = {
            v: 1,
            from: [0, 0],
            shapes: [
                {
                    kind: "points",
                    points: [
                        [3, 4],
                        [3, 10],
                        [6, 14],
                    ],
                },
                { kind: "arc", to: [16, 24], bend: quarter },
                { kind: "cubic", c1: [20, 40], c2: [40, 0], to: [50, 24] },
            ],
            keys: [
                { tick: 0, u: 0 },
                { tick: 4800, u: 5 },
            ],
        };
        expect(checkExactPath(path)).toEqual([]);
        expect(exactPieceCount(path)).toBe(5);
        const player = exactPlayer(path);
        const [l1, l2, l3, arc, cubic] = player.pieces.map((p) => p.length);
        expect(l1).toBeCloseTo(5, 12);
        expect(l2).toBeCloseTo(6, 12);
        expect(l3).toBeCloseTo(5, 12);
        // a quarter turn on chord √200: radius 10, length 5π
        expect(arc).toBeCloseTo(5 * Math.PI, 10);
        const ref = chordLength([16, 24], [20, 40], [40, 0], [50, 24]);
        expect(Math.abs(cubic! - ref) / ref).toBeLessThan(1e-6);
        // every joint is where its shape ends
        expect(d2(player.pointAtPlace(3), [6, 14])).toBeLessThan(1e-12);
        expect(d2(player.pointAtPlace(4), [16, 24])).toBeLessThan(1e-9);
        expect(d2(exactPointAt(path, 4800), [50, 24])).toBeLessThan(1e-12);
        expect(d2(exactPointAt(path, 0), [0, 0])).toBeLessThan(1e-12);
        // the arc's middle is its apex: M + bend·c·n
        const apex: XY = [
            11 - quarter * 10 * Math.SQRT2 * Math.SQRT1_2,
            19 + quarter * 10,
        ];
        expect(d2(player.pointAtPlace(3.5), apex)).toBeLessThan(1e-9);
    });

    it("QA-EP-2: equal ticks walk equal distances along a peaked cubic", () => {
        const path: ExactPath = {
            v: 1,
            from: [0, 0],
            shapes: [{ kind: "cubic", c1: [0, 80], c2: [10, 80], to: [10, 0] }],
            keys: [
                { tick: 0, u: 0 },
                { tick: 960, u: 1 },
            ],
        };
        const player = exactPlayer(path);
        const m = measureCubic([0, 0], [0, 80], [10, 80], [10, 0]);
        for (let tick = 0; tick <= 960; tick += 40) {
            const p = player.pointAt(tick);
            // the length from the start to that point, measured independently
            let t = 0;
            let best = Infinity;
            for (let i = 0; i <= 20000; i++) {
                const q = m.point(i / 20000);
                const e = d2(p, q);
                if (e < best) {
                    best = e;
                    t = i / 20000;
                }
            }
            expect(
                Math.abs(m.lengthTo(t) - (tick / 960) * m.length),
            ).toBeLessThan(1e-6 * m.length + 0.01);
        }
        // and not equal steps of t: a quarter of the time is not t = 1/4
        expect(d2(player.pointAt(240), m.point(0.25))).toBeGreaterThan(1);
    });

    it("QA-EP-3: a hold, then a steady walk", () => {
        const path: ExactPath = {
            v: 1,
            from: [0, 0],
            shapes: [{ kind: "points", points: [[20, 0]] }],
            keys: [
                { tick: 0, u: 0 },
                { tick: 960, u: 0 },
                { tick: 1920, u: 1 },
            ],
        };
        expect(exactPointAt(path, 500)).toEqual([0, 0]);
        expect(exactPointAt(path, 960)).toEqual([0, 0]);
        expect(d2(exactPointAt(path, 1440), [10, 0])).toBeLessThan(1e-12);
        expect(d2(exactPointAt(path, 1200), [5, 0])).toBeLessThan(1e-12);
    });

    it("QA-EP-3b: keys on a corner keep their count when either end follows its spot", () => {
        expect(d2(exactPointAt(corner, 2880), [12, 0])).toBeLessThan(1e-12);
        const endMoved = followExactEnds(corner, { to: [12, 18] });
        expect(endMoved.keys).toEqual(corner.keys);
        expect(d2(exactPointAt(endMoved, 2880), [12, 0])).toBeLessThan(1e-12);
        const both = followExactEnds(endMoved, { from: [-6, 0] });
        expect(both.keys).toEqual(corner.keys);
        expect(d2(exactPointAt(both, 2880), [12, 0])).toBeLessThan(1e-12);
        expect(d2(exactPointAt(both, 0), [-6, 0])).toBeLessThan(1e-12);
        expect(d2(exactPointAt(both, 3840), [12, 18])).toBeLessThan(1e-12);
    });

    it("QA-EP-3c: a retime that rounds two keys onto one tick drops one", () => {
        const path: ExactPath = {
            v: 1,
            from: [0, 0],
            shapes: [
                {
                    kind: "points",
                    points: [
                        [10, 0],
                        [10, 10],
                    ],
                },
            ],
            keys: [
                { tick: 0, u: 0 },
                { tick: 1, u: 0.5 },
                { tick: 2, u: 1 },
                { tick: 960, u: 2 },
            ],
        };
        const half = retimeExactPath(path, 480);
        expect(checkExactPath(half)).toEqual([]);
        expect(half.keys[0]).toEqual({ tick: 0, u: 0 });
        expect(half.keys[half.keys.length - 1]).toEqual({ tick: 480, u: 2 });
        expect(half.keys.length).toBe(3);
        // a last key that collides drops the one before it
        const tiny = retimeExactPath(
            {
                ...path,
                keys: [path.keys[0]!, { tick: 959, u: 1.9 }, path.keys[3]!],
            },
            2,
        );
        expect(tiny.keys).toEqual([
            { tick: 0, u: 0 },
            { tick: 2, u: 2 },
        ]);
        expect(() => retimeExactPath(path, 0)).toThrow();
    });

    it("QA-EP-3d: a split inside a cubic gives two valid halves that play the same", () => {
        const path: ExactPath = {
            v: 1,
            from: [0, 0],
            shapes: [
                { kind: "cubic", c1: [10, 30], c2: [30, 30], to: [40, 0] },
                { kind: "arc", to: [60, 0], bend: 0.3 },
                { kind: "points", points: [[80, 10]] },
            ],
            keys: [
                { tick: 0, u: 0 },
                { tick: 1000, u: 0.8 },
                { tick: 1500, u: 1.5 },
                { tick: 3000, u: 3 },
            ],
        };
        expect(checkExactPath(path)).toEqual([]);
        for (const at of [400, 1000, 1250, 2500]) {
            const { before, after } = splitExactPath(path, at);
            expect(before && checkExactPath(before)).toEqual([]);
            expect(after && checkExactPath(after)).toEqual([]);
            for (let tick = 0; tick <= 3000; tick += 25) {
                const want = exactPointAt(path, tick);
                const got =
                    tick <= at
                        ? exactPointAt(before!, tick)
                        : exactPointAt(after!, tick - at);
                expect(d2(want, got)).toBeLessThan(1e-6);
            }
        }
    });

    it("a split inside a hold at the start leaves only the walk", () => {
        const path: ExactPath = {
            v: 1,
            from: [0, 0],
            shapes: [{ kind: "points", points: [[10, 0]] }],
            keys: [
                { tick: 0, u: 0 },
                { tick: 480, u: 0 },
                { tick: 960, u: 1 },
            ],
        };
        const { before, after } = splitExactPath(path, 240);
        expect(before).toBeNull();
        expect(after!.keys).toEqual([
            { tick: 0, u: 0 },
            { tick: 240, u: 0 },
            { tick: 720, u: 1 },
        ]);
    });

    it("QA-EP-4: each broken rule is refused with its id", () => {
        const ok = corner;
        const rules = (p: ExactPath) => [
            ...new Set(checkExactPath(p).map((x) => x.rule)),
        ];
        expect(rules(ok)).toEqual([]);
        expect(rules({ ...ok, from: [NaN, 0] })).toEqual(["EP-1"]);
        expect(rules({ ...ok, shapes: [] })).toContain("EP-2");
        expect(
            rules({ ...ok, shapes: [{ kind: "points", points: [] }] }),
        ).toContain("EP-2");
        const arc = (bend: number, to: XY = [10, 0]): ExactPath => ({
            v: 1,
            from: [0, 0],
            shapes: [{ kind: "arc", to, bend }],
            keys: [
                { tick: 0, u: 0 },
                { tick: 10, u: 1 },
            ],
        });
        expect(rules(arc(0.25))).toEqual([]);
        expect(rules(arc(0))).toEqual(["EP-3"]);
        expect(rules(arc(0.6))).toEqual(["EP-3"]);
        expect(rules(arc(0.25, [0, 0]))).toEqual(["EP-3"]);
        const keys = (k: ExactPath["keys"]) => rules({ ...ok, keys: k });
        expect(
            keys([
                { tick: 5, u: 0 },
                { tick: 10, u: 2 },
            ]),
        ).toEqual(["EP-5"]);
        expect(
            keys([
                { tick: 0, u: 0 },
                { tick: 10, u: 1 },
                { tick: 10, u: 1.5 },
                { tick: 20, u: 2 },
            ]),
        ).toEqual(["EP-5"]);
        expect(
            keys([
                { tick: 0, u: 0 },
                { tick: 10, u: 1.5 },
                { tick: 15, u: 1 },
                { tick: 20, u: 2 },
            ]),
        ).toEqual(["EP-5"]);
        expect(
            keys([
                { tick: 0, u: 0 },
                { tick: 10, u: 1 },
            ]),
        ).toEqual(["EP-5"]);
        expect(
            keys([
                { tick: 0, u: 0 },
                { tick: 10.5, u: 2 },
            ]),
        ).toEqual(["EP-5"]);
        expect(
            rules({
                v: 1,
                from: [3, 3],
                shapes: [{ kind: "points", points: [[3, 3]] }],
                keys: [
                    { tick: 0, u: 0 },
                    { tick: 10, u: 1 },
                ],
            }),
        ).toEqual(["EP-6"]);
    });

    it("QA-EP-5: end-following moves only the named points", () => {
        const path: ExactPath = {
            v: 1,
            from: [0, 0],
            shapes: [
                { kind: "cubic", c1: [0, 10], c2: [10, 10], to: [10, 0] },
                { kind: "points", points: [[20, 0]] },
                { kind: "arc", to: [30, 0], bend: 0.25 },
            ],
            keys: [
                { tick: 0, u: 0 },
                { tick: 480, u: 2 },
                { tick: 960, u: 3 },
            ],
        };
        const moved = followExactEnds(path, { from: [-2, 1], to: [34, 3] });
        expect(moved.keys).toEqual(path.keys);
        expect(moved.from).toEqual([-2, 1]);
        expect(moved.shapes[0]).toEqual({
            kind: "cubic",
            c1: [-2, 11],
            c2: [10, 10],
            to: [10, 0],
        });
        expect(moved.shapes[1]).toEqual(path.shapes[1]);
        expect(moved.shapes[2]).toEqual({
            kind: "arc",
            to: [34, 3],
            bend: 0.25,
        });
        // the joint before the moved arc is still where the key says, on its count
        expect(d2(exactPointAt(moved, 480), [20, 0])).toBeLessThan(1e-12);
        // the original is untouched
        expect(path.from).toEqual([0, 0]);
    });
});
