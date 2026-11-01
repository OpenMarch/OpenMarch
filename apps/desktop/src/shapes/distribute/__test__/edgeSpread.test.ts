// @vitest-environment node
import { describe, expect, it } from "vitest";
import { distribute, edgeSplit, spreadScale } from "../distribute";
import {
    reshuffled,
    savedDistributionOf,
    spreadDistribution,
    storedDistribution,
    type SpreadDistribution,
} from "../distribution";
import { circleRegion, rectRegion, type Region } from "../region";
import type { XY } from "../../types";

/**
 * Spread with an edge (#450): marchers evenly along the outline, as many as it holds one interval
 * apart (a spot on every corner of a box), the rest an even spread inside, at least one interval
 * in, no pair closer than the interval. The edge doesn't follow the seed: Reshuffle reshuffles
 * the inside only.
 */

const INTERVAL = 20;
const edged = (seed: number, n: number): SpreadDistribution =>
    spreadDistribution(seed, n, true);
/** The spots' places (a spread's row is its seed, so they're left out) */
const spots = (region: Region, n: number, d: SpreadDistribution) =>
    distribute({
        region,
        n,
        distribution: d,
        across: INTERVAL,
        deep: INTERVAL,
    }).map(({ x, y }) => ({ x, y }));

const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const closest = (ps: readonly XY[]) =>
    Math.min(...ps.flatMap((p, i) => ps.slice(i + 1).map((q) => dist(p, q))));

const REGIONS: Record<string, Region> = {
    "a 3:2 box": rectRegion(3, 2),
    "a square box": rectRegion(1, 1),
    "a 4:1 box": rectRegion(4, 1),
    "a circle": circleRegion(1),
};
const COUNTS = [8, 12, 16, 24, 36, 48, 72, 100];

/** How far `p` is inside the frame of `region` at `scale` (field units), on its edge at 0 */
function depthIn(region: Region, scale: number, p: XY): number {
    const b = region.bounds;
    if (region.key.startsWith("circle"))
        return b.right * scale - Math.hypot(p.x, p.y);
    return Math.min(
        b.right * scale - Math.abs(p.x),
        b.bottom * scale - Math.abs(p.y),
    );
}

describe.each(Object.entries(REGIONS))(
    "Spread with an edge in %s",
    (_, region) => {
        it.each(COUNTS)(
            "stands %i: the edge on the outline about 1½ intervals apart, the rest spread up to it, no pair under the interval for 20 seeds",
            (n) => {
                const { edge, inside } = edgeSplit(region, n);
                expect(edge + inside).toBe(n);
                for (let seed = 1; seed <= 20; seed++) {
                    const d = edged(seed, n);
                    const all = spots(region, n, d);
                    expect(all).toHaveLength(n);
                    const scale = spreadScale(region, n, d, INTERVAL);
                    const onEdge = all.slice(0, edge);
                    const within = all.slice(edge);
                    for (const p of onEdge)
                        expect(
                            Math.abs(depthIn(region, scale, p)),
                        ).toBeLessThan(1e-6);
                    for (const p of within)
                        expect(depthIn(region, scale, p)).toBeGreaterThan(0);
                    expect(closest(all), `seed ${seed}`).toBeGreaterThanOrEqual(
                        INTERVAL * (1 - 1e-6),
                    );
                }
                if (inside === 0) return;
                // Along the edge about 1½ intervals apart: whole spots a side can't always land
                // in 1.3–1.7 on a short side (3.4 intervals: 2 at 1.72 or 3 at 1.15), so 1.3–1.7
                // where a side takes 4 or more (6 intervals long), 1 to 2 elsewhere
                const all = spots(region, n, edged(1, n));
                const onEdge = all.slice(0, edge);
                const scale = spreadScale(region, n, edged(1, n), INTERVAL);
                const long = region.key.startsWith("circle")
                    ? 2 * Math.PI * region.bounds.right * scale >= 6 * INTERVAL
                    : 2 *
                          Math.min(region.bounds.right, region.bounds.bottom) *
                          scale >=
                      6 * INTERVAL;
                const ring = [...onEdge, onEdge[0]!];
                const gaps = ring.slice(1).map((p, i) => dist(ring[i]!, p));
                for (const g of gaps) {
                    expect(g).toBeGreaterThanOrEqual(
                        (long ? 1.3 : 1) * INTERVAL - 1e-6,
                    );
                    expect(g).toBeLessThanOrEqual(
                        (long ? 1.7 : 2) * INTERVAL + 1e-6,
                    );
                }
            },
        );

        it("reads as one spread: the inside stands as near the edge as to each other", () => {
            for (const n of [30, 60]) {
                const { edge } = edgeSplit(region, n);
                const all = spots(region, n, edged(1, n));
                const onEdge = all.slice(0, edge);
                const within = all.slice(edge);
                const nearest = (p: XY, among: readonly XY[]) =>
                    Math.min(
                        ...among.filter((q) => q !== p).map((q) => dist(p, q)),
                    );
                // The inside's spots nearest the edge: how near the edge's are, against how near
                // the inside's are to each other
                const toEdge = within
                    .map((p) => nearest(p, onEdge))
                    .sort((a, b) => a - b);
                const among = within.map((p) => nearest(p, within));
                const median = (v: number[]) =>
                    [...v].sort((a, b) => a - b)[v.length >> 1]!;
                const k = Math.max(3, Math.round(edge / 2));
                const close = median(toEdge.slice(0, k));
                expect(close / median(among)).toBeGreaterThan(0.8);
                expect(close / median(among)).toBeLessThan(1.3);
            }
        });

        it("puts a spot on every corner of a box", () => {
            if (!region.key.startsWith("rect")) return;
            for (const n of [24, 48]) {
                const d = edged(1, n);
                const scale = spreadScale(region, n, d, INTERVAL);
                const w = region.bounds.right * scale;
                const h = region.bounds.bottom * scale;
                const all = spots(region, n, d);
                for (const c of [
                    { x: -w, y: -h },
                    { x: w, y: -h },
                    { x: w, y: h },
                    { x: -w, y: h },
                ])
                    expect(
                        Math.min(...all.map((p) => dist(p, c))),
                    ).toBeLessThan(1e-6);
            }
        });

        it("is the same each time, and Reshuffle moves the inside only", () => {
            const n = 36;
            const d = edged(4, n);
            expect(spots(region, n, d)).toEqual(spots(region, n, d));
            const next = reshuffled(d, n);
            expect(next.edge).toBe(true);
            const { edge } = edgeSplit(region, n);
            const a = spots(region, n, d);
            const b = spots(region, n, next);
            expect(b.slice(0, edge)).toEqual(a.slice(0, edge));
            expect(b.slice(edge)).not.toEqual(a.slice(edge));
            // The same size for every seed: Reshuffle keeps the frame
            expect(spreadScale(region, n, next, 1)).toBe(
                spreadScale(region, n, d, 1),
            );
        });
    },
);

describe("Spread with an edge, too few for an inside", () => {
    it("stands everyone on the edge, still no closer than the interval", () => {
        for (const region of Object.values(REGIONS))
            for (const n of [3, 4, 6]) {
                const { inside } = edgeSplit(region, n);
                // Six round a circle: five on the rim and one in the middle, its natural shape
                if (region.key.startsWith("circle") && n === 6)
                    expect(edgeSplit(region, n)).toEqual({
                        edge: 5,
                        inside: 1,
                    });
                else expect(inside).toBe(0);
                const all = spots(region, n, edged(1, n));
                expect(all).toHaveLength(n);
                expect(closest(all)).toBeGreaterThanOrEqual(
                    INTERVAL * (1 - 1e-6),
                );
            }
    });
});

describe("Spread with an edge keeps the floor for every seed (#450 review)", () => {
    /** Thin boxes either way, a short one, and a circle, where a relaxed spread can fall short */
    const SHAPES: Record<string, Region> = {
        "10:1": rectRegion(5, 0.5),
        "1:6": rectRegion(0.5, 3),
        "4:1": rectRegion(2, 0.5),
        circle: circleRegion(1),
    };
    const PROBED = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 37, 64];

    it.each(Object.entries(SHAPES))(
        "in a %s box, from 5 to 64, over 200 seeds",
        (name, region) => {
            for (const n of PROBED)
                for (let seed = 1; seed <= 200; seed++) {
                    const all = spots(region, n, edged(seed, n));
                    expect(all).toHaveLength(n);
                    expect(
                        closest(all),
                        `${name} ${n} seed ${seed}`,
                    ).toBeGreaterThanOrEqual(INTERVAL * (1 - 1e-6));
                }
        },
    );

    it("is the same each time where the lattice stands in", () => {
        // 10:1 at 64, seed 190: the relaxed spread fell short of the floor here before
        const region = SHAPES["10:1"]!;
        expect(spots(region, 64, edged(190, 64))).toEqual(
            spots(region, 64, edged(190, 64)),
        );
    });
});

describe("Spread with an edge, as stored", () => {
    it("is `edge: true`, absent when off, and kept by a saved shape", () => {
        expect(spreadDistribution(1, 10)).not.toHaveProperty("edge");
        const d = edged(3, 10);
        expect(
            storedDistribution(
                JSON.parse(JSON.stringify({ distribution: d })),
                1,
            ),
        ).toEqual(d);
        expect(
            storedDistribution({ distribution: { ...d, edge: "yes" } }, 1),
        ).not.toHaveProperty("edge");
        expect(savedDistributionOf(d)).toEqual({
            mode: "spread",
            generator: d.generator,
            edge: true,
        });
    });

    it("leaves a plain spread as it was: the same spots as before edges existed", () => {
        // Generator 2, a 3:2 box of 6 at seed 2, laid out on shapes/host before #450
        const before = [
            [28.889219, -12.933143],
            [9.125152, -9.821382],
            [-10.876513, -9.705548],
            [18.291688, 9.285398],
            [-1.709547, 9.460269],
            [-21.078771, 14.451579],
        ];
        spots(rectRegion(3, 2), 6, spreadDistribution(2, 6)).forEach((p, i) => {
            expect(p.x).toBeCloseTo(before[i]![0]!, 5);
            expect(p.y).toBeCloseTo(before[i]![1]!, 5);
        });
        for (const region of Object.values(REGIONS))
            expect(
                spreadScale(region, 30, spreadDistribution(2, 30), 1),
            ).not.toBe(spreadScale(region, 30, edged(2, 30), 1));
    });
});

describe("Spread with an edge, its size (#450 review)", () => {
    it("never shrinks for a bigger count", () => {
        for (const region of [...Object.values(REGIONS), rectRegion(10, 0.5)]) {
            let was = 0;
            for (let n = 3; n <= 100; n++) {
                const scale = spreadScale(region, n, edged(1, n), 1);
                expect(scale, `${region.key} ${n}`).toBeGreaterThanOrEqual(
                    was * (1 - 1e-6),
                );
                was = scale;
            }
        }
    });

    it("is the least that holds: the edge's spots stand an interval to two apart", () => {
        for (const [region, counts] of [
            [rectRegion(1, 1), [8, 9, 10]],
            [rectRegion(10, 0.5), [30, 31, 32, 33, 34]],
        ] as const)
            for (const n of counts) {
                const { edge } = edgeSplit(region, n);
                const ring = spots(region, n, edged(1, n)).slice(0, edge);
                const nearest = ring.map((p, i) =>
                    Math.min(
                        ...ring
                            .filter((_, j) => j !== i)
                            .map((q) => dist(p, q)),
                    ),
                );
                expect(
                    Math.min(...nearest),
                    `${region.key} ${n}`,
                ).toBeGreaterThanOrEqual(INTERVAL * (1 - 1e-6));
                expect(Math.min(...nearest), `${region.key} ${n}`).toBeLessThan(
                    2 * INTERVAL,
                );
            }
    });
});

describe("Spread with an edge, drafted mid-gesture", () => {
    it("stretches its own last layout, then lays out exactly once asked without the draft", () => {
        const d = edged(5, 30);
        const was = rectRegion(2, 1);
        const exact = spots(was, 30, d);
        const now = rectRegion(2.3, 1);
        const draft = distribute({
            region: now,
            n: 30,
            distribution: d,
            across: INTERVAL,
            deep: INTERVAL,
            draft: true,
        }).map(({ x, y }) => ({ x, y }));
        const sx =
            (2.3 * spreadScale(now, 30, d, 1)) /
            (2 * spreadScale(was, 30, d, 1));
        const sy = spreadScale(now, 30, d, 1) / spreadScale(was, 30, d, 1);
        draft.forEach((p, i) => {
            expect(p.x).toBeCloseTo(exact[i]!.x * sx, 6);
            expect(p.y).toBeCloseTo(exact[i]!.y * sy, 6);
        });
        expect(spots(now, 30, d)).not.toEqual(draft);
    });
});
