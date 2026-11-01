import { describe, expect, it } from "vitest";
import { boxShape } from "../boxShape";
import {
    boxHandlePoint,
    drawBox,
    filesOf,
    footprintOf,
    ranksOf,
    type BoxHandleKey,
    type BoxParams,
} from "../boxGeometry";
import { boxTool } from "../boxTool";
import { withMode } from "../../distribute/modes";
import { frameToField } from "../../frame/frame";
import type { DistributionMode } from "../../distribute/distribution";
import type { ToolEnv } from "../../tool/toolKind";
import type { ShapeContext, XY } from "../../types";

/**
 * Alt = from center (version A, docs/timeline/research/shapes/modifier-roles.md, section 2): a box
 * drawn with `fromCenter` grows about the press, the pointer setting one corner, and a handle
 * dragged with it resizes the box about its center. Without it, nothing changes.
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
const onGrid = (p: XY) =>
    Math.abs(p.x - snapHalf(p.x)) < 1e-9 &&
    Math.abs(p.y - snapHalf(p.y)) < 1e-9;
const centerOf = (box: BoxParams, n: number): XY => {
    const f = footprintOf(box, n);
    return { x: (f.left + f.right) / 2, y: (f.top + f.bottom) / 2 };
};

describe("drawing a box from its center", () => {
    it("centers the box on the press and puts a corner near the pointer", () => {
        // 9 marchers, 3 by 3: the press is the middle marcher
        const box = drawBox(
            { x: 100, y: 100 },
            { x: 140, y: 140 },
            9,
            env({ fromCenter: true }),
        )!;
        expect([filesOf(box), ranksOf(box, 9)]).toEqual([3, 3]);
        expect(footprintOf(box, 9)).toEqual({
            left: 60,
            top: 60,
            right: 140,
            bottom: 140,
        });
        expect(boxShape.generate(box, 9, ctx)[4]).toMatchObject({
            x: 100,
            y: 100,
        });
    });

    it("grows the other way when the pointer is behind and to the left", () => {
        const box = drawBox(
            { x: 100, y: 100 },
            { x: 60, y: 70 },
            4,
            env({ fromCenter: true }),
        )!;
        expect(footprintOf(box, 4)).toEqual({
            left: 60,
            top: 70,
            right: 140,
            bottom: 130,
        });
    });

    it("lands the dragged edge on a field line near the pointer, the far edge as far the other way (#425)", () => {
        const lines = { fieldLines: { x: [147], y: [] }, pullRadius: 3 };
        const at = (over: Partial<ToolEnv>) =>
            footprintOf(
                drawBox(
                    { x: 100, y: 100 },
                    { x: 146.5, y: 146 },
                    9,
                    env({ ...over, fromCenter: true }),
                )!,
                9,
            );
        expect([at(lines).left, at(lines).right]).toEqual([53, 147]);
        // With no line, the half steps
        expect([at({}).left, at({}).right]).toEqual([55, 145]);
    });

    it("draws corner to corner without it", () => {
        const box = drawBox({ x: 100, y: 100 }, { x: 140, y: 140 }, 9, env())!;
        expect(footprintOf(box, 9)).toEqual({
            left: 100,
            top: 100,
            right: 140,
            bottom: 140,
        });
    });

    it("keeps the box's full grid on half steps, within a quarter step of the press", () => {
        for (const to of [
            { x: 133, y: 121 },
            { x: 71, y: 147 },
            { x: 118, y: 62 },
        ])
            for (const n of [4, 6, 9, 12]) {
                const box = drawBox(
                    { x: 100, y: 100 },
                    to,
                    n,
                    env({ fromCenter: true }),
                )!;
                // The back-left spot of the full grid (a short back rank may leave it empty)
                const f = footprintOf(box, n);
                expect(onGrid({ x: f.left, y: f.top })).toBe(true);
                expect(box.across % half).toBe(0);
                expect(box.deep % half).toBe(0);
                // The center within a quarter step of the press
                const c = centerOf(box, n);
                expect(Math.abs(c.x - 100)).toBeLessThanOrEqual(half / 2);
                expect(Math.abs(c.y - 100)).toBeLessThanOrEqual(half / 2);
            }
    });

    it("draws mirror images on the four diagonals, the quarter step going toward the pointer", () => {
        // 2 × 2, 1½ steps apart: centered on the press, the marchers would be between grid spots
        const drawn = (dx: number, dy: number) =>
            footprintOf(
                drawBox(
                    { x: 100, y: 100 },
                    { x: 100 + dx, y: 100 + dy },
                    4,
                    env({ fromCenter: true }),
                )!,
                4,
            );
        const toward = (sign: number) => (sign > 0 ? [95, 110] : [90, 105]);
        for (const [sx, sy] of [
            [1, 1],
            [-1, -1],
            [1, -1],
            [-1, 1],
        ] as const) {
            const f = drawn(7.5 * sx, 7.5 * sy);
            expect([f.left, f.right]).toEqual(toward(sx));
            expect([f.top, f.bottom]).toEqual(toward(sy));
        }
    });

    it("is too short when the box it would draw, both ways from the press, is under half a step", () => {
        const from = { x: 100, y: 100 };
        const at = (dx: number) =>
            drawBox(
                from,
                { x: 100 + dx, y: 100 },
                4,
                env({ fromCenter: true }),
            );
        expect(at(2)).toBeUndefined();
        expect(at(3)).toBeDefined();
    });
});

/** A 3 × 3 box around 100, 100, 20 apart: 80 to 120 each way */
const square: BoxParams = {
    center: { x: 100, y: 100 },
    rotation: 0,
    files: 3,
    across: 20,
    deep: 20,
};

/** `box`'s handle `key` dragged by `by`, with or without `fromCenter` */
const dragged = (
    box: BoxParams,
    n: number,
    key: BoxHandleKey,
    by: XY,
    over: Partial<ToolEnv> = {},
): BoxParams => {
    const at = boxHandlePoint(box, n, key);
    return boxTool.dragHandle(
        box,
        n,
        key,
        { x: at.x + by.x, y: at.y + by.y },
        env(over),
    );
};

/** The frame's center and half sizes, rounded off floating-point noise */
const frameOf = (box: BoxParams, n: number) => {
    const f = boxTool.frameOf(box, n);
    const r = (v: number) => Math.round(v * 1e6) / 1e6;
    return {
        center: { x: r(f.center.x), y: r(f.center.y) },
        halfWidth: r(f.halfWidth),
        halfDepth: r(f.halfDepth),
    };
};

describe("resizing a box from its center", () => {
    it("a side handle moves the opposite side the other way by as much", () => {
        const out = dragged(
            square,
            9,
            "e",
            { x: 10, y: 0 },
            { fromCenter: true },
        );
        expect(footprintOf(out, 9)).toEqual({
            left: 70,
            top: 80,
            right: 130,
            bottom: 120,
        });
    });

    it("a corner handle grows both ways on both axes", () => {
        const out = dragged(
            square,
            9,
            "se",
            { x: 10, y: 15 },
            { fromCenter: true },
        );
        expect(footprintOf(out, 9)).toEqual({
            left: 70,
            top: 65,
            right: 130,
            bottom: 135,
        });
    });

    it("a handle dragged in shrinks it both ways", () => {
        const out = dragged(
            square,
            9,
            "nw",
            { x: 10, y: 10 },
            { fromCenter: true },
        );
        expect(footprintOf(out, 9)).toEqual({
            left: 90,
            top: 90,
            right: 110,
            bottom: 110,
        });
    });

    it("keeps the opposite side fixed without it (#439)", () => {
        expect(
            footprintOf(dragged(square, 9, "e", { x: 10, y: 0 }), 9),
        ).toEqual({
            left: 80,
            top: 80,
            right: 130,
            bottom: 120,
        });
        expect(
            footprintOf(dragged(square, 9, "se", { x: 10, y: 20 }), 9),
        ).toEqual({ left: 80, top: 80, right: 130, bottom: 140 });
    });

    it("keeps a turned box's center", () => {
        const turned = { ...square, rotation: Math.PI / 6 };
        const at = boxHandlePoint(turned, 9, "e");
        // Out along the box's own across axis, by a step
        const to = {
            x: at.x + 10 * Math.cos(Math.PI / 6),
            y: at.y + 10 * Math.sin(Math.PI / 6),
        };
        const out = boxTool.dragHandle(
            turned,
            9,
            "e",
            to,
            env({ fromCenter: true }),
        );
        expect(frameOf(out, 9)).toEqual({
            center: { x: 100, y: 100 },
            halfWidth: 30,
            halfDepth: 20,
        });
    });

    it.each<DistributionMode>(["outline", "spread"])(
        "keeps the center of a box in %s",
        (mode) => {
            const n = 12;
            const box = withMode(
                boxTool,
                { ...square, files: 4 },
                n,
                mode,
                env(),
            ) as BoxParams;
            const before = frameOf(box, n);
            for (const key of ["e", "se"] as const) {
                const out = dragged(
                    box,
                    n,
                    key,
                    { x: 10, y: 10 },
                    {
                        fromCenter: true,
                    },
                );
                const after = frameOf(out, n);
                expect(after.center).toEqual(before.center);
                expect(after.halfWidth).toBeGreaterThan(before.halfWidth);
                if (key === "e") expect(after.halfDepth).toBe(before.halfDepth);
                else expect(after.halfDepth).toBeGreaterThan(before.halfDepth);
            }
        },
    );

    it("keeps the full grid on half steps with an even count", () => {
        // 2 × 2, 20 apart: 90 to 110 each way
        const pair: BoxParams = { ...square, files: 2 };
        for (const by of [3, 7, 12, 18]) {
            const out = dragged(
                pair,
                4,
                "se",
                { x: by, y: by },
                {
                    fromCenter: true,
                },
            );
            const f = footprintOf(out, 4);
            expect(onGrid({ x: f.left, y: f.top })).toBe(true);
            expect(out.across % half).toBe(0);
            const c = centerOf(out, 4);
            expect(Math.abs(c.x - 100)).toBeLessThanOrEqual(half / 2);
            expect(Math.abs(c.y - 100)).toBeLessThanOrEqual(half / 2);
        }
    });
});

describe("resizing from the center again and again", () => {
    /** `box`'s se handle dragged to where its spacings become `spacing` both ways, from the center */
    const resized = (box: BoxParams, n: number, spacing: number) =>
        boxTool.dragHandle(
            box,
            n,
            "se",
            frameToField(boxTool.frameOf(box, n), {
                x: spacing / 2,
                y: spacing / 2,
            }),
            env({ fromCenter: true }),
        );

    it.each([
        ["square to the field", 0],
        ["turned a quarter", Math.PI / 2],
    ])(
        "doesn't walk a 2 × 2 box %s off its center: an even number of resizes puts it back",
        (_, rotation) => {
            // 2 × 2, 20 apart: 90 to 110 each way
            let box: BoxParams = { ...square, files: 2, rotation };
            for (let i = 1; i <= 6; i++) {
                // 1½ steps apart puts the marchers between grid spots, a quarter step either way
                box = resized(box, 4, i % 2 === 1 ? 15 : 20);
                const f = footprintOf(box, 4);
                expect(onGrid({ x: f.left, y: f.top })).toBe(true);
                if (i % 2 === 0)
                    expect(centerOf(box, 4)).toEqual({ x: 100, y: 100 });
            }
        },
    );
});

describe("from the center, with the other roles", () => {
    it("with constrain, draws equal spacings from the center", () => {
        const box = drawBox(
            { x: 100, y: 100 },
            { x: 140, y: 135 },
            9,
            env({ fromCenter: true, constrain: true }),
        )!;
        expect([filesOf(box), ranksOf(box, 9)]).toEqual([3, 3]);
        expect(box.across).toBe(box.deep);
        // Without constrain the drag is 40 across and 35 deep
        expect(
            drawBox(
                { x: 100, y: 100 },
                { x: 140, y: 135 },
                9,
                env({ fromCenter: true }),
            )!.deep,
        ).toBe(35);
        expect(centerOf(box, 9)).toEqual({ x: 100, y: 100 });
    });

    it("with constrain, a corner makes the spacings equal about the center", () => {
        const out = dragged(
            square,
            9,
            "se",
            { x: 20, y: 5 },
            {
                fromCenter: true,
                constrain: true,
            },
        );
        expect(out.across).toBe(out.deep);
        expect(out.across).not.toBe(square.across);
        expect(centerOf(out, 9)).toEqual({ x: 100, y: 100 });
    });

    it("with fine, draws off the half steps, centered exactly on the press", () => {
        const from = { x: 101.3, y: 98.6 };
        const box = drawBox(
            from,
            { x: 141.7, y: 139.1 },
            9,
            // fine: the ladder off, so nothing is snapped (toolEnvFor)
            env({ fromCenter: true, fine: true, snap: false }),
        )!;
        expect(box.across % half).not.toBe(0);
        const c = centerOf(box, 9);
        expect(c.x).toBeCloseTo(from.x, 9);
        expect(c.y).toBeCloseTo(from.y, 9);
        expect(footprintOf(box, 9).right).toBeCloseTo(141.7, 1);
    });

    it("with fine, a side handle resizes off the half steps about the center", () => {
        const out = dragged(
            square,
            9,
            "e",
            { x: 3.7, y: 0 },
            {
                fromCenter: true,
                fine: true,
                snap: false,
            },
        );
        expect(footprintOf(out, 9).left).toBeCloseTo(76.3, 9);
        expect(footprintOf(out, 9).right).toBeCloseTo(123.7, 9);
    });
});
