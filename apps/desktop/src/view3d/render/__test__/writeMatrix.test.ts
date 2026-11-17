import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { writeMatrix } from "../instanced-marchers.js";

/** Where the instance puts the body's origin (its soles). */
function soles(y?: number): Vector3 {
    const array = new Float32Array(32).fill(7);
    writeMatrix(array, 1, 3, -20, Math.PI / 3, 1.1, y);
    return new Vector3().applyMatrix4(new Matrix4().fromArray(array, 16));
}

describe("writeMatrix", () => {
    it("stands the marcher on y = 0 by default", () => {
        const p = soles();
        expect(p.x).toBeCloseTo(3, 6);
        expect(p.y).toBe(0);
        expect(p.z).toBeCloseTo(-20, 6);
    });

    it("stands the marcher at the given height, such as the field surface", () => {
        const p = soles(0.02);
        expect(p.x).toBeCloseTo(3, 6);
        expect(p.y).toBeCloseTo(0.02, 6);
        expect(p.z).toBeCloseTo(-20, 6);
    });
});
