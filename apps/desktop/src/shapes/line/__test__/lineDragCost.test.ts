import { describe, expect, it } from "vitest";
import {
    dragPoint,
    drawPoints,
    lineInterval,
    type LineParams,
} from "../lineGeometry";
import type { ToolEnv } from "../../tool/toolKind";

/**
 * Dragging an end of a curve measured straight across stays quick (#596): each pointer move
 * searches for where the interval comes out whole, and each try is a layout searched for straight
 * across. It took over a second a move for 64 marchers before. The bound is generous, so a slow CI
 * machine doesn't fail it; it catches a return to searching hundreds of layouts a move.
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
    pullRadius: 2,
    zoom: 1,
};

/** An 8-point curve, zigzagging, measured as `measured` says */
const curve = (measured?: "straight"): LineParams => {
    const points = Array.from({ length: 8 }, (_, i) => ({
        x: 100 + i * 40,
        y: 100 + (i % 2) * 60,
    }));
    const drawn = drawPoints(points, env, 1)!;
    return measured ? { ...drawn, measured } : drawn;
};

/** The mean time a pointer move takes, dragging point `index` (the last) about */
function msPerMove(
    base: LineParams,
    n: number,
    moveEnv: ToolEnv = env,
    index = 7,
): number {
    const moves = 20;
    const was = base.points[index]!;
    const drag = (i: number) =>
        dragPoint(
            base,
            n,
            index,
            { x: was.x + i * 1.3, y: was.y + 10 + i },
            moveEnv,
        );
    // Warmed up first, so the timing isn't the compiler's
    for (let i = 0; i < 5; i++) drag(i);
    const start = performance.now();
    for (let i = 0; i < moves; i++) drag(i);
    return (performance.now() - start) / moves;
}

describe("dragging an end of a curve (#596)", () => {
    it.each([16, 64])(
        "straight across, %i marchers: well under a frame's budget a move",
        (n) => {
            expect(msPerMove(curve("straight"), n)).toBeLessThan(60);
        },
    );

    // With Shift the end keeps its direction and snaps to the nearest whole interval along it,
    // searched for no further than it can be (review on #596: over a second a move, closed, and
    // about 200 ms here for 64). A Shift move is a few times a free one's, so it's bound looser.
    it.each([16, 64])(
        "straight across with Shift, %i marchers: well under a frame's budget a move",
        (n) => {
            expect(
                msPerMove(curve("straight"), n, { ...env, constrain: true }),
            ).toBeLessThan(100);
        },
    );

    it.each([16, 64])(
        "straight across with Shift, closed, %i marchers: well under a frame's budget a move",
        (n) => {
            const closed = { ...curve("straight"), closed: true };
            expect(
                msPerMove(closed, n, { ...env, constrain: true }, 0),
            ).toBeLessThan(100);
        },
    );

    it("with Shift, still lands the end where the interval comes out whole, straight across", () => {
        const base = curve("straight");
        const was = base.points[7]!;
        const moved = dragPoint(
            base,
            16,
            7,
            { x: was.x + 9, y: was.y + 13 },
            { ...env, constrain: true },
        );
        const end = moved.points[7]!;
        const before = base.points[6]!;
        // Along the end's own direction from the point before
        const cross =
            (was.x - before.x) * (end.y - before.y) -
            (was.y - before.y) * (end.x - before.x);
        expect(Math.abs(cross)).toBeLessThan(1e-6);
        const interval = lineInterval(moved, 16);
        expect(interval / STEP).toBeCloseTo(Math.round(interval / STEP), 9);
    });

    it("still snaps an end near the pointer so the interval comes out whole, straight across", () => {
        const to = { x: 381.3, y: 171 };
        const moved = dragPoint(curve("straight"), 16, 7, to, env);
        const end = moved.points[7]!;
        expect(Math.hypot(end.x - to.x, end.y - to.y)).toBeLessThan(6);
        expect(lineInterval(moved, 16)).toBeCloseTo(30, 9);
    });
});
