// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    boundsSize,
    gridFor,
    placementOffset,
    thumbnailSize,
    viewCamera,
} from "../previewMath";

describe("previewMath", () => {
    const bounds = {
        min: [-1, 0.5, 2] as [number, number, number],
        max: [1, 2.5, 4] as [number, number, number],
    };

    it("stands the model on the floor at the origin", () => {
        expect(placementOffset(bounds)).toEqual([-0, -0.5, -3]);
        expect(boundsSize(bounds)).toEqual([2, 2, 2]);
    });

    it("places each view's camera on its axis, framing the box", () => {
        const front = viewCamera([2, 2, 2], [0, 1, 0], "front");
        expect(front.position[0]).toBe(0);
        expect(front.position[2]).toBeGreaterThan(Math.sqrt(3));
        const side = viewCamera([2, 2, 2], [0, 1, 0], "side");
        expect(side.position[2]).toBe(0);
        expect(side.position[0]).toBeGreaterThan(Math.sqrt(3));
        const top = viewCamera([2, 2, 2], [0, 1, 0], "top");
        expect(top.position).toEqual([0, expect.any(Number), 0]);
        // Front at the bottom of the screen, as in the 3D View's top-down.
        expect(top.up).toEqual([0, 0, -1]);
    });

    it("never enlarges a thumbnail and caps the long edge", () => {
        expect(thumbnailSize(1600, 900)).toEqual({ width: 256, height: 144 });
        expect(thumbnailSize(100, 50)).toEqual({ width: 100, height: 50 });
    });

    it("covers the scene with a whole-meter grid", () => {
        expect(gridFor([0.1, 1.5, 0.1])).toEqual({ size: 4, divisions: 4 });
        const floor = gridFor([18.3, 0.01, 27.4]);
        expect(floor.size).toBeGreaterThan(27.4);
        expect(floor.divisions).toBeLessThanOrEqual(200);
    });
});
