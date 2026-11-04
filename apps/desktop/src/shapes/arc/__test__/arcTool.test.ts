import { describe, expect, it } from "vitest";
import { arcTool } from "../arcTool";
import {
    arcEnds,
    arcGuide,
    arcStretch,
    isRound,
    bendHandlePoint,
    bendOf,
    ellipseOf,
    isArcParams,
    MIDDLE_KEY,
    withBend,
    withEnds,
    withStretch,
    withSweep,
} from "../arcGeometry";
import {
    bentSegment,
    isLineParams,
    linePath,
    lineSpots,
    withLineFrame,
    lineFrame,
    type LineParams,
} from "../../line/lineGeometry";
import { lineFillSpots } from "../../line/lineFill";
import { distributionOf, switchModes } from "../../distribute/modes";
import { PLACED_KINDS } from "../../placed/placedBox";
import { SHAPE_TOOLS } from "../../tool/shapeTools";
import { circleTool } from "../../circle/circleTool";
import { chipLayout } from "../../editor/chip";
import {
    locksSizes,
    toggleSizesLock,
    useShapeEditorStore,
} from "../../frame/shapeEditorStore";
import type { ToolEnv } from "../../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    slotsOf,
    switchKind,
    pickMenu,
    undo,
    type ToolState,
} from "../../tool/toolMachine";
import type { ShapeContext, XY } from "../../types";

/**
 * The Arc (#634): drawn end to end, stretched by its handles as a box is (onto an ellipse when one
 * way only), its degrees set in the editor round its circle, spaced as a Line, closed by its chord
 * or round to a circle. Driven through the shape session with the real Arc kind.
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
const fine: ToolEnv = { ...env, snap: false, fine: true };
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const paramsOf = (t: ToolState) => t.params as LineParams;
const spotsOf = (t: ToolState) => slotsOf(t, ctx).map(({ x, y }) => ({ x, y }));

/** An arc of `n` dragged from `from` to `to` */
function drawn(n: number, from: XY, to: XY): ToolState {
    let t = openTool(arcTool, marchers(n));
    t = pointerMove(t, from, env);
    t = press(t, from, env);
    t = pointerMove(t, to, env);
    return release(t, ctx, null);
}

/** Handle `key` dragged to `to` */
function onHandle(t: ToolState, key: string, to: XY, e = env): ToolState {
    const h = t.kind.handles(t.params, t.spots, t.selected);
    const at = h.find((x) => x.key === key)!.at;
    t = press(t, at, e);
    expect(t.gesture).toMatchObject({ type: "handle", key });
    t = pointerMove(t, to, e);
    return release(t, ctx, null);
}

/** A 180° arc of 7 from (100, 200) to (160, 200), bowing up: its circle's center (130, 200), r 30 */
function halfTurn(): ToolState {
    const t = drawn(7, { x: 100, y: 200 }, { x: 160, y: 200 });
    return edit(t, withBend(paramsOf(t), 180), ctx);
}

/** A two-point open arc from (0, 0) to (40, 0) turning `bend` degrees */
const arc = (bend: number): LineParams =>
    withBend(
        {
            points: [
                { x: 0, y: 0, tension: 0 },
                { x: 40, y: 0, tension: 0 },
            ],
            spacing: { mode: "fit" },
        },
        bend,
    );

describe("the bent segment", () => {
    it("runs from end to end on one circle", () => {
        for (const bend of [30, 90, 180, 270, -120]) {
            const segment = bentSegment({ x: 0, y: 0 }, { x: 40, y: 0 }, bend);
            const path = linePath(arc(bend));
            expect(segment.type).toBe("arc");
            expect(dist(path.at(0), { x: 0, y: 0 })).toBeLessThan(1e-9);
            expect(dist(path.at(path.length), { x: 40, y: 0 })).toBeLessThan(
                1e-9,
            );
            // Its length is the sweep times the radius
            if (segment.type === "arc")
                expect(path.length).toBeCloseTo(
                    (Math.abs(bend) * Math.PI * segment.r) / 180,
                    9,
                );
        }
    });

    it("bows left of its first end for a positive sweep (toward the back of the field)", () => {
        const mid = linePath(arc(90)).at(linePath(arc(90)).length / 2);
        expect(mid.y).toBeLessThan(0);
        const other = linePath(arc(-90));
        expect(other.at(other.length / 2).y).toBeGreaterThan(0);
    });

    it("is a half circle about the chord's middle at 180°", () => {
        const path = linePath(arc(180));
        const mid = path.at(path.length / 2);
        expect(mid.x).toBeCloseTo(20, 9);
        expect(mid.y).toBeCloseTo(-20, 9);
        expect(path.length).toBeCloseTo(20 * Math.PI, 9);
    });
});

describe("reading an arc back", () => {
    it("reads a bent two-point line, not a straight one or three points", () => {
        expect(isArcParams(arc(90))).toBe(true);
        const straight = {
            ...arc(90),
            points: arc(90).points.map(({ bend: _b, ...q }) => q),
        };
        expect(isArcParams(straight)).toBe(false);
        expect(
            isArcParams({
                ...arc(90),
                points: [...arc(90).points, { x: 80, y: 0, tension: 0 }],
            }),
        ).toBe(false);
    });

    it("refuses a bend of a full turn or more", () => {
        const p = arc(90);
        const bad = {
            ...p,
            points: [{ ...p.points[0]!, bend: 360 }, p.points[1]!],
        };
        expect(isLineParams(bad)).toBe(false);
    });

    it("reads both closed arcs, and is read back as itself", () => {
        expect(isArcParams(withEnds(arc(90), "chord"))).toBe(true);
        expect(isArcParams(withEnds(arc(90), "circle"))).toBe(true);
        expect(PLACED_KINDS).toContain(arcTool);
        expect(SHAPE_TOOLS.map((e) => e.kind)).toContain(arcTool);
        expect(arcTool.shape.id).toBe("arc");
        expect(arcTool.shape.version).toBe(2);
    });
});

describe("drawing an arc", () => {
    it("lands its ends as a Line's and bows a quarter turn left of the drag", () => {
        const t = drawn(5, { x: 101, y: 199 }, { x: 159, y: 201 });
        const p = paramsOf(t);
        expect(p.points.map(({ x, y }) => ({ x, y }))).toEqual([
            { x: 100, y: 200 },
            { x: 160, y: 200 },
        ]);
        expect(bendOf(p)).toBe(90);
        expect(arcEnds(p)).toBe("open");
    });

    it("puts a marcher on each end and spaces the rest evenly, equal chords apart", () => {
        const t = drawn(5, { x: 100, y: 200 }, { x: 160, y: 200 });
        const spots = spotsOf(t);
        expect(spots).toHaveLength(5);
        const ends = [spots[0]!, spots[4]!].sort((a, b) => a.x - b.x);
        expect(dist(ends[0]!, { x: 100, y: 200 })).toBeLessThan(1e-6);
        expect(dist(ends[1]!, { x: 160, y: 200 })).toBeLessThan(1e-6);
        const ordered = lineSpots(paramsOf(t), 5);
        const chords = ordered.slice(1).map((s, i) => dist(s, ordered[i]!));
        for (const c of chords) expect(c).toBeCloseTo(chords[0]!, 6);
    });
});

describe("its degrees (owner on #634)", () => {
    const bend = () => arcTool.params.find((p) => p.key === "bend")!;

    it("keeps its ends up to a half turn, its middle moving", () => {
        const t = halfTurn();
        expect(bend().display(t.params, t.spots, STEP)).toBe("180°");
        const typed = edit(t, bend().type(t.params, t.spots, "90", env), ctx);
        const p = paramsOf(typed);
        expect(bendOf(p)).toBeCloseTo(90, 6);
        // The end marchers stay 60 apart; the circle grows to fit
        expect(dist(p.points[0]!, { x: 100, y: 200 })).toBeLessThan(1e-6);
        expect(dist(p.points[1]!, { x: 160, y: 200 })).toBeLessThan(1e-6);
        expect(arcGuide(p)!.rx).toBeCloseTo(30 * Math.SQRT2, 6);
        // And back to 30°, still the same ends
        const flat = bend().type(p, 7, "30", env) as LineParams;
        expect(dist(flat.points[0]!, { x: 100, y: 200 })).toBeLessThan(1e-6);
        expect(dist(flat.points[1]!, { x: 160, y: 200 })).toBeLessThan(1e-6);
    });

    it("lands its middle on half steps, or a field line, as its degrees are dragged", () => {
        const t = halfTurn();
        const roles = {
            fine: false,
            constrain: false,
            fromCenter: false,
        } as never;
        const drag = (e: ToolEnv) =>
            bend().scrub(
                t.params,
                7,
                // A degree per 2 px, or per px with fine
                { dx: e.snap ? -120 : -60, dy: 0, axis: "x", roles },
                e,
            ) as LineParams;
        // 120° would stand its middle 17.32 off its ends' line: landed at 15, 1½ steps
        let p = drag(env);
        expect(dist(bendHandlePoint(p), { x: 130, y: 185 })).toBeLessThan(1e-6);
        expect(dist(p.points[0]!, { x: 100, y: 200 })).toBeLessThan(1e-6);
        // A hash it comes near takes it instead
        p = drag({ ...env, fieldLines: { x: [], y: [183] }, pullRadius: 4 });
        expect(bendHandlePoint(p).y).toBeCloseTo(183, 6);
        // With fine, the degrees as dragged
        p = drag(fine);
        expect(Math.abs(bendOf(p))).toBeCloseTo(120, 6);
        // A half turn is a stop: just under it stays there
        const under = bend().scrub(
            t.params,
            7,
            { dx: -4, dy: 0, axis: "x", roles },
            env,
        );
        expect(Math.abs(bendOf(under as LineParams))).toBeCloseTo(180, 6);
    });

    it("keeps its circle past a half turn, and across it", () => {
        const t = halfTurn();
        // 180 → 270: the circle stays
        const most = bend().type(t.params, 7, "270", env) as LineParams;
        let g = arcGuide(most)!;
        expect(dist(g.center, { x: 130, y: 200 })).toBeLessThan(1e-6);
        expect(g.rx).toBeCloseTo(30, 6);
        // 270 → 90: back round the same circle to the half turn, then its ends stay
        const back = bend().type(most, 7, "90", env) as LineParams;
        expect(dist(back.points[0]!, { x: 100, y: 200 })).toBeLessThan(1e-6);
        expect(dist(back.points[1]!, { x: 160, y: 200 })).toBeLessThan(1e-6);
        // 90 → 270: out to the half turn on its ends, then round that circle
        const round = bend().type(back, 7, "270", env) as LineParams;
        g = arcGuide(round)!;
        expect(dist(g.center, { x: 130, y: 200 })).toBeLessThan(1e-6);
        expect(g.rx).toBeCloseTo(30, 6);
    });

    it("grows evenly from its middle, so in Fit its marchers spread out", () => {
        const t = halfTurn();
        const middle = bendHandlePoint(paramsOf(t));
        const gapBefore = dist(
            lineSpots(paramsOf(t), 7)[0]!,
            lineSpots(paramsOf(t), 7)[1]!,
        );
        const wider = withSweep(paramsOf(t), 270);
        expect(dist(bendHandlePoint(wider), middle)).toBeLessThan(1e-6);
        const spots = lineSpots(wider, 7);
        expect(dist(spots[0]!, spots[1]!)).toBeGreaterThan(gapBefore);
    });

    it("drags in whole degrees and never turns a full circle", () => {
        const t = halfTurn();
        const roles = {
            fine: false,
            constrain: false,
            fromCenter: false,
        } as never;
        const more = bend().scrub(
            t.params,
            7,
            { dx: 20, dy: 0, axis: "x", roles },
            env,
        );
        expect(bendOf(more as LineParams)).toBeCloseTo(190, 6);
        const most = bend().scrub(
            t.params,
            7,
            { dx: 2000, dy: 0, axis: "x", roles },
            env,
        );
        expect(Math.abs(bendOf(most as LineParams))).toBeLessThanOrEqual(359);
    });

    it("keeps a locked interval as its degrees change, the circle sized to it", () => {
        let t = halfTurn();
        t = edit(t, arcTool.lock!.toggle(t.params, t.spots, env), ctx);
        const before = linePath(paramsOf(t)).length;
        t = edit(t, bend().type(t.params, t.spots, "90", env), ctx);
        expect(bendOf(paramsOf(t))).toBeCloseTo(90, 6);
        expect(linePath(paramsOf(t)).length).toBeCloseTo(before, 6);
    });
});

describe("its degrees' steps (owner on #634)", () => {
    it("stops at the widest or narrowest rather than refusing the step", () => {
        const widen = arcTool.params.find((p) => p.key === "bend")!.widen!;
        expect(Math.abs(bendOf(widen(arc(350), 7, 1, env) as LineParams))).toBe(
            359,
        );
        expect(widen(arc(359), 7, 1, env)).toBeNull();
        expect(Math.abs(bendOf(widen(arc(10), 7, -1, env) as LineParams))).toBe(
            1,
        );
    });
});

describe("its width-and-depth lock (owner on #634)", () => {
    it("is its own, apart from a box's spacing lock", () => {
        useShapeEditorStore.setState({
            ratioLocked: false,
            sizesLocked: false,
        });
        toggleSizesLock();
        expect(useShapeEditorStore.getState()).toMatchObject({
            sizesLocked: true,
            ratioLocked: false,
        });
        toggleSizesLock();
        expect(locksSizes(arcTool)).toBe(true);
    });
});

describe("turning and flipping", () => {
    it("bows the other way when mirrored, so it stays where it was drawn", () => {
        const p = arc(90);
        const frame = lineFrame(p);
        const flipped = withLineFrame(p, { ...frame, flipY: true });
        expect(bendOf(flipped)).toBe(-90);
        const path = linePath(flipped);
        expect(path.at(path.length / 2).y).toBeGreaterThan(0);
        // Turned, it keeps its sweep
        const turned = withLineFrame(p, { ...frame, rotation: Math.PI / 2 });
        expect(bendOf(turned)).toBe(90);
    });

    it("stays readable turned or flipped when closed all the way round on an ellipse", () => {
        const drawn = withEnds(
            withStretch(
                withBend(
                    {
                        ...arc(90),
                        points: [
                            { x: 3.7, y: 41.3, tension: 0 },
                            { x: 113, y: 12, tension: 0 },
                        ],
                    },
                    120,
                ),
                1.6,
            ),
            "circle",
        );
        expect(isArcParams(drawn)).toBe(true);
        const frame = lineFrame(drawn);
        for (let k = 1; k < 24; k++) {
            const turned = withLineFrame(drawn, {
                ...frame,
                rotation: frame.rotation + (k * Math.PI) / 12,
            });
            expect(isArcParams(turned), `turned ${k * 15}°`).toBe(true);
        }
        expect(
            isArcParams(withLineFrame(drawn, { ...frame, flipX: true })),
        ).toBe(true);
    });
});

describe("closing it", () => {
    it("closes by its chord, filling as a closed Line, and opens again as it was", () => {
        const p = arc(180);
        const chord = withEnds(p, "chord");
        expect(arcEnds(chord)).toBe("chord");
        expect(switchModes(arcTool, { params: chord, n: 8 })).toEqual([
            "files",
            "outline",
            "spread",
        ]);
        expect(distributionOf(arcTool, chord, 8)?.mode).toBe("outline");
        expect(withEnds(chord, "open")).toEqual(p);
    });

    it("keeps its fill switching between the two closes (owner on #634)", () => {
        const chord = {
            ...withEnds(arc(180), "chord"),
            distribution: { mode: "files", oddGap: "center" },
        } as LineParams;
        const circle = withEnds(chord, "circle");
        expect(circle.distribution).toEqual(chord.distribution);
        expect(withEnds(circle, "chord").distribution).toEqual(
            chord.distribution,
        );
        expect(withEnds(circle, "open").distribution).toBeUndefined();
    });

    it("closes round to a whole circle, its marchers evenly round it", () => {
        const circle = withEnds(arc(90), "circle");
        expect(arcEnds(circle)).toBe("circle");
        const spots = lineFillSpots(circle, 8, STEP);
        expect(spots).toHaveLength(8);
        const path = linePath(circle);
        expect(path.closed).toBe(true);
        // Every spot the same distance from the circle's center
        const center = {
            x: spots.reduce((s, q) => s + q.x, 0) / 8,
            y: spots.reduce((s, q) => s + q.y, 0) / 8,
        };
        const r = dist(spots[0]!, center);
        for (const q of spots) expect(dist(q, center)).toBeCloseTo(r, 6);
        expect(withEnds(circle, "open")).toEqual(arc(90));
    });

    it("keeps a circle a circle as it bends", () => {
        const circle = withEnds(arc(90), "circle");
        const bent = withBend(circle, 200);
        expect(isArcParams(bent)).toBe(true);
        expect(bent.points[1]!.bend).toBe(160);
    });

    it("closes from an end's right-click menu, one undo step", () => {
        const t = drawn(6, { x: 100, y: 200 }, { x: 160, y: 200 });
        const sections = arcTool.menu!.sections(t.params, t.spots, "p0")!;
        expect(sections[0]!.items.map((i) => i.value)).toEqual([
            "open",
            "chord",
            "circle",
        ]);
        const closed = pickMenu(t, "p0", "chord", ctx, env);
        expect(arcEnds(paramsOf(closed))).toBe("chord");
        expect(arcEnds(paramsOf(undo(closed)))).toBe("open");
    });

    it("closes from the editor's Open or closed menu", () => {
        const t = drawn(6, { x: 100, y: 200 }, { x: 160, y: 200 });
        const ends = arcTool.choices!.find((c) => c.key === "ends")!;
        expect(ends.current(t.params, t.spots)).toBe("open");
        const circle = ends.pick(t.params, t.spots, "circle", env);
        expect(arcEnds(circle)).toBe("circle");
    });
});

describe("switching kinds", () => {
    it("turns a drawn Circle into a half-circle arc across its frame", () => {
        let t = openTool(circleTool, marchers(6));
        t = pointerMove(t, { x: 100, y: 100 }, env);
        t = press(t, { x: 100, y: 100 }, env);
        t = pointerMove(t, { x: 130, y: 100 }, env);
        t = release(t, ctx, null);
        const switched = switchKind(t, arcTool, ctx, env);
        expect(switched.kind).toBe(arcTool);
        expect(isArcParams(switched.params)).toBe(true);
        expect(Math.abs(bendOf(paramsOf(switched)))).toBe(180);
    });
});

describe("its whole circle", () => {
    it("shows the circle the arc is part of, through both ends", () => {
        const p = arc(90);
        const [circle] = arcTool.construction!(p, 5);
        expect(circle).toBeDefined();
        for (const end of p.points)
            expect(dist(end, circle!.center)).toBeCloseTo(circle!.rx, 9);
        expect(arcTool.construction!(withEnds(p, "chord"), 5)).toHaveLength(1);
    });

    it("draws angle lines from the circle's center through each end, in the Guides menu", () => {
        const p = arc(90);
        const [circle] = arcTool.construction!(p, 5);
        expect(circle!.spokes).toHaveLength(2);
        circle!.spokes!.forEach((to, i) =>
            expect(dist(to, p.points[i]!)).toBeLessThan(1e-9),
        );
        expect(arcTool.guides).toEqual(["circle", "angles"]);
    });

    it("shows none once it's closed to a circle", () => {
        expect(arcTool.construction!(withEnds(arc(90), "circle"), 5)).toEqual(
            [],
        );
    });
});

describe("stretching it (owner on #634)", () => {
    const handleAt = (t: ToolState, key: string) =>
        t.kind.handles(t.params, t.spots, null).find((h) => h.key === key)!.at;

    it("has a handle at each end and one in the middle", () => {
        const t = halfTurn();
        const keys = t.kind.handles(t.params, t.spots, null).map((h) => h.key);
        expect(keys).toEqual(["p0", "p1", MIDDLE_KEY]);
        expect(dist(handleAt(t, MIDDLE_KEY), { x: 130, y: 170 })).toBeLessThan(
            1e-6,
        );
    });

    it("stretches side to side from an end, the other side staying, onto an ellipse", () => {
        let t = halfTurn();
        // p1 at (160, 200) dragged 20 further out: 60 wide → 80 wide, the left side at 100 kept
        t = onHandle(t, "p1", { x: 180, y: 200 });
        const p = paramsOf(t);
        const g = arcGuide(p)!;
        expect(ellipseOf(p)).toBeDefined();
        expect(g.rx).toBeCloseTo(40, 6);
        expect(g.ry).toBeCloseTo(30, 6);
        expect(Math.min(p.points[0]!.x, p.points[1]!.x)).toBeCloseTo(100, 6);
        expect(Math.abs(bendOf(p))).toBeCloseTo(180, 6);
        // In Fit, the marchers spread side to side
        const spots = lineSpots(p, 7);
        for (const q of spots)
            expect(
                ((q.x - g.center.x) / g.rx) ** 2 +
                    ((q.y - g.center.y) / g.ry) ** 2,
            ).toBeCloseTo(1, 3);
    });

    it("stretches front to back from the middle, its ends' line staying", () => {
        let t = halfTurn();
        t = onHandle(t, MIDDLE_KEY, { x: 130, y: 160 });
        const p = paramsOf(t);
        const g = arcGuide(p)!;
        expect(g.ry).toBeCloseTo(40, 6);
        expect(g.rx).toBeCloseTo(30, 6);
        for (const q of p.points) expect(q.y).toBeCloseTo(200, 6);
    });

    it("keeps its proportions with constrain", () => {
        let t = halfTurn();
        t = onHandle(t, "p1", { x: 180, y: 200 }, { ...env, constrain: true });
        const g = arcGuide(paramsOf(t))!;
        expect(ellipseOf(paramsOf(t))).toBeUndefined();
        expect(g.rx).toBeCloseTo(40, 6);
        expect(g.ry).toBeCloseTo(40, 6);
        // The ends' line stays
        for (const q of paramsOf(t).points) expect(q.y).toBeCloseTo(200, 6);
    });

    it("stretches about its circle's center with fromCenter", () => {
        let t = halfTurn();
        t = onHandle(t, "p1", { x: 170, y: 200 }, { ...env, fromCenter: true });
        const g = arcGuide(paramsOf(t))!;
        expect(g.center.x).toBeCloseTo(130, 6);
        expect(g.rx).toBeCloseTo(40, 6);
    });

    it("sticks back to a circle near equal sizes", () => {
        let t = halfTurn();
        t = onHandle(t, "p1", { x: 180, y: 200 });
        // 80 wide back to 61: within 5% of 60 deep
        t = onHandle(t, "p1", { x: 161, y: 200 });
        expect(ellipseOf(paramsOf(t))).toBeUndefined();
    });

    it("keeps its degrees, and its degrees then grow round the ellipse", () => {
        let t = halfTurn();
        t = onHandle(t, MIDDLE_KEY, { x: 130, y: 160 });
        const g = arcGuide(paramsOf(t))!;
        const wider = withSweep(paramsOf(t), 270);
        const now = arcGuide(wider)!;
        expect(now.rx).toBeCloseTo(g.rx, 6);
        expect(now.ry).toBeCloseTo(g.ry, 6);
        expect(dist(now.center, g.center)).toBeLessThan(1e-6);
    });

    it("reads the room it takes as width × depth, and takes typed ones", () => {
        const t = halfTurn();
        const width = arcTool.params.find((q) => q.key === "width")!;
        const depth = arcTool.params.find((q) => q.key === "depth")!;
        // A half circle 60 across: from end to end 6 steps, 3 deep
        expect(width.display(t.params, t.spots, STEP)).toBe("6");
        expect(depth.display(t.params, t.spots, STEP)).toBe("3");
        expect(width.words!(t.params, 7)).toEqual({});
        expect(depth.words!(t.params, 7)).toEqual({
            before: "×",
            after: "steps",
        });
        // A typed depth keeps its ends' line and width
        const typed = edit(t, depth.type(t.params, t.spots, "4", env), ctx);
        const p = paramsOf(typed);
        expect(arcGuide(p)!.ry).toBeCloseTo(40, 6);
        expect(arcGuide(p)!.rx).toBeCloseTo(30, 6);
        for (const q of p.points) expect(q.y).toBeCloseTo(200, 6);
        // A typed width keeps its middle
        const wide = width.type(t.params, t.spots, "8", env) as LineParams;
        expect(Math.abs(wide.points[0]!.x - wide.points[1]!.x)).toBeCloseTo(
            80,
            6,
        );
        expect((wide.points[0]!.x + wide.points[1]!.x) / 2).toBeCloseTo(130, 6);
    });

    it("changes its numbers with its degrees, its circle staying", () => {
        const t = halfTurn();
        const width = arcTool.params.find((q) => q.key === "width")!;
        const depth = arcTool.params.find((q) => q.key === "depth")!;
        // A quarter turn of a 30 circle: its ends 42.43 apart, 8.79 deep
        const quarter = withSweep(paramsOf(t), 90);
        expect(width.value!(quarter, 7, STEP)).toBeCloseTo(
            (2 * 30 * Math.SQRT1_2) / STEP,
            6,
        );
        expect(depth.value!(quarter, 7, STEP)).toBeCloseTo(
            (30 - 30 * Math.SQRT1_2) / STEP,
            6,
        );
        // Past a half turn it reads how wide it reaches, not its ends' gap
        const most = withSweep(paramsOf(t), 270);
        expect(width.value!(most, 7, STEP)).toBeCloseTo(6, 6);
        expect(depth.value!(most, 7, STEP)).toBeCloseTo(
            (30 + 30 * Math.SQRT1_2) / STEP,
            6,
        );
        // Typing a width past a half turn sizes its reach
        const typed = width.type(most, 7, "8", env) as LineParams;
        expect(arcGuide(typed)!.rx).toBeCloseTo(40, 6);
    });

    it("drags width and depth each on its own, both together with the lock", () => {
        const t = halfTurn();
        const width = arcTool.params.find((q) => q.key === "width")!;
        const depth = arcTool.params.find((q) => q.key === "depth")!;
        const roles = {
            fine: false,
            constrain: false,
            fromCenter: false,
        } as never;
        const wider = width.scrub(
            t.params,
            7,
            { dx: 16, dy: 0, axis: "x", roles },
            env,
        );
        expect(width.display(wider, 7, STEP)).toBe("7");
        expect(depth.display(wider, 7, STEP)).toBe("3");
        const both = width.scrub(
            t.params,
            7,
            { dx: 16, dy: 0, axis: "x", roles },
            { ...env, sizesLocked: true },
        );
        expect(width.display(both, 7, STEP)).toBe("7");
        // 3 × 7/6 = 3.5: the follower on half steps
        expect(depth.display(both, 7, STEP)).toBe("3½");
    });

    it("lands a locked follower on half steps", () => {
        const t = halfTurn();
        const width = arcTool.params.find((q) => q.key === "width")!;
        const depth = arcTool.params.find((q) => q.key === "depth")!;
        // 6 → 7.5 wide: 3 deep would follow to 3.75, landed on 4 (half steps of 10 are 5)
        const typed = width.type(t.params, 7, "7.5", {
            ...env,
            sizesLocked: true,
        }) as LineParams;
        expect(depth.value!(typed, 7, STEP)).toBeCloseTo(4, 6);
        // Off the ladder it follows exactly
        const free = width.type(t.params, 7, "7.5", {
            ...fine,
            sizesLocked: true,
        }) as LineParams;
        expect(depth.value!(free, 7, STEP)).toBeCloseTo(3.75, 6);
    });

    it("pulls a dragged handle onto a field line it comes near", () => {
        const lines = { x: [183], y: [157] };
        const pulled: ToolEnv = { ...env, fieldLines: lines, pullRadius: 4 };
        // An end dragged to 181 lands its end on the yard line at 183, off the half steps
        let t = onHandle(halfTurn(), "p1", { x: 181, y: 200 }, pulled);
        expect(Math.max(...paramsOf(t).points.map((q) => q.x))).toBeCloseTo(
            183,
            6,
        );
        // The middle dragged to 159 lands the arc's top on the line at 157
        t = onHandle(halfTurn(), MIDDLE_KEY, { x: 130, y: 159 }, pulled);
        expect(handleAt(t, MIDDLE_KEY).y).toBeCloseTo(157, 6);
        // Out of reach, or with the pulls off, it keeps to the half steps
        t = onHandle(halfTurn(), "p1", { x: 176, y: 200 }, pulled);
        expect(arcGuide(paramsOf(t))!.rx).toBeCloseTo(37.5, 6);
        t = onHandle(
            halfTurn(),
            "p1",
            { x: 181, y: 200 },
            { ...pulled, pull: false },
        );
        expect(arcGuide(paramsOf(t))!.rx).toBeCloseTo(40, 6);
    });

    it("keeps its proportions with the ratio lock, constrain freeing them", () => {
        const locked: ToolEnv = { ...env, sizesLocked: true };
        let t = onHandle(halfTurn(), "p1", { x: 180, y: 200 }, locked);
        expect(arcGuide(paramsOf(t))!.ry).toBeCloseTo(40, 6);
        // The host flips the lock with constrain: locked and held is free
        t = onHandle(
            halfTurn(),
            "p1",
            { x: 180, y: 200 },
            { ...env, constrain: true, sizesLocked: false },
        );
        expect(arcGuide(paramsOf(t))!.ry).toBeCloseTo(30, 6);
        expect(
            arcTool.honors!.handle!("p1", true, paramsOf(t), 7).constrain,
        ).toBe("freeRatio");
        // A typed width follows it too
        const width = arcTool.params.find((q) => q.key === "width")!;
        const u = halfTurn();
        const typed = width.type(u.params, u.spots, "8", locked)!;
        expect(arcGuide(typed as LineParams)!.ry).toBeCloseTo(40, 6);
        // The editor offers it just after the depth
        const depth = arcTool.params.find((q) => q.key === "depth")!;
        expect(arcTool.ratioLock).toBe(true);
        expect(depth.ratioLockAfter).toBe(true);
        expect(width.ratioLockAfter).toBeFalsy();
    });

    it("keeps its ends when its degrees change on an ellipse", () => {
        let t = halfTurn();
        t = onHandle(t, MIDDLE_KEY, { x: 130, y: 160 });
        const before = paramsOf(t).points.map(({ x, y }) => ({ x, y }));
        const degrees = arcTool.params.find((q) => q.key === "bend")!;
        const typed = edit(t, degrees.type(t.params, t.spots, "120", env), ctx);
        const p = paramsOf(typed);
        expect(Math.abs(bendOf(p))).toBeCloseTo(120, 6);
        expect(ellipseOf(p)).toBeDefined();
        p.points.forEach((q, i) =>
            expect(dist(q, before[i]!)).toBeLessThan(1e-6),
        );
    });

    it("closes all the way around an ellipse, and opens again", () => {
        let t = halfTurn();
        t = onHandle(t, MIDDLE_KEY, { x: 130, y: 160 });
        const p = paramsOf(t);
        const round = withEnds(p, "circle");
        expect(isArcParams(round)).toBe(true);
        expect(round.points[1]!.ellipse).toEqual(round.points[0]!.ellipse);
        const ends = arcTool.choices!.find((c) => c.key === "ends")!;
        expect(
            ends.options(round, 7).find((o) => o.value === "circle")!.label,
        ).toBe("Close all the way around");
        const g = arcGuide(p)!;
        for (const q of lineFillSpots(round, 8, STEP))
            expect(
                ((q.x - g.center.x) / g.rx) ** 2 +
                    ((q.y - g.center.y) / g.ry) ** 2,
            ).toBeCloseTo(1, 3);
        expect(withEnds(round, "open")).toEqual(p);
    });

    it("turns and mirrors its ellipse with the shape", () => {
        let t = halfTurn();
        t = onHandle(t, MIDDLE_KEY, { x: 130, y: 160 });
        const p = paramsOf(t);
        const frame = lineFrame(p);
        const turned = withLineFrame(p, {
            ...frame,
            rotation: frame.rotation + Math.PI / 2,
        });
        expect(arcGuide(turned)!.ry).toBeCloseTo(40, 6);
        const mirrored = withLineFrame(p, { ...frame, flipY: true });
        const m = arcGuide(mirrored)!;
        expect(m.rx).toBeCloseTo(30, 6);
        expect(m.ry).toBeCloseTo(40, 6);
        for (const q of lineSpots(mirrored, 7)) {
            const dx = q.x - m.center.x;
            const dy = q.y - m.center.y;
            const u = (dx * Math.cos(m.axis) + dy * Math.sin(m.axis)) / m.rx;
            const v = (-dx * Math.sin(m.axis) + dy * Math.cos(m.axis)) / m.ry;
            expect(u * u + v * v).toBeCloseTo(1, 3);
        }
    });
});

describe("measured side to side (owner on #634)", () => {
    const measured = () => arcTool.choices!.find((c) => c.key === "measured")!;
    const degrees = () => arcTool.params.find((q) => q.key === "bend")!;
    const quarter = () => {
        const t = drawn(7, { x: 100, y: 200 }, { x: 160, y: 200 });
        return paramsOf(t);
    };

    it("offers along, straight, side to side and front to back, but no offset", () => {
        const values = measured()
            .options(quarter(), 7)
            .map((o) => o.value);
        expect(values).toEqual(["along", "straight", "x", "y"]);
    });

    it("spaces its marchers evenly side to side, each on the arc", () => {
        const p = measured().pick(quarter(), 7, "x", env) as LineParams;
        expect(measured().current(p, 7)).toBe("x");
        const spots = lineSpots(p, 7);
        const g = arcGuide(p)!;
        spots.forEach((q, i) => {
            expect(q.x).toBeCloseTo(100 + i * 10, 6);
            expect(dist(q, g.center)).toBeCloseTo(g.rx, 6);
        });
    });

    it("keeps each marcher's side-to-side spot as its degrees change", () => {
        const p = measured().pick(quarter(), 7, "x", env) as LineParams;
        const deeper = degrees().type(p, 7, "150", env) as LineParams;
        lineSpots(deeper, 7).forEach((q, i) =>
            expect(q.x).toBeCloseTo(100 + i * 10, 6),
        );
    });

    it("can't be side to side once it wraps back past a half turn", () => {
        const most = withSweep(quarter(), 270);
        const x = measured()
            .options(most, 7)
            .find((o) => o.value === "x")!;
        expect(x.disabled).toBeTruthy();
    });
});

describe("its stretch (owner on #634)", () => {
    const param = (key: string) => arcTool.params.find((q) => q.key === key)!;
    const shown = (key: string, p: LineParams) =>
        param(key).shown?.(p, 7) ?? true;
    const deeper = () => paramsOf(onHandleTop(halfTurn(), { x: 130, y: 160 }));
    const onHandleTop = (t: ToolState, to: XY) => {
        let s = pointerMove(t, { x: 130, y: 170 }, env);
        s = press(s, { x: 130, y: 170 }, env);
        s = pointerMove(s, to, env);
        return release(s, ctx, null);
    };
    const keep = (p: LineParams) =>
        arcTool
            .choices!.find((c) => c.key === "spacing")!
            .pick(p, 7, "keep", env) as LineParams;

    it("always shows the stretch, a circle as 1× circle, and no radius", () => {
        const round = paramsOf(halfTurn());
        expect(shown("stretch", round)).toBe(true);
        expect(param("stretch").display(round, 7, STEP)).toBe("1×");
        expect(param("stretch").words!(round, 7)!.after).toBe("circle");
        // Typed on a circle, it becomes an ellipse again
        const typed = param("stretch").type(round, 7, "1.4", env) as LineParams;
        expect(arcStretch(typed)).toBeCloseTo(1.4, 6);
        expect(arcTool.params.map((q) => q.key)).not.toContain("radius");
        const oval = deeper();
        expect(shown("stretch", oval)).toBe(true);
        expect(param("stretch").display(oval, 7, STEP)).toBe("1.33×");
        expect(param("stretch").words!(oval, 7)).toEqual({
            before: "·",
            after: "tall",
        });
    });

    it("takes a typed stretch, keeping its ends and degrees up to a half turn", () => {
        const p = deeper();
        const ends = p.points.map(({ x, y }) => ({ x, y }));
        const twice = param("stretch").type(p, 7, "2", env) as LineParams;
        expect(arcStretch(twice)).toBeCloseTo(2, 6);
        twice.points.forEach((q, i) =>
            expect(dist(q, ends[i]!)).toBeLessThan(1e-6),
        );
        expect(Math.abs(bendOf(twice))).toBeCloseTo(180, 6);
        const wide = param("stretch").type(p, 7, "1.5 wide", env) as LineParams;
        expect(arcStretch(wide)).toBeCloseTo(1 / 1.5, 6);
        expect(param("stretch").words!(wide, 7)!.after).toBe("wide");
        // A decimal comma reads as a point; more than one number isn't a stretch
        const comma = param("stretch").type(
            p,
            7,
            "2,5 tall",
            env,
        ) as LineParams;
        expect(arcStretch(comma)).toBeCloseTo(2.5, 6);
        expect(param("stretch").type(p, 7, "1/2", env)).toBeNull();
        expect(param("stretch").type(p, 7, "1.5x2", env)).toBeNull();
    });

    it("makes a circle typed 1, its ends and degrees kept", () => {
        const p = deeper();
        const round = param("stretch").type(p, 7, "1", env)!;
        expect(isRound(round)).toBe(true);
        expect(ellipseOf(round)).toBeUndefined();
        round.points.forEach((q, i) =>
            expect(dist(q, p.points[i]!)).toBeLessThan(1e-6),
        );
    });

    it("drags through a circle in notches", () => {
        const p = deeper(); // 1.33× deep
        const roles = {
            fine: false,
            constrain: false,
            fromCenter: false,
        } as never;
        // 7 notches of 0.05 back: 0.33 → about 0, landed on a circle
        const back = param("stretch").scrub(
            p,
            7,
            { dx: -28, dy: 0, axis: "x", roles },
            env,
        );
        expect(isRound(back as LineParams)).toBe(true);
        const past = param("stretch").scrub(
            p,
            7,
            { dx: -40, dy: 0, axis: "x", roles },
            env,
        );
        expect(param("stretch").words!(past as LineParams, 7)!.after).toBe(
            "wide",
        );
    });

    it("moves its interval in Fit and its ends in Keep interval", () => {
        const interval = param("interval");
        const fit = deeper();
        const fitMore = param("stretch").type(fit, 7, "2", env) as LineParams;
        expect(interval.value!(fitMore, 7, STEP)).toBeGreaterThan(
            interval.value!(fit, 7, STEP),
        );
        const kept = keep(fit);
        const keptMore = param("stretch").type(kept, 7, "2", env) as LineParams;
        expect(interval.value!(keptMore, 7, STEP)).toBeCloseTo(
            interval.value!(kept, 7, STEP),
            6,
        );
        expect(dist(keptMore.points[1]!, kept.points[1]!)).toBeGreaterThan(1);
    });

    it("keeps the guide's width past a half turn", () => {
        const most = withSweep(deeper(), 270);
        const g = arcGuide(most)!;
        const p = param("stretch").type(most, 7, "2", env) as LineParams;
        expect(arcGuide(p)!.rx).toBeCloseTo(g.rx, 6);
        expect(arcStretch(p)).toBeCloseTo(2, 6);
    });
});

describe("dragging its stretch onto a circle (#634)", () => {
    it("keeps the stretch in the editor, reading 1× circle", () => {
        const t = halfTurn();
        let s = pointerMove(t, { x: 130, y: 170 }, env);
        s = press(s, { x: 130, y: 170 }, env);
        s = pointerMove(s, { x: 130, y: 160 }, env);
        const oval = paramsOf(release(s, ctx, null));
        const stretch = arcTool.params.find((q) => q.key === "stretch")!;
        const round = stretch.type(oval, 7, "1", env)!;
        const keys = (dragged: string | null) =>
            chipLayout(arcTool, round, 7, env, dragged).values.map(
                (v) => v.param.key,
            );
        expect(keys(null)).toContain("stretch");
        expect(stretch.display(round, 7, STEP)).toBe("1×");
        expect(stretch.words!(round, 7)!.after).toBe("circle");
    });
});
