// @vitest-environment node
import { describe, expect, it } from "vitest";
import { boxCorners, boxFrame, type BoxParams } from "../../box/boxGeometry";
import { boxTool } from "../../box/boxTool";
import { circleTool } from "../../circle/circleTool";
import type { AnyToolKind, ToolEnv } from "../../tool/toolKind";
import type { XY } from "../../types";
import { dragShape, startShapeGesture } from "../gestures";

/**
 * The edge pull while moving a whole shape (#444): a side (or the center line) that comes within a
 * few pixels of one of the field's lines lands on it, one snap per axis. Away from lines the
 * half-step grid still decides.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
/** Yard lines every 8 steps side to side; front sideline, front and back hash front to back */
const LINES = {
    x: [-160, -80, 0, 80, 160],
    y: [0, -280, -560],
};
const env = (over: Partial<ToolEnv> = {}): ToolEnv => ({
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
    fieldLines: LINES,
    pullRadius: 1.2,
    ...over,
});
const exact = (a: number, b: number) =>
    expect(Math.abs(a - b)).toBeLessThan(1e-9);

/** 4 files by 3 ranks, 1⅗ steps apart, so its far edges are off the half steps */
const N = 12;
const box: BoxParams = {
    center: { x: 30, y: -150 },
    rotation: 0,
    files: 4,
    across: 1.6 * STEP,
    deep: 1.6 * STEP,
};
const edges = (p: BoxParams) => {
    const f = boxFrame(p, N);
    return {
        left: f.center.x - f.halfWidth,
        right: f.center.x + f.halfWidth,
        back: f.center.y - f.halfDepth,
        front: f.center.y + f.halfDepth,
        center: f.center,
    };
};

/** `edges` for a box of `n` marchers */
const edges2 = (p: BoxParams, n: number) => {
    const f = boxFrame(p, n);
    return {
        left: f.center.x - f.halfWidth,
        right: f.center.x + f.halfWidth,
        center: f.center,
    };
};

/** `p` dragged from inside by `by` */
function move(
    kind: AnyToolKind,
    p: unknown,
    by: XY,
    over: Partial<ToolEnv> = {},
    n = N,
) {
    // Off the center dot, which is a gesture of its own
    const c = kind.frameOf(p, n).center;
    const grab = { x: c.x + 6, y: c.y + 7 };
    const gesture = startShapeGesture(kind, p, n, grab, env(over));
    expect(gesture?.type).toBe("move");
    return dragShape(
        kind,
        n,
        gesture!,
        { x: grab.x + by.x, y: grab.y + by.y },
        env(over),
    );
}

describe("moving a box onto a line", () => {
    it("lands its front edge on the front sideline when it comes within the pull", () => {
        const before = edges(box);
        // The front edge ends 0.8 short of the sideline
        const p = move(boxTool, box, { x: 0, y: -before.front - 0.8 });
        exact(edges(p as BoxParams).front, 0);
    });

    it("lands its right edge on a yard line, the nearest of either side", () => {
        const before = edges(box);
        const p = move(boxTool, box, { x: 80 - before.right + 1, y: 0 });
        exact(edges(p as BoxParams).right, 80);
    });

    it("snaps each axis on its own", () => {
        const before = edges(box);
        const p = move(boxTool, box, {
            x: 80 - before.right - 0.5,
            y: -280 - before.front + 0.7,
        }) as BoxParams;
        exact(edges(p).right, 80);
        exact(edges(p).front, -280);
    });

    it("lands its center on a line (on the 50)", () => {
        // An odd number of files, so a center marcher stands on the line, off the half steps
        const odd: BoxParams = { ...box, files: 3 };
        const c = boxFrame(odd, 9).center;
        const p = move(boxTool, odd, { x: -c.x + 0.6, y: 0 }, {}, 9);
        exact(boxFrame(p as BoxParams, 9).center.x, 0);
    });

    it("keeps the half-step grid away from lines", () => {
        const p = move(boxTool, box, { x: 23, y: -31 }) as BoxParams;
        const free = { x: 30 + 23, y: -150 - 31 };
        // The back-left corner is on the half steps, as before #444
        const e = edges(p);
        exact(e.left, snapHalf(e.left));
        exact(e.back, snapHalf(e.back));
        expect(Math.abs(e.center.x - free.x)).toBeLessThan(half);
    });

    it("with fine, still lands on the line, and moves freely away from lines (owner on #453)", () => {
        const before = edges(box);
        const fine = { snap: false, fine: true };
        const p = move(boxTool, box, { x: 0, y: -before.front - 0.8 }, fine);
        exact(edges(p as BoxParams).front, 0);
        // Off the half steps, exactly where it was dragged
        const away = move(boxTool, box, { x: 3.3, y: -7.1 }, fine) as BoxParams;
        exact(away.center.x, box.center.x + 3.3);
        exact(away.center.y, box.center.y - 7.1);
    });

    it("doesn't pull with the Snap toggle off", () => {
        const before = edges(box);
        const p = move(
            boxTool,
            box,
            { x: 0, y: -before.front - 0.8 },
            { snap: false, pull: false },
        );
        exact(edges(p as BoxParams).front, -0.8);
    });

    it("doesn't pull past the radius", () => {
        const before = edges(box);
        const p = move(boxTool, box, { x: 80 - before.right + 2, y: 0 });
        expect(Math.abs(edges(p as BoxParams).right - 80)).toBeGreaterThan(
            1e-6,
        );
    });

    it("pulls from no farther than a quarter step, however far the pixels reach", () => {
        const before = edges(box);
        const far = { pullRadius: 6 };
        const at = (off: number) =>
            edges(
                move(
                    boxTool,
                    box,
                    { x: 80 - before.right + off, y: 0 },
                    far,
                ) as BoxParams,
            ).right;
        exact(at(2.4), 80);
        expect(Math.abs(at(2.6) - 80)).toBeGreaterThan(1e-6);
    });

    it("pulls a quarter-turned box by its own sides", () => {
        const turned: BoxParams = { ...box, rotation: Math.PI / 2 };
        const f = boxFrame(turned, N);
        // Turned a quarter, its depth runs side to side; either side lands (one is off the grid)
        for (const side of [-1, 1]) {
            const x = f.center.x + side * f.halfDepth;
            const p = move(boxTool, turned, { x: 80 - x - 0.9, y: 0 });
            const g = boxFrame(p as BoxParams, N);
            exact(g.center.x + side * g.halfDepth, 80);
        }
    });

    describe("turned off the field's axes (#446)", () => {
        const turnedBy = (degrees: number): BoxParams => ({
            ...box,
            center: { x: 40, y: -150 },
            rotation: (degrees * Math.PI) / 180,
        });
        /** The corner farthest toward the 50's side, and where it ends after `p` */
        const rightmost = (p: BoxParams) =>
            boxCorners(p, N).reduce((a, b) => (b.x > a.x ? b : a));

        it("lands a 15° box's corner on a yard line", () => {
            const turned = turnedBy(15);
            const c = rightmost(turned);
            const p = move(boxTool, turned, { x: 80 - c.x - 0.9, y: 0 });
            exact(rightmost(p as BoxParams).x, 80);
            // Still turned the same, and the same size
            exact((p as BoxParams).rotation, turned.rotation);
        });

        it("lands a 30° box's center on the back hash", () => {
            const turned = turnedBy(30);
            const p = move(boxTool, turned, { x: 0, y: -280 + 150 + 0.8 });
            exact(boxFrame(p as BoxParams, N).center.y, -280);
        });

        it("lands a 15° box's corner on a yard line and the back hash at once", () => {
            const turned = turnedBy(15);
            const c = rightmost(turned);
            const p = move(boxTool, turned, {
                x: 80 - c.x - 0.7,
                y: -280 - c.y + 0.6,
            });
            const at = rightmost(p as BoxParams);
            exact(at.x, 80);
            exact(at.y, -280);
        });

        it("moves by half steps away from lines", () => {
            const turned = turnedBy(15);
            // Its corners and center well clear of every line
            const p = move(boxTool, turned, { x: 23, y: -7 }) as BoxParams;
            exact(p.center.x, 40 + 25);
            exact(p.center.y, -150 - 5);
        });
    });

    it("pulls a box dragged by its center dot the same way", () => {
        const c = boxFrame(box, N).center;
        const gesture = startShapeGesture(boxTool, box, N, c, env());
        expect(gesture?.type).toBe("center");
        const before = edges(box);
        const by = { x: 0, y: -before.front - 0.8 };
        const p = dragShape(
            boxTool,
            N,
            gesture!,
            { x: c.x + by.x, y: c.y + by.y },
            env(),
        ) as BoxParams;
        exact(edges(p).front, 0);
    });

    it("lands a side rather than the center when both are as near a line", () => {
        // Two files 158 apart: the center 0.5 right of the 50, the right side 0.5 short of
        // the 40, and the left side out of reach
        const wide: BoxParams = {
            center: { x: 0.5, y: -150 },
            rotation: 0,
            files: 2,
            across: 158,
            deep: 1.6 * STEP,
        };
        const n = 4;
        const before = edges2(wide, n);
        exact(before.center.x, 0.5);
        exact(before.right, 79.5);
        const p = move(boxTool, wide, { x: 0, y: 0 }, {}, n) as BoxParams;
        exact(edges2(p, n).right, 80);
    });

    it("doesn't pull a circle", () => {
        const circle = circleTool.fromFrame(
            {
                center: { x: 0.4, y: -100 },
                halfWidth: 30,
                halfDepth: 30,
                rotation: 0,
            },
            8,
            env(),
        );
        const free = move(
            circleTool,
            circle,
            { x: 0, y: 0.3 },
            { fieldLines: undefined },
            8,
        );
        const p = move(circleTool, circle, { x: 0, y: 0.3 }, {}, 8);
        expect(p).toEqual(free);
    });
});

describe("moving with constrain held ($mod)", () => {
    /** Off the half steps both ways, so the grid would pull either axis */
    const off: BoxParams = { ...box, center: { x: 31.3, y: -151.7 } };

    it("stays on the axis the drag has gone further along, across or down", () => {
        const across = edges(
            move(
                boxTool,
                off,
                { x: 23, y: 9 },
                { constrain: true },
            ) as BoxParams,
        ).center;
        exact(across.y, off.center.y);
        expect(across.x).toBeGreaterThan(off.center.x + STEP);
        const down = edges(
            move(
                boxTool,
                off,
                { x: -6, y: -24 },
                { constrain: true },
            ) as BoxParams,
        ).center;
        exact(down.x, off.center.x);
        expect(down.y).toBeLessThan(off.center.y - STEP);
    });

    it("moves on both axes without it", () => {
        const free = edges(
            move(boxTool, off, { x: 23, y: 9 }) as BoxParams,
        ).center;
        expect(free.y).toBeGreaterThan(off.center.y + half);
    });
});
