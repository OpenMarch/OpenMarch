// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fieldToFrame, frameToField } from "../../frame/frame";
import {
    boxCorners,
    boxFrame,
    boxHandlePoint,
    drawBox,
    stretchBox,
    type BoxHandleKey,
    type BoxParams,
} from "../boxGeometry";
import type { ToolEnv } from "../../tool/toolKind";
import type { XY } from "../../types";

/**
 * The edge pull (#425): while a box handle is dragged or a box is drawn, a moving edge that comes
 * within a few pixels of one of the field's lines lands on it, the interval becoming whatever
 * that takes. Away from lines the half-step ladder wins.
 */

const STEP = 10;
const half = STEP / 2;
const snapHalf = (v: number) => Math.round(v / half) * half;
/** Yard lines every 8 steps side to side; front sideline, front and back hash front to back */
const LINES = {
    x: [-160, -80, 0, 80, 160],
    y: [0, -280, -560],
};
/** fine: off the half-step ladder, still pulled (owner on #453) */
const FINE = { snap: false, fine: true };
/** The Snap toggle off: no snapping at all */
const NO_SNAP = { snap: false, pull: false };
const env = (over: Partial<ToolEnv> = {}): ToolEnv => ({
    stepPx: STEP,
    snap: true,
    constrain: false,
    gridSnap: (p) => ({ x: snapHalf(p.x), y: snapHalf(p.y) }),
    hitRadius: 3,
    fieldLines: LINES,
    pullRadius: 6,
    ...over,
});
const exact = (a: number, b: number) =>
    expect(Math.abs(a - b)).toBeLessThan(1e-9);
const onHalves = (v: number) =>
    expect(Math.abs(v / half - Math.round(v / half))).toBeLessThan(1e-9);

/** `files` files in one rank, 2 steps apart, its left edge on x = `left`, y = -100 */
function row(files: number, left = 0): BoxParams {
    return {
        center: { x: left + ((files - 1) * 2 * STEP) / 2, y: -100 },
        rotation: 0,
        files,
        across: 2 * STEP,
        deep: 2 * STEP,
    };
}
const edges = (p: BoxParams, n: number) => {
    const f = boxFrame(p, n);
    return {
        left: f.center.x - f.halfWidth,
        right: f.center.x + f.halfWidth,
        back: f.center.y - f.halfDepth,
        front: f.center.y + f.halfDepth,
    };
};
const stretch = (
    p: BoxParams,
    n: number,
    key: BoxHandleKey,
    to: XY,
    over: Partial<ToolEnv> = {},
) => stretchBox(p, n, key, to, env(over));

describe("stretching a box onto a line", () => {
    it("7 files from the 40, dragged near the 50, are exactly 2⅔ apart with the edge on it", () => {
        const p = stretch(row(7), 7, "e", { x: 162, y: -100 });
        exact(p.across, (8 / 3) * STEP);
        exact(edges(p, 7).right, 160);
        exact(edges(p, 7).left, 0);
    });

    it("11 files there are 1⅗ apart", () => {
        const p = stretch(row(11), 11, "e", { x: 157, y: -100 });
        exact(p.across, 1.6 * STEP);
        exact(edges(p, 11).right, 160);
    });

    it("keeps the fixed edge from the other side too", () => {
        // Right edge on 160, dragged left to near the 0 line
        const p = stretch(row(7, 40), 7, "w", { x: 3, y: -100 });
        exact(edges(p, 7).right, 160);
        exact(edges(p, 7).left, 0);
        exact(p.across, (8 / 3) * STEP);
    });

    it("5 ranks from the front sideline to the front hash are 7 apart", () => {
        const ranks: BoxParams = {
            center: { x: 0, y: -40 },
            rotation: 0,
            files: 1,
            across: 2 * STEP,
            deep: 2 * STEP,
        };
        const p = stretch(ranks, 5, "n", { x: 0, y: -284 });
        exact(p.deep, 7 * STEP);
        exact(edges(p, 5).back, -280);
        exact(edges(p, 5).front, 0);
    });

    it("steps by half steps away from lines", () => {
        for (const x of [100, 113, 127, 140]) {
            const p = stretch(row(7), 7, "e", { x, y: -100 });
            onHalves(p.across);
            exact(edges(p, 7).left, 0);
        }
    });

    it("pulls only within the radius, and no farther than a quarter of the edge's half-step detent", () => {
        // 7 pixels away is past the 6 px radius
        onHalves(stretch(row(7), 7, "e", { x: 167, y: -100 }).across);
        // 3 files: the detent at the edge is 2 × ½ step = 10, so the pull reaches 2.5
        const three = row(3);
        exact(stretch(three, 3, "e", { x: 82, y: -100 }).across, 40);
        exact(
            stretch(three, 3, "e", { x: 77.4, y: -100 }).across,
            40, // the ladder's own value lands on the line too
        );
        onHalves(stretch(three, 3, "e", { x: 83, y: -100 }).across);
    });

    it("with fine, still lands the edge on the line: 2⅔ exactly (owner on #453)", () => {
        const fine = stretch(row(7), 7, "e", { x: 162, y: -100 }, FINE);
        exact(fine.across, (8 / 3) * STEP);
        exact(edges(fine, 7).right, 160);
        // Away from lines, hundredths rather than half steps
        const free = stretch(row(7), 7, "e", { x: 131.3, y: -100 }, FINE);
        // 131.3 over 6 gaps, to hundredths of a 10-unit step
        exact(free.across, 21.9);
    });

    it("doesn't pull with the Snap toggle off, or a 45° box with no corner near a line", () => {
        const noSnap = stretch(row(7), 7, "e", { x: 162, y: -100 }, NO_SNAP);
        expect(Math.abs(noSnap.across - (8 / 3) * STEP)).toBeGreaterThan(1e-3);
        const turned = { ...row(7), rotation: Math.PI / 4 };
        const to = boxHandlePoint(turned, 7, "e");
        const p = stretch(turned, 7, "e", { x: to.x + 1, y: to.y + 1 });
        onHalves(p.across);
    });

    it("doesn't pull a corner while constrain equalizes the spacings", () => {
        // 7 files, 2 ranks: the south-east corner moves both ways
        const block: BoxParams = { ...row(7), files: 7 };
        const free = stretch(block, 14, "se", { x: 162, y: -77 });
        exact(free.across, (8 / 3) * STEP);
        const equal = stretch(
            block,
            14,
            "se",
            { x: 162, y: -77 },
            { constrain: true },
        );
        expect(Math.abs(equal.across - (8 / 3) * STEP)).toBeGreaterThan(1e-3);
        onHalves(equal.across);
        exact(equal.deep, equal.across);
        // In hundredths a pulled 2⅔ across would show: 27 across and 33 deep make 30 each, not 29.8
        const fine = stretch(
            block,
            14,
            "se",
            { x: 162, y: -77 },
            { ...FINE, constrain: true },
        );
        exact(fine.across, 30);
        exact(fine.deep, 30);
    });

    it("still pulls a side handle with constrain, which only flips the ratio lock there", () => {
        // What toolEnvFor gives a $mod side drag: constrain, and the ratio lock flipped on
        const p = stretch(
            row(7),
            7,
            "e",
            { x: 162, y: -100 },
            { constrain: true, ratioLocked: true },
        );
        exact(p.across, (8 / 3) * STEP);
        exact(edges(p, 7).right, 160);
        // The same drag with the lock button on and no key lands the same
        const locked = stretch(
            row(7),
            7,
            "e",
            { x: 162, y: -100 },
            {
                ratioLocked: true,
            },
        );
        exact(locked.across, p.across);
    });

    it("with the ratio lock at 1, a pulled 2⅔ across makes deep exactly 2⅔", () => {
        const block: BoxParams = { ...row(7), files: 7 };
        const p = stretch(
            block,
            14,
            "e",
            { x: 162, y: -100 },
            { ratioLocked: true },
        );
        exact(p.across, (8 / 3) * STEP);
        exact(p.deep, (8 / 3) * STEP);
    });

    it("with the ratio lock, a pulled axis that doesn't lead leaves the other on half steps", () => {
        // 7 × 2, 2 across and 1½ deep (deep is ¾ of across), its left edge on the 0 line. The
        // corner goes 2 px from the 160 line, but deep grows more (to 2½), so deep leads: across
        // follows it on half steps, not as an exact value off both the line and the ladder
        const base: BoxParams = { ...row(7), deep: 1.5 * STEP };
        const top = base.center.y - (1.5 * STEP) / 2;
        const p = stretch(
            base,
            14,
            "se",
            { x: 162, y: top + 2.5 * STEP },
            { ratioLocked: true },
        );
        exact(p.deep, 2.5 * STEP);
        onHalves(p.across);
        exact(edges(p, 14).left, 0);
    });

    it("on a box turned a quarter, its own across follows the field's front-to-back lines", () => {
        const turned: BoxParams = { ...row(5), rotation: Math.PI / 2 };
        // Put the box's own west end on the front sideline (y = 0)
        const w = boxHandlePoint(turned, 5, "w");
        const placed = {
            ...turned,
            center: { x: turned.center.x, y: turned.center.y - w.y },
        };
        const w0 = boxHandlePoint(placed, 5, "w");
        const e0 = boxHandlePoint(placed, 5, "e");
        const dir = Math.sign(e0.y - w0.y);
        const lineY = dir < 0 ? -280 : 280;
        const lines = { x: LINES.x, y: [0, lineY] };
        const p = stretchBox(
            placed,
            5,
            "e",
            { x: e0.x, y: lineY - dir * 3 },
            env({ fieldLines: lines }),
        );
        exact(p.across, 7 * STEP);
        exact(boxHandlePoint(p, 5, "w").y, 0);
        exact(boxHandlePoint(p, 5, "e").y, lineY);
    });
});

describe("drawing a box onto a line", () => {
    it("lands the dragged edge on the line from a corner on the 40, whatever the count", () => {
        const p = drawBox({ x: 0, y: -100 }, { x: 162, y: -99 }, 7, env())!;
        exact(p.across, (8 / 3) * STEP);
        exact(edges(p, 7).left, 0);
        exact(edges(p, 7).right, 160);
        const eleven = drawBox(
            { x: 0, y: -100 },
            { x: 158, y: -99 },
            11,
            env(),
        )!;
        exact(edges(eleven, 11).right, 160);
        exact(edges(eleven, 11).left, 0);
    });

    it("drawn up and to the left, keeps the pressed corner and puts the far edge on the line", () => {
        const p = drawBox({ x: 160, y: -100 }, { x: 2, y: -101 }, 7, env())!;
        exact(edges(p, 7).right, 160);
        exact(edges(p, 7).left, 0);
    });

    it("drawn with fine, still lands on the line (owner on #453)", () => {
        const fine = drawBox(
            { x: 0, y: -100 },
            { x: 162, y: -99 },
            7,
            env(FINE),
        )!;
        exact(fine.across, (8 / 3) * STEP);
    });

    it("doesn't pull with constrain or the Snap toggle off", () => {
        const equal = drawBox(
            { x: 0, y: -100 },
            { x: 162, y: -99 },
            7,
            env({ constrain: true }),
        )!;
        onHalves(equal.across);
        const noSnap = drawBox(
            { x: 0, y: -100 },
            { x: 162, y: -99 },
            7,
            env(NO_SNAP),
        )!;
        expect(Math.abs(noSnap.across - (8 / 3) * STEP)).toBeGreaterThan(1e-3);
    });
});

describe("stretching a turned box onto a line (#446)", () => {
    const N = 12;
    /** 4 files by 3 ranks, 2 steps apart, turned `degrees`, own corner `own` at field `at` */
    const turned = (degrees: number, own: XY, at: XY): BoxParams => {
        const p: BoxParams = {
            center: { x: 0, y: 0 },
            rotation: (degrees * Math.PI) / 180,
            files: 4,
            across: 2 * STEP,
            deep: 2 * STEP,
        };
        const c = frameToField(boxFrame(p, N), own);
        return { ...p, center: { x: at.x - c.x, y: at.y - c.y } };
    };
    // Own half sizes: 3 gaps × 20 across, 2 × 20 deep
    const HW = 30;
    const HD = 20;
    /** Where own point `own` of `p` is on the field */
    const field = (p: BoxParams, own: XY) => frameToField(boxFrame(p, N), own);
    /** The own point of `p` a field point `at` is, worked out on its frame */
    const ownOf = (p: BoxParams, at: XY) => fieldToFrame(boxFrame(p, N), at);
    const hasCorner = (p: BoxParams, at: Partial<XY>) =>
        boxCorners(p, N).some(
            (c) =>
                (at.x === undefined || Math.abs(c.x - at.x) < 1e-9) &&
                (at.y === undefined || Math.abs(c.y - at.y) < 1e-9),
        );
    const sameCorner = (p: BoxParams, at: XY) =>
        expect(hasCorner(p, at)).toBe(true);

    it("a 15° box's east handle lands its corner on a yard line, the west side staying", () => {
        // Its back-east corner 4 short of the 50
        const p = turned(15, { x: HW, y: -HD }, { x: 76, y: -150 });
        const west = [
            field(p, { x: -HW, y: -HD }),
            field(p, { x: -HW, y: HD }),
        ];
        // The east edge where the corner is on the 50, then 1 short of it
        const u = field(p, { x: HW + 1, y: -HD }).x - 76;
        const onLine = HW + 4 / u;
        const to = field(p, { x: onLine - 1, y: 0 });
        const out = stretch(p, N, "e", to);
        expect(hasCorner(out, { x: 80 })).toBe(true);
        for (const w of west) sameCorner(out, w);
        exact(out.rotation, p.rotation);
        // Spacing is exactly what that takes
        exact(out.across, (onLine + HW) / 3);
    });

    it("a 30° box's back handle lands a corner on the back hash", () => {
        const p = turned(30, { x: HW, y: -HD }, { x: 40, y: -277 });
        const front = [field(p, { x: -HW, y: HD }), field(p, { x: HW, y: HD })];
        // Each unit the back edge moves back (own −y) moves that corner's y by dy
        const dy = field(p, { x: HW, y: -HD - 1 }).y - -277;
        const onLine = -HD - -3 / dy;
        const to = field(p, { x: 0, y: onLine + 1 });
        const out = stretch(p, N, "n", to);
        expect(hasCorner(out, { y: -280 })).toBe(true);
        for (const f of front) sameCorner(out, f);
        exact(out.deep, (HD - onLine) / 2);
    });

    it("a 15° box's corner handle lands its corner on a yard line and the back hash at once", () => {
        const p = turned(15, { x: HW, y: -HD }, { x: 77.5, y: -277.5 });
        const anchor = field(p, { x: -HW, y: HD });
        // The own spot the crossing is, then dragged a little short of it
        const cross = ownOf(p, { x: 80, y: -280 });
        const to = field(p, { x: cross.x - 0.6, y: cross.y + 0.6 });
        const out = stretch(p, N, "ne", to);
        sameCorner(out, { x: 80, y: -280 });
        sameCorner(out, anchor);
        exact(out.across, (cross.x + HW) / 3);
        exact(out.deep, (HD - cross.y) / 2);
    });

    it("steps by half steps away from lines; fine still pulls, the Snap toggle off doesn't", () => {
        const p = turned(15, { x: HW, y: -HD }, { x: 50, y: -150 });
        const to = field(p, { x: HW + 9, y: 0 });
        onHalves(stretch(p, N, "e", to).across);
        const near = turned(15, { x: HW, y: -HD }, { x: 76, y: -150 });
        const u = field(near, { x: HW + 1, y: -HD }).x - 76;
        const t = field(near, { x: HW + 4 / u - 1, y: 0 });
        expect(hasCorner(stretch(near, N, "e", t, FINE), { x: 80 })).toBe(true);
        expect(hasCorner(stretch(near, N, "e", t, NO_SNAP), { x: 80 })).toBe(
            false,
        );
    });

    describe("at a shallow turn, an edge running nearly along a hash (review of #448)", () => {
        const N5 = 10;
        // 5 files by 2 ranks, 2 steps apart: own half sizes 40 across, 10 deep
        const W = 40;
        const D = 10;
        for (const degrees of [15, 5, 1]) {
            it(`at ${degrees}°, travels no farther than the radius to catch it, and every half step stays reachable`, () => {
                const base: BoxParams = {
                    center: { x: 0, y: 0 },
                    rotation: (degrees * Math.PI) / 180,
                    files: 5,
                    across: 2 * STEP,
                    deep: 2 * STEP,
                };
                const c = frameToField(boxFrame(base, N5), { x: W, y: -D });
                // Its back-east corner 1 from the front hash
                const p = {
                    ...base,
                    center: { x: 40 - c.x, y: -281 - c.y },
                };
                const radius = 5; // 6 px, capped at a quarter of 4 gaps' half step
                const seen = new Set<string>();
                for (let ex = W - 20; ex <= W + 20; ex += 0.05) {
                    const to = frameToField(boxFrame(p, N5), { x: ex, y: 0 });
                    const out = stretch(p, N5, "e", to);
                    const edge = -W + 4 * out.across;
                    const onHalves =
                        Math.abs(
                            out.across / half - Math.round(out.across / half),
                        ) < 1e-9;
                    if (!onHalves)
                        expect(Math.abs(edge - ex)).toBeLessThanOrEqual(
                            radius + 1e-6,
                        );
                    seen.add(out.across.toFixed(6));
                }
                for (const across of [15, 20, 25])
                    expect(seen.has(across.toFixed(6)), `${across}`).toBe(true);
            });
        }
    });
});

describe("from the center (fromCenter)", () => {
    const CENTER = { fromCenter: true };

    describe("drawing 2 × 2 with fine, from a press 1 step short of the 45", () => {
        /** The right edge of a box drawn from 70 to `x` */
        const right = (x: number) =>
            edges(
                drawBox(
                    { x: 70, y: -100 },
                    { x, y: -90 },
                    4,
                    env({ ...FINE, ...CENTER }),
                )!,
                4,
            ).right;

        it("still lands the dragged edge on the line: one gap is half a gap from the center", () => {
            exact(right(80.5), 80);
        });

        it("pulls within a quarter of the edge's own detent, half the reach of a fixed edge", () => {
            // An interval's half step moves the edge a quarter step from the center: 0.625 here
            exact(right(80.6), 80);
            exact(right(81), 81);
        });
    });

    it("doesn't pull the far side, mirrored across the press, onto a line", () => {
        // 4 files from 50: the dragged edge 18½ short of the 50, the far one 1½ past the 40
        const p = drawBox(
            { x: 50, y: -100 },
            { x: 98.5, y: -90 },
            4,
            env(CENTER),
        )!;
        // On the half steps, as with no line there: 3 steps apart, 5 to 95
        expect(p.files).toBe(4);
        expect(p.across).toBe(30);
        exact(edges(p, 4).left, 5);
    });

    describe("a 3 × 3 box turned 30°, its se corner dragged", () => {
        const N = 9;
        /** 3 × 3, 2 steps apart, turned 30°, around `center` */
        const turned = (center: XY): BoxParams => ({
            center,
            rotation: Math.PI / 6,
            files: 3,
            across: 2 * STEP,
            deep: 2 * STEP,
        });
        /** `p` with its se corner dragged to own 20.1, 20.1: a tenth past where it was */
        const dragged = (p: BoxParams) =>
            stretch(
                p,
                N,
                "se",
                frameToField(boxFrame(p, N), { x: 20.1, y: 20.1 }),
                CENTER,
            );
        const corner = (p: BoxParams, own: XY) => {
            const f = boxFrame(p, N);
            return frameToField(f, {
                x: own.x * f.halfWidth,
                y: own.y * f.halfDepth,
            });
        };

        it("lands the moving east edge's other corner on a line near it", () => {
            // The ne corner just short of the 50; the se corner nowhere near a line
            const p = turned({ x: 52.5, y: -140 });
            expect(Math.abs(corner(p, { x: 1, y: -1 }).x - 80)).toBeLessThan(1);
            const out = dragged(p);
            exact(corner(out, { x: 1, y: -1 }).x, 80);
            exact(out.center.x, 52.5);
            exact(out.center.y, -140);
        });

        it("doesn't take the middle of a moving edge for a corner", () => {
            // The middle of the east edge just short of the 50, no corner near a line
            const p = turned({ x: 62.5, y: -140 });
            expect(
                Math.abs(frameToField(boxFrame(p, N), { x: 20, y: 0 }).x - 80),
            ).toBeLessThan(1);
            const out = dragged(p);
            expect([out.across, out.deep]).toEqual([20, 20]);
        });
    });
});
