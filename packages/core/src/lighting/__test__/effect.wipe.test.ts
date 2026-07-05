import { describe, expect, it } from "vitest";
import type {
    LightingEffectLayerRect,
    LightingMarcherPosition,
} from "../effectLayers";
import {
    getWipeActiveMarcherIds,
    getWipeActiveMarcherIdsAtTime,
    getWipeRevealPolygonLocal,
    isPointInWipeRevealLocal,
    isPositionInWipeReveal,
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

function buildSixteenMarcherGrid(): {
    layer: LightingEffectLayerRect;
    marcherPositions: LightingMarcherPosition[];
} {
    const layer: LightingEffectLayerRect = {
        left: 0,
        top: 0,
        width: 800,
        height: 200,
    };
    const marcherPositions: LightingMarcherPosition[] = [];
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 8; col++) {
            marcherPositions.push({
                marcherId: row * 8 + col + 1,
                x: col * 100 + 50,
                y: row * 100 + 50,
            });
        }
    }
    return { layer, marcherPositions };
}

describe("wipe marcher activation", () => {
    it("activates left-half marchers at 50% for 0° wipe", () => {
        const { layer, marcherPositions } = buildSixteenMarcherGrid();
        const active = getWipeActiveMarcherIds(
            [layer],
            0.5,
            0,
            marcherPositions,
        );

        expect([...active].sort((a, b) => a - b)).toEqual([
            1, 2, 3, 4, 9, 10, 11, 12,
        ]);
    });

    it("activates all marchers at 100% progress", () => {
        const { layer, marcherPositions } = buildSixteenMarcherGrid();
        const active = getWipeActiveMarcherIds([layer], 1, 0, marcherPositions);
        expect(active.size).toBe(16);
    });

    it("activates no marchers at 0% progress", () => {
        const { layer, marcherPositions } = buildSixteenMarcherGrid();
        const active = getWipeActiveMarcherIds([layer], 0, 0, marcherPositions);
        expect(active.size).toBe(0);
    });

    it("returns all marchers when no layers are defined", () => {
        const { marcherPositions } = buildSixteenMarcherGrid();
        const active = getWipeActiveMarcherIds([], 0.5, 0, marcherPositions);
        expect(active.size).toBe(16);
    });

    it("ignores marchers outside every layer", () => {
        const layer: LightingEffectLayerRect = {
            left: 0,
            top: 0,
            width: 100,
            height: 100,
        };
        const active = getWipeActiveMarcherIds([layer], 1, 0, [
            { marcherId: 1, x: 500, y: 500 },
        ]);
        expect(active.size).toBe(0);
    });

    it("checks point-in-polygon for layer-local coordinates", () => {
        expect(isPointInWipeRevealLocal(100, 100, 0.5, 0, 25, 50)).toBe(true);
        expect(isPointInWipeRevealLocal(100, 100, 0.5, 0, 75, 50)).toBe(false);
    });

    it("checks canvas-space positions against layers", () => {
        const layers: LightingEffectLayerRect[] = [
            { left: 10, top: 20, width: 100, height: 100 },
        ];
        expect(isPositionInWipeReveal(layers, 1, 0, { x: 60, y: 70 })).toBe(
            true,
        );
        expect(isPositionInWipeReveal(layers, 0.5, 0, { x: 55, y: 70 })).toBe(
            true,
        );
        expect(isPositionInWipeReveal(layers, 0.5, 0, { x: 90, y: 70 })).toBe(
            false,
        );
    });

    it("resolves active marchers from timestamp and effect window", () => {
        const { layer, marcherPositions } = buildSixteenMarcherGrid();
        const active = getWipeActiveMarcherIdsAtTime({
            layers: [layer],
            directionDegrees: 0,
            effectWindowMs: { startMs: 1000, durationMs: 1000 },
            timestampMs: 1500,
            marcherPositions,
        });

        expect([...active].sort((a, b) => a - b)).toEqual([
            1, 2, 3, 4, 9, 10, 11, 12,
        ]);
    });
});
