// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SILK_MASK_EDGE, silkMaskField, silkMaskInside } from "../silkMask";
import { curveCutPath, cutPathBounds } from "../../sizes/silkCuts";
import { SILK_SHAPE_IDS, silkShape } from "../../sizes/silkShapes";
import { guardModel } from "../guard";

const SIZE = 128;

/** A planar point given in inches on a shape at its catalog size. */
const planar = (
    id: (typeof SILK_SHAPE_IDS)[number],
    xIn: number,
    yIn: number,
) => {
    const b = cutPathBounds(silkShape(id).path);
    return [(xIn * 0.0254) / b.maxX, (yIn * 0.0254) / b.maxY] as const;
};

describe("silk masks", () => {
    it("fills a rectangle, edges at the border", () => {
        const f = silkMaskField(curveCutPath(0.9, 1.37), SIZE);
        expect(f).toHaveLength(SIZE * SIZE);
        expect(silkMaskInside(f, 0.5, 0.5, SIZE)).toBe(true);
        expect(f[(SIZE / 2) * SIZE + SIZE / 2]).toBe(255);
        // the outermost texels are half a texel inside
        expect(f[0]).toBeGreaterThan(SILK_MASK_EDGE);
        expect(f[0]).toBeLessThan(SILK_MASK_EDGE + 20);
    });

    it.each(SILK_SHAPE_IDS)("%s keeps the silk by the pole's top", (id) => {
        const f = silkMaskField(silkShape(id).path, SIZE);
        expect(silkMaskInside(f, 0.02, 0.01, SIZE)).toBe(true);
    });

    it("cuts the C-swing's hollow, the hook and the notches", () => {
        const at = (
            id: (typeof SILK_SHAPE_IDS)[number],
            x: number,
            y: number,
        ) =>
            silkMaskInside(
                silkMaskField(silkShape(id).path, SIZE),
                ...planar(id, x, y),
                SIZE,
            );
        // C-swing (the super swing, 44 x 68, 84 deep): silk above the pole
        // end and in the foot, nothing in the hollow between
        expect(at("cSwing", 4, 20)).toBe(true);
        expect(at("cSwing", 4, 60)).toBe(false);
        expect(at("cSwing", 30, 82)).toBe(true);
        // curved tail: the notch of its hook is outside
        expect(at("curvedTail", 50, 20)).toBe(false);
        expect(at("curvedTail", 40, 10)).toBe(true);
        // snake: the notch in its pole edge
        expect(at("snake", 2, 18)).toBe(false);
        expect(at("snake", 2, 6)).toBe(true);
        expect(at("snake", 6, 18)).toBe(true);
        // wings: the neck notch, and the sleeve notches
        expect(at("wings", 4, 36)).toBe(false);
        expect(at("wings", 1.2, 14)).toBe(false);
        expect(at("wings", 12, 36)).toBe(true);
    });
});

describe("the 6 ft flag's shape", () => {
    it("keeps the 36 x 54 in rectangle by default", () => {
        const silk = guardModel("flag6").silks![0];
        expect(silk).toMatchObject({ fly: 1.37, header: 0.9 });
        expect(silk.cut).toBeUndefined();
    });

    it.each(SILK_SHAPE_IDS.filter((id) => id !== "rectangle"))(
        "takes the show's %s at its catalog size",
        (id) => {
            const silk = guardModel("flag6", "low", { silkShape: id })
                .silks![0];
            const shape = silkShape(id);
            expect(silk.cut).toBe(id);
            expect(silk.header).toBeCloseTo(shape.header.m, 9);
            expect(silk.fly).toBeCloseTo(shape.fly.m, 9);
        },
    );
});
