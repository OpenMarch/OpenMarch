// @vitest-environment node
import { describe, expect, it } from "vitest";
import { edgesAndCenter, linesUnder, pullShift } from "../linePull";

describe("pullShift", () => {
    it("shifts the value nearest a line onto it, within reach", () => {
        expect(pullShift([10, 20, 15], [22, 50], 3)).toBe(2);
        expect(pullShift([10, 20, 15], [16.5, 50], 3)).toBe(1.5);
    });

    it("finds nothing beyond reach, or with no reach", () => {
        expect(pullShift([10, 20], [24], 3)).toBeNull();
        expect(pullShift([10, 20], [20.5], 0)).toBeNull();
    });
});

describe("edgesAndCenter", () => {
    it("gives the two edges and the center, or one value for a single row", () => {
        const points = [
            { x: 10, y: 5 },
            { x: 30, y: 5 },
        ];
        expect(edgesAndCenter(points, "x")).toEqual([10, 30, 20]);
        expect(edgesAndCenter(points, "y")).toEqual([5]);
        expect(edgesAndCenter([], "x")).toEqual([]);
    });
});

describe("linesUnder", () => {
    it("names the lines the edges or center lie on", () => {
        const points = [
            { x: 10, y: 5 },
            { x: 30, y: 7 },
        ];
        expect(linesUnder(points, { x: [0, 20, 30.0004], y: [6, 8] })).toEqual({
            x: [20, 30.0004],
            y: [6],
        });
    });
});
