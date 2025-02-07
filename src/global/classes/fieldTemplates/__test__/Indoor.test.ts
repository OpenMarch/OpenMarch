import { describe, it, expect, vi } from "vitest";
import { createIndoorXCheckpoints, createIndoorYCheckpoints } from "../Indoor";

describe("createIndoorXCheckpoints", () => {
    it("should throw error when xSteps is less than 4", () => {
        expect(() => createIndoorXCheckpoints({ xSteps: 3 })).toThrow(
            "xSteps must be at least 4",
        );
    });

    it("should create correct checkpoints for minimum xSteps (4)", () => {
        const checkpoints = createIndoorXCheckpoints({ xSteps: 4 });
        expect(checkpoints).toHaveLength(2);
        expect(checkpoints[0]).toEqual({
            id: 0,
            name: "Line A",
            axis: "x",
            terseName: "A",
            stepsFromCenterFront: -2,
            useAsReference: true,
            visible: true,
        });
        expect(checkpoints[1]).toEqual({
            id: 1,
            name: "Line B",
            axis: "x",
            terseName: "B",
            stepsFromCenterFront: 2,
            useAsReference: true,
            visible: true,
        });
    });

    it("should create correct checkpoints for 8 steps", () => {
        const checkpoints = createIndoorXCheckpoints({ xSteps: 8 });
        expect(checkpoints).toHaveLength(3);
        expect(checkpoints[0].stepsFromCenterFront).toBe(-4);
        expect(checkpoints[1].stepsFromCenterFront).toBe(0);
        expect(checkpoints[2].stepsFromCenterFront).toBe(4);
    });

    it("should create correct checkpoints for 12 steps", () => {
        const checkpoints = createIndoorXCheckpoints({ xSteps: 12 });
        expect(checkpoints).toHaveLength(4);
        expect(checkpoints.map((c) => c.stepsFromCenterFront)).toEqual([
            -6, -2, 2, 6,
        ]);
        expect(checkpoints.map((c) => c.terseName)).toEqual([
            "A",
            "B",
            "C",
            "D",
        ]);
    });

    it("should handle non-divisible-by-4 steps", () => {
        const checkpoints = createIndoorXCheckpoints({ xSteps: 10 });
        expect(checkpoints).toHaveLength(4);
        expect(checkpoints.map((c) => c.stepsFromCenterFront)).toEqual([
            -5, -1, 3, 5,
        ]);
    });
});
describe("createIndoorYCheckpoints", () => {
    it("should throw error when ySteps is less than 4", () => {
        expect(() => createIndoorYCheckpoints({ ySteps: 3 })).toThrow(
            "ySteps must be at least 4",
        );
    });

    it("should create correct checkpoints for minimum ySteps (4)", () => {
        const checkpoints = createIndoorYCheckpoints({ ySteps: 4 });
        expect(checkpoints).toHaveLength(2);
        expect(checkpoints[0]).toEqual({
            id: 0,
            name: "Line 0",
            axis: "y",
            terseName: "0",
            stepsFromCenterFront: 0,
            useAsReference: true,
            visible: true,
        });
        expect(checkpoints[1]).toEqual({
            id: 1,
            name: "Line 1",
            axis: "y",
            terseName: "1",
            stepsFromCenterFront: -4,
            useAsReference: true,
            visible: true,
        });
    });

    it("should create correct checkpoints for 8 steps", () => {
        const checkpoints = createIndoorYCheckpoints({ ySteps: 8 });
        expect(checkpoints).toHaveLength(3);
        expect(checkpoints.map((c) => c.stepsFromCenterFront)).toEqual([
            0, -4, -8,
        ]);
        expect(checkpoints.map((c) => c.terseName)).toEqual(["0", "1", "2"]);
    });

    it("should create correct checkpoints for 16 steps", () => {
        const checkpoints = createIndoorYCheckpoints({ ySteps: 16 });
        expect(checkpoints).toHaveLength(5);
        expect(checkpoints.map((c) => c.stepsFromCenterFront)).toEqual([
            0, -4, -8, -12, -16,
        ]);
        expect(checkpoints.map((c) => c.name)).toEqual([
            "Line 0",
            "Line 1",
            "Line 2",
            "Line 3",
            "Line 4",
        ]);
    });

    it("should handle non-divisible-by-4 steps with correct warning", () => {
        const consoleSpy = vi.spyOn(console, "warn");
        const checkpoints = createIndoorYCheckpoints({ ySteps: 6 });
        expect(consoleSpy).toHaveBeenCalledWith(
            "ySteps is not divisible by 4.This may cause weird formatting",
        );
        expect(checkpoints).toHaveLength(2);
        expect(checkpoints.map((c) => c.stepsFromCenterFront)).toEqual([0, -6]);
        consoleSpy.mockRestore();
    });
});
