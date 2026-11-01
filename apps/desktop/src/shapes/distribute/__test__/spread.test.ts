// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { distribute, spreadScale } from "../distribute";
import {
    reshuffled,
    spreadDistribution,
    storedDistribution,
    type SpreadDistribution,
} from "../distribution";
import {
    circleRegion,
    polygonRegion,
    rectRegion,
    type Region,
} from "../region";
import { evenSpread, SPREAD_GENERATOR } from "../spread";
import { leastTravel } from "../../leastTravel";
import type { XY } from "../../types";

/**
 * Even spread (#391, spec #385), at the distributor: a seeded scatter with no visible files, the
 * closest pair exactly one interval apart, soft edges, and a count change that nudges rather than
 * reshuffles. Driven through `distribute` with the box's and the circle's regions, and an L, since
 * a spread fills any closed region.
 */

const INTERVAL = 20;
/** A step in field units: the interval is 2 steps */
const STEP = INTERVAL / 2;

const spread = (
    region: Region,
    n: number,
    d: SpreadDistribution = spreadDistribution(1, n),
) =>
    distribute({
        region,
        n,
        distribution: d,
        across: INTERVAL,
        deep: INTERVAL,
    });

const REGIONS: Record<string, Region> = {
    "a 3:2 box": rectRegion(3, 2),
    "a square box": rectRegion(1, 1),
    "a 4:1 box": rectRegion(4, 1),
    "a circle": circleRegion(1),
    "an L": polygonRegion([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 4 },
        { x: 0, y: 4 },
    ]),
};

const dist = (a: XY, b: XY) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

/** A spread's closest pair: never under the interval, and not much over it */
function expectSpacing(closest: number, interval: number, what?: string) {
    expect(closest, what).toBeGreaterThanOrEqual(interval * (1 - 1e-6));
    expect(closest, what).toBeLessThan(interval * 1.2);
}

/** Each spot's distance to its nearest neighbor */
function nearest(spots: readonly XY[]): number[] {
    return spots.map((p, i) =>
        Math.min(...spots.filter((_, j) => j !== i).map((q) => dist(p, q))),
    );
}

/** The spread of the nearest-neighbor distances: their standard deviation over their mean */
function unevenness(spots: readonly XY[]): number {
    const d = nearest(spots);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const sd = Math.sqrt(d.reduce((a, v) => a + (v - mean) ** 2, 0) / d.length);
    return sd / mean;
}

describe("Even spread", () => {
    it("gives identical spots for the same shape, count and seed", () => {
        for (const region of Object.values(REGIONS)) {
            const once = spread(region, 37, spreadDistribution(4, 37));
            // A fresh region object, so nothing is shared but the inputs
            const again = spread(
                region.key.startsWith("circle")
                    ? circleRegion(1)
                    : { ...region },
                37,
                spreadDistribution(4, 37),
            );
            expect(again).toEqual(once);
            expect(evenSpread(region, 37, 4)).toEqual(
                evenSpread(region, 37, 4),
            );
        }
    });

    it("has exactly the spots asked for, inside its edge", () => {
        for (const region of Object.values(REGIONS))
            for (const n of [1, 2, 3, 7, 12, 36, 61, 120]) {
                const spots = spread(region, n);
                expect(spots).toHaveLength(n);
                const k = spreadScale(
                    region,
                    n,
                    spreadDistribution(1, n),
                    INTERVAL,
                );
                for (const s of spots)
                    expect(
                        region.edgeDistance({ x: s.x / k, y: s.y / k }),
                    ).toBeGreaterThanOrEqual(0);
            }
    });

    it("puts no pair closer than one interval, and from 12 the closest within 20% of it", () => {
        // A few marchers have too few neighbors to even out with: they stand as far apart as
        // the frame lets them, at least the interval
        for (const region of Object.values(REGIONS))
            for (const n of [2, 3, 5, 12, 36, 100, 300])
                for (const seed of [1, 2, 3]) {
                    const what = `${region.key} ${n} ${seed}`;
                    const closest = Math.min(
                        ...nearest(
                            spread(region, n, spreadDistribution(seed, n)),
                        ),
                    );
                    if (n >= 12) expectSpacing(closest, INTERVAL, what);
                    else
                        expect(closest, what).toBeGreaterThanOrEqual(
                            INTERVAL * (1 - 1e-6),
                        );
                }
    });

    describe("in a long, thin shape (#439 review)", () => {
        /** Boxes up to 20:1 either way, as files × ranks */
        const THIN: [number, number][] = [
            [8, 1],
            [12, 1],
            [20, 1],
            [19, 2],
            [1, 12],
            [1, 20],
            [2, 19],
        ];

        it("puts no pair closer than one interval, for 20 seeds", () => {
            for (const [files, ranks] of THIN) {
                const region = rectRegion(files / 2, ranks / 2);
                for (const n of [2, 3, 6, 12, 22, 48])
                    for (let seed = 1; seed <= 20; seed++)
                        expect(
                            Math.min(
                                ...nearest(
                                    spread(
                                        region,
                                        n,
                                        spreadDistribution(seed, n),
                                    ),
                                ),
                            ),
                            `${files}×${ranks} ${n} ${seed}`,
                        ).toBeGreaterThanOrEqual(INTERVAL * (1 - 1e-6));
            }
        });

        it("never stacks two marchers in a single file", () => {
            for (const [files, ranks, n, seed] of [
                [20, 1, 20, 2],
                [22, 1, 22, 4],
                [1, 20, 20, 2],
            ] as const) {
                const spots = spread(
                    rectRegion(files / 2, ranks / 2),
                    n,
                    spreadDistribution(seed, n),
                );
                expect(Math.min(...nearest(spots))).toBeGreaterThanOrEqual(
                    INTERVAL * (1 - 1e-6),
                );
            }
        });
    });

    it("keeps one size for every seed, so Reshuffle keeps the shape's frame (#439)", () => {
        for (const region of Object.values(REGIONS))
            for (const n of [1, 2, 12, 36, 100]) {
                const scale = spreadScale(
                    region,
                    n,
                    spreadDistribution(1, n),
                    1,
                );
                for (const seed of [2, 3, 7])
                    expect(
                        spreadScale(region, n, spreadDistribution(seed, n), 1),
                    ).toBe(scale);
            }
    });

    it("lays out a generator 1 spread as it always did, its closest pair exactly one interval", () => {
        for (const region of Object.values(REGIONS))
            for (const n of [5, 36]) {
                const d = { ...spreadDistribution(2, n), generator: 1 };
                expect(Math.min(...nearest(spread(region, n, d)))).toBeCloseTo(
                    INTERVAL,
                    9,
                );
                const layout = evenSpread(region, n, 2, n, 1);
                expect(spreadScale(region, n, d, 1)).toBe(layout.scale);
            }
    });

    it("keeps neighbors about the same distance apart: under 10% spread at 12 to 300", () => {
        const worst: Record<string, number> = {};
        for (const [name, region] of Object.entries(REGIONS)) {
            for (const n of [12, 13, 17, 24, 36, 50, 81, 120, 200, 300])
                for (const seed of [1, 2, 3])
                    worst[name] = Math.max(
                        worst[name] ?? 0,
                        unevenness(
                            spread(region, n, spreadDistribution(seed, n)),
                        ),
                    );
        }
        for (const name of Object.keys(REGIONS))
            expect(worst[name], name).toBeLessThan(0.1);
    });

    it("forms no line of 4 or more within a tenth of a step along a box's straight edge", () => {
        const tenth = STEP / 10;
        for (const [hw, hd] of [
            [3, 2],
            [1, 1],
            [4, 1],
        ] as const) {
            const region = rectRegion(hw, hd);
            for (const n of [12, 24, 36, 60, 120, 300])
                for (const seed of [1, 2, 3, 4]) {
                    const d = spreadDistribution(seed, n);
                    const spots = spread(region, n, d);
                    const k = spreadScale(region, n, d, INTERVAL);
                    // Each edge: how far in each spot stands, and where along it
                    const edges = [
                        (s: XY) => ({ in: s.y + hd * k, along: s.x }),
                        (s: XY) => ({ in: hd * k - s.y, along: s.x }),
                        (s: XY) => ({ in: s.x + hw * k, along: s.y }),
                        (s: XY) => ({ in: hw * k - s.x, along: s.y }),
                    ];
                    for (const edge of edges) {
                        // The marchers nearest the edge, in order along it
                        const row = spots
                            .map(edge)
                            .filter((s) => s.in <= INTERVAL)
                            .sort((a, b) => a.along - b.along);
                        for (let i = 0; i + 4 <= row.length; i++) {
                            const four = row.slice(i, i + 4);
                            // Neighbors along the edge, not four strangers far apart
                            const close = four.every(
                                (s, j) =>
                                    j === 0 ||
                                    s.along - four[j - 1]!.along <=
                                        2 * INTERVAL,
                            );
                            const ins = four.map((s) => s.in);
                            const level =
                                Math.max(...ins) - Math.min(...ins) <= tenth;
                            expect(
                                close && level,
                                `${hw}:${hd} n=${n} seed=${seed}`,
                            ).toBe(false);
                        }
                    }
                }
        }
    });

    it("lays out 300 marchers in under 300 ms", () => {
        const region = rectRegion(3, 2.5);
        const start = performance.now();
        evenSpread(region, 300, 9);
        expect(performance.now() - start).toBeLessThan(300);
    });

    describe("determinism", () => {
        afterEach(() => vi.restoreAllMocks());

        it("never calls the engine-approximated Math functions while laying out", () => {
            const approximated = [
                "sin",
                "cos",
                "tan",
                "atan2",
                "hypot",
                "pow",
                "exp",
                "log",
            ] as const;
            const spies = approximated.map((f) => vi.spyOn(Math, f));
            for (const region of Object.values(REGIONS)) {
                evenSpread(region, 40, 3);
                evenSpread(region, 41, 3, 40);
                evenSpread(region, 39, 3, 40);
            }
            for (const spy of spies) expect(spy).not.toHaveBeenCalled();
        });
    });

    describe("Reshuffle", () => {
        it("moves to the next seed and gives a new layout", () => {
            const d = spreadDistribution(1, 30);
            const next = reshuffled(d, 30);
            expect(next).toEqual({ ...d, seed: 2 });
            const region = rectRegion(3, 2);
            const before = spread(region, 30, d);
            const after = spread(region, 30, next);
            expect(after).not.toEqual(before);
            // Still the same kind of spread
            expectSpacing(Math.min(...nearest(after)), INTERVAL);
        });

        it("lays out for the count there is now, dropping an old count", () => {
            const d: SpreadDistribution = { ...spreadDistribution(3, 30) };
            expect(reshuffled(d, 32)).toEqual(spreadDistribution(4, 32));
        });
    });

    describe("a count change", () => {
        /** How far each marcher walks from `before` to `after` with the least travel */
        function walks(before: readonly XY[], after: readonly XY[]): number[] {
            // The extra spot of the larger set walks nowhere: match against the closest n
            const [from, to] =
                before.length <= after.length
                    ? [before, after]
                    : [after, before];
            const used = to
                .map((s, i) => ({
                    i,
                    d: Math.min(...from.map((f) => dist(f, s))),
                }))
                .sort((a, b) => a.d - b.d)
                .slice(0, from.length)
                .map((x) => to[x.i]!);
            const spotOf = leastTravel(from, used);
            return from.map((f, i) => dist(f, used[spotOf[i]!]!));
        }

        it("nudges the spread: most marchers move less than half an interval", () => {
            for (const region of Object.values(REGIONS))
                for (const n of [12, 36, 100]) {
                    const d = spreadDistribution(2, n);
                    const before = spread(region, n, d);
                    for (const m of [n - 1, n + 1]) {
                        const after = spread(region, m, d);
                        expect(after).toHaveLength(m);
                        const moved = walks(before, after);
                        const little = moved.filter(
                            (w) => w < INTERVAL / 2,
                        ).length;
                        expect(
                            little / moved.length,
                            `${region.key} ${n}→${m}`,
                        ).toBeGreaterThan(0.75);
                        expectSpacing(Math.min(...nearest(after)), INTERVAL);
                    }
                }
        });

        it("is the same each time for the same seed and counts", () => {
            const region = circleRegion(1);
            const d = spreadDistribution(5, 20);
            expect(spread(region, 23, d)).toEqual(spread(region, 23, d));
        });
    });

    describe("drafted mid-gesture (#439)", () => {
        const drafted = (region: Region, n: number, d: SpreadDistribution) =>
            distribute({
                region,
                n,
                distribution: d,
                across: INTERVAL,
                deep: INTERVAL,
                draft: true,
            });

        it("stretches the box's own last layout, even after a circle of the same count and seed", () => {
            const d = spreadDistribution(9, 40);
            const was = rectRegion(2, 0.5);
            const box = spread(was, 40, d);
            // Another shape asked for since: a circle spread just like it
            spread(circleRegion(1), 40, d);
            const now = rectRegion(2.4, 0.5);
            const out = drafted(now, 40, d);
            const sx =
                (2.4 * spreadScale(now, 40, d, 1)) /
                (2 * spreadScale(was, 40, d, 1));
            const sy = spreadScale(now, 40, d, 1) / spreadScale(was, 40, d, 1);
            out.forEach((s, i) => {
                expect(s.x).toBeCloseTo(box[i]!.x * sx, 6);
                expect(s.y).toBeCloseTo(box[i]!.y * sy, 6);
            });
        });

        it("lays out exactly what it hasn't seen before, and never keeps a draft", () => {
            const d = spreadDistribution(11, 30);
            const region = rectRegion(1.7, 0.5);
            // Nothing to stretch yet: the exact layout
            expect(drafted(region, 30, d)).toEqual(spread(region, 30, d));
            const other = rectRegion(2.2, 0.5);
            const draft = drafted(other, 30, d);
            // Asked for again without the draft: the exact layout, not the draft
            expect(spread(other, 30, d)).not.toEqual(draft);
            expect(spread(other, 30, d)).toEqual(
                distribute({
                    region: rectRegion(2.2, 0.5),
                    n: 30,
                    distribution: d,
                    across: INTERVAL,
                    deep: INTERVAL,
                }),
            );
        });
    });

    describe("as stored", () => {
        it("reads a spread with its seed, generator and count", () => {
            expect(
                storedDistribution(
                    {
                        distribution: {
                            mode: "spread",
                            seed: 7,
                            generator: SPREAD_GENERATOR,
                            count: 30,
                        },
                    },
                    4,
                ),
            ).toEqual({
                mode: "spread",
                seed: 7,
                generator: SPREAD_GENERATOR,
                count: 30,
            });
        });

        it("reads a generator 1 spread (#391) as one, so it lays out as placed", () => {
            expect(
                storedDistribution(
                    { distribution: { mode: "spread", seed: 3, generator: 1 } },
                    1,
                ),
            ).toEqual({ mode: "spread", seed: 3, generator: 1 });
        });

        it("reads a spread from a generator this app doesn't have as none", () => {
            expect(
                storedDistribution(
                    {
                        distribution: {
                            mode: "spread",
                            seed: 7,
                            generator: SPREAD_GENERATOR + 1,
                        },
                    },
                    4,
                ),
            ).toBeUndefined();
        });

        it("reads a broken seed as seed 1", () => {
            expect(
                storedDistribution(
                    {
                        distribution: {
                            mode: "spread",
                            seed: -2.5,
                            generator: SPREAD_GENERATOR,
                        },
                    },
                    4,
                ),
            ).toEqual({
                mode: "spread",
                seed: 1,
                generator: SPREAD_GENERATOR,
            });
        });
    });
});
