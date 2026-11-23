import { describe, expect, it } from "vitest";
import {
    BADGE_HEIGHT,
    badgeWidth,
    alongFractions,
    classifyOrder,
    FADE_LEAD,
    FADE_TAIL,
    fadeAt,
    haloTone,
    haloWidth,
    laneHalfWidth,
    laneSamplePoints,
    ownHalfWidth,
    relativeLuminance,
    washAlpha,
    laneTip,
    neighborHalfWidths,
    placeNumbers,
    thinnedPositions,
    threadDarts,
    type Box,
    type PlacedBadge,
} from "../orderLane";
import type { XY } from "../orderSweep";

/** The order lane's drawing rules (pathways steps 4h and 4i) */

/** The dot's radius on screen at 100% */
const R = 3.26;
/** `count` marchers in a row, `gap` apart, left to right */
const row = (count: number, gap: number, y = 0): XY[] =>
    Array.from({ length: count }, (_, i) => ({ x: i * gap, y }));
/** A 4 × 4 box, 30 px apart: [rank][file], front rank first */
const BOX = Array.from({ length: 4 }, (_, r) =>
    Array.from({ length: 4 }, (_, f) => ({ x: f * 30, y: r * 30 })),
);

const tipOf = (points: string): XY => {
    const [, tip] = points.split(" ").map((p) => {
        const [x, y] = p.split(",").map(Number);
        return { x: x!, y: y! };
    });
    return tip!;
};

const boxOf = (b: PlacedBadge): Box => {
    const w = badgeWidth(b.text);
    return {
        minX: b.at.x - w / 2,
        minY: b.at.y - BADGE_HEIGHT / 2,
        maxX: b.at.x + w / 2,
        maxY: b.at.y + BADGE_HEIGHT / 2,
    };
};
const anyOverlap = (badges: readonly PlacedBadge[]) =>
    badges.some((a, i) =>
        badges.some((b, k) => {
            if (k <= i) return false;
            const p = boxOf(a);
            const q = boxOf(b);
            return (
                p.minX < q.maxX &&
                q.minX < p.maxX &&
                p.minY < q.maxY &&
                q.minY < p.maxY
            );
        }),
    );

describe("laneHalfWidth", () => {
    it("holds the dot, grows with it, and stops growing so it never becomes a slab", () => {
        expect(laneHalfWidth(1, 3, false)).toBe(4.2);
        expect(laneHalfWidth(R, 6, false)).toBeCloseTo(R + 5);
        expect(laneHalfWidth(20, 24, false)).toBe(11);
    });

    it("widens round the selection ring when the line is selected", () => {
        expect(laneHalfWidth(R, 7, true)).toBe(10);
        expect(laneHalfWidth(R, 7, true)).toBeGreaterThan(
            laneHalfWidth(R, 7, false),
        );
    });
});

describe("classifyOrder", () => {
    const r = row(6, 30);

    it("draws a row in order, either way, as a plain lane", () => {
        expect(classifyOrder(r, R)).toBe("lane");
        expect(classifyOrder([...r].reverse(), R)).toBe("lane");
    });

    it("an order that runs back over its own marchers is folded", () => {
        // Split: the back three first, then the front three
        expect(
            classifyOrder(
                [3, 4, 5, 0, 1, 2].map((i) => r[i]!),
                R,
            ),
        ).toBe("folded");
        // From the middle outward
        expect(
            classifyOrder(
                [2, 3, 1, 4, 0, 5].map((i) => r[i]!),
                R,
            ),
        ).toBe("folded");
    });

    it("a box in a snake, a reading order or a spiral is a plain lane", () => {
        const [a, b, c, d] = BOX;
        const snake = [
            ...a!,
            ...[...b!].reverse(),
            ...c!,
            ...[...d!].reverse(),
        ];
        const reading = [...a!, ...b!, ...c!, ...d!];
        const spiral = [
            ...a!,
            b![3]!,
            c![3]!,
            d![3]!,
            d![2]!,
            d![1]!,
            d![0]!,
            c![0]!,
            b![0]!,
            b![1]!,
            b![2]!,
            c![2]!,
            c![1]!,
        ];
        expect(classifyOrder(snake, R)).toBe("lane");
        expect(classifyOrder(reading, R)).toBe("lane");
        expect(classifyOrder(spiral, R)).toBe("lane");
    });

    it("an order whose legs cross is crossed", () => {
        const [a, b] = BOX;
        // Front left, back right, front right, back left: an X
        expect(classifyOrder([a![0]!, b![3]!, a![3]!, b![0]!], R)).toBe(
            "crossed",
        );
    });
});

describe("laneTip", () => {
    it("points past the leader, continuing the first leg outward", () => {
        const tip = laneTip(row(3, 30), 8)!;
        const point = tipOf(tip.points);
        expect(point.x).toBeLessThan(-8);
        expect(point.y).toBeCloseTo(0);
        expect(tip.box.maxX).toBeLessThan(0);
    });

    it("needs two marchers", () => {
        expect(laneTip([{ x: 0, y: 0 }], 8)).toBeNull();
    });
});

describe("darts", () => {
    it("a thread has one per leg long enough to hold it", () => {
        expect(
            threadDarts([
                { x: 0, y: 0 },
                { x: 20, y: 0 },
            ]),
        ).toEqual([]);
        expect(
            threadDarts([
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 0, y: 50 },
            ]),
        ).toHaveLength(2);
    });
});

describe("the fade (step 4i)", () => {
    it("runs from dark at the leader to pale at the tail, by distance along the line", () => {
        expect(fadeAt(0)).toBe(FADE_LEAD);
        expect(fadeAt(1)).toBe(FADE_TAIL);
        expect(fadeAt(0.5)).toBeCloseTo((FADE_LEAD + FADE_TAIL) / 2);
        // Out of range clamps
        expect(fadeAt(-1)).toBe(FADE_LEAD);
        expect(fadeAt(2)).toBe(FADE_TAIL);
        const along = alongFractions([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 40, y: 0 },
        ]);
        expect(along).toEqual([0, 0.25, 1]);
    });

    it("is strong enough to read on its own: at least 3:1 from leader to tail on a white field", () => {
        const grey = (alpha: number) => {
            const c = (v: number) => 255 - alpha * (255 - v);
            return relativeLuminance({ r: c(0x1c), g: c(0x1f), b: c(0x26) });
        };
        const lead = grey(FADE_LEAD);
        const tail = grey(FADE_TAIL);
        expect((tail + 0.05) / (lead + 0.05)).toBeGreaterThanOrEqual(3);
    });
});

describe("ownHalfWidth (step 4i)", () => {
    it("a lane through a box narrows so the ranks of a snake stay apart", () => {
        // A 4 × 4 box at 2 steps (about 15 px at 100%), its order snaking across the ranks
        const box = Array.from({ length: 4 }, (_, r) =>
            Array.from({ length: 4 }, (_, f) => ({ x: f * 15, y: r * 15 })),
        );
        const snake = box.flatMap((rank, r) =>
            r % 2 ? [...rank].reverse() : rank,
        );
        const hw = ownHalfWidth(snake, 8.26, R);
        expect(hw).toBeCloseTo(15 / 2 - 1.5);
        // The two ranks' lanes leave a gap between them
        expect(2 * hw).toBeLessThan(15);
        // At 30 px the lanes don't touch: nothing narrows
        expect(ownHalfWidth(BOX.flat(), 10, R)).toBe(10);
    });

    it("a straight row keeps its width, and nothing narrows below the dots", () => {
        expect(ownHalfWidth(row(6, 30), 8, R)).toBe(8);
        expect(ownHalfWidth(row(6, 4), 8, R)).toBe(R + 1.4);
        expect(ownHalfWidth(row(2, 30), 8, R)).toBe(8);
    });
});

describe("the wash (step 4i)", () => {
    it("is none on a white field and just enough on darker floors", () => {
        expect(washAlpha(Array(20).fill(0.98))).toBe(0);
        expect(washAlpha([])).toBe(0);
        const mid = washAlpha(Array(20).fill(0.5));
        // Brings a mid-gray floor up to the target under the lane
        expect(0.5 + mid * 0.5).toBeCloseTo(0.82, 2);
        // A black floor is lifted to the target; even black and white stripes never hide the floor
        expect(washAlpha(Array(20).fill(0))).toBeCloseTo(0.82);
        expect(
            washAlpha(Array.from({ length: 40 }, (_, i) => (i % 2 ? 1 : 0))),
        ).toBe(0.85);
    });

    it("calms a high-contrast pattern even where its darkest part is light enough", () => {
        const checker = Array.from({ length: 40 }, (_, i) =>
            i % 2 ? 0.95 : 0.35,
        );
        expect(washAlpha(checker)).toBeGreaterThan(0.7);
    });

    it("reads the floor along the lane's middle and both its edges", () => {
        const at = laneSamplePoints(row(2, 20), 10, 5);
        // 5 stops along a 20 px leg, three across each
        expect(at).toHaveLength(15);
        expect(Math.min(...at.map((p) => p.y))).toBeCloseTo(-8);
        expect(Math.max(...at.map((p) => p.y))).toBeCloseTo(8);
    });
});

describe("halos (step 4i)", () => {
    it("are dark round light dots and light round the rest, from the dot's color alone", () => {
        expect(haloTone({ r: 255, g: 0, b: 0 })).toBe("light");
        expect(haloTone({ r: 128, g: 128, b: 128 })).toBe("light");
        expect(haloTone({ r: 0, g: 0, b: 0 })).toBe("light");
        expect(haloTone({ r: 255, g: 255, b: 255 })).toBe("dark");
        expect(haloTone({ r: 255, g: 212, b: 0 })).toBe("dark");
    });

    it("thin when zoomed out, so a block of dots isn't one mass", () => {
        expect(haloWidth(1.5)).toBe(0.9);
        expect(haloWidth(3.26)).toBeCloseTo(1.63);
        expect(haloWidth(10)).toBe(2);
    });
});

describe("thinnedPositions", () => {
    it("numbers every marcher when they fit", () => {
        expect(thinnedPositions(6, 30)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it("thins like ruler labels, always keeping the leader and the tail", () => {
        const shown = thinnedPositions(20, 22);
        expect(shown[0]).toBe(0);
        expect(shown.at(-1)).toBe(19);
        expect(shown).toContain(3);
        expect(shown).not.toContain(2);
    });
});

describe("placeNumbers", () => {
    const base = { halfWidth: 8, dotRadius: R, busy: [] as Box[] };

    it("a plain lane's numbers sit on one rail below a line that runs across", () => {
        const points = row(6, 30);
        const { badges, crowded } = placeNumbers({
            ...base,
            points,
            kind: "lane",
            dots: points,
        });
        expect(crowded).toBe(false);
        expect(badges.map((b) => b.text)).toEqual([
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
        ]);
        expect(new Set(badges.map((b) => b.at.y)).size).toBe(1);
        expect(badges[0]!.at.y).toBeGreaterThan(0);
        expect(badges.map((b) => b.role)).toEqual([
            "leader",
            "middle",
            "middle",
            "middle",
            "middle",
            "tail",
        ]);
    });

    it("an order that doubles back numbers every marcher, staggering into a second row when one row is too tight", () => {
        const line = row(10, 14);
        const points = [9, 7, 5, 3, 1, 0, 2, 4, 6, 8].map((i) => line[i]!);
        const { badges, crowded } = placeNumbers({
            ...base,
            points,
            kind: "folded",
            dots: line,
        });
        expect(crowded).toBe(false);
        expect(badges).toHaveLength(10);
        expect(new Set(badges.map((b) => b.at.y)).size).toBeGreaterThan(1);
        expect(anyOverlap(badges)).toBe(false);
    });

    it("when even two rows can't fit, only the leader's and the tail's show and it says so", () => {
        const line = row(20, 7.33);
        const points = [...line].reverse().filter((_, i) => i % 2 === 0);
        const rest = [...line].reverse().filter((_, i) => i % 2 === 1);
        const { badges, crowded } = placeNumbers({
            ...base,
            // The names above the dots, as the field draws them
            busy: [{ minX: -20, minY: -30, maxX: 160, maxY: -6 }],
            points: [...points, ...rest.reverse()],
            kind: "folded",
            dots: line,
        });
        expect(crowded).toBe(true);
        expect(badges.map((b) => b.role)).toEqual(["leader", "tail"]);
    });

    it("keeps clear of labels and every other dot", () => {
        const points = row(3, 40);
        const label: Box = { minX: -10, minY: 6, maxX: 10, maxY: 30 };
        const stranger = { x: 40, y: 18 };
        const { badges } = placeNumbers({
            ...base,
            busy: [label],
            points,
            kind: "crossed",
            dots: [...points, stranger],
        });
        expect(badges).toHaveLength(3);
        const [first, second] = badges.map(boxOf);
        expect(
            first!.minX < label.maxX &&
                label.minX < first!.maxX &&
                first!.minY < label.maxY &&
                label.minY < first!.maxY,
        ).toBe(false);
        expect(
            Math.hypot(
                (second!.minX + second!.maxX) / 2 - stranger.x,
                (second!.minY + second!.maxY) / 2 - stranger.y,
            ),
        ).toBeGreaterThan(R + BADGE_HEIGHT / 2);
    });
});

describe("neighborHalfWidths", () => {
    it("narrows lanes of lines one row apart so they never touch, but never thinner than the dots", () => {
        const a = row(5, 22, 0);
        const b = row(5, 22, 14);
        const [ha, hb] = neighborHalfWidths([a, b], [8, 8], R);
        expect(ha! + hb!).toBeLessThan(14);
        expect(ha).toBeGreaterThan(R);
    });

    it("ignores a spot two lines share where they cross", () => {
        const across = row(5, 30);
        const down = [0, 1, 2, 3, 4].map((i) => ({ x: 60, y: (i - 2) * 30 }));
        const [h] = neighborHalfWidths([across, down], [8, 8], R);
        expect(h).toBe(8);
    });
});

describe("numbers beside another line", () => {
    it("never sit on a neighboring line's lane: they move to the other side", () => {
        // B runs one row above U, so B's rail below would land in U's lane
        const b = row(5, 22, 0);
        const u = row(5, 22, 14);
        const { badges } = placeNumbers({
            points: b,
            kind: "lane",
            halfWidth: 6,
            dotRadius: R,
            busy: [],
            dots: [...b, ...u],
            others: [{ points: u, halfWidth: 6 }],
        });
        expect(badges).toHaveLength(5);
        // U's lane reaches up to y = 14 - 6; no badge's box comes down into it
        for (const badge of badges)
            expect(badge.at.y + BADGE_HEIGHT / 2).toBeLessThanOrEqual(8);
        // The middle ones move above the line (the ends may sit beside it)
        for (const badge of badges.filter((b) => b.role === "middle"))
            expect(badge.at.y).toBeLessThan(0);
    });
});

describe("a stacked pair", () => {
    it("doesn't thin the numbers of the whole lane", () => {
        const points = [...row(8, 30), { x: 210, y: 0.5 }];
        const { badges } = placeNumbers({
            points,
            kind: "lane",
            halfWidth: 8,
            dotRadius: R,
            busy: [],
            dots: points,
        });
        // All but the one stacked on the 8th are numbered
        expect(badges.length).toBeGreaterThanOrEqual(8);
    });
});
