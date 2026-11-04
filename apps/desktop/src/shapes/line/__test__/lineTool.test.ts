import { withPivot } from "../../frame/pivot";
import { describe, expect, it } from "vitest";
import { lineTool } from "../lineTool";
import { isLineParams, type LineParams } from "../lineGeometry";
import { boxTool } from "../../box/boxTool";
import { chipLayout } from "../../editor/chip";
import {
    liveTargets,
    moveLive,
    openLive,
    pressLive,
    releaseLive,
} from "../../placed/liveBox";
import {
    boxesAt,
    type PlacedBox,
    type PlacedRecipe,
} from "../../placed/placedBox";
import { placementOf } from "../../tool/shapePlacement";
import { boxLabel } from "../../placed/PlacedBoxesOverlay";
import { placedBoxSummary } from "../../placed/placedBoxText";
import { SHAPE_TOOLS } from "../../tool/shapeTools";
import { kindPickGate } from "../../tool/pickKind";
import type { ToolEnv } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    redo,
    release,
    slotsOf,
    switchKind,
    targetsOf,
    undo,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * The Line (#523, spec #522): a straight two-point line drawn with one drag, Fit as drawn, Keep
 * interval once an interval is typed, Interval on the path from the spacing menu. Driven through
 * the shape session with the real kind, as a user does: draw, drag handles, type in the editor,
 * pick from its menu, place, reopen.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
/** A yard line off the half-step grid, so a pull onto it is plain to see */
const YARD = 122;
const HASH = 263;
const env: ToolEnv = {
    stepPx: STEP,
    snap: true,
    pull: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
    fieldLines: { x: [YARD], y: [HASH] },
    pullRadius: 2,
};
/** `fine` held: the ladder off, the pulls kept */
const fine: ToolEnv = { ...env, snap: false, fine: true, gridSnap: (p) => p };
/** The Snap toggle off: nothing snaps, nothing is pulled */
const snapOff: ToolEnv = { ...fine, fine: false, pull: false };
const constrain: ToolEnv = { ...env, constrain: true };
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

function drawn(n: number, from: XY, to: XY, e: ToolEnv = env): ToolState {
    let t = openTool(lineTool, marchers(n));
    t = press(t, from, e);
    t = pointerMove(t, to, e);
    return release(t, ctx);
}

/** A handle dragged from where it is to `to` */
function dragHandle(
    t: ToolState,
    key: string,
    to: XY,
    e: ToolEnv = env,
): ToolState {
    const h = lineTool.handles(t.params as LineParams, t.spots);
    const at = h.find((x) => x.key === key)!.at;
    t = press(t, at, e);
    expect(t.gesture?.type).toBe("handle");
    t = pointerMove(t, to, e);
    return release(t, ctx);
}

const paramsOf = (t: ToolState) => t.params as LineParams;
const pointsOf = (t: ToolState) =>
    paramsOf(t).points.map(({ x, y }) => ({ x, y }));
const spotsOf = (t: ToolState) => slotsOf(t, ctx).map(({ x, y }) => ({ x, y }));
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const expectNear = (a: readonly XY[], b: readonly XY[]) => {
    expect(a).toHaveLength(b.length);
    a.forEach((p, i) => {
        expect(p.x).toBeCloseTo(b[i]!.x, 6);
        expect(p.y).toBeCloseTo(b[i]!.y, 6);
    });
};
const interval = lineTool.params.find((p) => p.key === "interval")!;
const spacing = lineTool.choices!.find((c) => c.key === "spacing")!;
const chipText = (t: ToolState) =>
    chipLayout(lineTool, t.params, t.spots, env).intervals.map((x) => ({
        display: x.display,
        derived: x.derived,
    }));
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

describe("Line in the pickers", () => {
    it("is listed after the box and the circle, with its own action", () => {
        expect(SHAPE_TOOLS.map((e) => [e.kind.shape.label, e.action])).toEqual([
            ["Box", "shapeBlock"],
            ["Circle", "shapeCircle"],
            ["Line", "shapeLine"],
            // Its preset with smooth points (#525)
            ["Curve", "shapeCurve"],
            // A Line of two points bent as an arc, its own kind (#634)
            ["Arc", "shapeArc"],
        ]);
    });

    it("is greyed out with Select marchers first when nothing is selected", () => {
        const gate = kindPickGate(false, []);
        expect(gate.ok).toBe(false);
        expect(!gate.ok && gate.reason).toBe("Select marchers first");
    });

    it("is stored as its own kind and version, not the old path line", () => {
        expect(lineTool.shape.id).toBe("line");
        expect(lineTool.shape.version).toBe(2);
    });
});

describe("drawing a line", () => {
    it("draws a straight two-point line, its ends on half steps", () => {
        const t = drawn(5, { x: 101, y: 99 }, { x: 148, y: 101 });
        expect(pointsOf(t)).toEqual([
            { x: 100, y: 100 },
            { x: 150, y: 100 },
        ]);
        expect(paramsOf(t).points.every((p) => p.tension === 0)).toBe(true);
        expect(paramsOf(t).closed).toBeFalsy();
        // The marchers spread evenly from one end to the other
        expectNear(spotsOf(t), [
            { x: 100, y: 100 },
            { x: 112.5, y: 100 },
            { x: 125, y: 100 },
            { x: 137.5, y: 100 },
            { x: 150, y: 100 },
        ]);
        // Everyone has a spot to walk to
        expect(targetsOf(t, ctx)).toHaveLength(5);
    });

    it("pulls an end onto a yard line or a hash within reach", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 123, y: 261.5 });
        expect(pointsOf(t)[1]).toEqual({ x: YARD, y: HASH });
    });

    it("turns the ladder off with fine, still pulling onto lines", () => {
        const free = drawn(5, { x: 100, y: 100 }, { x: 147.3, y: 101.2 }, fine);
        expect(pointsOf(free)[1]).toEqual({ x: 147.3, y: 101.2 });
        const pulled = drawn(5, { x: 100, y: 100 }, { x: 123.1, y: 140 }, fine);
        expect(pointsOf(pulled)[1]).toEqual({ x: YARD, y: 140 });
    });

    it("snaps and pulls nothing with the Snap toggle off", () => {
        const t = drawn(
            5,
            { x: 100.3, y: 100.2 },
            { x: 123.1, y: 140.7 },
            snapOff,
        );
        expect(pointsOf(t)).toEqual([
            { x: 100.3, y: 100.2 },
            { x: 123.1, y: 140.7 },
        ]);
    });

    it("keeps to 45° with constrain", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 160, y: 154 }, constrain);
        const [a, b] = pointsOf(t);
        expect(Math.abs(b!.x - a!.x)).toBeCloseTo(Math.abs(b!.y - a!.y), 6);
    });

    it("draws nothing for a drag shorter than half a step", () => {
        expect(drawn(5, { x: 100, y: 100 }, { x: 102, y: 100 }).params).toBe(
            null,
        );
    });
});

describe("Fit", () => {
    it("shows the interval worked out from the drawing", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 150, y: 100 });
        expect(paramsOf(t).spacing.mode).toBe("fit");
        // Off the half steps it shows as about so much, which a press puts on one
        expect(chipText(t)).toEqual([{ display: "1¼", derived: true }]);
        const even = drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 });
        expect(chipText(even)).toEqual([{ display: "2", derived: false }]);
        expect(paramsOf(even).spacing.mode).toBe("fit");
    });

    it("snaps a dragged end where the interval comes out to whole steps", () => {
        let t = drawn(5, { x: 100, y: 100 }, { x: 150, y: 100 });
        t = dragHandle(t, "p1", { x: 179, y: 101 });
        expect(pointsOf(t)).toEqual([
            { x: 100, y: 100 },
            { x: 180, y: 100 },
        ]);
        expect(chipText(t)[0]!.display).toBe("2");
        // 4 gaps from the other end: 58.5 is nearest 1 step each, so 40 long
        t = dragHandle(t, "p0", { x: 121.5, y: 100 });
        expect(pointsOf(t)[0]).toEqual({ x: 140, y: 100 });
        expect(chipText(t)[0]!.display).toBe("1");
    });

    it("leaves a dragged end where it's dragged with fine, still pulling onto lines", () => {
        let t = drawn(5, { x: 100, y: 100 }, { x: 150, y: 100 });
        t = dragHandle(t, "p0", { x: 121.5, y: 100 }, fine);
        expect(pointsOf(t)[0]).toEqual({ x: YARD, y: 100 });
        t = dragHandle(t, "p0", { x: 113.3, y: 100 }, fine);
        expect(pointsOf(t)[0]).toEqual({ x: 113.3, y: 100 });
    });
});

describe("Keep interval", () => {
    // 5 marchers from 100 to 150: 1¼ steps apart, the center at 125
    const fitLine = () => drawn(5, { x: 100, y: 100 }, { x: 150, y: 100 });

    it("is what typing an interval switches to, the length following from the pivot", () => {
        const t = kept(fitLine(), "2");
        expect(paramsOf(t).spacing.mode).toBe("keep");
        // 4 gaps of 2 steps, grown from the left end, where a new line's pivot is (#596)
        expect(paramsOf(t).pivot).toBe("w");
        expect(pointsOf(t)).toEqual([
            { x: 100, y: 100 },
            { x: 180, y: 100 },
        ]);
        expectNear(
            spotsOf(t),
            [100, 120, 140, 160, 180].map((x) => ({ x, y: 100 })),
        );
        expect(chipText(t)).toEqual([{ display: "2", derived: false }]);
    });

    it("grows from the center when the pivot is there", () => {
        let t = fitLine();
        t = edit(t, withPivot(paramsOf(t), "c"), ctx);
        t = kept(t, "2½");
        expect(pointsOf(t)).toEqual([
            { x: 75, y: 100 },
            { x: 175, y: 100 },
        ]);
    });

    it("keeps exact fractions as typed", () => {
        const t = kept(fitLine(), "1 2/3");
        const [a, b] = pointsOf(t);
        expect(dist(a!, b!)).toBeCloseTo((4 * 50) / 3, 9);
        expect(chipText(t)[0]!.display).toBe("1⅔");
    });

    it("turns the line when an end is dragged, the interval kept", () => {
        let t = kept(fitLine(), "2");
        t = dragHandle(t, "p1", { x: 101, y: 160 });
        const [a, b] = pointsOf(t);
        expect(a).toEqual({ x: 100, y: 100 });
        expect(b!.x).toBeCloseTo(100, 6);
        expect(b!.y).toBeCloseTo(180, 6);
        expect(paramsOf(t).spacing.mode).toBe("keep");
        expect(chipText(t)[0]!.display).toBe("2");
        const spots = spotsOf(t);
        for (let i = 1; i < spots.length; i++)
            expect(dist(spots[i - 1]!, spots[i]!)).toBeCloseTo(20, 6);
    });

    it("turns square to the field from an end off the grid", () => {
        // 1⅝ steps apart from the center: the ends at 92.5 and 157.5, a quarter step off the grid
        let t = fitLine();
        t = kept(edit(t, withPivot(paramsOf(t), "c"), ctx), "1.625");
        expect(pointsOf(t)[0]).toEqual({ x: 92.5, y: 100 });
        expect(pointsOf(t)[1]).toEqual({ x: 157.5, y: 100 });
        // Dragged near straight down from the first end, it turns exactly there
        t = dragHandle(t, "p1", { x: 94, y: 150 });
        expect(pointsOf(t)[1]!.x).toBeCloseTo(92.5, 9);
        expect(pointsOf(t)[1]!.y).toBeCloseTo(165, 9);
    });

    it("goes back to Fit from the spacing menu, the line kept as it is", () => {
        const keptLine = kept(fitLine(), "2");
        const t = picked(keptLine, "fit");
        expect(paramsOf(t).spacing.mode).toBe("fit");
        expect(pointsOf(t)).toEqual(pointsOf(keptLine));
    });
});

describe("Interval on the path", () => {
    // 5 marchers on a line 10 steps long
    const longLine = () => drawn(5, { x: 0, y: 100 }, { x: 100, y: 100 });

    it("is offered in the spacing menu, anchored at start, center or end", () => {
        const t = longLine();
        expect(spacing.options(t.params, t.spots).map((o) => o.value)).toEqual([
            "fit",
            "keep",
            "path-start",
            "path-center",
            "path-end",
        ]);
        expect(spacing.current(t.params, t.spots)).toBe("fit");
    });

    it("lays a typed run on the line as drawn, from the anchor", () => {
        const run = (anchor: string) => {
            const t = kept(picked(longLine(), `path-${anchor}`), "2");
            expect(spacing.current(t.params, t.spots)).toBe(`path-${anchor}`);
            // The drawn line stays; the run of 8 steps sits on it
            expect(pointsOf(t)).toEqual([
                { x: 0, y: 100 },
                { x: 100, y: 100 },
            ]);
            return spotsOf(t).map((p) => p.x);
        };
        expectNear(
            run("start").map((x) => ({ x, y: 0 })),
            [0, 20, 40, 60, 80].map((x) => ({ x, y: 0 })),
        );
        expectNear(
            run("center").map((x) => ({ x, y: 0 })),
            [10, 30, 50, 70, 90].map((x) => ({ x, y: 0 })),
        );
        expectNear(
            run("end").map((x) => ({ x, y: 0 })),
            [20, 40, 60, 80, 100].map((x) => ({ x, y: 0 })),
        );
    });

    it("keeps the spots where they are when picked from Fit", () => {
        const t = longLine();
        expectNear(spotsOf(picked(t, "path-center")), spotsOf(t));
    });
});

describe("mixed intervals (#526)", () => {
    /** `n` marchers on a Fit line from 100 to 150, its center at 125 */
    const fitLine = (n: number) =>
        drawn(n, { x: 100, y: 100 }, { x: 150, y: 100 });
    const groups = lineTool.groups!;
    const gapsOf = (t: ToolState) => {
        const at = spotsOf(t);
        return at.slice(1).map((q, i) => dist(at[i]!, q) / STEP);
    };
    const expectGaps = (t: ToolState, steps: number[]) => {
        const gaps = gapsOf(t);
        expect(gaps).toHaveLength(steps.length);
        gaps.forEach((g, i) => expect(g).toBeCloseTo(steps[i]!, 6));
    };
    /** The group chips as the editor shows them */
    const chips = (t: ToolState) =>
        chipLayout(lineTool, t.params, t.spots, env).groups?.map(
            (g) =>
                `${g.count}${g.rest ? " rest" : ""}${g.grown ? ` +${g.grown}` : ""}${g.dropped ? " dropped" : ""} × ${g.interval}`,
        ) ?? null;
    const typedIn = (
        t: ToolState,
        index: number,
        part: "count" | "interval",
        text: string,
    ) => edit(t, groups.type(t.params, t.spots, index, part, text, env), ctx);

    it("lays 2*3+4*2 as 2 marchers at 3 steps, then 4 at 2, the length following from the pivot", () => {
        const t = kept(fitLine(6), "2*3+4*2");
        expect(paramsOf(t).spacing).toEqual({
            mode: "keep",
            groups: [
                { count: 2, interval: 30 },
                { count: 4, interval: 20 },
            ],
        });
        // The seam between the groups is the larger interval
        expectGaps(t, [3, 3, 2, 2, 2]);
        expect(pointsOf(t)).toEqual([
            { x: 100, y: 100 },
            { x: 220, y: 100 },
        ]);
        expect(chips(t)).toEqual(["2 × 3", "4 × 2"]);
        // The single interval number gives way to the groups
        expect(chipText(t)).toEqual([]);
    });

    it("reads x and , too", () => {
        const t = kept(fitLine(6), "2x3, 4x2");
        expectGaps(t, [3, 3, 2, 2, 2]);
    });

    it("puts the rest at the start, the end or the middle, by where it's typed", () => {
        expectGaps(kept(fitLine(6), "2.5+3*4"), [2.5, 2.5, 4, 4, 4]);
        expectGaps(kept(fitLine(6), "3*4+2.5"), [4, 4, 4, 2.5, 2.5]);
        const both = kept(fitLine(7), "2*3+2+2*3");
        expectGaps(both, [3, 3, 2, 2, 3, 3]);
        expect(chips(both)).toEqual(["2 × 3", "3 rest × 2", "2 × 3"]);
    });

    it("grows the last group to take extra marchers, and marks it", () => {
        const t = kept(fitLine(10), "2*3+4*2");
        expectGaps(t, [3, 3, 2, 2, 2, 2, 2, 2, 2]);
        expect(chips(t)).toEqual(["2 × 3", "8 +4 × 2"]);
        // The typed count is kept
        expect(paramsOf(t).spacing).toMatchObject({
            groups: [{ count: 2 }, { count: 4 }],
        });
    });

    it("drops groups from the end with too few marchers", () => {
        expect(chips(kept(fitLine(4), "2*3+4*2"))).toEqual(["2 × 3", "2 × 2"]);
        const two = kept(fitLine(2), "2*3+4*2");
        expect(chips(two)).toEqual(["2 × 3", "0 dropped × 2"]);
        expectGaps(two, [3]);
    });

    it("keeps exact fractions in a group", () => {
        const t = kept(fitLine(4), "2*1 2/3+2");
        expectGaps(t, [5 / 3, 2, 2]);
        expect(chips(t)).toEqual(["2 × 1⅔", "2 rest × 2"]);
    });

    it("goes back to one interval for everyone when a plain number is typed", () => {
        let t = kept(fitLine(6), "2*3+4*2");
        t = kept(t, "2");
        expect(paramsOf(t).spacing).toEqual({
            mode: "keep",
            groups: [{ interval: 20 }],
        });
        expect(chips(t)).toBeNull();
        expect(chipText(t)).toEqual([{ display: "2", derived: false }]);
    });

    it("refuses a list it can't read", () => {
        const t = fitLine(6);
        expect(interval.type(t.params, t.spots, "2+3", env)).toBeNull();
        expect(interval.type(t.params, t.spots, "2⅔x3", env)).toBeNull();
    });

    it("lays the groups on the drawn line from the anchor, on the path", () => {
        let t = drawn(6, { x: 0, y: 100 }, { x: 200, y: 100 });
        t = picked(t, "path-start");
        t = kept(t, "2*3+4*2");
        expect(pointsOf(t)).toEqual([
            { x: 0, y: 100 },
            { x: 200, y: 100 },
        ]);
        expect(spotsOf(t)[0]).toEqual({ x: 0, y: 100 });
        expectGaps(t, [3, 3, 2, 2, 2]);
        // Back to Keep interval, the groups kept and the line sized to them
        t = picked(t, "keep");
        expectGaps(t, [3, 3, 2, 2, 2]);
        const [a, b] = pointsOf(t);
        expect(dist(a!, b!)).toBeCloseTo(120, 6);
    });

    it("widens every group at once when scaled", () => {
        const t = kept(fitLine(6), "2*3+4*2");
        const wider = interval.widen!(
            t.params,
            t.spots,
            0.5,
            env,
        ) as LineParams;
        expect(wider.spacing).toMatchObject({
            groups: [{ interval: 35 }, { interval: 25 }],
        });
        const squeezed = interval.widen!(t.params, t.spots, -2, env);
        expect(squeezed).toBeNull();
    });

    describe("its group chips", () => {
        const drumline = () => kept(fitLine(6), "2*3+4*2");

        it("types a group's count or interval", () => {
            let t = typedIn(drumline(), 0, "count", "3");
            expect(chips(t)).toEqual(["3 × 3", "3 × 2"]);
            t = typedIn(t, 1, "interval", "2½");
            expect(chips(t)).toEqual(["3 × 3", "3 × 2½"]);
            expectGaps(t, [3, 3, 3, 2.5, 2.5]);
        });

        it("takes the full list typed into any of its numbers", () => {
            const t = typedIn(drumline(), 1, "interval", "2.5+3*4");
            expect(chips(t)).toEqual(["3 rest × 2½", "3 × 4"]);
        });

        it("refuses a count that isn't a whole number of marchers", () => {
            const t = drumline();
            for (const text of ["0", "1.5", "abc"])
                expect(
                    groups.type(t.params, t.spots, 0, "count", text, env),
                    text,
                ).toBeNull();
        });

        it("drags a group's count and interval", () => {
            const t = drumline();
            const roles = { fine: false, constrain: false, fromCenter: false };
            const more = groups.scrub(
                t.params,
                t.spots,
                0,
                "count",
                { dx: 33, dy: 0, axis: "x", roles },
                env,
            );
            expect(chips(edit(t, more, ctx))).toEqual(["4 × 3", "2 × 2"]);
            const wider = groups.scrub(
                t.params,
                t.spots,
                1,
                "interval",
                { dx: 8, dy: 0, axis: "x", roles },
                env,
            );
            expect(chips(edit(t, wider, ctx))).toEqual(["2 × 3", "4 × 2½"]);
        });

        it("gives a typed count to the rest when its count is set", () => {
            let t = kept(fitLine(6), "2*3+2");
            expect(chips(t)).toEqual(["2 × 3", "4 rest × 2"]);
            t = typedIn(t, 1, "count", "3");
            expect(chips(t)).toEqual(["2 × 3", "4 +1 × 2"]);
        });

        it("adds a group at the end with +, taking a marcher from the last", () => {
            const t = edit(
                drumline(),
                groups.add(drumline().params, 6, env),
                ctx,
            );
            expect(chips(t)).toEqual(["2 × 3", "3 × 2", "1 × 2"]);
        });

        it("adds a group that gets a marcher, even when the last has only 1", () => {
            let t = kept(fitLine(6), "5*3+1*2");
            t = edit(t, groups.add(t.params, 6, env), ctx);
            expect(chips(t)).toEqual(["4 × 3", "1 × 2", "1 × 2"]);
        });

        it("adds a group that gets a marcher when the counts already take everyone", () => {
            let t = kept(fitLine(4), "2*3+4*2");
            expect(chips(t)).toEqual(["2 × 3", "2 × 2"]);
            t = edit(t, groups.add(t.params, 4, env), ctx);
            expect(chips(t)).toEqual(["2 × 3", "1 × 2", "1 × 2"]);
        });

        it("adds no group when every group already has just 1 marcher", () => {
            const t = kept(fitLine(2), "1*3+1*2");
            expect(groups.add(t.params, 2, env)).toBe(t.params);
        });

        const roles = { fine: false, constrain: false, fromCenter: false };
        const countDragged = (t: ToolState, index: number, dx: number) =>
            groups.scrub(
                t.params,
                t.spots,
                index,
                "count",
                { dx, dy: 0, axis: "x", roles },
                env,
            ) as LineParams;
        const storedCounts = (p: LineParams) =>
            p.spacing.mode === "fit"
                ? []
                : p.spacing.groups.map((g) => g.count);

        it("drags a dropped or grown group's count from its typed count", () => {
            const dropped = kept(fitLine(2), "2*3+4*2");
            expect(countDragged(dropped, 1, 1)).toBe(dropped.params);
            expect(storedCounts(countDragged(dropped, 1, 33))).toEqual([2, 6]);
            const grown = kept(fitLine(10), "2*3+4*2");
            expect(storedCounts(countDragged(grown, 1, 33))).toEqual([2, 6]);
        });

        it("keeps a group's count at 999 or under", () => {
            const t = kept(fitLine(6), "998*3+2");
            expect(
                groups.type(t.params, 6, 0, "count", "1000", env),
            ).toBeNull();
            expect(storedCounts(countDragged(t, 0, 2000))).toEqual([
                999,
                undefined,
            ]);
            expect(interval.type(t.params, 6, "1000*3+2", env)).toBeNull();
        });

        it("adds a group after the rest with +", () => {
            const rest = kept(fitLine(6), "2*3+2");
            const t = edit(rest, groups.add(rest.params, 6, env), ctx);
            expect(chips(t)).toEqual(["2 × 3", "3 rest × 2", "1 × 2"]);
        });

        it("removes a group, back to one interval for everyone at the last one", () => {
            let t = edit(
                drumline(),
                groups.remove(drumline().params, 6, 0, env),
                ctx,
            );
            expect(chips(t)).toBeNull();
            expect(chipText(t)).toEqual([{ display: "2", derived: false }]);
            t = kept(fitLine(7), "2*3+2+2*3");
            t = edit(t, groups.remove(t.params, 7, 1, env), ctx);
            expect(chips(t)).toEqual(["2 × 3", "5 +3 × 3"]);
        });

        it("undoes a group edit as one step", () => {
            const t = typedIn(drumline(), 0, "count", "3");
            expect(chips(undo(t))).toEqual(["2 × 3", "4 × 2"]);
        });
    });
});

describe("the session around a line", () => {
    it("undoes and redoes a typed interval", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 150, y: 100 });
        const sized = typed(t, "2");
        expect(undo(sized).params).toBe(t.params);
        expect(redo(undo(sized)).params).toBe(sized.params);
    });

    it("turns into a box keeping its frame, and back", () => {
        const t = drawn(5, { x: 100, y: 100 }, { x: 180, y: 100 });
        const box = switchKind(t, boxTool, ctx, env);
        expect(boxTool.frameOf(box.params, 5).center).toEqual({
            x: 140,
            y: 100,
        });
        const line = switchKind(box, lineTool, ctx, env);
        const [a, b] = pointsOf(line);
        expect((a!.x + b!.x) / 2).toBeCloseTo(140, 6);
        expect(a!.y).toBeCloseTo(100, 6);
    });
});

describe("a placed line", () => {
    const N = 5;
    /** What placing `t` saves, through JSON as the database keeps it */
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
    const readBack = (recipe: PlacedRecipe): PlacedBox<LineParams> => {
        const at = new Map(recipe.members.map((m) => [m.marcherId, m]));
        const [placed] = boxesAt({
            recipes: [recipe],
            endBeatOf: () => 8,
            beat: 8,
            positionOf: (id) => at.get(id),
        });
        return placed as PlacedBox<LineParams>;
    };
    const keptLine = () =>
        kept(drawn(N, { x: 100, y: 100 }, { x: 150, y: 100 }), "2");

    it("saves its points and spacing as a line recipe, with everyone on a spot", () => {
        const t = keptLine();
        const placement = placementOf(t, ctx)!;
        expect(placement.recipe.kind).toBe("line");
        expect(placement.recipe.kindVersion).toBe(2);
        expect(placement.recipe.params).toMatchObject({
            points: [
                { x: 100, y: 100, tension: 0 },
                { x: 180, y: 100, tension: 0 },
            ],
            spacing: { mode: "keep" },
            spots: N,
        });
        expectNear(
            [...placement.members]
                .sort((a, b) => a.slot - b.slot)
                .map(({ x, y }) => ({ x, y })),
            spotsOf(t),
        );
    });

    it("reopens from its recipe with the same points and interval", () => {
        const t = keptLine();
        const placed = readBack(recipeOf(t));
        expect(placed.kind).toBe(lineTool);
        expect(placed.spots).toBe(N);
        expect(placed.params).toEqual(JSON.parse(JSON.stringify(t.params)));
        expect(
            chipLayout(lineTool, placed.params, N, env).intervals[0]!.display,
        ).toBe("2");
    });

    it("saves an end dragged on the placed line on release, the interval kept", () => {
        const placed = readBack(recipeOf(keptLine()));
        const end = lineTool.handles(placed.params, N)[1]!;
        let live = pressLive(openLive(placed), end.at, env)!;
        expect(live.gesture?.type).toBe("handle");
        live = moveLive(live, { x: 100, y: 20 }, env);
        const out = releaseLive(live);
        expect(out.changed).toBe(true);
        const params = out.live.params as LineParams;
        expect(params.points[1]!.x).toBeCloseTo(100, 6);
        expect(params.points[1]!.y).toBeCloseTo(20, 6);
        const { members, spots } = liveTargets(placed, params, ctx);
        expect(spots).toBe(N);
        expect(members).toHaveLength(N);
        const at = [...members].sort((a, b) => a.slot - b.slot);
        for (let i = 1; i < at.length; i++)
            expect(dist(at[i - 1]!, at[i]!)).toBeCloseTo(20, 6);
    });

    it("saves its groups and reopens with them exactly", () => {
        const t = kept(
            drawn(7, { x: 100, y: 100 }, { x: 150, y: 100 }),
            "2*3+2+2*1 2/3",
        );
        const recipe = recipeOf(t);
        expect(recipe.params).toMatchObject({
            spacing: {
                mode: "keep",
                groups: [
                    { count: 2, interval: 30 },
                    { interval: 20 },
                    { count: 2, interval: 50 / 3 },
                ],
            },
        });
        const placed = readBack(recipe);
        expect(placed.kind).toBe(lineTool);
        expect(placed.params).toEqual(JSON.parse(JSON.stringify(t.params)));
        expect(
            chipLayout(lineTool, placed.params, 7, env).groups?.map(
                (g) => `${g.count} × ${g.interval}`,
            ),
        ).toEqual(["2 × 3", "3 × 2", "2 × 1⅔"]);
    });

    it("labels a placed grouped line with its groups", () => {
        const t = kept(
            drawn(6, { x: 100, y: 100 }, { x: 150, y: 100 }),
            "2*3+4*2",
        );
        const placed = readBack(recipeOf(t));
        expect(boxLabel(placed, STEP)).toBe("Line · 2 × 3 + 4 × 2 steps");
        expect(placedBoxSummary(placed, STEP)).toBe("2 × 3 + 4 × 2 steps");
        // A plain line keeps its one interval
        expect(boxLabel(readBack(recipeOf(keptLine())), STEP)).toBe(
            "Line · 2 steps",
        );
    });

    describe("a line saved by a newer build reads as plain positions", () => {
        const saved = () => {
            const recipe = recipeOf(keptLine());
            const { spots: _spots, ...params } = recipe.params as LineParams & {
                spots: number;
            };
            return { recipe, params };
        };
        const withParams = (recipe: PlacedRecipe, params: object) =>
            readBack({ ...recipe, params: { ...params, spots: N } });

        it("reads this version's lines, its host pivot included", () => {
            const { recipe, params } = saved();
            expect(isLineParams(params)).toBe(true);
            expect(
                withParams(recipe, { ...params, pivot: "start" }),
            ).toBeDefined();
        });

        it.each([
            [
                "a point rounder than this build lays out",
                (p: LineParams) => ({
                    ...p,
                    points: [p.points[0], { ...p.points[1]!, tension: 2.5 }],
                }),
            ],
            [
                "a corners switch that isn't on or off",
                (p: LineParams) => ({ ...p, corners: "yes" }),
            ],
            ["a closed line", (p: LineParams) => ({ ...p, closed: true })],
            [
                "two groups without a count",
                (p: LineParams) => ({
                    ...p,
                    spacing: {
                        mode: "keep",
                        groups: [{ interval: 30 }, { interval: 20 }],
                    },
                }),
            ],
            [
                "a count that isn't a whole number of marchers",
                (p: LineParams) => ({
                    ...p,
                    spacing: {
                        mode: "keep",
                        groups: [
                            { interval: 30, count: 1.5 },
                            { interval: 20 },
                        ],
                    },
                }),
            ],
            [
                "a group of no marchers",
                (p: LineParams) => ({
                    ...p,
                    spacing: {
                        mode: "keep",
                        groups: [{ interval: 30, count: 0 }, { interval: 20 }],
                    },
                }),
            ],
            [
                "no groups",
                (p: LineParams) => ({
                    ...p,
                    spacing: { mode: "keep", groups: [] },
                }),
            ],
            [
                "a setting it doesn't know",
                (p: LineParams) => ({ ...p, measured: "across" }),
            ],
            [
                "a broken group",
                (p: LineParams) => ({
                    ...p,
                    spacing: { mode: "keep", groups: [null] },
                }),
            ],
            [
                "a group interval that isn't a number",
                (p: LineParams) => ({
                    ...p,
                    spacing: { mode: "keep", groups: [{ interval: "2" }] },
                }),
            ],
            [
                "an unknown anchor",
                (p: LineParams) => ({
                    ...p,
                    spacing: {
                        mode: "path",
                        groups: [{ interval: 20 }],
                        anchor: "middle",
                    },
                }),
            ],
        ])("refuses %s", (_name, change) => {
            const { recipe, params } = saved();
            const changed = change(params as LineParams);
            expect(isLineParams(changed)).toBe(false);
            expect(withParams(recipe, changed)).toBeUndefined();
        });
    });
});

describe("grabbing a line", () => {
    it("takes a press near the line, but not a press far from a long line with few marchers", () => {
        // 2 marchers 40 steps apart: half the interval would reach 20 steps off the line
        const t = drawn(2, { x: 100, y: 100 }, { x: 500, y: 100 });
        const p = paramsOf(t);
        expect(lineTool.contains(p, 2, { x: 300, y: 105 }, env)).toBe(true);
        expect(lineTool.contains(p, 2, { x: 300, y: 150 }, env)).toBe(false);
        let pressed = press(t, { x: 300, y: 150 }, env);
        expect(pressed.gesture?.type).toBe("draw");
        pressed = press(t, { x: 300, y: 105 }, env);
        expect(pressed.gesture?.type).toBe("move");
    });
});
