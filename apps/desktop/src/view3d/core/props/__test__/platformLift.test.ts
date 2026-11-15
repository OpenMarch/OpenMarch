import { describe, expect, it } from "vitest";
import type { ItemGeometry } from "@openmarch/core";
import type { PropSolid } from "../propLayout";
import { liftAt, liftPlatforms, writeLifts } from "../platformLift";

const square = (
    id: number,
    cx: number,
    half: number,
    base: number,
    height: number,
    surface: PropSolid["surface"] = "platform",
): PropSolid => ({
    id,
    surface,
    center: { x: cx, z: 0 },
    base,
    height,
    outline: [
        { x: cx - half, z: -half },
        { x: cx + half, z: -half },
        { x: cx + half, z: half },
        { x: cx - half, z: half },
    ],
    closed: true,
    geometry: {} as ItemGeometry,
});

/** Half a count at 8 to 5: half of a 22.5 in step */
const RAMP = 0.2858;

describe("liftAt", () => {
    const platforms = liftPlatforms([
        square(1, 0, 2, 0, 0.6),
        square(2, 0, 1, 0.6, 0.4),
    ]);

    it("is the top of the tallest platform under the dot, away from its edges", () => {
        expect(liftAt(platforms, 0, 0, RAMP)).toBeCloseTo(1);
        expect(liftAt(platforms, 1.5, 0, RAMP)).toBeCloseTo(0.6);
        expect(liftAt(platforms, 5, 0, RAMP)).toBe(0);
    });

    it("steps up across an edge over the ramp, halfway on the edge", () => {
        expect(liftAt(platforms, 2, 0, RAMP)).toBeCloseTo(0.3);
        expect(liftAt(platforms, 2 + RAMP / 2, 0, RAMP)).toBeCloseTo(0);
        expect(liftAt(platforms, 2 - RAMP / 2, 0, RAMP)).toBeCloseTo(0.6);
        const quarter = liftAt(platforms, 2 + RAMP / 4, 0, RAMP);
        expect(quarter).toBeGreaterThan(0);
        expect(quarter).toBeLessThan(0.3);
    });

    it("steps from one platform onto the one stacked on it", () => {
        expect(liftAt(platforms, 1, 0, RAMP)).toBeCloseTo(0.8);
    });

    it("never stands a performer on an obstacle or a Floor prop", () => {
        const others = liftPlatforms([
            square(3, 0, 2, 0, 2, "obstacle"),
            square(4, 10, 2, 0, 0, "floor"),
        ]);
        expect(liftAt(others, 0, 0, RAMP)).toBe(0);
        expect(liftAt(others, 10, 0, RAMP)).toBe(0);
    });
});

describe("writeLifts", () => {
    it("writes each placed performer's lift, and 0 for the rest", () => {
        const platforms = liftPlatforms([square(1, 0, 2, 0, 0.6)]);
        const xz = new Float32Array([0, 0, 5, 0, 0, 0]);
        const placed = new Uint8Array([1, 1, 0]);
        const out = new Float32Array(3).fill(9);
        writeLifts(platforms, xz, placed, RAMP, out);
        expect([...out].map((v) => +v.toFixed(3))).toEqual([0.6, 0, 0]);
    });
});
