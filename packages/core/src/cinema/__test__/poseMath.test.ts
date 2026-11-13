import { describe, expect, it } from "vitest";
import {
    FOV_MAX_DEG,
    FOV_MIN_DEG,
    clampEye,
    easeInOutCubic,
    fitDistance,
    fitFov,
    lerpPose,
    type CameraPose,
} from "../index";

describe("easeInOutCubic", () => {
    it("runs 0 to 1 through the midpoint and clamps outside", () => {
        expect(easeInOutCubic(0)).toBe(0);
        expect(easeInOutCubic(1)).toBe(1);
        expect(easeInOutCubic(0.5)).toBe(0.5);
        expect(easeInOutCubic(-1)).toBe(0);
        expect(easeInOutCubic(2)).toBe(1);
        expect(easeInOutCubic(Number.NaN)).toBe(0);
    });

    it("starts and ends slowly", () => {
        expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
        expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
    });
});

describe("fitDistance and fitFov", () => {
    it("round trip", () => {
        const distance = fitDistance(10, 40, 16 / 9);
        expect(distance).toBeGreaterThan(10);
        expect(fitFov(10, distance, 16 / 9)).toBeCloseTo(40, 6);
    });

    it("round trip in a portrait frame, where the width is the limit", () => {
        const distance = fitDistance(10, 40, 9 / 16);
        expect(distance).toBeGreaterThan(fitDistance(10, 40, 16 / 9));
        expect(fitFov(10, distance, 9 / 16)).toBeCloseTo(40, 6);
    });

    it("clamps the field of view", () => {
        expect(FOV_MIN_DEG).toBe(8);
        expect(FOV_MAX_DEG).toBe(65);
        expect(fitFov(1000, 1, 1)).toBe(65);
        expect(fitFov(0.001, 1000, 1)).toBe(8);
    });

    it("stays finite for degenerate inputs", () => {
        expect(fitFov(5, 0, 1)).toBe(65);
        expect(Number.isFinite(fitFov(5, 20, Number.NaN))).toBe(true);
        expect(Number.isFinite(fitFov(Number.NaN, 20, 1))).toBe(true);
        expect(Number.isFinite(fitDistance(5, 40, 0))).toBe(true);
        expect(Number.isFinite(fitDistance(5, 0, 1))).toBe(true);
    });
});

describe("lerpPose", () => {
    it("is linear on position, target and field of view", () => {
        const a: CameraPose = {
            position: [0, 10, 20],
            target: [0, 0, 0],
            fovDeg: 20,
        };
        const b: CameraPose = {
            position: [10, 20, -20],
            target: [4, 2, -8],
            fovDeg: 40,
        };
        expect(lerpPose(a, b, 0.5)).toEqual({
            position: [5, 15, 0],
            target: [2, 1, -4],
            fovDeg: 30,
        });
        expect(lerpPose(a, b, 0)).toEqual(a);
        expect(lerpPose(a, b, 1)).toEqual(b);
    });
});

describe("clampEye", () => {
    it("raises a camera that is below the minimum eye height", () => {
        const pose: CameraPose = {
            position: [1, -3, 2],
            target: [0, 0, 0],
            fovDeg: 30,
        };
        expect(clampEye(pose)).toEqual({ ...pose, position: [1, 0.5, 2] });
        expect(pose.position[1]).toBe(-3);
    });

    it("leaves a camera above it alone", () => {
        const pose: CameraPose = {
            position: [1, 3, 2],
            target: [0, 0, 0],
            fovDeg: 30,
        };
        expect(clampEye(pose)).toEqual(pose);
    });
});
