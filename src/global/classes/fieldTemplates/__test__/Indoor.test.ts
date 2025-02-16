import { describe, it, expect, vi } from "vitest";
import { createIndoorXCheckpoints, createIndoorYCheckpoints } from "../Indoor";

describe("createIndoorXCheckpoints", () => {
    it("should throw error when xSteps is less than 4", () => {
        expect(() => createIndoorXCheckpoints({ xSteps: 3 })).toThrow(
            "xSteps must be at least 4",
        );
    });

    it("should create correct checkpoints for minimum xSteps (4)", () => {
        let checkpoints = createIndoorXCheckpoints({ xSteps: 4 }).sort(
            (a, b) => a.stepsFromCenterFront - b.stepsFromCenterFront,
        );
        expect(checkpoints).toHaveLength(3);
        expect(checkpoints[0].stepsFromCenterFront).toBe(-2);
        expect(checkpoints[1].stepsFromCenterFront).toBe(0);
        expect(checkpoints[2].stepsFromCenterFront).toBe(2);
    });

    it("should create correct checkpoints for 8 steps", () => {
        const checkpoints = createIndoorXCheckpoints({ xSteps: 8 }).sort(
            (a, b) => a.stepsFromCenterFront - b.stepsFromCenterFront,
        );
        expect(checkpoints).toHaveLength(3);
        expect(checkpoints[0].stepsFromCenterFront).toBe(-4);
        expect(checkpoints[1].stepsFromCenterFront).toBe(0);
        expect(checkpoints[2].stepsFromCenterFront).toBe(4);
    });

    it("should create correct checkpoints for 12 steps", () => {
        const checkpoints = createIndoorXCheckpoints({ xSteps: 12 }).sort(
            (a, b) => a.stepsFromCenterFront - b.stepsFromCenterFront,
        );
        expect(checkpoints).toHaveLength(5);
        expect(checkpoints.map((c) => c.stepsFromCenterFront)).toEqual([
            -6, -4, 0, 4, 6,
        ]);
        expect(checkpoints.map((c) => c.terseName)).toEqual([
            "LE",
            "4",
            "5",
            "4",
            "RE",
        ]);
    });

    it("should handle non-divisible-by-4 steps", () => {
        const checkpoints = createIndoorXCheckpoints({ xSteps: 10 });
        expect(checkpoints).toHaveLength(5);
        expect(
            checkpoints
                .map((c) => c.stepsFromCenterFront)
                .sort((a, b) => a - b),
        ).toEqual([-5, -4, 0, 4, 5]);
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
            name: "A line",
            axis: "y",
            terseName: "A",
            stepsFromCenterFront: 0,
            useAsReference: true,
            visible: true,
        });
        expect(checkpoints[1]).toEqual({
            id: 1,
            name: "B line",
            axis: "y",
            terseName: "B",
            stepsFromCenterFront: -4,
            useAsReference: true,
            visible: true,
        });
    });

    it("should create correct checkpoints for 8 steps", () => {
        const checkpoints = createIndoorYCheckpoints({ ySteps: 8 });
        expect(checkpoints).toHaveLength(3);
        expect(
            checkpoints
                .map((c) => c.stepsFromCenterFront)
                .sort((a, b) => b - a),
        ).toEqual([0, -4, -8]);
        expect(checkpoints.map((c) => c.terseName)).toEqual(["A", "B", "C"]);
    });

    it("should create correct checkpoints for 16 steps", () => {
        const checkpoints = createIndoorYCheckpoints({ ySteps: 16 });
        expect(checkpoints).toHaveLength(5);
        expect(
            checkpoints
                .map((c) => c.stepsFromCenterFront)
                .sort((a, b) => b - a),
        ).toEqual([0, -4, -8, -12, -16]);
        expect(checkpoints.map((c) => c.name)).toEqual([
            "A line",
            "B line",
            "C line",
            "D line",
            "E line",
        ]);
        expect(checkpoints.map((c) => c.terseName)).toEqual([
            "A",
            "B",
            "C",
            "D",
            "E",
        ]);
    });

    it("should create correct checkpoints for 18 steps", () => {
        const checkpoints = createIndoorYCheckpoints({ ySteps: 18 });
        expect(checkpoints).toHaveLength(7);
        expect(
            checkpoints
                .map((c) => c.stepsFromCenterFront)
                .sort((a, b) => b - a),
        ).toEqual([0, -1, -5, -9, -13, -17, -18]);
        expect(checkpoints.map((c) => c.name)).toEqual([
            "Front edge",
            "Back edge",
            "A line",
            "B line",
            "C line",
            "D line",
            "E line",
        ]);
    });

    it("should handle non-divisible-by-4 steps with correct warning", () => {
        const consoleSpy = vi.spyOn(console, "warn");
        const checkpoints = createIndoorYCheckpoints({ ySteps: 6 });
        expect(checkpoints).toHaveLength(4);
        expect(
            checkpoints
                .map((c) => c.stepsFromCenterFront)
                .sort((a, b) => b - a),
        ).toEqual([0, -1, -5, -6]);
        consoleSpy.mockRestore();
    });
});
