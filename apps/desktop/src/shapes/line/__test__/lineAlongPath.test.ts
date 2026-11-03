import { describe, expect, it } from "vitest";
import {
    isLineParams,
    lineInterval,
    linePath,
    lineSpots,
    SMOOTH,
    type LineParams,
    type LinePoint,
} from "../lineGeometry";
import { chordOffsets } from "../../spacing";

/**
 * What a Line's interval measures (#527, ADR 0006's Line amendment): along the path by default
 * (absent `measured`), straight across marcher to marcher with `straight`. Straight across never
 * cuts past a corner that holds no marcher: a gap that would goes along the path to it and on
 * straight across, so a spike's tip is walked round, not skipped.
 */

const corner = (x: number, y: number, more: Partial<LinePoint> = {}) => ({
    x,
    y,
    tension: 0,
    ...more,
});
const smooth = (x: number, y: number): LinePoint => ({
    x,
    y,
    tension: SMOOTH,
});

/** How far along the line each spot is from the one before */
const arcGaps = (p: LineParams, n: number) => {
    const s = lineSpots(p, n).map((spot) => spot.s!);
    return s.slice(1).map((x, i) => x - s[i]!);
};
const chordGaps = (p: LineParams, n: number) => {
    const spots = lineSpots(p, n);
    return spots
        .slice(1)
        .map((q, i) => Math.hypot(q.x - spots[i]!.x, q.y - spots[i]!.y));
};
/** Whether a gap's two spots are either side of `s` along the line */
const straddles = (p: LineParams, n: number, s: number) => {
    const at = lineSpots(p, n).map((spot) => spot.s!);
    return at.slice(1).map((x, i) => at[i]! < s && x > s);
};

/**
 * A line with a sharp spike whose tip is a corner, then a curve (so straight across differs from
 * along the path): intervals of 10 from its start, round the corners
 */
const SPIKE = [
    corner(0, 0),
    corner(35, 0),
    corner(40, -40),
    corner(45, 0),
    smooth(65, 10),
    corner(85, 0),
];
const N = 16;
const spiked = (more: Partial<LineParams> = {}): LineParams => ({
    points: SPIKE,
    spacing: { mode: "path", groups: [{ interval: 10 }], anchor: "start" },
    corners: false,
    ...more,
});
/** How far along the line the spike's tip is */
const TIP = 35 + Math.hypot(5, 40);

describe("a spike whose tip holds no marcher", () => {
    it("would be cut across by straight-across gaps alone: the case the rule is for", () => {
        const path = linePath(spiked());
        const s = chordOffsets(path, 0, Array<number>(N - 1).fill(10));
        const jump = Math.max(...s.slice(1).map((x, i) => x - s[i]!));
        expect(jump).toBeGreaterThan(12);
        // The Line measured straight across never does
        const p = spiked({ measured: "straight" });
        arcGaps(p, N).forEach((g) => expect(g).toBeLessThan(10.5));
        expect(straddles(p, N, TIP).filter(Boolean)).toHaveLength(1);
    });

    it("is walked round along the path: every gap 10 along it", () => {
        const p = spiked();
        arcGaps(p, N).forEach((g) => expect(g).toBeCloseTo(10, 9));
        expect(straddles(p, N, TIP).filter(Boolean)).toHaveLength(1);
    });

    it("is walked round straight across too, the gap over the tip measured along the path", () => {
        const p = spiked({ measured: "straight" });
        const arcs = arcGaps(p, N);
        const over = straddles(p, N, TIP);
        expect(over.filter(Boolean)).toHaveLength(1);
        arcs.forEach((g, i) => {
            // Over the tip, and on the straight parts, a gap is 10 along the path
            if (over[i]) expect(g).toBeCloseTo(10, 9);
            // Never more than a chord of 10 round the gentle curve
            expect(g).toBeLessThan(10.5);
        });
        // On the curve, straight across: chords of 10, a little more along it
        const curved = lineSpots(p, N)
            .map((spot, i) => ({ spot, i }))
            .filter(({ spot }) => spot.s! > 35 + 2 * Math.hypot(5, 40) + 1e-6);
        expect(curved.length).toBeGreaterThan(2);
        const chords = chordGaps(p, N);
        curved.slice(1).forEach(({ i }) => {
            expect(chords[i - 1]).toBeCloseTo(10, 6);
        });
    });

    it("is walked round when the tip's own answer is Even spacing, with the corners switch on", () => {
        // One stretch end to end: the tip opts out, the next point is smooth
        const points = [
            corner(0, 0),
            corner(30, -60, { marcher: false }),
            smooth(55, -30),
            corner(60, 0),
        ];
        const tip = Math.hypot(30, 60);
        for (const measured of [undefined, "straight"] as const) {
            const p: LineParams = {
                points,
                spacing: { mode: "fit" },
                ...(measured ? { measured } : {}),
            };
            const n = 8;
            const arcs = arcGaps(p, n);
            const over = straddles(p, n, tip);
            expect(over.filter(Boolean)).toHaveLength(1);
            // The first gap is on the straight side, the same either way
            const first = arcs[0]!;
            arcs.forEach((g, i) => {
                // Straight across, the part past the tip is a chord of the curve beyond it
                if (over[i]) expect(g).toBeCloseTo(first, measured ? 2 : 6);
                expect(g).toBeLessThan(first * 1.1);
            });
        }
    });
});

describe("along the path and straight across on a curve", () => {
    const ARC: LineParams = {
        points: [
            corner(0, 0),
            smooth(40, -30),
            smooth(80, -10),
            corner(120, 0),
        ],
        spacing: { mode: "keep", groups: [{ interval: 15 }] },
    };

    it("gives equal gaps along the path by default", () => {
        const gaps = arcGaps(ARC, 6);
        gaps.forEach((g) => expect(g).toBeCloseTo(gaps[0]!, 9));
        expect(gaps[0]).toBeCloseTo(15, 9);
        // Straight across they come out shorter, and uneven where it bends more
        chordGaps(ARC, 6).forEach((g) => expect(g).toBeLessThan(15));
    });

    it("gives equal gaps straight across when measured so", () => {
        const p: LineParams = { ...ARC, measured: "straight" };
        chordGaps(p, 6).forEach((g) => expect(g).toBeCloseTo(15, 6));
        arcGaps(p, 6).forEach((g) => expect(g).toBeGreaterThan(15));
    });

    it("spreads Fit evenly along the path, or evenly straight across", () => {
        const fit: LineParams = { ...ARC, spacing: { mode: "fit" } };
        const along = arcGaps(fit, 6);
        along.forEach((g) =>
            expect(g).toBeCloseTo(linePath(fit).length / 5, 6),
        );
        const across = chordGaps({ ...fit, measured: "straight" }, 6);
        across.forEach((g) => expect(g).toBeCloseTo(across[0]!, 6));
    });

    it("is the same both ways on a line of straight segments", () => {
        const zigzag: LineParams = {
            points: [
                corner(0, 0),
                corner(30, 20),
                corner(60, 0),
                corner(90, 20),
            ],
            spacing: { mode: "keep", groups: [{ interval: 10 }] },
            corners: false,
        };
        const straight = lineSpots({ ...zigzag, measured: "straight" }, 9);
        lineSpots(zigzag, 9).forEach((spot, i) => {
            expect(spot.x).toBeCloseTo(straight[i]!.x, 9);
            expect(spot.y).toBeCloseTo(straight[i]!.y, 9);
        });
    });
});

describe("↔ and ↕", () => {
    it("still put neighbors exactly an interval apart that way, round un-held corners", () => {
        // x only goes right, so ↔ lays it out by x; the corners hold no marcher
        const bent: LineParams = {
            points: [
                corner(0, 0),
                corner(30, 40),
                corner(50, 10),
                corner(80, 50),
            ],
            spacing: { mode: "keep", groups: [{ interval: 10 }] },
            measured: "x",
            corners: false,
        };
        const spots = lineSpots(bent, 9);
        expect(spots.map((q) => q.x)).toEqual([
            0, 10, 20, 30, 40, 50, 60, 70, 80,
        ]);
        // In order along the line: the x a gap covers is the x of the path between, so it can't
        // cut a corner short the way a chord does
        spots
            .slice(1)
            .forEach((q, i) => expect(q.s!).toBeGreaterThan(spots[i]!.s!));
    });
});

describe("the stored setting", () => {
    it("reads straight across and round-trips it", () => {
        const p = spiked({ measured: "straight" });
        const back = JSON.parse(JSON.stringify(p)) as unknown;
        expect(isLineParams(back)).toBe(true);
        expect(back).toEqual(p);
        expect(lineSpots(back as LineParams, N)).toEqual(lineSpots(p, N));
    });
});

/**
 * Whether Fit's `n` spots are evenly spaced as the line measures them: the same spots as its
 * interval laid from the start, the last of them on the line's end (not short of it, with the
 * last gap shorter)
 */
const fitsEvenly = (p: LineParams, n: number, digits: number) => {
    const fit = lineSpots(p, n);
    const laid = lineSpots(
        {
            ...p,
            spacing: {
                mode: "path",
                groups: [{ interval: lineInterval(p, n) }],
                anchor: "start",
            },
        },
        n,
    );
    expect(laid.at(-1)!.s!).toBeCloseTo(linePath(p).length, digits);
    fit.forEach((q, i) => {
        expect(q.x).toBeCloseTo(laid[i]!.x, digits);
        expect(q.y).toBeCloseTo(laid[i]!.y, digits);
    });
};

/** A small seeded generator, so a failure repeats */
const seeded = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
};

describe("Fit straight across round corners that hold no marcher", () => {
    it("keeps the last gap as long as the others (a run that would have jumped a corner)", () => {
        const p: LineParams = {
            points: [
                corner(3.3, 0.6),
                smooth(8.6, 10.2),
                smooth(16.3, 4),
                smooth(26.3, 7.9),
                corner(32.7, 5.1),
                corner(40.6, 11.6),
            ],
            spacing: { mode: "fit" },
            corners: false,
            measured: "straight",
        };
        fitsEvenly(p, 5, 6);
    });

    it("spreads random lines evenly, and reaches farther the longer the interval", () => {
        const random = seeded(527);
        for (let c = 0; c < 80; c++) {
            const count = 3 + Math.floor(random() * 4);
            let x = 0;
            const points = Array.from({ length: count }, (_, i) => {
                x += 2 + random() * 12;
                const y = random() * 14;
                return i === 0 || i === count - 1 || random() < 0.5
                    ? corner(x, y)
                    : smooth(x, y);
            });
            const p: LineParams = {
                points,
                spacing: { mode: "fit" },
                corners: false,
                measured: "straight",
            };
            const n = 3 + Math.floor(random() * 6);
            fitsEvenly(p, n, 4);
            const interval = lineInterval(p, n);

            // An interval on the path: the last marcher only ever moves on as it grows
            let reach = -Infinity;
            for (let k = 0.5; k <= 1.5; k += 0.05) {
                const spots = lineSpots(
                    {
                        ...p,
                        spacing: {
                            mode: "path",
                            groups: [{ interval: interval * k }],
                            anchor: "start",
                        },
                    },
                    n,
                );
                const last = spots.at(-1)!.s!;
                expect(last).toBeGreaterThanOrEqual(reach - 1e-9);
                reach = last;
            }
        }
    });
});
