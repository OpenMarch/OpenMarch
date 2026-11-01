import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { frameDrawing } from "../field/fieldModeBase";
import {
    DEGREE,
    pivotAt,
    pivotPoint,
    type Pivot,
    type ShapeFrame,
} from "../frame/frame";
import {
    flipShape,
    frameControls,
    shapeTargetAt,
    turnShape,
} from "../frame/gestures";
import { pivotOf, snapPivot, withPivot } from "../frame/pivot";
import { scaleShape } from "../frame/scale";
import { openLive, moveLive, pressLive, releaseLive } from "../placed/liveBox";
import { boxesAt, type PlacedRecipe } from "../placed/placedBox";
import { placementOf } from "../tool/shapePlacement";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    switchKind,
    undo,
    type ToolState,
} from "../tool/toolMachine";
import type { ShapeContext, XY } from "../types";
import { rowTool, spreadTool } from "./fakeRowKind";

/**
 * The draggable pivot (#350, spec #344): a reach-inside ($mod) drag from the center dot pulls it
 * out, it then drags on its own, snaps to marchers, the frame's 9 points and half steps (fine off), and a double
 * click sends it back to the center. Turning, flipping and scaling go around it, and it is saved
 * with the shape. Driven with the box and with fake kinds the host has never heard of.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
const env = (over: Partial<ToolEnv> = {}): ToolEnv => ({
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
    ...over,
});
const ctx: ShapeContext = { stepPx: STEP, snapPoint: (p) => p };
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));
const near = (a: XY, b: XY, eps = 1e-6) =>
    Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

function drawn(kind: AnyToolKind, n: number, from: XY, to: XY): ToolState {
    let t = openTool(kind, marchers(n));
    t = press(t, from, env());
    t = pointerMove(t, to, env());
    return release(t, ctx);
}

/** A press at `from`, a drag to `to` and a release, with `over` held */
function dragged(
    t: ToolState,
    from: XY,
    to: XY,
    over: Partial<ToolEnv> = {},
): ToolState {
    t = press(t, from, env(over));
    t = pointerMove(t, to, env(over));
    return release(t, ctx);
}

const pivotField = (kind: AnyToolKind, t: ToolState) =>
    pivotPoint(kind.frameOf(t.params, t.spots), pivotOf(t.params));

const N = 6;
const KINDS: readonly [string, AnyToolKind, XY, XY][] = [
    // 3 × 2 box, 20 by 10, around (110, 105)
    ["the box", boxTool, { x: 100, y: 100 }, { x: 120, y: 110 }],
    ["a fake row", rowTool, { x: 100, y: 100 }, { x: 150, y: 100 }],
    ["a fake spread", spreadTool, { x: 100, y: 100 }, { x: 150, y: 100 }],
];

const frame = (over: Partial<ShapeFrame> = {}): ShapeFrame => ({
    center: { x: 100, y: 100 },
    halfWidth: 20,
    halfDepth: 10,
    rotation: 0,
    flipX: false,
    flipY: false,
    ...over,
});

describe("a free pivot on the frame", () => {
    it("sits where it was put, and reads back as one of the 9 points when it is one", () => {
        const f = frame({ rotation: 30 * DEGREE });
        const at = { x: 113, y: 91 };
        const p = pivotAt(f, at);
        expect(typeof p).toBe("object");
        expect(near(pivotPoint(f, p), at)).toBe(true);
        expect(pivotAt(f, pivotPoint(f, "ne"))).toBe("ne");
        expect(pivotAt(f, f.center)).toBe("c");
    });

    it("moves, turns and stretches with its frame", () => {
        const f = frame();
        // Halfway to the right edge, on the front edge
        const p = pivotAt(f, { x: 110, y: 110 });
        expect(pivotPoint({ ...f, center: { x: 0, y: 0 } }, p)).toEqual({
            x: 10,
            y: 10,
        });
        expect(
            near(pivotPoint({ ...f, halfWidth: 40 }, p), { x: 120, y: 110 }),
        ).toBe(true);
        expect(
            near(pivotPoint({ ...f, rotation: 90 * DEGREE }, p), {
                x: 90,
                y: 110,
            }),
        ).toBe(true);
    });

    it("can sit off a line, which has no depth", () => {
        const line = frame({ halfDepth: 0 });
        const at = { x: 104, y: 120 };
        expect(near(pivotPoint(line, pivotAt(line, at)), at)).toBe(true);
    });
});

describe("snapping the pivot", () => {
    const f = frame();
    const at = (p: XY, over: Partial<ToolEnv> = {}, marchersAt: XY[] = []) =>
        pivotPoint(
            f,
            snapPivot(f, p, env({ pivotSnaps: () => marchersAt, ...over })),
        );

    it("snaps to a marcher near the pointer", () => {
        const marcher = { x: 131.3, y: 87.9 };
        expect(at({ x: 130, y: 89 }, {}, [marcher])).toEqual(marcher);
    });

    it("snaps to the frame's 9 points, saved as that point", () => {
        const f2 = frame({ rotation: 20 * DEGREE });
        const corner = pivotPoint(f2, "sw");
        expect(snapPivot(f2, { x: corner.x + 1, y: corner.y - 1 }, env())).toBe(
            "sw",
        );
    });

    it("snaps to half steps anywhere else", () => {
        expect(at({ x: 141.2, y: 76.6 })).toEqual({ x: 140, y: 75 });
    });

    it("doesn't snap with fine", () => {
        const marcher = { x: 131.3, y: 87.9 };
        const p = at({ x: 130.4, y: 89.1 }, { snap: false }, [marcher]);
        expect(near(p, { x: 130.4, y: 89.1 })).toBe(true);
    });
});

describe.each(KINDS)("the pivot on the field, with %s", (_, kind, a, b) => {
    const open = () => drawn(kind, N, a, b);

    it("a new shape starts centered", () => {
        expect(pivotOf(open().params)).toBe("c");
    });

    it("a reach-inside ($mod) drag from the center dot moves the pivot, as one undo step", () => {
        const t = open();
        const { center } = kind.frameOf(t.params, N);
        const to = { x: center.x + 30, y: center.y - 20 };
        const moved = dragged(t, center, to, { reachInside: true });
        // The shape stays where it was
        expect(kind.frameOf(moved.params, N)).toEqual(
            kind.frameOf(t.params, N),
        );
        expect(near(pivotField(kind, moved), to)).toBe(true);
        expect(moved.past.length).toBe(t.past.length + 1);
        expect(pivotOf(undo(moved).params)).toBe("c");
    });

    it("a plain drag on the center dot still moves the shape", () => {
        const t = open();
        const { center } = kind.frameOf(t.params, N);
        const moved = dragged(t, center, { x: center.x + 20, y: center.y });
        expect(kind.frameOf(moved.params, N).center.x).toBeCloseTo(
            center.x + 20,
        );
        expect(pivotOf(moved.params)).toBe("c");
    });

    it("once out, the pivot drags on its own, and the field draws it", () => {
        const t = open();
        const { center } = kind.frameOf(t.params, N);
        const out = { x: center.x + 30, y: center.y - 20 };
        let moved = dragged(t, center, out, { reachInside: true });
        expect(shapeTargetAt(kind, moved.params, N, out, env())).toEqual({
            type: "pivot",
        });
        const drawing = frameDrawing(kind, moved.params, N, null, null, env());
        expect(near(drawing.pivotMark!, out)).toBe(true);
        moved = dragged(moved, out, { x: out.x + 10, y: out.y + 5 });
        expect(
            near(pivotField(kind, moved), { x: out.x + 10, y: out.y + 5 }),
        ).toBe(true);
        expect(kind.frameOf(moved.params, N)).toEqual(
            kind.frameOf(t.params, N),
        );
    });

    it("a centered pivot draws no crosshair of its own", () => {
        const t = open();
        expect(
            frameDrawing(kind, t.params, N, null, null, env()).pivotMark,
        ).toBeUndefined();
    });

    it("a double click on the pivot sends it back to the center", () => {
        const t = open();
        const { center } = kind.frameOf(t.params, N);
        const out = { x: center.x + 30, y: center.y - 20 };
        let moved = dragged(t, center, out, { reachInside: true });
        moved = press(moved, out, env());
        moved = release(moved, ctx, { double: true });
        expect(pivotOf(moved.params)).toBe("c");
    });

    it("turns go around a moved pivot", () => {
        const t = open();
        const { center } = kind.frameOf(t.params, N);
        const out = { x: center.x + 30, y: center.y - 20 };
        const moved = dragged(t, center, out, { reachInside: true });
        const turned = edit(
            moved,
            turnShape(
                kind,
                moved.params,
                N,
                90 * DEGREE,
                pivotOf(moved.params),
                env({ snap: false }),
            ),
            ctx,
        );
        expect(kind.frameOf(turned.params, N).rotation).toBeCloseTo(
            90 * DEGREE,
        );
        expect(near(pivotField(kind, turned), out, 1e-6)).toBe(true);
        // The center swung around it
        expect(
            near(kind.frameOf(turned.params, N).center, {
                x: out.x - 20,
                y: out.y - 30,
            }),
        ).toBe(true);
    });

    it("the rotate knob turns around a moved pivot too", () => {
        const t = open();
        const { center } = kind.frameOf(t.params, N);
        const out = { x: center.x + 30, y: center.y };
        const moved = dragged(t, center, out, { reachInside: true });
        const { knob } = frameControls(kind, moved.params, N, env());
        // A quarter turn clockwise around the pivot
        const v = { x: knob.x - out.x, y: knob.y - out.y };
        const turned = dragged(moved, knob, {
            x: out.x - v.y,
            y: out.y + v.x,
        });
        expect(near(pivotField(kind, turned), out, 1e-6)).toBe(true);
    });

    it("flips go around a moved pivot, and twice is where it started", () => {
        const t = open();
        const { center } = kind.frameOf(t.params, N);
        const out = { x: center.x + 30, y: center.y - 20 };
        const moved = dragged(t, center, out, { reachInside: true });
        const flip = (s: ToolState) =>
            edit(
                s,
                flipShape(
                    kind,
                    s.params,
                    N,
                    "across",
                    pivotOf(s.params),
                    env(),
                ),
                ctx,
            );
        const once = flip(moved);
        expect(kind.frameOf(once.params, N).center.x).toBeCloseTo(
            2 * out.x - center.x,
        );
        expect(near(pivotField(kind, once), out)).toBe(true);
        const twice = flip(once);
        expect(near(kind.frameOf(twice.params, N).center, center)).toBe(true);
        expect(near(pivotField(kind, twice), out)).toBe(true);
    });

    it("scaling goes around a moved pivot", () => {
        const t = open();
        const { center } = kind.frameOf(t.params, N);
        // A corner marcher, so the box's spots stay on half steps as it grows from it
        const corner = pivotPoint(kind.frameOf(t.params, N), "se");
        const moved = dragged(t, center, corner, { reachInside: true });
        expect(near(pivotField(kind, moved), corner)).toBe(true);
        const scaled = scaleShape(
            kind,
            moved.params,
            N,
            1,
            pivotOf(moved.params),
            env(),
        );
        expect(scaled).not.toBeNull();
        const grown = edit(moved, scaled, ctx);
        expect(near(pivotField(kind, grown), corner)).toBe(true);
        expect(kind.frameOf(grown.params, N).halfWidth).toBeGreaterThan(
            kind.frameOf(moved.params, N).halfWidth,
        );
    });

    it("picking another kind keeps the pivot with the frame", () => {
        const t = open();
        const { center } = kind.frameOf(t.params, N);
        const moved = dragged(
            t,
            center,
            pivotPoint(kind.frameOf(t.params, N), "e"),
            { reachInside: true },
        );
        const other = kind === rowTool ? spreadTool : rowTool;
        const switched = switchKind(moved, other, ctx, env());
        expect(pivotOf(switched.params)).toBe("e");
    });

    it("is placed with the shape: the recipe keeps it", () => {
        const t = open();
        const { center } = kind.frameOf(t.params, N);
        const out = { x: center.x + 30, y: center.y - 20 };
        const moved = dragged(t, center, out, { reachInside: true });
        const stored = placementOf(moved, ctx)!.recipe.params as {
            pivot?: Pivot;
        };
        expect(stored.pivot).toEqual(pivotOf(moved.params));
    });
});

describe("a pivot of its own stays put when the shape settles on the grid", () => {
    it("turning a box around an off-grid point keeps the pivot there", () => {
        const t = drawn(boxTool, N, { x: 100, y: 100 }, { x: 120, y: 110 });
        const { center } = boxTool.frameOf(t.params, N);
        // Dropped with fine, so off the half steps (a marcher standing there, say)
        const out = { x: center.x + 31.3, y: center.y - 18.6 };
        const moved = dragged(t, center, out, {
            reachInside: true,
            snap: false,
            fine: true,
        });
        for (const degrees of [90, 37]) {
            const turned = edit(
                moved,
                turnShape(
                    boxTool,
                    moved.params,
                    N,
                    degrees * DEGREE,
                    pivotOf(moved.params),
                    env(),
                ),
                ctx,
            );
            expect(near(pivotField(boxTool, turned), out)).toBe(true);
        }
    });
});

describe("a placed box keeps its pivot", () => {
    /** A box drawn with its pivot on its right edge, placed, and read back from its recipe */
    const placed = () => {
        let t = drawn(boxTool, N, { x: 100, y: 100 }, { x: 120, y: 110 });
        t = edit(t, withPivot(t.params, "e"), ctx);
        const placement = placementOf(t, ctx)!;
        const recipe: PlacedRecipe = {
            ...placement.recipe,
            id: 1,
            timelineId: 10,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        };
        const at = new Map(
            placement.members.map((m) => [m.marcherId, { x: m.x, y: m.y }]),
        );
        const [box] = boxesAt({
            recipes: [recipe],
            endBeatOf: () => 8,
            beat: 8,
            positionOf: (id) => at.get(id),
        });
        return box!;
    };

    it("reopens with the pivot where it was left", () => {
        expect(pivotOf(placed().params)).toBe("e");
    });

    it("its pivot drags on the field, and a pivot-only change is saved", () => {
        const box = placed();
        const from = pivotPoint(boxTool.frameOf(box.params, N), "e");
        const to = { x: from.x + 20, y: from.y + 20 };
        let live = pressLive(openLive(box), from, env())!;
        expect(live.gesture?.type).toBe("pivot");
        live = moveLive(live, to, env());
        const out = releaseLive(live);
        expect(out.changed).toBe(true);
        expect(
            near(
                pivotPoint(
                    boxTool.frameOf(out.live.params, N),
                    pivotOf(out.live.params),
                ),
                to,
            ),
        ).toBe(true);
    });

    it("a double click on its pivot sends it back to the center", () => {
        const box = placed();
        const at = pivotPoint(boxTool.frameOf(box.params, N), "e");
        const live = pressLive(openLive(box), at, env())!;
        const out = releaseLive(live, { double: true });
        expect(out.changed).toBe(true);
        expect(pivotOf(out.live.params)).toBe("c");
    });
});
