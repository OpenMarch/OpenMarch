import { describe, expect, it } from "vitest";
import { lineTool } from "../lineTool";
import { isLineParams, lineSpots, type LineParams } from "../lineGeometry";
import { chipLayout } from "../../editor/chip";
import {
    edgeSplitOf,
    switchModes,
    withEdge,
    withMode,
} from "../../distribute/modes";
import {
    boxesAt,
    closedUpParams,
    withoutMembers,
    type PlacedBox,
    type PlacedRecipe,
} from "../../placed/placedBox";
import { placementOf } from "../../tool/shapePlacement";
import type { ToolEnv } from "../../tool/toolKind";
import {
    edit,
    finishPoints,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    targetsOf,
    undo,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * Closing a Line and filling it (#529, spec #522), through the shape session with the real kind:
 * a click on the first point, an end dropped on the other or Close in the editor closes it; a
 * closed line has a gap per marcher, offers the host's Grid, Outline and Spread (with Edge), and
 * Open turns it back into a line through the same spots.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    pull: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

/** A press and release where it pressed, the pointer moving there first as a hover does */
function click(t: ToolState, at: XY): ToolState {
    t = pointerMove(t, at, env);
    t = press(t, at, env);
    return release(t, ctx, { double: false });
}

/** Points clicked one after another, the run left going */
function clicking(n: number, points: readonly XY[]): ToolState {
    let t = openTool(lineTool, marchers(n));
    for (const p of points) t = click(t, p);
    return t;
}

const SQUARE = [
    { x: 100, y: 100 },
    { x: 140, y: 100 },
    { x: 140, y: 140 },
    { x: 100, y: 140 },
];
/** A 4 × 4 step square, closed by a click on its first point */
const square = (n = 8) => click(clicking(n, SQUARE), { x: 101, y: 99 });

const paramsOf = (t: ToolState) => t.params as LineParams;
const pointsOf = (t: ToolState) =>
    paramsOf(t).points.map(({ x, y }) => ({ x, y }));
const spotsOf = (t: ToolState) => slotsOf(t, ctx).map(({ x, y }) => ({ x, y }));
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
/** Each spot to the next, the last back to the first */
const gapsRound = (spots: readonly XY[]) =>
    spots.map((s, i) => dist(s, spots[(i + 1) % spots.length]!));
const expectNear = (a: readonly XY[], b: readonly XY[]) => {
    expect(a).toHaveLength(b.length);
    a.forEach((p, i) => {
        expect(p.x).toBeCloseTo(b[i]!.x, 6);
        expect(p.y).toBeCloseTo(b[i]!.y, 6);
    });
};
/** The same spots, in any order */
const expectSameSpots = (a: readonly XY[], b: readonly XY[]) => {
    const key = (p: XY) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
    expect(a.map(key).sort()).toEqual(b.map(key).sort());
};
const choice = (key: string) => lineTool.choices!.find((c) => c.key === key)!;
const picked = (t: ToolState, key: string, value: string) =>
    edit(t, choice(key).pick(t.params, t.spots, value, env), ctx);
const shown = (t: ToolState, key: string) =>
    choice(key).shown?.(t.params, t.spots) ?? true;
const interval = lineTool.params.find((p) => p.key === "interval")!;
const inMode = (t: ToolState, mode: "files" | "outline" | "spread") =>
    edit(t, withMode(lineTool, t.params, t.spots, mode, env), ctx);
const modesOf = (t: ToolState) =>
    switchModes(lineTool, { params: t.params, n: t.spots });
const inside = (spots: readonly XY[]) =>
    spots.every(
        (s) =>
            s.x >= 100 - 1e-6 &&
            s.x <= 140 + 1e-6 &&
            s.y >= 100 - 1e-6 &&
            s.y <= 140 + 1e-6,
    );

describe("closing a line", () => {
    it("closes with a click on the first point, as one undo step", () => {
        const t = square();
        expect(t.gesture).toBeNull();
        expect(paramsOf(t).closed).toBe(true);
        expect(pointsOf(t)).toEqual(SQUARE);
        expect(targetsOf(t, ctx)).toHaveLength(8);
        expect(t.past).toHaveLength(1);
        expect(undo(t).params).toBeNull();
    });

    it("previews the closed line with the pointer on the first point", () => {
        const t = pointerMove(clicking(8, SQUARE), { x: 101, y: 99 }, env);
        expect(t.gesture?.type).toBe("points");
        expect(paramsOf(t).closed).toBe(true);
    });

    it("closes when an end is dropped on the other, the two made one point", () => {
        let t = finishPoints(clicking(8, [...SQUARE, { x: 100, y: 110 }]), ctx);
        expect(paramsOf(t).closed).toBeFalsy();
        const end = lineTool
            .handles(t.params, t.spots)
            .find((h) => h.key === "p4")!;
        t = press(t, end.at, env);
        t = pointerMove(t, { x: 101, y: 101 }, env);
        t = release(t, ctx);
        expect(paramsOf(t).closed).toBe(true);
        expect(pointsOf(t)).toEqual(SQUARE);
    });

    it("closes and opens with the editor's choice, once there are three points", () => {
        const two = finishPoints(clicking(8, SQUARE.slice(0, 2)), ctx);
        expect(shown(two, "ends")).toBe(false);
        const open = finishPoints(clicking(8, SQUARE), ctx);
        expect(shown(open, "ends")).toBe(true);
        expect(choice("ends").current(open.params, 8)).toBe("open");
        const closed = picked(open, "ends", "closed");
        expect(paramsOf(closed).closed).toBe(true);
        expect(choice("ends").current(closed.params, 8)).toBe("closed");
        expect(undo(closed).params).toBe(open.params);
    });

    it("has a gap for every marcher, the last back to the first", () => {
        const t = square();
        const spots = spotsOf(t);
        expect(spots).toHaveLength(8);
        // Every corner holds a marcher, two gaps a side
        gapsRound(spots).forEach((g) => expect(g).toBeCloseTo(20, 6));
        for (const c of SQUARE)
            expect(spots.some((s) => dist(s, c) < 1e-6)).toBe(true);
        expect(
            chipLayout(lineTool, t.params, 8, env).intervals[0]!.display,
        ).toBe("2");
    });

    it("runs the intervals round the corners with the switch off", () => {
        // 10 marchers round 16 steps: every 1.6 steps along it, from the first corner
        const spots = spotsOf(picked(square(10), "corners", "off"));
        expect(spots).toHaveLength(10);
        expectNear(spots.slice(0, 4), [
            { x: 100, y: 100 },
            { x: 116, y: 100 },
            { x: 132, y: 100 },
            { x: 140, y: 108 },
        ]);
    });

    it("keeps a typed interval all the way round, grown from its pivot", () => {
        let t = picked(square(10), "corners", "off");
        t = edit(t, interval.type(t.params, 10, "3", env), ctx);
        // Ten gaps of 3 steps along the outline, round its corners
        const sides = gapsRound(pointsOf(t));
        sides.forEach((side) => expect(side).toBeCloseTo(75, 6));
        const s = lineSpots(paramsOf(t), 10).map((spot) => spot.s!);
        s.slice(1).forEach((x, i) => expect(x - s[i]!).toBeCloseTo(30, 6));
        // Grown from its center, which stays put
        const xs = pointsOf(t).map((p) => p.x);
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(120, 6);
    });

    it("drops Interval on the path from the spacing menu once closed", () => {
        const values = (t: ToolState) =>
            choice("spacing")
                .options(t.params, t.spots)
                .map((o) => o.value);
        expect(values(finishPoints(clicking(8, SQUARE), ctx))).toContain(
            "path-start",
        );
        expect(values(square())).toEqual(["fit", "keep"]);
    });
});

describe("filling a closed line", () => {
    it("offers the host's modes only once it's closed", () => {
        expect(modesOf(finishPoints(clicking(8, SQUARE), ctx))).toEqual([]);
        expect(modesOf(square())).toEqual(["files", "outline", "spread"]);
    });

    it("is its outline until another mode is picked", () => {
        const t = square();
        expect(withMode(lineTool, t.params, 8, "outline", env)).toBe(t.params);
    });

    it("fills a grid inside it from the host's distributor", () => {
        const t = inMode(square(9), "files");
        const spots = spotsOf(t);
        expect(spots).toHaveLength(9);
        expect(inside(spots)).toBe(true);
        // A square grid as wide as fits: 3 × 3, 2 steps apart, filling the square
        const xs = [...new Set(spots.map((s) => Math.round(s.x * 1e6) / 1e6))];
        expect(xs.sort((a, b) => a - b)).toEqual([100, 120, 140]);
        expect(
            chipLayout(lineTool, t.params, 9, env).intervals[0]!.display,
        ).toBe("2");
        // Its spacing follows the outline: the outline's menus are put away
        expect(shown(t, "spacing")).toBe(false);
        expect(shown(t, "corners")).toBe(false);
        expect(pointsOf(t)).toEqual(SQUARE);
    });

    it("grows the outline from its pivot when Grid's spacing is typed", () => {
        let t = inMode(square(9), "files");
        t = edit(t, interval.type(t.params, 9, "3", env), ctx);
        const xs = pointsOf(t).map((p) => p.x);
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(60, 6);
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(120, 6);
        const spots = spotsOf(t);
        expect(dist(spots[0]!, spots[1]!)).toBeCloseTo(30, 6);
    });

    it("leaves a short back rank when the grid has more spots than marchers", () => {
        const spots = spotsOf(inMode(square(8), "files"));
        expect(spots).toHaveLength(8);
        expect(inside(spots)).toBe(true);
        // 3 × 3 with one off the back rank, which runs across the field at the back (the
        // frame square to the field, as a box's)
        const back = Math.min(...spots.map((s) => s.y));
        const backRank = spots.filter((s) => Math.abs(s.y - back) < 1e-6);
        expect(backRank).toHaveLength(2);
    });

    it("spreads over it, with its edge on", () => {
        let t = inMode(square(12), "spread");
        let spots = spotsOf(t);
        expect(spots).toHaveLength(12);
        expect(inside(spots)).toBe(true);
        t = edit(t, withEdge(lineTool, t.params, 12, true, env), ctx);
        spots = spotsOf(t);
        expect(inside(spots)).toBe(true);
        const split = edgeSplitOf(lineTool, t.params, 12)!;
        expect(split.edge + split.inside).toBe(12);
        // A spot on every corner
        for (const c of SQUARE)
            expect(spots.some((s) => dist(s, c) < 1e-6)).toBe(true);
    });

    it("fills the same outline the same way however it was clicked", () => {
        // A 6 × 3 step rectangle, clicked from three corners, both ways round
        const A = { x: 100, y: 100 };
        const B = { x: 160, y: 100 };
        const C = { x: 160, y: 130 };
        const D = { x: 100, y: 130 };
        const orders = [
            [A, B, C, D],
            [C, B, A, D],
            [B, C, D, A],
        ];
        const closedFrom = (pts: XY[], n: number) =>
            click(clicking(n, pts), { x: pts[0]!.x + 1, y: pts[0]!.y });
        for (const mode of ["files", "spread"] as const) {
            const [first, ...others] = orders.map((pts) =>
                spotsOf(inMode(closedFrom(pts, 9), mode)),
            );
            for (const spots of others) expectSameSpots(spots, first!);
        }
        // Ranks square to the field: Grid's rows run across it
        const grid = spotsOf(inMode(closedFrom(orders[1]!, 8), "files"));
        const rows = new Set(grid.map((s) => s.y.toFixed(6)));
        expect(rows.size).toBeLessThan(grid.length / 2);
    });

    it("centres Grid's spots in the outline, no rank left empty", () => {
        const RECT = [
            { x: 100, y: 100 },
            { x: 160, y: 100 },
            { x: 160, y: 130 },
            { x: 100, y: 130 },
        ];
        const spots = spotsOf(
            inMode(click(clicking(9, RECT), { x: 101, y: 99 }), "files"),
        );
        expect(spots).toHaveLength(9);
        const mid = (vs: number[]) => (Math.min(...vs) + Math.max(...vs)) / 2;
        expect(mid(spots.map((s) => s.x))).toBeCloseTo(130, 6);
        expect(mid(spots.map((s) => s.y))).toBeCloseTo(115, 6);
        // The grid's phase with the fewest spots that still fit: two ranks of 5, 15 apart, one
        // off the back, never a back rank of one
        const ranks = new Map<string, number>();
        for (const s of spots)
            ranks.set(s.y.toFixed(6), (ranks.get(s.y.toFixed(6)) ?? 0) + 1);
        expect([...ranks.values()]).toEqual([4, 5]);
        // Spread over the outline: no third of it left empty
        for (const third of [0, 1, 2])
            expect(
                spots.some(
                    (s) =>
                        s.x >= 100 + third * 20 - 1e-6 &&
                        s.x <= 120 + third * 20 + 1e-6,
                ),
            ).toBe(true);
    });

    // Grid's spots on a polygon are part of the recipe format (ADR 0006): a change to them
    // needs a new version, as the spread generator's do
    it.each([
        [
            "a 6 × 3 step rectangle",
            [
                [100, 100],
                [160, 100],
                [160, 130],
                [100, 130],
            ],
            9,
            [
                [115, 107.5],
                [130, 107.5],
                [145, 107.5],
                [160, 107.5],
                [100, 122.5],
                [115, 122.5],
                [130, 122.5],
                [145, 122.5],
                [160, 122.5],
            ],
        ],
        [
            "a hexagon, re-centred once its back rank comes off",
            [
                [105, 100],
                [115, 100],
                [120, 112.5],
                [115, 125],
                [105, 125],
                [100, 112.5],
            ],
            10,
            [
                [103.75, 103.125],
                [110, 103.125],
                [116.25, 103.125],
                [103.75, 109.375],
                [110, 109.375],
                [116.25, 109.375],
                [103.75, 115.625],
                [110, 115.625],
                [116.25, 115.625],
                [110, 121.875],
            ],
        ],
    ])("keeps Grid's spots in %s", (_name, outline, n, want) => {
        const params: LineParams = {
            points: outline.map(([x, y]) => ({ x: x!, y: y!, tension: 0 })),
            closed: true,
            spacing: { mode: "fit" },
            distribution: { mode: "files", oddGap: "center" },
        };
        expect(isLineParams(params)).toBe(true);
        expectNear(
            lineTool.shape.generate(params, n, ctx),
            want.map(([x, y]) => ({ x: x!, y: y! })),
        );
    });

    it("fills an L the same way", () => {
        const L = [
            { x: 100, y: 100 },
            { x: 120, y: 100 },
            { x: 120, y: 120 },
            { x: 140, y: 120 },
            { x: 140, y: 140 },
            { x: 100, y: 140 },
        ];
        const t = inMode(click(clicking(10, L), { x: 100, y: 100 }), "files");
        const spots = spotsOf(t);
        expect(spots).toHaveLength(10);
        // None in the missing corner
        expect(spots.some((s) => s.x > 120 + 1e-6 && s.y < 120 - 1e-6)).toBe(
            false,
        );
    });
});

describe("opening a closed line", () => {
    it("keeps the outline's spots", () => {
        const closed = square();
        const opened = picked(closed, "ends", "open");
        expect(paramsOf(opened).closed).toBeFalsy();
        expectNear(spotsOf(opened), spotsOf(closed));
    });

    it("keeps the outline's spots on uneven sides, corners held", () => {
        const RECT = [
            { x: 100, y: 100 },
            { x: 150, y: 100 },
            { x: 150, y: 120 },
            { x: 100, y: 120 },
        ];
        const closed = click(clicking(9, RECT), { x: 100, y: 100 });
        const opened = picked(closed, "ends", "open");
        expectSameSpots(spotsOf(opened), spotsOf(closed));
    });

    it("opens a grid to the spots its outline has", () => {
        const outline = spotsOf(square());
        const opened = picked(inMode(square(), "files"), "ends", "open");
        expect(paramsOf(opened).distribution).toBeUndefined();
        expectNear(spotsOf(opened), outline);
    });
});

describe("a closed line with mixed groups (#526)", () => {
    /** A 6 × 6 step square, closed by a click on its first point */
    const SIX = [
        { x: 100, y: 100 },
        { x: 160, y: 100 },
        { x: 160, y: 160 },
        { x: 100, y: 160 },
    ];
    const six = (n = 9) => click(clicking(n, SIX), { x: 101, y: 99 });
    // 4 marchers 2 steps apart, the rest 3: the top side holds the 2-step gaps, every other
    // side two 3-step gaps, the closing gap the seam between the last group and the first
    // Typed, then locked (Keep interval): typing alone leaves the interval unlocked
    const grouped = (t: ToolState, n = 9) => {
        const typed = edit(t, interval.type(t.params, n, "4*2+3", env), ctx);
        return edit(typed, lineTool.lock!.toggle(typed.params, n, env), ctx);
    };
    const GAPS = [20, 20, 20, 30, 30, 30, 30, 30, 30];

    it("runs the groups once round in Outline + Keep interval, from the first point", () => {
        const t = grouped(six());
        expect(paramsOf(t).spacing).toEqual({
            mode: "keep",
            groups: [{ interval: 20, count: 4 }, { interval: 30 }],
        });
        expect(isLineParams(paramsOf(t))).toBe(true);
        // Already as long as its gaps round: the outline stays, every corner holds a marcher
        expect(pointsOf(t)).toEqual(SIX);
        const spots = spotsOf(t);
        gapsRound(spots).forEach((g, i) => expect(g).toBeCloseTo(GAPS[i]!, 6));
        for (const c of SIX)
            expect(spots.some((s) => dist(s, c) < 1e-6)).toBe(true);
        expect(lineTool.groups!.shown(t.params, 9, STEP)).toHaveLength(2);
    });

    it("gives the closing segment the gaps that fall on it, corners off", () => {
        const t = grouped(picked(six(), "corners", "off"));
        gapsRound(spotsOf(t)).forEach((g, i) =>
            expect(g).toBeCloseTo(GAPS[i]!, 6),
        );
    });

    it("keeps the groups' proportions round the same outline in Fit, unlocked", () => {
        const t = picked(grouped(six()), "spacing", "fit");
        expect(paramsOf(t).spacing).toEqual({
            mode: "fit",
            groups: [{ interval: 20, count: 4 }, { interval: 30 }],
        });
        expect(isLineParams(paramsOf(t))).toBe(true);
        expect(pointsOf(t)).toEqual(SIX);
        // As long round as its groups: the same gaps, every corner on a marcher
        expect(spotsOf(t)).toHaveLength(9);
        gapsRound(spotsOf(t)).forEach((g, i) =>
            expect(g).toBeCloseTo(GAPS[i]!, 6),
        );
        for (const c of SIX)
            expect(spotsOf(t).some((s) => dist(s, c) < 1e-6)).toBe(true);
    });

    it("keeps its groups when an open line with them is closed", () => {
        let t = finishPoints(clicking(9, SIX), ctx);
        t = grouped(t);
        t = picked(t, "ends", "closed");
        expect(paramsOf(t).closed).toBe(true);
        expect(paramsOf(t).spacing).toEqual({
            mode: "keep",
            groups: [{ interval: 20, count: 4 }, { interval: 30 }],
        });
        expect(spotsOf(t)).toHaveLength(9);
        // Grown as a whole to its gaps round
        expect(gapsRound(spotsOf(t)).reduce((a, b) => a + b, 0)).toBeCloseTo(
            240,
            6,
        );
    });

    it("hides the group chips once it's filled", () => {
        const t = inMode(grouped(six()), "files");
        expect(lineTool.groups!.shown(t.params, 9, STEP)).toBeNull();
        expect(spotsOf(t)).toHaveLength(9);
    });

    it("opens to the outline's spots, its groups kept", () => {
        const closed = grouped(six());
        const opened = picked(closed, "ends", "open");
        expect(paramsOf(opened).closed).toBeFalsy();
        expect(paramsOf(opened).spacing).toEqual(paramsOf(closed).spacing);
        expectSameSpots(spotsOf(opened), spotsOf(closed));
    });
});

describe("a placed closed line", () => {
    const N = 9;
    function recipeOf(t: ToolState): PlacedRecipe {
        const placement = placementOf(t, ctx)!;
        return {
            ...placement.recipe,
            id: 1,
            timelineId: 10,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        };
    }
    const readBack = (recipe: PlacedRecipe) => {
        const at = new Map(recipe.members.map((m) => [m.marcherId, m]));
        const [placed] = boxesAt({
            recipes: [recipe],
            endBeatOf: () => 8,
            beat: 8,
            positionOf: (id) => at.get(id),
        });
        return placed as PlacedBox<LineParams> | undefined;
    };

    it.each(["outline", "files", "spread"] as const)(
        "reopens closed, in %s",
        (mode) => {
            const t = inMode(square(N), mode);
            const recipe = recipeOf(t);
            const placed = readBack(recipe)!;
            expect(placed.kind).toBe(lineTool);
            expect(placed.params.closed).toBe(true);
            expect(placed.params).toEqual(JSON.parse(JSON.stringify(t.params)));
            expect(
                switchModes(lineTool, { params: placed.params, n: N }),
            ).toHaveLength(3);
            expectSameSpots(
                lineTool.shape.generate(placed.params, N, ctx),
                spotsOf(t),
            );
        },
    );

    it("closes up in Outline + Keep interval with even gaps, grown from its pivot", () => {
        let t = picked(square(N), "corners", "off");
        t = edit(t, interval.type(t.params, N, "2", env), ctx);
        t = edit(t, lineTool.lock!.toggle(t.params, N, env), ctx);
        const placed = readBack(withoutMembers(recipeOf(t), [5]))!;
        const params = closedUpParams(placed, N - 1, env) as LineParams;
        const spots = lineTool.shape.generate(params, N - 1, ctx);
        expect(spots).toHaveLength(N - 1);
        // The hole closes all the way round: every gap the interval, the last back to the first
        gapsRound(spots).forEach((g) => expect(g).toBeCloseTo(20, 6));
        const xs = params.points.map((p) => p.x);
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(120, 6);
    });

    it.each([
        [
            "a fill on an open line",
            (p: LineParams) => {
                const { closed: _closed, ...open } = p;
                return open;
            },
        ],
        [
            "a fill this version doesn't know",
            (p: LineParams) => ({ ...p, distribution: { mode: "rings" } }),
        ],
        [
            "a closed line with a run on the path",
            (p: LineParams) => ({
                ...p,
                spacing: {
                    mode: "path",
                    groups: [{ interval: 20 }],
                    anchor: "start",
                },
            }),
        ],
        [
            "a closed line of two points",
            (p: LineParams) => ({ ...p, points: p.points.slice(0, 2) }),
        ],
    ])("reads %s as plain positions", (_name, change) => {
        const recipe = recipeOf(inMode(square(N), "files"));
        const { spots: _spots, ...params } = recipe.params as LineParams & {
            spots: number;
        };
        const changed = change(params as LineParams);
        expect(isLineParams(changed)).toBe(false);
        expect(
            readBack({ ...recipe, params: { ...changed, spots: N } }),
        ).toBeUndefined();
    });
});

describe("a closed line and Measured (#527)", () => {
    it("is laid out along the path whatever axis it says, and offers no axis", () => {
        const t = square();
        const measured = edit(t, { ...paramsOf(t), measured: "x" }, ctx);
        expect(isLineParams(measured.params)).toBe(true);
        expectNear(spotsOf(measured), spotsOf(t));
        expect(shown(t, "measured")).toBe(true);
        const options = choice("measured").options(t.params, t.spots);
        expect(options.find((o) => o.value === "straight")!.disabled).toBe(
            undefined,
        );
        expect(options.find((o) => o.value === "x")!.disabled).toBeDefined();
        expect(options.find((o) => o.value === "y")!.disabled).toBeDefined();
    });

    it("hides the Measured menu once filled", () => {
        expect(shown(inMode(square(9), "files"), "measured")).toBe(false);
    });
});
