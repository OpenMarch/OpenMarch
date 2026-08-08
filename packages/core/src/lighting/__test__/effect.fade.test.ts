import { describe, expect, it } from "vitest";
import {
    defaultFadeEffectArgs,
    lerpLightingRgba,
    parseFadeEffectArgs,
    sampleFadeEffectFill,
} from "../effect.fade";

describe("parseFadeEffectArgs", () => {
    it("falls back to defaults for invalid JSON", () => {
        expect(parseFadeEffectArgs("not-json")).toEqual(defaultFadeEffectArgs);
    });

    it("falls back to defaults for empty args", () => {
        expect(parseFadeEffectArgs("{}")).toEqual(defaultFadeEffectArgs);
    });

    it("round-trips valid args", () => {
        expect(
            parseFadeEffectArgs(
                JSON.stringify({
                    startColor: "#ff0000",
                    endColor: "#0000ff",
                }),
            ),
        ).toEqual({
            startColor: "#ff0000",
            endColor: "#0000ff",
        });
    });

    it("fills in a missing color with the default", () => {
        expect(
            parseFadeEffectArgs(JSON.stringify({ startColor: "#123456" })),
        ).toEqual({
            startColor: "#123456",
            endColor: defaultFadeEffectArgs.endColor,
        });
    });
});

describe("lerpLightingRgba", () => {
    const start = { r: 0, g: 0, b: 0, a: 1 };
    const end = { r: 100, g: 200, b: 50, a: 1 };

    it("returns the start color at progress 0", () => {
        expect(lerpLightingRgba(start, end, 0)).toEqual(start);
    });

    it("returns the end color at progress 1", () => {
        expect(lerpLightingRgba(start, end, 1)).toEqual(end);
    });

    it("interpolates each channel at the midpoint", () => {
        expect(lerpLightingRgba(start, end, 0.5)).toEqual({
            r: 50,
            g: 100,
            b: 25,
            a: 1,
        });
    });

    it("clamps progress outside [0, 1]", () => {
        expect(lerpLightingRgba(start, end, -1)).toEqual(start);
        expect(lerpLightingRgba(start, end, 2)).toEqual(end);
    });
});

describe("sampleFadeEffectFill", () => {
    const args = { startColor: "#000000", endColor: "#ffffff" };
    const window = { startMs: 1000, durationMs: 4000 };

    it("returns the start color at window.startMs", () => {
        expect(
            sampleFadeEffectFill({
                args,
                timestampMs: window.startMs,
                window,
                marcherId: 1,
                baseFill: { r: 0, g: 0, b: 0, a: 1 },
                layers: [],
            }),
        ).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it("returns the end color once the window has fully elapsed", () => {
        expect(
            sampleFadeEffectFill({
                args,
                timestampMs: window.startMs + window.durationMs,
                window,
                marcherId: 1,
                baseFill: { r: 0, g: 0, b: 0, a: 1 },
                layers: [],
            }),
        ).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });

    it("returns an interpolated color partway through the window", () => {
        expect(
            sampleFadeEffectFill({
                args,
                timestampMs: window.startMs + window.durationMs / 2,
                window,
                marcherId: 1,
                baseFill: { r: 0, g: 0, b: 0, a: 1 },
                layers: [],
            }),
        ).toEqual({ r: 128, g: 128, b: 128, a: 1 });
    });

    it("clamps to the start color before the window begins", () => {
        expect(
            sampleFadeEffectFill({
                args,
                timestampMs: window.startMs - 500,
                window,
                marcherId: 1,
                baseFill: { r: 0, g: 0, b: 0, a: 1 },
                layers: [],
            }),
        ).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });
});
