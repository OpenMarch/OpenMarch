// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxShape } from "../box/boxShape";
import {
    changeFiles,
    drawBox,
    filesOf,
    footprintOf,
    ranksOf,
    shortBy,
    splitFor,
    stretchBox,
    type BoxParams,
} from "../box/boxGeometry";
import { boxTool } from "../box/boxTool";
import {
    cancelGesture,
    edit,
    openTool,
    pointerMove,
    press,
    release,
    targetsOf,
    undo,
    redo,
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
const onGrid = (p: XY) =>
    Math.abs(p.x - snapHalf(p.x)) < 1e-9 &&
    Math.abs(p.y - snapHalf(p.y)) < 1e-9;
const marchers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        at: { x: 300 + i * 7, y: 300 },
        drillRank: i,
    }));

describe("drawing a box", () => {
    it("splits the marchers into near-square cells", () => {
        // 16 marchers in a square: 4 by 4
        const box = drawBox({ x: 0, y: 0 }, { x: 75, y: 75 }, 16, env())!;
        expect(filesOf(box)).toBe(4);
        expect(ranksOf(box, 16)).toBe(4);
        expect(box.across).toBe(25);
        expect(box.deep).toBe(25);
        // A wide box: more files than ranks
        const wide = drawBox({ x: 0, y: 0 }, { x: 160, y: 40 }, 16, env())!;
        expect(filesOf(wide)).toBe(8);
        expect(ranksOf(wide, 16)).toBe(2);
    });

    it("puts the marchers on the rectangle's edges", () => {
        const box = drawBox({ x: 0, y: 0 }, { x: 40, y: 40 }, 4, env())!;
        expect(footprintOf(box, 4)).toEqual({
            left: 0,
            top: 0,
            right: 40,
            bottom: 40,
        });
        const slots = boxShape.generate(box, 4, ctx);
        expect(slots.map((s) => [s.x, s.y])).toEqual([
            [0, 0],
            [40, 0],
            [0, 40],
            [40, 40],
        ]);
    });

    it("stands a marcher on the corner the drag starts from, snapped to the grid", () => {
        const at = (box: BoxParams, n: number) =>
            boxShape.generate(box, n, ctx).map((s) => `${s.x},${s.y}`);
        const a = drawBox({ x: 1.3, y: 2.2 }, { x: 93, y: 71 }, 12, env())!;
        expect(at(a, 12)).toContain("0,0");
        const b = drawBox({ x: 81, y: 59 }, { x: 0, y: 0 }, 12, env())!;
        expect(at(b, 12)).toContain("80,60");
    });

    it("ends the far edge near the cursor", () => {
        // 5 files over 83: four intervals of 20 (83 / 4 rounded to a half step)
        const box = drawBox({ x: 0, y: 0 }, { x: 83, y: 3 }, 5, env())!;
        expect(filesOf(box)).toBe(5);
        expect(footprintOf(box, 5).right).toBe(80);
    });

    it("rounds intervals to half steps, never under half a step", () => {
        const box = drawBox({ x: 0, y: 0 }, { x: 87, y: 83 }, 16, env())!;
        expect(box.across % half).toBe(0);
        expect(box.deep % half).toBe(0);
        const tiny = drawBox({ x: 0, y: 0 }, { x: 6, y: 6 }, 16, env())!;
        expect(tiny.across).toBe(half);
        expect(tiny.deep).toBe(half);
    });

    it("puts every marcher on the half-step grid", () => {
        const box = drawBox({ x: 1.3, y: 2.2 }, { x: 93, y: 71 }, 12, env())!;
        const slots = boxShape.generate(box, 12, ctx);
        expect(slots.every(onGrid)).toBe(true);
    });

    it("prefers a split with no short rank", () => {
        // 20 marchers in a 3:2 drag: 6 files would leave a back rank of 2
        const box = drawBox({ x: 0, y: 0 }, { x: 150, y: 100 }, 20, env())!;
        expect(filesOf(box) * ranksOf(box, 20)).toBe(20);
        expect(shortBy(box, 20)).toBe(0);
    });

    it("leaves as few empty spots as it can when no split is even", () => {
        // 23 marchers in a square: 5 × 5 is squarer but leaves 2 empty; 4 × 6 or 6 × 4 leave 1
        const box = drawBox({ x: 0, y: 0 }, { x: 100, y: 100 }, 23, env())!;
        expect(shortBy(box, 23)).toBe(1);
    });

    it("doesn't force evenness on a split far from the drawn shape", () => {
        // 20 marchers in a very wide drag: 10 × 2, not a single rank of 20
        const wide = drawBox({ x: 0, y: 0 }, { x: 300, y: 40 }, 20, env())!;
        expect(filesOf(wide)).toBe(10);
        // 4 marchers in a thin strip: nothing fits within 2×, so the closest even split
        const strip = drawBox({ x: 0, y: 0 }, { x: 400, y: 10 }, 4, env())!;
        expect(filesOf(strip)).toBe(4);
    });

    it("puts a short rank at the back, centered", () => {
        // 5 marchers, 2 files: 3 ranks, the back one short
        const box = drawBox({ x: 0, y: 0 }, { x: 30, y: 60 }, 5, env())!;
        expect(filesOf(box)).toBe(2);
        expect(shortBy(box, 5)).toBe(1);
        const slots = boxShape.generate(box, 5, ctx);
        const back = Math.min(...slots.map((s) => s.y));
        const backRank = slots.filter((s) => s.y === back);
        expect(backRank).toHaveLength(1);
        expect(backRank[0]!.x).toBe(box.center.x);
    });

    it("constrain makes the intervals equal", () => {
        const box = drawBox(
            { x: 0, y: 0 },
            { x: 120, y: 40 },
            4,
            env({ constrain: true }),
        )!;
        expect(box.across).toBe(box.deep);
    });

    it("fine rounds to hundredths of a step, not half steps (#411)", () => {
        const box = drawBox(
            { x: 0, y: 0 },
            { x: 83, y: 83 },
            16,
            env({ snap: false }),
        )!;
        // 2.7666 steps is 2.77
        expect(box.across).toBeCloseTo(27.7);
    });

    it("keeps the file count until another fits clearly better", () => {
        // 12 marchers in a square: 3 files (4 ranks) and 4 files (3 ranks) fit equally well
        expect(splitFor(105, 100, 12)).toBe(4);
        // A little wider, 4 fits better, but not by enough to leave 3
        expect(splitFor(105, 100, 12, 3)).toBe(3);
        // Wider still, it changes
        expect(splitFor(120, 100, 12, 3)).toBe(4);
    });

    it("is too short under half a step", () => {
        expect(drawBox({ x: 0, y: 0 }, { x: 2, y: 1 }, 4, env())).toBe(
            undefined,
        );
    });
});

describe("editing a box", () => {
    const box = drawBox({ x: 0, y: 0 }, { x: 75, y: 75 }, 16, env())!;

    it("has its handles on the corner and edge marchers", () => {
        const handles = boxTool.handles(box, 16);
        expect(handles.find((h) => h.key === "nw")!.at).toEqual({
            x: 0,
            y: 0,
        });
        expect(handles.find((h) => h.key === "se")!.at).toEqual({
            x: 75,
            y: 75,
        });
    });

    it("drops the handles of an axis with a single file or rank", () => {
        const rank = drawBox({ x: 0, y: 0 }, { x: 60, y: 0.1 }, 4, env())!;
        expect(ranksOf(rank, 4)).toBe(1);
        expect(boxTool.handles(rank, 4).map((h) => h.key)).toEqual(["e", "w"]);
    });

    it("a corner stretches both intervals and keeps files, ranks and the opposite corner", () => {
        const out = stretchBox(box, 16, "se", { x: 120, y: 105 }, env());
        expect(filesOf(out)).toBe(4);
        expect(ranksOf(out, 16)).toBe(4);
        expect(out.across).toBe(40);
        expect(out.deep).toBe(35);
        const f = footprintOf(out, 16);
        expect([f.left, f.top, f.right, f.bottom]).toEqual([0, 0, 120, 105]);
    });

    it("a corner with constrain makes the intervals equal; a side with it doesn't", () => {
        const out = stretchBox(
            box,
            16,
            "se",
            { x: 120, y: 105 },
            env({ constrain: true }),
        );
        expect(out.across).not.toBe(35);
        expect(out.across).toBe(out.deep);
        expect(filesOf(out)).toBe(4);
        const side = stretchBox(
            box,
            16,
            "e",
            { x: 120, y: 999 },
            env({ constrain: true }),
        );
        expect(side.deep).toBe(box.deep);
    });

    it("a side stretches only its own axis", () => {
        const out = stretchBox(box, 16, "e", { x: 120, y: 999 }, env());
        expect(out.across).toBe(40);
        expect(out.deep).toBe(box.deep);
        const f = footprintOf(out, 16);
        expect([f.left, f.top, f.bottom]).toEqual([0, 0, 75]);
    });

    it("the file count changes around the center, keeping the intervals", () => {
        const out = changeFiles(box, 16, 1, env());
        expect(filesOf(out)).toBe(5);
        expect(out.across).toBe(box.across);
        expect(out.deep).toBe(box.deep);
        // Within a quarter step of the old center: its marchers snap to the grid
        expect(Math.abs(out.center.x - box.center.x)).toBeLessThanOrEqual(
            half / 2,
        );
        expect(Math.abs(out.center.y - box.center.y)).toBeLessThanOrEqual(
            half / 2,
        );
        expect(changeFiles(box, 16, -99, env()).files).toBe(1);
        expect(changeFiles(box, 16, 99, env()).files).toBe(16);
    });
});

describe("the tool's state machine", () => {
    const n = 16;
    const start = () => openTool(boxTool, marchers(n));
    const drawn = () => {
        let s = press(start(), { x: 0, y: 0 }, env());
        s = pointerMove(s, { x: 75, y: 75 }, env());
        return release(s, ctx);
    };

    it("a drag on empty field draws a box, assigned on release", () => {
        let s = press(start(), { x: 0, y: 0 }, env());
        expect(s.gesture?.type).toBe("draw");
        s = pointerMove(s, { x: 80, y: 80 }, env());
        // Nobody is assigned while drawing
        expect(s.assignment).toBe(null);
        s = release(s, ctx);
        expect(s.gesture).toBe(null);
        expect(s.assignment).toHaveLength(n);
        expect(new Set(s.assignment).size).toBe(n);
        expect(targetsOf(s, ctx)).toHaveLength(n);
        expect(s.past).toHaveLength(1);
    });

    it("holds who goes where during a gesture", () => {
        const s = drawn();
        let g = press(s, { x: 40, y: 40 }, env());
        expect(g.gesture?.type).toBe("move");
        g = pointerMove(g, { x: 200, y: 40 }, env());
        expect(g.assignment).toBe(s.assignment);
        g = release(g, ctx);
        expect(g.past).toHaveLength(2);
    });

    it("a press on a handle drags it", () => {
        const s = drawn();
        const g = press(s, { x: 76, y: 76 }, env());
        expect(g.gesture).toMatchObject({ type: "handle", key: "se" });
    });

    it("a drag outside the box replaces it, one undo step back", () => {
        const s = drawn();
        let g = press(s, { x: 200, y: 200 }, env());
        expect(g.gesture?.type).toBe("draw");
        g = release(pointerMove(g, { x: 300, y: 260 }, env()), ctx);
        expect(footprintOf(g.params as BoxParams, n).left).toBe(200);
        const back = undo(g);
        expect(back.params).toBe(s.params);
        expect(redo(back).params).toBe(g.params);
    });

    it("a click without a drag changes nothing and leaves nothing to undo", () => {
        const s = drawn();
        const g = release(press(s, { x: 200, y: 200 }, env()), ctx);
        expect(g.params).toBe(s.params);
        expect(g.past).toHaveLength(s.past.length);
    });

    it("Escape during a gesture puts everything back", () => {
        const s = drawn();
        const g = pointerMove(
            press(s, { x: 76, y: 76 }, env()),
            { x: 200, y: 200 },
            env(),
        );
        expect(cancelGesture(g)).toMatchObject({
            params: s.params,
            assignment: s.assignment,
            gesture: null,
        });
    });

    it("an edit from the readout is one undo step", () => {
        const s = drawn();
        const more = edit(
            s,
            changeFiles(s.params as BoxParams, n, 1, env()),
            ctx,
        );
        expect(filesOf(more.params as BoxParams)).toBe(5);
        expect(undo(more).params).toBe(s.params);
    });
});
