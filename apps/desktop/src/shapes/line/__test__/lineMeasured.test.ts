import { describe, expect, it } from "vitest";
import { lineTool } from "../lineTool";
import {
    isLineParams,
    lineSpots,
    onLine,
    type LineParams,
    type LinePoint,
} from "../lineGeometry";
import { chipLayout } from "../../editor/chip";
import { scaleReadout } from "../../frame/scale";
import { turnShape } from "../../frame/gestures";
import { boxesAt, type PlacedRecipe } from "../../placed/placedBox";
import { placementOf } from "../../tool/shapePlacement";
import { paramGlyph, type ToolEnv } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * The Line's Measured setting (#527, spec #522): an interval is measured along the path between
 * neighbors by default; Straight across makes it the distance from marcher to marcher, ↔ how far
 * apart they are side to side, x exactly on the step grid, and ↕ front to back. Driven through the shape session with the real kind.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
/** Yard lines 8 steps apart, and a hash */
const YARDS = [0, 80, 160];
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    pull: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
    fieldLines: { x: YARDS, y: [263] },
    pullRadius: 2,
};
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

function drawn(n: number, from: XY, to: XY): ToolState {
    let t = openTool(lineTool, marchers(n));
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    return release(t, ctx);
}

const paramsOf = (t: ToolState) => t.params as LineParams;
const spotsOf = (t: ToolState) => slotsOf(t, ctx).map(({ x, y }) => ({ x, y }));
const interval = lineTool.params.find((p) => p.key === "interval")!;
const spacing = lineTool.choices!.find((c) => c.key === "spacing")!;
const measured = lineTool.choices!.find((c) => c.key === "measured")!;
const typed = (t: ToolState, text: string) =>
    edit(t, interval.type(t.params, t.spots, text, env), ctx);
/** The interval locked (Keep interval) as its button does, one change; as it is when it is */
const locked = (t: ToolState) =>
    lineTool.lock!.locked(t.params, t.spots)
        ? t
        : edit(t, lineTool.lock!.toggle(t.params, t.spots, env), ctx);
/** Typed, then locked: typing alone leaves the interval unlocked (owner decision on #522) */
const kept = (t: ToolState, text: string) => locked(typed(t, text));
const picked = (t: ToolState, value: string) =>
    edit(t, spacing.pick(t.params, t.spots, value, env), ctx);
const measuredBy = (t: ToolState, value: string) =>
    edit(t, measured.pick(t.params, t.spots, value, env), ctx);
const glyphOf = (t: ToolState) => paramGlyph(interval, t.params, t.spots);
const chip = (t: ToolState) =>
    chipLayout(lineTool, t.params, t.spots, env).intervals[0]!.display;
const reasonOf = (t: ToolState, value: string) =>
    measured.options(t.params, t.spots).find((o) => o.value === value)!
        .disabled;
const gapsOf = (values: readonly number[]) =>
    values.slice(1).map((v, i) => v - values[i]!);
/** Whether every spot is on the straight line through `a` and `b` */
const onLineThrough = (spots: readonly XY[], a: XY, b: XY) =>
    spots.every(
        (p) =>
            Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) <
            1e-6,
    );
const corner = (x: number, y: number): LinePoint => ({ x, y, tension: 0 });

/** A diagonal from the 0 yard line to the 80 one, 6 steps deep */
const diagonal = (n = 5) => drawn(n, { x: 1, y: 100 }, { x: 79, y: 160 });
/** A diagonal off the yard lines */
const offYards = (n = 5) => drawn(n, { x: 20, y: 100 }, { x: 60, y: 180 });

describe("the Measured menu", () => {
    it("offers along the path, straight across, ↔ and ↕, along the path by default with no mark", () => {
        const t = offYards();
        expect(measured.options(t.params, t.spots).map((o) => o.value)).toEqual(
            ["along", "straight", "x", "y", "offset"],
        );
        expect(measured.options(t.params, t.spots).map((o) => o.label)).toEqual(
            [
                "Along the path",
                "Straight across",
                "↔ Side to side",
                "↕ Front to back",
                "Offset",
            ],
        );
        expect(measured.current(t.params, t.spots)).toBe("along");
        expect(paramsOf(t).measured).toBeUndefined();
        expect(glyphOf(t)).toBeNull();
        expect(scaleReadout(lineTool, t.params, t.spots, env)).not.toMatch(
            /[↔↕]/,
        );
    });

    it("shows ↔ or ↕ before the interval once picked", () => {
        expect(glyphOf(measuredBy(offYards(), "x"))).toBe("↔");
        expect(glyphOf(measuredBy(offYards(), "y"))).toBe("↕");
        expect(glyphOf(measuredBy(measuredBy(offYards(), "x"), "along"))).toBe(
            null,
        );
        const back = measuredBy(measuredBy(offYards(), "x"), "along");
        expect("measured" in paramsOf(back)).toBe(false);
    });

    it("stores straight across, with no mark, and back to along the path stores nothing", () => {
        const t = measuredBy(offYards(), "straight");
        expect(paramsOf(t).measured).toBe("straight");
        expect(measured.current(t.params, t.spots)).toBe("straight");
        expect(glyphOf(t)).toBeNull();
        const back = measuredBy(t, "along");
        expect("measured" in paramsOf(back)).toBe(false);
    });
});

describe("↔: neighbors the interval apart side to side", () => {
    it("puts x exactly an interval apart and on the step grid, y where the line puts it", () => {
        const t = kept(measuredBy(offYards(), "x"), "1.5");
        expect(paramsOf(t).spacing.mode).toBe("keep");
        const spots = spotsOf(t);
        expect(gapsOf(spots.map((p) => p.x))).toEqual([15, 15, 15, 15]);
        for (const p of spots) expect(p.x % half).toBe(0);
        // Still on the line as drawn, y wherever it puts them
        expect(onLineThrough(spots, { x: 20, y: 100 }, { x: 60, y: 180 })).toBe(
            true,
        );
        expect(chip(t)).toBe("1½");
    });

    it("moves a run that grows off the grid onto it, along the line", () => {
        // 4 marchers 1½ steps apart from the center at 40: x from 17.5, landed on 20
        const t = kept(measuredBy(offYards(4), "x"), "1.5");
        const xs = spotsOf(t).map((p) => p.x);
        expect(xs).toEqual([20, 35, 50, 65]);
        expect(paramsOf(t).points[0]!.x).toBe(20);
        expect(
            onLineThrough(spotsOf(t), { x: 20, y: 100 }, { x: 60, y: 180 }),
        ).toBe(true);
    });

    it("keeps its ends in Fit, the interval worked out side to side", () => {
        const t = measuredBy(offYards(), "x");
        expect(paramsOf(t).points).toEqual(paramsOf(offYards()).points);
        expect(spotsOf(t).map((p) => p.x)).toEqual([20, 30, 40, 50, 60]);
        // 4 steps across over 4 gaps, though the line is longer than that
        expect(chip(t)).toBe("1");
    });

    it("keeps the same number when picked in Keep interval, now measured across", () => {
        const keptLine = kept(offYards(), "2");
        const t = measuredBy(keptLine, "x");
        expect(chip(t)).toBe("2");
        expect(gapsOf(spotsOf(t).map((p) => p.x))).toEqual([20, 20, 20, 20]);
        // And back: 2 steps along the line again (straight across too, on a straight line)
        const back = measuredBy(t, "along");
        const spots = spotsOf(back);
        for (let i = 1; i < spots.length; i++)
            expect(
                Math.hypot(
                    spots[i]!.x - spots[i - 1]!.x,
                    spots[i]!.y - spots[i - 1]!.y,
                ),
            ).toBeCloseTo(20, 9);
    });

    it("keeps the interval across when an end is dragged in Keep interval", () => {
        let t = kept(measuredBy(diagonal(), "x"), "2");
        const end = lineTool.handles(t.params, t.spots)[1]!;
        t = press(t, end.at, env);
        t = pointerMove(t, { x: end.at.x - 20, y: end.at.y + 40 }, env);
        t = release(t, ctx);
        expect(paramsOf(t).measured).toBe("x");
        expect(gapsOf(spotsOf(t).map((p) => p.x))).toEqual([20, 20, 20, 20]);
    });

    it("lays a run on the path from its anchor, x on the grid", () => {
        // 8 steps across; a run of 4 × 1½ = 6 steps
        const run = (anchor: string) =>
            spotsOf(
                kept(
                    picked(measuredBy(diagonal(), "x"), `path-${anchor}`),
                    "1.5",
                ),
            ).map((p) => p.x);
        expect(run("start")).toEqual([0, 15, 30, 45, 60]);
        expect(run("end")).toEqual([20, 35, 50, 65, 80]);
        expect(run("center")).toEqual([10, 25, 40, 55, 70]);
        // 4 × 1¾ = 7 steps: centered it would start at ½ step, which is on the grid
        const odd = spotsOf(
            kept(picked(measuredBy(diagonal(), "x"), "path-center"), "1.75"),
        ).map((p) => p.x);
        expect(odd[0]).toBe(5);
        expect(gapsOf(odd)).toEqual([17.5, 17.5, 17.5, 17.5]);
    });
});

describe("↕: the same front to back", () => {
    it("puts y exactly an interval apart and on the step grid", () => {
        const t = kept(measuredBy(offYards(), "y"), "2");
        const spots = spotsOf(t);
        expect(gapsOf(spots.map((p) => p.y))).toEqual([20, 20, 20, 20]);
        for (const p of spots) expect(p.y % half).toBe(0);
        expect(onLineThrough(spots, { x: 20, y: 100 }, { x: 60, y: 180 })).toBe(
            true,
        );
    });
});

describe("greyed out on a line that isn't one way", () => {
    it("can't measure across a line that runs straight front to back", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 100, y: 180 });
        expect(reasonOf(t, "x")).toBe("The line doesn't go side to side");
        expect(reasonOf(t, "y")).toBeUndefined();
        expect(reasonOf(t, "along")).toBeUndefined();
        expect(reasonOf(t, "straight")).toBeUndefined();
        expect(measured.pick(t.params, t.spots, "x", env)).toBe(t.params);
    });

    it("can't measure along a way the line turns back", () => {
        const zigzag: LineParams = {
            points: [corner(0, 0), corner(40, 40), corner(80, 0)],
            spacing: { mode: "fit" },
        };
        expect(measured.options(zigzag, 5)[2]!.disabled).toBeUndefined();
        expect(measured.options(zigzag, 5)[3]!.disabled).toBe(
            "The line turns back front to back",
        );
        const back: LineParams = {
            ...zigzag,
            points: [corner(0, 0), corner(40, 40), corner(20, 80)],
        };
        expect(measured.options(back, 5)[2]!.disabled).toBe(
            "The line turns back side to side",
        );
    });

    it("lays a line with corners out across when it goes one way", () => {
        // A bent line, as clicking points will draw: x still only goes right
        const bent: LineParams = {
            points: [corner(0, 0), corner(30, 40), corner(80, 50)],
            spacing: { mode: "keep", groups: [{ interval: 20 }] },
            measured: "x",
            // The intervals run around the corner
            corners: false,
        };
        const spots = lineSpots(bent, 5, STEP);
        expect(spots.map((p) => p.x)).toEqual([0, 20, 40, 60, 80]);
        // Each on its own segment of the bend
        expect(spots[1]!.y).toBeCloseTo((20 * 40) / 30, 9);
        expect(spots[2]!.y).toBeCloseTo(40 + (10 * 10) / 50, 9);
        expect(spots.map((p) => p.s)).toEqual(
            [...spots.map((p) => p.s)].sort((a, b) => a - b),
        );
    });
});

describe("a line drawn from yard line to yard line", () => {
    it("starts in ↔ when it runs diagonally", () => {
        const t = diagonal();
        expect(paramsOf(t).points.map((p) => p.x)).toEqual([0, 80]);
        expect(paramsOf(t).measured).toBe("x");
        expect(measured.current(t.params, t.spots)).toBe("x");
        expect(glyphOf(t)).toBe("↔");
        expect(spotsOf(t).map((p) => p.x)).toEqual([0, 20, 40, 60, 80]);
    });

    it("starts along the path otherwise", () => {
        expect(paramsOf(offYards()).measured).toBeUndefined();
        // Along the field, or straight from a yard line to the next, it's the same either way
        expect(
            paramsOf(drawn(5, { x: 1, y: 100 }, { x: 79, y: 100 })).measured,
        ).toBeUndefined();
        expect(
            paramsOf(drawn(5, { x: 0, y: 100 }, { x: 1, y: 180 })).measured,
        ).toBeUndefined();
    });
});

describe("a placed line keeps its Measured setting", () => {
    const N = 5;
    function readBack(t: ToolState) {
        const placement = placementOf(t, ctx)!;
        const recipe: PlacedRecipe = {
            ...placement.recipe,
            id: 1,
            timelineId: 10,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        };
        const at = new Map(recipe.members.map((m) => [m.marcherId, m]));
        const [placed] = boxesAt({
            recipes: [recipe],
            endBeatOf: () => 8,
            beat: 8,
            positionOf: (id) => at.get(id),
        });
        return { placement, placed };
    }

    it.each(["x", "y"] as const)("saves and reopens %s", (axis) => {
        const t = kept(measuredBy(offYards(N), axis), "1.5");
        const { placement, placed } = readBack(t);
        expect(placement.recipe.params).toMatchObject({ measured: axis });
        expect(placed).toBeDefined();
        expect(placed!.params).toEqual(JSON.parse(JSON.stringify(t.params)));
        expect(measured.current(placed!.params as LineParams, N)).toBe(axis);
        const saved = [...placement.members]
            .sort((a, b) => a.slot - b.slot)
            .map((m) => m[axis]);
        expect(gapsOf(saved)).toEqual([15, 15, 15, 15]);
    });

    it("reads straight across, ↔ and ↕ but no other setting", () => {
        const p = paramsOf(offYards());
        expect(isLineParams({ ...p, measured: "straight" })).toBe(true);
        expect(isLineParams({ ...p, measured: "x" })).toBe(true);
        expect(isLineParams({ ...p, measured: "y" })).toBe(true);
        expect(isLineParams({ ...p, measured: "true" })).toBe(false);
        // Along the path is the absence of a setting, never stored
        expect(isLineParams({ ...p, measured: "along" })).toBe(false);
        expect(isLineParams({ ...p, measured: null })).toBe(false);
    });
});

/** A session on a line of `n` marchers whose params are `p` */
const opened = (n: number, p: LineParams) =>
    edit(drawn(n, { x: 1, y: 100 }, { x: 79, y: 160 }), p, ctx);
const smooth = (x: number, y: number): LinePoint => ({ x, y, tension: 1 });
const onHalf = (v: number) => Math.abs(v / half - Math.round(v / half)) < 1e-9;

describe("↔ with mixed intervals", () => {
    it("spaces each group at its own interval side to side, on the grid", () => {
        // 2 marchers at 1½ steps, then 3 at 2: the seam takes the larger
        const t = kept(measuredBy(offYards(), "x"), "2*1.5+3*2");
        expect(paramsOf(t).measured).toBe("x");
        const xs = spotsOf(t).map((p) => p.x);
        expect(gapsOf(xs)).toEqual([15, 20, 20, 20]);
        for (const x of xs) expect(x % half).toBe(0);
        expect(glyphOf(t)).toBe("↔");
    });
});

describe("↔ on a line whose corners hold marchers", () => {
    // A zigzag of diagonals, x only ever going right
    const zigzag = (spacing: LineParams["spacing"]): LineParams => ({
        points: [corner(0, 100), corner(40, 140), corner(100, 80)],
        spacing,
        measured: "x",
    });

    it("in Fit gives each leg a whole number of even gaps side to side, a marcher on the corner", () => {
        const t = opened(6, zigzag({ mode: "fit" }));
        const spots = spotsOf(t);
        // 4 steps across then 6: 2 gaps and 3
        expect(spots.map((p) => p.x)).toEqual([0, 20, 40, 60, 80, 100]);
        expect(spots[2]).toEqual({ x: 40, y: 140 });
        expect(spots[1]!.y).toBeCloseTo(120, 9);
        expect(spots[3]!.y).toBeCloseTo(120, 9);
    });

    it("in Keep interval sizes each leg to its gaps side to side, every x on the grid", () => {
        // 3 steps across then 7, typed 2: legs of 2 gaps and 3, so 4 steps and 6
        const t = kept(
            opened(6, {
                ...zigzag({ mode: "fit" }),
                points: [corner(0, 100), corner(30, 130), corner(100, 60)],
            }),
            "2",
        );
        const p = paramsOf(t);
        expect(p.spacing.mode).toBe("keep");
        const spots = spotsOf(t);
        expect(gapsOf(spots.map((q) => q.x))).toEqual([20, 20, 20, 20, 20]);
        for (const q of spots) expect(onHalf(q.x)).toBe(true);
        // The corner holds the third marcher, each leg still at its own slope
        expect(spots[2]!.x).toBeCloseTo(p.points[1]!.x, 9);
        expect(spots[2]!.y).toBeCloseTo(p.points[1]!.y, 9);
        expect(spots.at(-1)!.x).toBeCloseTo(p.points[2]!.x, 9);
        const slope = (a: XY, b: XY) => (b.y - a.y) / (b.x - a.x);
        expect(slope(p.points[0]!, p.points[1]!)).toBeCloseTo(1, 9);
        expect(slope(p.points[1]!, p.points[2]!)).toBeCloseTo(-1, 9);
    });
});

describe("↔ on a curve", () => {
    it("lays a gentle bow out side to side", () => {
        const t = opened(5, {
            points: [smooth(0, 100), smooth(40, 80), smooth(80, 100)],
            spacing: { mode: "fit" },
            measured: "x",
        });
        expect(reasonOf(t, "x")).toBeUndefined();
        const spots = spotsOf(t);
        expect(spots.map((p) => p.x)).toEqual([0, 20, 40, 60, 80]);
        // On the bow, not the straight line between its ends
        expect(spots[2]!.y).toBeCloseTo(80, 6);
    });

    it("refuses ↔ on a curve that turns back side to side, though its points go one way", () => {
        const t = opened(5, {
            points: [
                smooth(0, 0),
                smooth(100, 0),
                smooth(101, 100),
                smooth(200, 100),
            ],
            spacing: { mode: "fit" },
        });
        expect(reasonOf(t, "x")).toBe("The line turns back side to side");
        expect(measured.pick(t.params, t.spots, "x", env)).toBe(t.params);
    });
});

describe("review fixes", () => {
    it("keeps a dragged end's x in Keep interval ↔, however steep the drag", () => {
        let t = kept(measuredBy(diagonal(), "x"), "2");
        const before = paramsOf(t).points;
        const end = lineTool.handles(t.params, t.spots)[1]!;
        t = press(t, end.at, env);
        // Nearly straight down the field from the other end
        t = pointerMove(t, { x: before[0]!.x + 1, y: before[0]!.y + 300 }, env);
        t = release(t, ctx);
        const after = paramsOf(t).points;
        expect(after[1]!.x).toBe(before[1]!.x);
        expect(after[1]!.y).toBe(snapHalf(before[0]!.y + 300));
        const xs = spotsOf(t).map((p) => p.x);
        expect(gapsOf(xs)).toEqual([20, 20, 20, 20]);
        expect(xs[0]).toBe(before[0]!.x);
    });

    it("sizes a line in Keep interval ↔ to its run again when it's turned", () => {
        const t = kept(measuredBy(diagonal(), "x"), "2");
        const turned = turnShape(
            lineTool,
            t.params,
            t.spots,
            // 30° on from how it was drawn (ADR 0006, decision 10)
            Math.PI / 6,
            "c",
            env,
        ) as LineParams;
        const after = edit(t, turned, ctx);
        const p = paramsOf(after);
        const spots = spotsOf(after);
        expect(gapsOf(spots.map((q) => q.x)).map((g) => g.toFixed(9))).toEqual(
            Array(4).fill((20).toFixed(9)),
        );
        // The run reaches from end to end, no marcher past them
        expect(spots[0]!.x).toBeCloseTo(p.points[0]!.x, 9);
        expect(spots.at(-1)!.x).toBeCloseTo(p.points.at(-1)!.x, 9);
        expect(spots[0]!.y).toBeCloseTo(p.points[0]!.y, 9);
    });

    it("takes a press by the run it shows, rounded onto the grid", () => {
        // 8 steps across, 4 gaps of 2⅜ centered: from -7½, shown from -5
        const p: LineParams = {
            points: [corner(0, 100), corner(80, 160)],
            spacing: {
                mode: "path",
                groups: [{ interval: 23.75 }],
                anchor: "center",
            },
            measured: "x",
        };
        expect(lineSpots(p, 5, STEP)[0]!.x).toBe(-5);
        // 8.4 along the line past the shown run's end, 11.5 past the unrounded one
        const at = {
            x: 87.5 + 11.5 * 0.8,
            y: 100 + (87.5 + 11.5 * 0.8) * 0.75,
        };
        expect(onLine(p, 5, at, { stepPx: STEP, hitRadius: 3 })).toBe(true);
    });

    it("shows along the path on the trigger while a part runs square to its setting", () => {
        const t = opened(5, {
            points: [
                corner(0, 100),
                corner(40, 140),
                corner(40, 180),
                corner(80, 220),
            ],
            spacing: { mode: "fit" },
            measured: "x",
        });
        expect(measured.current(t.params, t.spots)).toBe("along");
        expect(glyphOf(t)).toBeNull();
    });

    it("says a part runs square rather than turning back", () => {
        const t = opened(5, {
            points: [
                corner(0, 100),
                corner(40, 140),
                corner(40, 180),
                corner(80, 220),
            ],
            spacing: { mode: "fit" },
        });
        expect(reasonOf(t, "x")).toBe(
            "Part of the line runs straight front to back",
        );
        expect(reasonOf(t, "y")).toBeUndefined();
    });
});

describe("a saved line with Measured and everything else", () => {
    it("reads measured with corners, tensions and groups", () => {
        expect(
            isLineParams({
                points: [corner(0, 0), smooth(40, 40), corner(100, 0)],
                spacing: {
                    mode: "keep",
                    groups: [{ interval: 15, count: 2 }, { interval: 20 }],
                },
                corners: false,
                measured: "x",
            }),
        ).toBe(true);
    });
});
