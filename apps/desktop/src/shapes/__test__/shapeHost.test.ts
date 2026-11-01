import { describe, expect, it } from "vitest";
import { boxTool } from "../box/boxTool";
import { filesOf, ranksOf, type BoxParams } from "../box/boxGeometry";
import { chipLayout } from "../editor/chip";
import { DEGREE } from "../frame/frame";
import { flipShape, turnShape } from "../frame/gestures";
import { placementOf } from "../tool/shapePlacement";
import { selectMarchersFirst, shapeSelectionGate } from "../tool/selectionGate";
import { kindPickGate } from "../tool/pickKind";
import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import {
    canRecalculate,
    edit,
    openTool,
    pointerMove,
    press,
    recalculate,
    release,
    slotsOf,
    switchKind,
    targetsOf,
    undo,
    redo,
    type ToolState,
} from "../tool/toolMachine";
import type { ShapeContext, XY } from "../types";
import { rowTool } from "./fakeRowKind";

/**
 * The shape host (#344, #345): the shape session, the chip and placing, driven with the box and
 * with a fake kind the host has never heard of, so nothing in the host depends on one kind
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
const near = (a: XY, b: XY) =>
    Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
/** Each marcher's id with the spot they're going to */
const goingTo = (t: ToolState) =>
    targetsOf(t, ctx).map((x) => ({ id: x.id, to: { x: x.to.x, y: x.to.y } }));

/** A shape drawn by dragging from `from` to `to` and releasing */
function drawn(kind: AnyToolKind, n: number, from: XY, to: XY): ToolState {
    let t = openTool(kind, marchers(n));
    t = press(t, from, env());
    t = pointerMove(t, to, env());
    return release(t, ctx);
}

const KINDS: readonly [string, AnyToolKind][] = [
    ["the box", boxTool],
    ["a fake test kind", rowTool],
];

describe.each(KINDS)("the shape session with %s", (_name, kind) => {
    const N = 6;
    const open = () => drawn(kind, N, { x: 0, y: 0 }, { x: 100, y: 40 });

    it("gets its spot count from the host: one spot per marcher", () => {
        const t = openTool(kind, marchers(N));
        expect(t.spots).toBe(N);
        expect(t.params).toBeNull();
        expect(slotsOf(open(), ctx)).toHaveLength(N);
    });

    it("draws a shape as one undo step and gives every marcher their own spot", () => {
        const t = open();
        const targets = targetsOf(t, ctx);
        expect(targets.map((x) => x.id)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(new Set(targets.map((x) => x.slot)).size).toBe(N);
        expect(undo(t).params).toBeNull();
        expect(redo(undo(t)).params).toBe(t.params);
    });

    it("moves with everyone keeping their spot", () => {
        const t = open();
        const center = kind.frameOf(t.params, N).center;
        let moved = press(t, center, env());
        moved = pointerMove(
            moved,
            { x: center.x + 20, y: center.y + 10 },
            env(),
        );
        moved = release(moved, ctx);
        const before = goingTo(t);
        const after = goingTo(moved);
        expect(after).toHaveLength(N);
        after.forEach((a, i) => {
            expect(a.id).toBe(before[i]!.id);
            expect(
                near(a.to, {
                    x: before[i]!.to.x + 20,
                    y: before[i]!.to.y + 10,
                }),
            ).toBe(true);
        });
    });

    it("turns and flips around its pivot, keeping who goes where", () => {
        const t = open();
        const frame = kind.frameOf(t.params, N);
        const turned = edit(
            t,
            turnShape(kind, t.params, N, 90 * DEGREE, "c", env()),
            ctx,
        );
        expect(kind.frameOf(turned.params, N).rotation).toBeCloseTo(
            Math.PI / 2,
        );
        expect(near(kind.frameOf(turned.params, N).center, frame.center)).toBe(
            true,
        );
        expect(turned.assignment).toEqual(t.assignment);

        const flipped = edit(
            t,
            flipShape(kind, t.params, N, "across", "c", env()),
            ctx,
        );
        expect(kind.frameOf(flipped.params, N).flipX).toBe(true);
        // A mirror: whoever stood furthest left now stands furthest right
        const xs = (s: ToolState) => goingTo(s).map((x) => x.to.x);
        const left = xs(t).indexOf(Math.min(...xs(t)));
        expect(xs(flipped)[left]).toBeCloseTo(Math.max(...xs(flipped)));
    });

    it("places through one host function: the recipe and each member's spot", () => {
        expect(placementOf(openTool(kind, marchers(N)), ctx)).toBeNull();
        const t = open();
        const placement = placementOf(t, ctx)!;
        expect(placement.recipe.kind).toBe(kind.shape.id);
        expect(placement.recipe.kindVersion).toBe(kind.shape.version);
        expect(placement.recipe.orderMode).toBe("nearest");
        expect((placement.recipe.params as { spots: number }).spots).toBe(N);
        expect(placement.members).toEqual(
            targetsOf(t, ctx).map((x) => ({
                marcherId: x.id,
                slot: x.slot,
                x: x.to.x,
                y: x.to.y,
            })),
        );
        // Nothing is placed in the middle of a gesture
        expect(
            placementOf(press(t, { x: 500, y: 500 }, env()), ctx),
        ).toBeNull();
    });

    it("shows its primary numbers in the chip, and a typed number edits the shape", () => {
        const t = open();
        const layout = chipLayout(kind, t.params, N, env());
        const shown = [...layout.values, ...layout.intervals];
        expect(shown.map((x) => x.param.key)).toEqual(
            kind.params
                .filter((p) => p.primary && (p.shown?.(t.params, N) ?? true))
                .map((p) => p.key),
        );
        const spacing = layout.intervals[0]!;
        const typed = spacing.param.type(t.params, N, "3", env());
        const next = edit(t, typed, ctx);
        expect(
            chipLayout(kind, next.params, N, env()).intervals[0]!.display,
        ).toBe("3");
        expect(undo(next).params).toBe(t.params);
    });

    it("declares what scaling changes and how each number behaves", () => {
        expect(["interval", "footprint"]).toContain(kind.scaling);
        for (const p of kind.params) {
            expect(["x", "y", "both"]).toContain(p.drag);
            expect(typeof p.interval).toBe("boolean");
            expect(typeof p.blends).toBe("boolean");
        }
    });
});

describe("the box's chip", () => {
    const box = (n: number, to: XY) =>
        drawn(boxTool, n, { x: 0, y: 0 }, to).params as BoxParams;

    it("reads the box's declared numbers: − 6 × 2 + │ ↔ 2 ↕ 2 steps 🔗", () => {
        const p = box(12, { x: 100, y: 20 });
        expect([filesOf(p), ranksOf(p, 12)]).toEqual([6, 2]);
        const layout = chipLayout(boxTool, p, 12, env());
        expect(layout.values.map((x) => x.display)).toEqual(["6 × 2"]);
        expect(layout.intervals.map((x) => [x.param.glyph, x.display])).toEqual(
            [
                ["↔", "2"],
                ["↕", "2"],
            ],
        );
        expect(layout.ratioLock).toBe(true);
        const size = layout.values[0]!;
        expect(size.param.stepper?.less).toBe("One fewer across");
        expect(filesOf(size.less as BoxParams)).toBe(5);
        expect(filesOf(size.more as BoxParams)).toBe(7);
    });

    it("says how many spots are short, and hides spacings with one spot that way", () => {
        const p = box(13, { x: 120, y: 20 });
        const layout = chipLayout(boxTool, p, 13, env());
        expect(layout.values[0]!.display).toBe("7 × 2");
        expect(layout.values[0]!.note).toBe("1 short");

        const one = box(1, { x: 20, y: 20 });
        const alone = chipLayout(boxTool, one, 1, env());
        expect(alone.values[0]!.display).toBe("1 × 1");
        expect(alone.values[0]!.less).toBeNull();
        expect(alone.values[0]!.more).toBeNull();
        expect(alone.intervals).toEqual([]);
        expect(alone.ratioLock).toBe(false);
    });

    it("follows the field once the box is turned a quarter", () => {
        const p = box(12, { x: 100, y: 20 });
        const turned = turnShape(
            boxTool,
            p,
            12,
            90 * DEGREE,
            "c",
            env(),
        ) as BoxParams;
        const layout = chipLayout(boxTool, turned, 12, env());
        expect(layout.values[0]!.display).toBe("2 × 6");
    });
});

describe("the selection gate", () => {
    it("needs marchers selected, and says so", () => {
        expect(shapeSelectionGate([])).toEqual({
            ok: false,
            reason: selectMarchersFirst(),
        });
        expect(selectMarchersFirst()).toBe("Select marchers first");
        expect(shapeSelectionGate([{ id: 4 }, { id: 2 }])).toEqual({
            ok: true,
            ids: [4, 2],
        });
    });
});

describe("switching kinds with a shape open", () => {
    const N = 6;
    const sameFrame = (
        a: AnyToolKind,
        pa: unknown,
        b: AnyToolKind,
        pb: unknown,
    ) => {
        const fa = a.frameOf(pa, N);
        const fb = b.frameOf(pb, N);
        // Sizes land on the new kind's half-step spacing
        const slack = ((N - 1) * half) / 2;
        expect(Math.abs(fb.center.x - fa.center.x)).toBeLessThanOrEqual(
            half / 2,
        );
        expect(Math.abs(fb.center.y - fa.center.y)).toBeLessThanOrEqual(
            half / 2,
        );
        expect(Math.abs(fb.halfWidth - fa.halfWidth)).toBeLessThanOrEqual(
            slack,
        );
        expect(fb.rotation).toBeCloseTo(fa.rotation);
        expect(fb.flipX).toBe(fa.flipX);
        expect(fb.flipY).toBe(fa.flipY);
    };

    it("arms the other kind when nothing is drawn yet", () => {
        const t = switchKind(
            openTool(boxTool, marchers(N)),
            rowTool,
            ctx,
            env(),
        );
        expect(t.kind).toBe(rowTool);
        expect(t.params).toBeNull();
        expect(t.past).toEqual([]);
    });

    it("turns a box into the fake kind keeping its center, size, turn and flip", () => {
        let t = drawn(boxTool, N, { x: 0, y: 0 }, { x: 100, y: 0 });
        t = edit(
            t,
            turnShape(boxTool, t.params, N, 30 * DEGREE, "c", env()),
            ctx,
        );
        t = edit(t, flipShape(boxTool, t.params, N, "across", "c", env()), ctx);
        const row = switchKind(t, rowTool, ctx, env());
        expect(row.kind).toBe(rowTool);
        sameFrame(boxTool, t.params, rowTool, row.params);
        // Everyone gets a spot of their own on the new shape
        expect(new Set(targetsOf(row, ctx).map((x) => x.slot)).size).toBe(N);
    });

    it("turns the fake kind into a box keeping its frame", () => {
        let t = drawn(rowTool, N, { x: 0, y: 0 }, { x: 100, y: 0 });
        t = edit(t, flipShape(rowTool, t.params, N, "across", "c", env()), ctx);
        const box = switchKind(t, boxTool, ctx, env());
        expect(box.kind).toBe(boxTool);
        sameFrame(rowTool, t.params, boxTool, box.params);
        expect(targetsOf(box, ctx)).toHaveLength(N);
    });

    it("is one undo step: undo brings back the old kind and shape", () => {
        const t = drawn(boxTool, N, { x: 0, y: 0 }, { x: 100, y: 40 });
        const row = switchKind(t, rowTool, ctx, env());
        const back = undo(row);
        expect(back.kind).toBe(boxTool);
        expect(back.params).toBe(t.params);
        expect(goingTo(back)).toEqual(goingTo(t));
        const again = redo(back);
        expect(again.kind).toBe(rowTool);
        expect(again.params).toBe(row.params);
    });

    it("does nothing when the kind is the open one", () => {
        const t = drawn(boxTool, N, { x: 0, y: 0 }, { x: 100, y: 40 });
        expect(switchKind(t, boxTool, ctx, env())).toBe(t);
    });
});

describe("picking a kind", () => {
    it("needs marchers selected to open a shape", () => {
        expect(kindPickGate(false, [])).toEqual({
            ok: false,
            reason: selectMarchersFirst(),
        });
        expect(kindPickGate(false, [{ id: 3 }])).toEqual({ ok: true });
    });

    it("switches the open shape's kind whatever is selected", () => {
        expect(kindPickGate(true, [])).toEqual({ ok: true });
    });
});

describe.each(KINDS)(
    "Recalculate who goes where with %s (#429)",
    (_name, kind) => {
        const N = 6;
        const open = () => drawn(kind, N, { x: 0, y: 0 }, { x: 100, y: 40 });
        const flipped = (t: ToolState) =>
            edit(t, flipShape(kind, t.params, N, "across", "c", env()), ctx);

        it("has nothing to change right after drawing: it's least travel already", () => {
            const t = open();
            expect(canRecalculate(t, ctx)).toBe(false);
            expect(recalculate(t, ctx)).toBe(t);
        });

        it("reassigns by least travel after a flip kept everyone's spot, as one undo step", () => {
            const t = flipped(open());
            expect(t.assignment).toEqual(open().assignment);
            expect(canRecalculate(t, ctx)).toBe(true);
            const again = recalculate(t, ctx);
            // The same spots, worked out fresh: what drawing it flipped would give
            expect(again.params).toBe(t.params);
            expect(again.assignment).not.toEqual(t.assignment);
            expect(canRecalculate(again, ctx)).toBe(false);
            const back = undo(again);
            expect(back.assignment).toEqual(t.assignment);
        });

        it("measures from where the marchers come from (the start flag)", () => {
            // Everyone starts the move mirrored: the leftmost comes from the right
            let t = openTool(
                kind,
                marchers(N).map((m, i) => ({
                    ...m,
                    from: { x: 335 - i * 7, y: 300 },
                })),
            );
            t = press(t, { x: 0, y: 0 }, env());
            t = pointerMove(t, { x: 100, y: 40 }, env());
            t = release(t, ctx);
            expect(canRecalculate(t, ctx)).toBe(false);
            expect(canRecalculate(flipped(t), ctx)).toBe(true);
        });
    },
);
