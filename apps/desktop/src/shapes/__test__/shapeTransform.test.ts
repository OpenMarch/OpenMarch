import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { boxShape } from "../box/boxShape";
import { type BoxParams } from "../box/boxGeometry";
import { frameDrawing } from "../field/fieldModeBase";
import { DEGREE, pivotPoint, type PivotKey } from "../frame/frame";
import {
    dragShape,
    flipShape,
    startShapeGesture,
    turnShape,
} from "../frame/gestures";
import { lengthReadout, scaleReadout, scaleShape } from "../frame/scale";
import { boxesAt, type PlacedRecipe } from "../placed/placedBox";
import { placementOf } from "../tool/shapePlacement";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    targetsOf,
    undo,
    type ToolState,
} from "../tool/toolMachine";
import { flipSelection, selectionPivot } from "../transform/selectionTransform";
import type { ShapeContext, XY } from "../types";
import {
    gapListTool,
    rowTool,
    spreadTool,
    type SpreadParams,
} from "./fakeRowKind";

/**
 * The Transform section's host side (#349, spec #344): scaling by interval or by footprint in half
 * steps around the pivot, handles snapping spacings to half steps (fine: hundredths) with a length
 * readout, a shape's turn and flip surviving a reselect, and a plain selection turned and flipped
 * with positions only. Driven with the box and with fake kinds the host has never heard of.
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

/** The steps between neighbors, from where the marchers go */
const gapsOf = (t: ToolState) => {
    const xs = targetsOf(t, ctx)
        .map((x) => x.to.x)
        .sort((a, b) => a - b);
    const distinct = xs.filter((x, i) => i === 0 || x - xs[i - 1]! > 1e-6);
    return distinct.slice(1).map((x, i) => (x - distinct[i]!) / STEP);
};

const INTERVAL_KINDS: readonly [string, AnyToolKind][] = [
    ["the box", boxTool],
    ["a fake row", rowTool],
];

describe.each(INTERVAL_KINDS)("scaling %s by interval", (_name, kind) => {
    const N = 6;
    const open = () => drawn(kind, N, { x: 0, y: 0 }, { x: 100, y: 40 });

    it("− and + change every spacing by half a step, as one undo step that keeps who goes where", () => {
        const t = open();
        const before = gapsOf(t);
        const wider = edit(
            t,
            scaleShape(kind, t.params, N, 1, "c", env()),
            ctx,
        );
        expect(gapsOf(wider)).toEqual(before.map((g) => g + 0.5));
        expect(wider.assignment).toEqual(t.assignment);
        expect(undo(wider).params).toBe(t.params);

        const closer = edit(
            t,
            scaleShape(kind, t.params, N, -1, "c", env()),
            ctx,
        );
        expect(gapsOf(closer)).toEqual(before.map((g) => g - 0.5));
    });

    it("grows around the pivot: the pivot point stays put", () => {
        const t = open();
        for (const pivot of ["c", "nw", "e"] as PivotKey[]) {
            const was = pivotPoint(kind.frameOf(t.params, N), pivot);
            const scaled = scaleShape(kind, t.params, N, 1, pivot, env());
            const now = pivotPoint(kind.frameOf(scaled, N), pivot);
            // The box goes back on the grid, which can shift it a quarter step
            expect(near(was, now, STEP / 4 + 1e-6)).toBe(true);
        }
    });

    it("can't take a spacing under half a step", () => {
        let params = open().params;
        for (let i = 0; i < 20; i++) {
            const next = scaleShape(kind, params, N, -1, "c", env());
            if (next === null) break;
            params = next;
        }
        expect(scaleShape(kind, params, N, -1, "c", env())).toBeNull();
        // Every spacing changes together, so − stops once one is half a step
        expect(scaleReadout(kind, params, N, env())).toMatch(/ ½ /);
    });

    it("keeps its turn and flip through a scale", () => {
        const t = open();
        const turned = turnShape(kind, t.params, N, 30 * DEGREE, "c", env());
        const flipped = flipShape(kind, turned, N, "across", "c", env());
        const scaled = scaleShape(kind, flipped, N, 1, "c", env());
        const a = kind.frameOf(flipped, N);
        const b = kind.frameOf(scaled, N);
        expect(b.rotation).toBeCloseTo(a.rotation);
        expect([b.flipX, b.flipY]).toEqual([a.flipX, a.flipY]);
    });
});

describe("scaling a shape with uneven gaps (spec #344 story 36)", () => {
    const N = 4;
    /** A row of four drawn, then typed to gaps of 4, 4 and 2 steps */
    const open = () => {
        const t = drawn(gapListTool, N, { x: 0, y: 0 }, { x: 90, y: 0 });
        const [gaps] = gapListTool.params;
        return edit(t, gaps!.type(t.params, N, "4, 4, 2", env())!, ctx);
    };

    it("+ and − change every gap of the list by half a step", () => {
        const t = open();
        expect(gapsOf(t)).toEqual([4, 4, 2]);
        const wider = edit(
            t,
            scaleShape(gapListTool, t.params, N, 1, "c", env()),
            ctx,
        );
        expect(gapsOf(wider)).toEqual([4.5, 4.5, 2.5]);
        const closer = edit(
            t,
            scaleShape(gapListTool, t.params, N, -1, "c", env()),
            ctx,
        );
        expect(gapsOf(closer)).toEqual([3.5, 3.5, 1.5]);
        expect(scaleReadout(gapListTool, wider.params, N, env())).toBe(
            "4½, 4½, 2½ apart",
        );
    });

    it("− stops when the smallest gap is half a step", () => {
        const t = open();
        const [gaps] = gapListTool.params;
        const tight = gaps!.type(t.params, N, "3, 3, 0.5", env())!;
        expect(scaleShape(gapListTool, tight, N, -1, "c", env())).toBeNull();
    });
});

describe("the box's scale", () => {
    it("reads its spacings, and ignores the ratio lock: both change by half a step", () => {
        const t = drawn(boxTool, 8, { x: 0, y: 0 }, { x: 60, y: 20 });
        const p = t.params as BoxParams;
        expect(scaleReadout(boxTool, p, 8, env())).toBe("↔ 2 ↕ 2 apart");
        const locked = { ...p, deep: 30 };
        const scaled = scaleShape(
            boxTool,
            locked,
            8,
            1,
            "c",
            env({ ratioLocked: true }),
        ) as BoxParams;
        expect([scaled.across, scaled.deep]).toEqual([25, 35]);
    });
});

describe("scaling a footprint kind", () => {
    const N = 5;
    const open = () => drawn(spreadTool, N, { x: 0, y: 0 }, { x: 80, y: 0 });

    it("scales its footprint in half steps, not a spacing", () => {
        const t = open();
        const length = (t.params as SpreadParams).length;
        expect(scaleReadout(spreadTool, t.params, N, env())).toBe("8 steps");
        const wider = edit(
            t,
            scaleShape(spreadTool, t.params, N, 1, "c", env()),
            ctx,
        );
        expect((wider.params as SpreadParams).length).toBe(length + half);
        expect(scaleReadout(spreadTool, wider.params, N, env())).toBe(
            "8½ steps",
        );
        const closer = scaleShape(spreadTool, t.params, N, -1, "w", env());
        expect((closer as SpreadParams).length).toBe(length - half);
        // Grown from the west end, that end stays put
        expect(
            near(
                pivotPoint(spreadTool.frameOf(closer, N), "w"),
                pivotPoint(spreadTool.frameOf(t.params, N), "w"),
            ),
        ).toBe(true);
    });

    it("can't go under half a step", () => {
        const tiny: SpreadParams = {
            center: { x: 0, y: 0 },
            length: half,
            rotation: 0,
        };
        expect(scaleShape(spreadTool, tiny, N, -1, "c", env())).toBeNull();
    });
});

describe("handles snap spacings", () => {
    const N = 8;
    const box = () =>
        drawn(boxTool, N, { x: 0, y: 0 }, { x: 60, y: 20 }).params as BoxParams;
    const stretched = (to: XY, over: Partial<ToolEnv> = {}) => {
        const b = box();
        const g = startShapeGesture(
            boxTool,
            b,
            N,
            pivotPoint(boxTool.frameOf(b, N), "e"),
            env(),
        )!;
        expect(g.type).toBe("handle");
        return dragShape(boxTool, N, g, to, env(over)) as BoxParams;
    };

    it("to half steps", () => {
        // 4 across from x = 0: the east edge dragged to 77 spreads 3 gaps of 25.67, so 2½ steps
        expect(stretched({ x: 77, y: 5 }).across).toBe(25);
    });

    it("to hundredths of a step with fine (#411)", () => {
        // 2.5667 steps is 2.57
        expect(stretched({ x: 77, y: 5 }, { snap: false }).across).toBeCloseTo(
            25.7,
        );
    });

    it("show a length readout by the pointer while dragged", () => {
        const b = box();
        const at = pivotPoint(boxTool.frameOf(b, N), "e");
        const g = startShapeGesture(boxTool, b, N, at, env())!;
        const to = { x: 77, y: 5 };
        const params = dragShape(boxTool, N, g, to, env());
        const drawing = frameDrawing(boxTool, params, N, g, to, env());
        expect(drawing.tip).toEqual({
            at: to,
            text: "7½ × 2 steps · ↔ 2½ ↕ 2 apart",
        });
        expect(lengthReadout(rowTool, rowParams(), 4, env())).toBe(
            "6 steps · ↔ 2 apart",
        );
    });
});

const rowParams = () => ({ center: { x: 0, y: 0 }, gap: 20, rotation: 0 });

describe("a placed shape remembers its turn and flip", () => {
    it.each(INTERVAL_KINDS)("in the recipe placed from %s", (_name, kind) => {
        const N = 6;
        let t = drawn(kind, N, { x: 0, y: 0 }, { x: 100, y: 40 });
        t = edit(t, turnShape(kind, t.params, N, 30 * DEGREE, "c", env()), ctx);
        t = edit(t, flipShape(kind, t.params, N, "deep", "c", env()), ctx);
        const frame = kind.frameOf(t.params, N);
        const stored = placementOf(t, ctx)!.recipe.params as object;
        const reopened = kind.frameOf(JSON.parse(JSON.stringify(stored)), N);
        expect(reopened.rotation).toBeCloseTo(frame.rotation);
        expect([reopened.flipX, reopened.flipY]).toEqual([
            frame.flipX,
            frame.flipY,
        ]);
    });

    it("and the box comes back turned and flipped when selected again", () => {
        const N = 6;
        let t = drawn(boxTool, N, { x: 0, y: 0 }, { x: 100, y: 40 });
        t = edit(
            t,
            turnShape(boxTool, t.params, N, 30 * DEGREE, "c", env()),
            ctx,
        );
        t = edit(t, flipShape(boxTool, t.params, N, "across", "c", env()), ctx);
        const placement = placementOf(t, ctx)!;
        const recipe: PlacedRecipe = {
            ...placement.recipe,
            id: 1,
            timelineId: 10,
            members: placement.members,
            params: JSON.parse(JSON.stringify(placement.recipe.params)),
        };
        expect(recipe.kind).toBe(boxShape.id);
        const at = new Map(
            placement.members.map((m) => [m.marcherId, { x: m.x, y: m.y }]),
        );
        const [box] = boxesAt({
            recipes: [recipe],
            endBeatOf: () => 8,
            beat: 8,
            positionOf: (id) => at.get(id),
        });
        const was = boxTool.frameOf(t.params, N);
        const now = boxTool.frameOf(box!.params, box!.spots);
        expect(now.rotation).toBeCloseTo(was.rotation);
        expect([now.flipX, now.flipY]).toEqual([was.flipX, was.flipY]);
    });
});

describe("a plain selection", () => {
    const points = [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 40, y: 0 },
        { id: 3, x: 40, y: 20 },
    ];

    it("flips about a line through the pivot, keeping who is who", () => {
        expect(flipSelection(points, "across", "c")).toEqual([
            { id: 1, x: 40, y: 0 },
            { id: 2, x: 0, y: 0 },
            { id: 3, x: 0, y: 20 },
        ]);
        expect(flipSelection(points, "across", "w").map((p) => p.x)).toEqual([
            0, -40, -40,
        ]);
        expect(flipSelection(points, "deep", "s").map((p) => p.y)).toEqual([
            40, 40, 20,
        ]);
    });

    it("puts the pivot on the box around them", () => {
        expect(selectionPivot(points, "ne")).toEqual({ x: 40, y: 0 });
        expect(selectionPivot(points, "c")).toEqual({ x: 20, y: 10 });
    });
});
