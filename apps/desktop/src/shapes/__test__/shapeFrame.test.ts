// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxShape } from "../box/boxShape";
import {
    boxFrame,
    drawBox,
    filesOf,
    insideBox,
    ranksOf,
    stretchBox,
    type BoxParams,
} from "../box/boxGeometry";
import { boxTool } from "../box/boxTool";
import {
    DEGREE,
    flipFrame,
    pivotPoint,
    resizeCursor,
    rotateFrame,
    rotationDegrees,
    snapRotation,
    type ShapeFrame,
} from "../frame/frame";
import {
    dragShape,
    frameControls,
    scrubTurn,
    shapeTargetAt,
    startShapeGesture,
    turnShape,
} from "../frame/gestures";
import {
    withFiles,
    acrossIsDeep,
    flipBox,
    onField,
    scrubRotation,
    withFieldCount,
    scrubSize,
    scrubSpacing,
    turnBy,
    withRanks,
    withSpacing,
} from "../editor/boxEdits";
import { parseSteps } from "../editor/format";
import { parseSize, scrubValue } from "../editor/scrub";
import {
    edit,
    openTool,
    pointerMove,
    press,
    release,
    recalculate,
    targetsOf,
} from "../tool/toolMachine";
import type { ToolEnv } from "../tool/toolKind";
import type { ShapeContext, XY } from "../types";

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
const close = (a: XY, b: XY) =>
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);

const frame = (over: Partial<ShapeFrame> = {}): ShapeFrame => ({
    center: { x: 100, y: 100 },
    halfWidth: 20,
    halfDepth: 10,
    rotation: 0,
    flipX: false,
    flipY: false,
    ...over,
});

/** A 4 × 2 box, 10 apart, its back-left marcher at 0, 0 */
const box4x2 = (): BoxParams =>
    drawBox({ x: 0, y: 0 }, { x: 30, y: 10 }, 8, env())!;

describe("the shape frame", () => {
    it("turns around a pivot, which stays put", () => {
        const f = frame();
        const pivot = pivotPoint(f, "nw");
        const turned = rotateFrame(f, 90 * DEGREE, pivot);
        close(pivotPoint(turned, "nw"), pivot);
        // Around the center, the center stays
        close(rotateFrame(f, 1, f.center).center, f.center);
    });

    it("flips about a pivot on the field's axes", () => {
        const f = frame();
        // About the center: nothing moves but the mirror
        const c = flipFrame(f, "across", "c");
        close(c.center, f.center);
        expect(c.flipX).toBe(true);
        // About the west edge: the shape lands on the other side of it
        const w = flipFrame(f, "across", "w");
        close(w.center, { x: 60, y: 100 });
        // A turned frame flips on the field, side 1 and side 2 swapping: turned the other way
        const turned = flipFrame(
            frame({ rotation: 30 * DEGREE }),
            "across",
            "c",
        );
        expect(rotationDegrees(turned.rotation)).toBe(330);
        expect(turned.flipX).toBe(true);
    });

    it("snaps rotation to 15° as the field's rotate handle does, whole degrees with fine, and not with the Snap toggle off", () => {
        const turn = (deg: number, over: Partial<ToolEnv> = {}) =>
            rotationDegrees(snapRotation(deg * DEGREE, env(over)));
        expect(turn(33.4)).toBe(30);
        expect(turn(38)).toBe(45);
        expect(turn(33.4, { fine: true, snap: false })).toBe(33);
        expect(turn(33.4, { snap: false, pull: false })).toBe(33.4);
        // constrain doesn't change a turn
        expect(turn(33.4, { constrain: true })).toBe(30);
        expect(snapRotation(-0.1 * DEGREE, env())).toBe(0);
        expect(snapRotation(355 * DEGREE, env())).toBe(0);
        expect(rotationDegrees(-90 * DEGREE)).toBe(270);
    });

    it("the rotation number drags in 15° steps, whole degrees with fine, freely with the Snap toggle off, and a typed one stays exact", () => {
        const b = box4x2();
        const degreesOf = (p: unknown) =>
            rotationDegrees(boxTool.frameOf(p as BoxParams, 8).rotation);
        // 2 px a degree: 20 px is 10°, which lands on 15°
        expect(degreesOf(scrubTurn(boxTool, b, 8, 20, "c", env()))).toBe(15);
        expect(
            degreesOf(
                scrubTurn(
                    boxTool,
                    b,
                    8,
                    20,
                    "c",
                    env({ snap: false, pull: false }),
                ),
            ),
        ).toBe(10);
        expect(
            degreesOf(
                scrubTurn(
                    boxTool,
                    b,
                    8,
                    21,
                    "c",
                    env({ fine: true, snap: false }),
                ),
            ),
        ).toBe(11);
        expect(
            degreesOf(
                scrubTurn(boxTool, b, 8, 20, "c", env({ constrain: true })),
            ),
        ).toBe(15);
        const typed = turnShape(boxTool, b, 8, 33.4 * DEGREE, "c", env());
        expect(degreesOf(typed)).toBe(33.4);
        // From a typed angle, the next 15° step
        expect(degreesOf(scrubTurn(boxTool, typed, 8, 20, "c", env()))).toBe(
            45,
        );
    });

    it("turns resize cursors with the shape", () => {
        expect(resizeCursor({ rotation: 0 }, { x: 1, y: 0 })).toBe("ew-resize");
        expect(resizeCursor({ rotation: 90 * DEGREE }, { x: 1, y: 0 })).toBe(
            "ns-resize",
        );
        expect(resizeCursor({ rotation: 45 * DEGREE }, { x: 1, y: 0 })).toBe(
            "nwse-resize",
        );
    });
});

describe("a turned box", () => {
    const turned = (degrees: number) =>
        turnBy(box4x2(), 8, degrees, "c", env());

    it("stays the same box: same count, spacing and center", () => {
        const b = box4x2();
        const t = turned(30);
        expect(filesOf(t)).toBe(4);
        expect(ranksOf(t, 8)).toBe(2);
        expect(t.across).toBe(b.across);
        close(t.center, b.center);
        expect(rotationDegrees(t.rotation)).toBe(30);
    });

    it("lands on the grid again at a quarter turn", () => {
        const spots = boxShape.generate(turned(90), 8, ctx);
        for (const s of spots) {
            expect(s.x).toBeCloseTo(snapHalf(s.x), 6);
            expect(s.y).toBeCloseTo(snapHalf(s.y), 6);
        }
    });

    it("stretches along its own axes, the opposite side staying put", () => {
        const t = turned(90);
        const f = boxFrame(t, 8);
        // Turned a quarter, its east handle points down the field
        const east = { x: f.center.x, y: f.center.y + f.halfWidth };
        const fixed = { x: f.center.x, y: f.center.y - f.halfWidth };
        const s = stretchBox(t, 8, "e", { x: east.x, y: east.y + 30 }, env());
        const sf = boxFrame(s, 8);
        expect(s.across).toBe(20);
        close({ x: sf.center.x, y: sf.center.y - sf.halfWidth }, fixed);
    });

    it("is grabbed inside its own outline, not its field-square bounds", () => {
        const t = turned(45);
        expect(insideBox(t, 8, t.center)).toBe(true);
        // A corner of the unturned box is outside the turned one
        expect(insideBox(t, 8, { x: -5, y: -5 })).toBe(false);
    });
});

describe("frame gestures", () => {
    it("the knob above the back edge turns the box around the pivot", () => {
        const b = box4x2();
        const e = env({ pivot: "c" });
        const { knob } = frameControls(boxTool, b, 8, e);
        expect(shapeTargetAt(boxTool, b, 8, knob, e)).toEqual({
            type: "rotate",
            from: "knob",
        });
        const g = startShapeGesture(boxTool, b, 8, knob, e)!;
        // Drag the knob a quarter turn clockwise around the center
        const r = Math.hypot(knob.x - b.center.x, knob.y - b.center.y);
        const turned = dragShape(
            boxTool,
            8,
            g,
            { x: b.center.x + r, y: b.center.y },
            e,
        ) as BoxParams;
        expect(rotationDegrees(turned.rotation)).toBe(90);
    });

    it("just outside a corner turns it too, and the middle is the center dot", () => {
        const b = box4x2();
        const e = env();
        expect(shapeTargetAt(boxTool, b, 8, { x: -4, y: -4 }, e)).toEqual({
            type: "rotate",
            from: "corner",
        });
        expect(shapeTargetAt(boxTool, b, 8, b.center, e)).toEqual({
            type: "center",
        });
        expect(shapeTargetAt(boxTool, b, 8, { x: 200, y: 200 }, e)).toBe(null);
    });

    it("the center dot moves the box in half steps", () => {
        const b = box4x2();
        const g = startShapeGesture(boxTool, b, 8, b.center, env())!;
        const moved = dragShape(
            boxTool,
            8,
            g,
            { x: b.center.x + 12, y: b.center.y + 3 },
            env(),
        ) as BoxParams;
        expect(moved.center.x - b.center.x).toBe(10);
        expect(moved.center.y - b.center.y).toBe(5);
    });
});

const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

/** The tool with a 4 × 2 box drawn and released for 8 marchers */
function drawnTool() {
    let t = openTool(boxTool, marchers(8));
    t = press(t, { x: 0, y: 0 }, env());
    t = pointerMove(t, { x: 30, y: 10 }, env());
    return release(t, ctx);
}

describe("who goes where, held through turns and flips", () => {
    it("a turn keeps each marcher on their own spot, turned with the form", () => {
        const t = drawnTool();
        const before = targetsOf(t, ctx);
        const turned = edit(
            t,
            turnBy(t.params as BoxParams, 8, 180, "c", env()),
            ctx,
        );
        const after = targetsOf(turned, ctx);
        expect(after.map((a) => a.slot)).toEqual(before.map((b) => b.slot));
        // Half a turn about the center: each marcher's spot mirrors through it
        const c = (t.params as BoxParams).center;
        after.forEach((a, i) =>
            close(a.to, {
                x: 2 * c.x - before[i]!.to.x,
                y: 2 * c.y - before[i]!.to.y,
            }),
        );
    });

    it("a flip mirrors the form: who was on the left is on the right", () => {
        const t = drawnTool();
        const before = targetsOf(t, ctx);
        const flipped = edit(
            t,
            flipBox(t.params as BoxParams, 8, "across", "c", env()),
            ctx,
        );
        const after = targetsOf(flipped, ctx);
        const c = (t.params as BoxParams).center;
        after.forEach((a, i) => {
            expect(a.to.x).toBeCloseTo(2 * c.x - before[i]!.to.x, 6);
            expect(a.to.y).toBeCloseTo(before[i]!.to.y, 6);
        });
    });

    it("a turned box flips side to side on the field, each spot to its mirror image", () => {
        let t = drawnTool();
        t = edit(t, turnBy(t.params as BoxParams, 8, 30, "c", env()), ctx);
        const before = targetsOf(t, ctx);
        const c = (t.params as BoxParams).center;
        const flipped = targetsOf(
            edit(
                t,
                flipBox(t.params as BoxParams, 8, "across", "c", env()),
                ctx,
            ),
            ctx,
        );
        flipped.forEach((a, i) => {
            expect(a.to.x).toBeCloseTo(2 * c.x - before[i]!.to.x, 6);
            expect(a.to.y).toBeCloseTo(before[i]!.to.y, 6);
        });
    });

    it("a stretch or move keeps spots; a new count across works it out again", () => {
        const t = drawnTool();
        const slots = targetsOf(t, ctx).map((x) => x.slot);
        const wider = edit(
            t,
            withSpacing(t.params as BoxParams, "across", 2, 8, env()),
            ctx,
        );
        expect(targetsOf(wider, ctx).map((x) => x.slot)).toEqual(slots);
        const twoDeep = edit(
            t,
            withRanks(t.params as BoxParams, 8, 4, env()),
            ctx,
        );
        expect(filesOf(twoDeep.params as BoxParams)).toBe(2);
        expect(twoDeep.assignment).not.toBe(t.assignment);
    });
});

describe("the floating editor's numbers", () => {
    it("spacing drags half a step per 8 px, a hundredth per px with fine, from where it started", () => {
        const b = box4x2();
        expect(scrubSpacing(b, "across", 16, 8, env()).across).toBe(20);
        expect(scrubSpacing(b, "deep", 8, 8, env()).deep).toBe(15);
        expect(
            scrubSpacing(b, "across", 8, 8, env({ snap: false })).across,
        ).toBeCloseTo(10.8);
        // Back where it started: unchanged, not rounded
        const odd = { ...b, across: 12.3 };
        expect(scrubSpacing(odd, "across", 3, 8, env())).toBe(odd);
        // Never under half a step
        expect(scrubSpacing(b, "across", -400, 8, env()).across).toBe(5);
    });

    it("a typed spacing keeps hundredths of a step, not half steps (#411)", () => {
        const across = boxTool.params.find((p) => p.key === "across")!;
        const typed = across.type(box4x2(), 8, "2.37", env()) as BoxParams;
        expect(typed.across).toBeCloseTo(23.7);
    });

    it("the ratio lock moves the other spacing, both on half steps", () => {
        const b = { ...box4x2(), deep: 20 };
        const locked = withSpacing(
            b,
            "across",
            1.5,
            8,
            env({ ratioLocked: true }),
        );
        expect(locked.across).toBe(15);
        expect(locked.deep).toBe(30);
        // 4.5 apart makes 5.14 exactly; on half steps it's 5
        const odd = { ...b, across: 35, deep: 40 };
        const r = withSpacing(
            odd,
            "across",
            4.5,
            8,
            env({ ratioLocked: true }),
        );
        expect(r.deep).toBe(50);
    });

    it("the size drags one per 16 px, across or deep on the field", () => {
        const b = box4x2();
        expect(filesOf(scrubSize(b, "across", 32, 8, env()))).toBe(6);
        // One more rank: 8 in 3 deep is 3 across
        expect(filesOf(scrubSize(b, "deep", 16, 8, env()))).toBe(3);
        // 13 in 2 deep is 7 across
        expect(
            filesOf(
                withRanks(
                    drawBox({ x: 0, y: 0 }, { x: 60, y: 10 }, 13, env())!,
                    13,
                    2,
                    env(),
                ),
            ),
        ).toBe(7);
    });

    it("reads typed steps and sizes", () => {
        expect(parseSteps("2½")).toBe(2.5);
        expect(parseSteps("2 1/2")).toBe(2.5);
        expect(parseSteps("½")).toBe(0.5);
        expect(parseSteps("3 steps")).toBe(3);
        expect(parseSteps("0")).toBe(null);
        expect(parseSteps("abc")).toBe(null);
        expect(parseSize("6 × 2")).toEqual({ across: 6, deep: 2 });
        expect(parseSize("6x2")).toEqual({ across: 6, deep: 2 });
        expect(parseSize("6")).toEqual({ across: 6 });
        expect(parseSize("x")).toBe(null);
        expect(scrubValue(4, 0, -20, { axis: "y", px: 8, step: 1 })).toBe(6);
    });
});

describe("the decisions of 2026-10-17", () => {
    it("the numbers follow the field once the box is turned past 45°", () => {
        expect(acrossIsDeep(0)).toBe(false);
        expect(acrossIsDeep(45 * DEGREE)).toBe(false);
        expect(acrossIsDeep(46 * DEGREE)).toBe(true);
        expect(acrossIsDeep(90 * DEGREE)).toBe(true);
        expect(acrossIsDeep(135 * DEGREE)).toBe(false);
        expect(acrossIsDeep(270 * DEGREE)).toBe(true);
        // A 4 × 2 box turned a quarter reads 2 × 4 on the field, and + makes it wider on the field
        const t = turnBy(box4x2(), 8, 90, "c", env());
        expect(onField(t, 8)).toMatchObject({ across: 2, deep: 4 });
        const wider = withFieldCount(t, 8, "across", 3, env());
        expect(onField(wider, 8).across).toBe(3);
        // Its side-to-side spacing is the box's own deep
        expect(onField(t, 8).acrossKey).toBe("deep");
    });

    it("a resize keeps the center", () => {
        const b = box4x2();
        for (const out of [
            withSpacing(b, "across", 2, 8, env()),
            withFieldCount(b, 8, "across", 2, env()),
        ]) {
            expect(Math.abs(out.center.x - b.center.x)).toBeLessThanOrEqual(
                half / 2,
            );
            expect(Math.abs(out.center.y - b.center.y)).toBeLessThanOrEqual(
                half / 2,
            );
        }
    });

    it("a flip keeps the angle when the mirrored box looks the same, and + always changes the count", () => {
        const t = turnBy(box4x2(), 8, 90, "c", env());
        const f = flipBox(t, 8, "across", "c", env());
        expect(rotationDegrees(f.rotation)).toBe(90);
        // A box at 30° really tilts the other way
        const t30 = turnBy(box4x2(), 8, 30, "c", env());
        expect(
            rotationDegrees(flipBox(t30, 8, "across", "c", env()).rotation),
        ).toBe(330);
        // 64 in 9 ranks is still 8 across: one more deep goes on to the next count that changes
        const big = drawBox({ x: 0, y: 0 }, { x: 70, y: 70 }, 64, env())!;
        expect(filesOf(big)).toBe(8);
        expect(filesOf(withRanks(big, 64, 9, env()))).toBe(7);
    });

    it("the rotation drags 1° per 2 px in 15° steps (#403), whole degrees with fine, and back to the start changes nothing", () => {
        const b = box4x2();
        expect(
            rotationDegrees(scrubRotation(b, 60, 8, "c", env()).rotation),
        ).toBe(30);
        expect(
            rotationDegrees(
                scrubRotation(b, 44, 8, "c", env({ fine: true, snap: false }))
                    .rotation,
            ),
        ).toBe(22);
        expect(
            rotationDegrees(scrubRotation(b, -20, 8, "c", env()).rotation),
        ).toBe(345);
        expect(scrubRotation(b, 1, 8, "c", env())).toBe(b);
    });

    it("after a turn or flip, who goes where is kept until Recalculate (#429)", () => {
        const t = drawnTool();
        const flipped = edit(
            t,
            flipBox(t.params as BoxParams, 8, "across", "c", env()),
            ctx,
        );
        expect(flipped.assignment).toEqual(t.assignment);
        // Recalculate works it out again: the flip's mirror is gone
        const again = recalculate(flipped, ctx);
        targetsOf(again, ctx).forEach((a, i) =>
            close(a.to, targetsOf(t, ctx)[i]!.to),
        );
        // A stretch keeps spots too
        expect(
            edit(
                t,
                withSpacing(t.params as BoxParams, "across", 2, 8, env()),
                ctx,
            ).assignment,
        ).toEqual(t.assignment);
    });

    it("on a turned box, + goes one wider on the field: the frame turns a quarter back first", () => {
        // 2 across, 4 deep, turned a quarter: 4 across on the field
        const narrow = withFiles(box4x2(), 8, 2, env());
        const t = turnBy(narrow, 8, 90, "c", env());
        expect(onField(t, 8).across).toBe(4);
        for (const want of [5, 6, 7]) {
            const out = withFieldCount(t, 8, "across", want, env());
            expect(onField(out, 8).across).toBe(want);
            // The same spacing side to side, on the box's own across now
            expect(onField(out, 8).acrossSpacing).toBe(
                onField(t, 8).acrossSpacing,
            );
        }
        expect(withFieldCount(t, 8, "across", 4, env())).toBe(t);
    });
});
