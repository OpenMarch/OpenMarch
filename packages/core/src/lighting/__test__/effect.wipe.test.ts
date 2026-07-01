import { describe, expect, it } from "vitest";
import {
    getWipeRevealPolygonLocal,
    normalizeWipeDirectionDegrees,
    parseWipeEffectArgs,
    type WipeRevealPoint,
} from "../effect.wipe";

function expectPolygonClose(
    actual: WipeRevealPoint[],
    expected: WipeRevealPoint[],
) {
    expect(actual).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
        expect(actual[i]!.x).toBeCloseTo(expected[i]!.x, 4);
        expect(actual[i]!.y).toBeCloseTo(expected[i]!.y, 4);
    }
}

describe("default wipe effect args", () => {
    it("falls back to defaults for invalid wipe args", () => {
        expect(parseWipeEffectArgs("not-json")).toEqual({
            color: "#000000",
            directionDegrees: 0,
        });
    });

    it("falls back to defaults for empty wipe args", () => {
        expect(parseWipeEffectArgs("{}")).toEqual({
            color: "#000000",
            directionDegrees: 0,
        });
    });

    it("round-trips valid wipe args", () => {
        expect(
            parseWipeEffectArgs(
                JSON.stringify({
                    color: "#ff0000",
                    directionDegrees: 90,
                }),
            ),
        ).toEqual({
            color: "#ff0000",
            directionDegrees: 90,
        });
    });

    it("normalizes directionDegrees that wrap past 360", () => {
        expect(
            parseWipeEffectArgs(
                JSON.stringify({
                    color: "#ff0000",
                    directionDegrees: 370,
                }),
            ),
        ).toEqual({
            color: "#ff0000",
            directionDegrees: 10,
        });
    });

    it("normalizes negative directionDegrees", () => {
        expect(
            parseWipeEffectArgs(
                JSON.stringify({
                    color: "#ff0000",
                    directionDegrees: -10,
                }),
            ),
        ).toEqual({
            color: "#ff0000",
            directionDegrees: 350,
        });
    });

    it("rounds fractional directionDegrees", () => {
        expect(
            parseWipeEffectArgs(
                JSON.stringify({
                    color: "#ff0000",
                    directionDegrees: 45.6,
                }),
            ),
        ).toEqual({
            color: "#ff0000",
            directionDegrees: 46,
        });
    });
});

describe("getWipeRevealPolygonLocal", () => {
    it("returns empty polygon at zero progress", () => {
        expect(getWipeRevealPolygonLocal(100, 100, 0, 0)).toEqual([]);
    });

    it("returns full rect at 100% progress", () => {
        expectPolygonClose(getWipeRevealPolygonLocal(100, 100, 1, 0), [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
        ]);
    });

    it("reveals left half at 50% for 0° (left to right)", () => {
        expectPolygonClose(getWipeRevealPolygonLocal(100, 100, 0.5, 0), [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 100 },
            { x: 0, y: 100 },
        ]);
    });

    it("reveals bottom half at 50% for 90° (bottom to top)", () => {
        expectPolygonClose(getWipeRevealPolygonLocal(100, 100, 0.5, 90), [
            { x: 0, y: 50 },
            { x: 100, y: 50 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
        ]);
    });

    it("reveals right half at 50% for 180° (right to left)", () => {
        expectPolygonClose(getWipeRevealPolygonLocal(100, 100, 0.5, 180), [
            { x: 50, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 50, y: 100 },
        ]);
    });

    it("reveals a triangular portion at 50% for 45°", () => {
        const polygon = getWipeRevealPolygonLocal(100, 100, 0.5, 45);
        expect(polygon.length).toBeGreaterThanOrEqual(3);
        for (const point of polygon) {
            expect(point.x).toBeGreaterThanOrEqual(-WIPE_REVEAL_EPSILON);
            expect(point.y).toBeGreaterThanOrEqual(-WIPE_REVEAL_EPSILON);
            expect(point.x).toBeLessThanOrEqual(100 + WIPE_REVEAL_EPSILON);
            expect(point.y).toBeLessThanOrEqual(100 + WIPE_REVEAL_EPSILON);
        }
    });
});

const WIPE_REVEAL_EPSILON = 1e-6;

describe("normalizeWipeDirectionDegrees", () => {
    it("wraps values at 360", () => {
        expect(normalizeWipeDirectionDegrees(370)).toBe(10);
    });

    it("wraps negative values", () => {
        expect(normalizeWipeDirectionDegrees(-10)).toBe(350);
    });

    it("rounds before wrapping", () => {
        expect(normalizeWipeDirectionDegrees(359.6)).toBe(0);
    });
});
