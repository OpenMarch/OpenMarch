import { describe, it, expect } from "vitest";
import { FieldProperties, type Checkpoint } from "../FieldProperties";
import {
    fieldFootprint,
    pixelsToWorld,
    stepMeters,
    stepsToWorld,
    worldToPixels,
} from "../world";

// A 100 step by 40 step field with the front sideline at y = 0.
const cp = (id: number, axis: "x" | "y", steps: number): Checkpoint => ({
    id,
    name: `${axis}${id}`,
    axis,
    terseName: `${axis}${id}`,
    stepsFromCenterFront: steps,
    useAsReference: true,
    visible: true,
});

const fp = new FieldProperties({
    name: "test",
    xCheckpoints: [cp(1, "x", -50), cp(2, "x", 0), cp(3, "x", 50)],
    yCheckpoints: [cp(4, "y", 0), cp(5, "y", -40)],
});

describe("world mapping", () => {
    it("converts the step size to meters", () => {
        expect(stepMeters(fp)).toBeCloseTo(22.5 * 0.0254, 9);
    });

    it("maps the front sideline center to the origin", () => {
        const w = pixelsToWorld(fp, {
            x: fp.centerFrontPoint.xPixels,
            y: fp.centerFrontPoint.yPixels,
        });
        expect(w.x).toBeCloseTo(0, 9);
        expect(w.z).toBeCloseTo(0, 9);
    });

    it("puts the back edge at negative z and side 2 at positive x", () => {
        const backRight = pixelsToWorld(fp, { x: fp.width, y: 0 });
        expect(backRight.x).toBeGreaterThan(0);
        expect(backRight.z).toBeLessThan(0);
    });

    it("round-trips pixels and world", () => {
        const back = worldToPixels(fp, pixelsToWorld(fp, { x: 12.5, y: 99 }));
        expect(back.x).toBeCloseTo(12.5, 6);
        expect(back.y).toBeCloseTo(99, 6);
    });

    it("maps steps to world with +z toward the audience", () => {
        const w = stepsToWorld(fp, { xSteps: 10, ySteps: -4 });
        expect(w.x).toBeCloseTo(10 * stepMeters(fp), 9);
        expect(w.z).toBeCloseTo(-4 * stepMeters(fp), 9);
    });

    it("computes the footprint from the checkpoints", () => {
        const f = fieldFootprint(fp);
        const m = stepMeters(fp);
        expect(f.minX).toBeCloseTo(-50 * m, 9);
        expect(f.maxX).toBeCloseTo(50 * m, 9);
        expect(f.minZ).toBeCloseTo(-40 * m, 9);
        expect(f.maxZ).toBe(0);
    });
});
