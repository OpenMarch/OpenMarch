import { describe, expect, it } from "vitest";
import {
    normalizeWipeDirectionDegrees,
    parseWipeEffectArgs,
} from "../effect.wipe";

describe("default wipe effect args", () => {
    it("falls back to defaults for invalid wipe args", () => {
        expect(parseWipeEffectArgs("not-json")).toEqual({
            color: "#000000",
            cycleDurationMs: 2000,
            cycleFrequencyMs: 1000,
            directionDegrees: 0,
        });
    });

    it("falls back to defaults for empty wipe args", () => {
        expect(parseWipeEffectArgs("{}")).toEqual({
            color: "#000000",
            cycleDurationMs: 2000,
            cycleFrequencyMs: 1000,
            directionDegrees: 0,
        });
    });

    it("round-trips valid wipe args", () => {
        expect(
            parseWipeEffectArgs(
                JSON.stringify({
                    color: "#ff0000",
                    cycleDurationMs: 3000,
                    cycleFrequencyMs: 500,
                    directionDegrees: 90,
                }),
            ),
        ).toEqual({
            color: "#ff0000",
            cycleDurationMs: 3000,
            cycleFrequencyMs: 500,
            directionDegrees: 90,
        });
    });

    it("clamps cycle duration to the minimum", () => {
        expect(
            parseWipeEffectArgs(
                JSON.stringify({
                    color: "#ff0000",
                    cycleDurationMs: 0,
                    cycleFrequencyMs: 1000,
                }),
            ),
        ).toEqual({
            color: "#ff0000",
            cycleDurationMs: 1,
            cycleFrequencyMs: 1000,
            directionDegrees: 0,
        });
    });

    it("clamps cycle frequency to the minimum", () => {
        expect(
            parseWipeEffectArgs(
                JSON.stringify({
                    color: "#ff0000",
                    cycleDurationMs: 2000,
                    cycleFrequencyMs: 0,
                }),
            ),
        ).toEqual({
            color: "#ff0000",
            cycleDurationMs: 2000,
            cycleFrequencyMs: 1,
            directionDegrees: 0,
        });
    });

    it("normalizes directionDegrees that wrap past 360", () => {
        expect(
            parseWipeEffectArgs(
                JSON.stringify({
                    color: "#ff0000",
                    cycleDurationMs: 2000,
                    cycleFrequencyMs: 1000,
                    directionDegrees: 370,
                }),
            ),
        ).toEqual({
            color: "#ff0000",
            cycleDurationMs: 2000,
            cycleFrequencyMs: 1000,
            directionDegrees: 10,
        });
    });

    it("normalizes negative directionDegrees", () => {
        expect(
            parseWipeEffectArgs(
                JSON.stringify({
                    color: "#ff0000",
                    cycleDurationMs: 2000,
                    cycleFrequencyMs: 1000,
                    directionDegrees: -10,
                }),
            ),
        ).toEqual({
            color: "#ff0000",
            cycleDurationMs: 2000,
            cycleFrequencyMs: 1000,
            directionDegrees: 350,
        });
    });

    it("rounds fractional directionDegrees", () => {
        expect(
            parseWipeEffectArgs(
                JSON.stringify({
                    color: "#ff0000",
                    cycleDurationMs: 2000,
                    cycleFrequencyMs: 1000,
                    directionDegrees: 45.6,
                }),
            ),
        ).toEqual({
            color: "#ff0000",
            cycleDurationMs: 2000,
            cycleFrequencyMs: 1000,
            directionDegrees: 46,
        });
    });
});

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
