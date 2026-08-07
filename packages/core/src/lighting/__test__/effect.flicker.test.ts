import { describe, expect, it } from "vitest";
import {
    defaultFlickerEffectArgs,
    isMarcherFlickerOn,
    MIN_FLICKER_ON_OFF_MS,
    parseFlickerEffectArgs,
    sampleFlickerEffectFill,
} from "../effect.flicker";

describe("parseFlickerEffectArgs", () => {
    it("falls back to defaults for invalid JSON", () => {
        expect(parseFlickerEffectArgs("not-json")).toEqual(
            defaultFlickerEffectArgs,
        );
    });

    it("falls back to defaults for empty args", () => {
        expect(parseFlickerEffectArgs("{}")).toEqual(defaultFlickerEffectArgs);
    });

    it("round-trips valid args", () => {
        expect(
            parseFlickerEffectArgs(
                JSON.stringify({
                    color: "#00ff00",
                    onMinMs: 100,
                    onMaxMs: 300,
                    offMinMs: 150,
                    offMaxMs: 400,
                }),
            ),
        ).toEqual({
            color: "#00ff00",
            onMinMs: 100,
            onMaxMs: 300,
            offMinMs: 150,
            offMaxMs: 400,
        });
    });

    it("clamps each dwell field to the minimum", () => {
        const result = parseFlickerEffectArgs(
            JSON.stringify({
                onMinMs: 1,
                onMaxMs: 1,
                offMinMs: 1,
                offMaxMs: 1,
            }),
        );
        expect(result.onMinMs).toBe(MIN_FLICKER_ON_OFF_MS);
        expect(result.onMaxMs).toBe(MIN_FLICKER_ON_OFF_MS);
        expect(result.offMinMs).toBe(MIN_FLICKER_ON_OFF_MS);
        expect(result.offMaxMs).toBe(MIN_FLICKER_ON_OFF_MS);
    });

    it("swaps an inverted min/max pair", () => {
        const result = parseFlickerEffectArgs(
            JSON.stringify({
                onMinMs: 500,
                onMaxMs: 100,
                offMinMs: 600,
                offMaxMs: 200,
            }),
        );
        expect(result.onMinMs).toBe(100);
        expect(result.onMaxMs).toBe(500);
        expect(result.offMinMs).toBe(200);
        expect(result.offMaxMs).toBe(600);
    });
});

describe("isMarcherFlickerOn", () => {
    const window = { startMs: 1000, durationMs: 5000 };
    const args = {
        color: "#ffffff",
        onMinMs: 50,
        onMaxMs: 150,
        offMinMs: 50,
        offMaxMs: 150,
    };

    it("is off before the window starts", () => {
        expect(isMarcherFlickerOn(1, window, window.startMs - 1, args)).toBe(
            false,
        );
    });

    it("starts off at window.startMs", () => {
        expect(isMarcherFlickerOn(1, window, window.startMs, args)).toBe(false);
    });

    it("is stable across repeated calls at the same timestamp", () => {
        const first = isMarcherFlickerOn(
            5,
            window,
            window.startMs + 3000,
            args,
        );
        const second = isMarcherFlickerOn(
            5,
            window,
            window.startMs + 3000,
            args,
        );
        expect(second).toBe(first);
    });

    it("is not synchronized across marchers", () => {
        const timestampMs = window.startMs + 4000;
        const results = Array.from({ length: 50 }, (_, marcherId) =>
            isMarcherFlickerOn(marcherId, window, timestampMs, args),
        );
        expect(results.some((r) => r)).toBe(true);
        expect(results.some((r) => !r)).toBe(true);
    });

    it("only toggles at intervals within the configured on/off ranges", () => {
        const marcherId = 42;
        let state = false; // starts off
        let lastToggleMs = window.startMs;
        const stepMs = 5;
        for (
            let t = window.startMs;
            t <= window.startMs + window.durationMs;
            t += stepMs
        ) {
            const on = isMarcherFlickerOn(marcherId, window, t, args);
            if (on !== state) {
                const dwellMs = t - lastToggleMs;
                const [minMs, maxMs] = state
                    ? [args.onMinMs, args.onMaxMs]
                    : [args.offMinMs, args.offMaxMs];
                // Allow slack for the step size used while scanning for the toggle.
                expect(dwellMs).toBeGreaterThanOrEqual(minMs - stepMs);
                expect(dwellMs).toBeLessThanOrEqual(maxMs + stepMs);
                state = on;
                lastToggleMs = t;
            }
        }
    });
});

describe("sampleFlickerEffectFill", () => {
    const args = {
        color: "#ff0000",
        onMinMs: 50,
        onMaxMs: 150,
        offMinMs: 50,
        offMaxMs: 150,
    };
    const window = { startMs: 1000, durationMs: 5000 };

    it("returns undefined when off and the color when on", () => {
        const timestampMs = window.startMs + 2500;
        const marcherId = 9;
        const expectedOn = isMarcherFlickerOn(
            marcherId,
            window,
            timestampMs,
            args,
        );
        const result = sampleFlickerEffectFill({
            args,
            timestampMs,
            window,
            marcherId,
            baseFill: { r: 0, g: 0, b: 0, a: 1 },
            layers: [],
        });

        if (expectedOn) {
            expect(result).toEqual({ r: 255, g: 0, b: 0, a: 1 });
        } else {
            expect(result).toBeUndefined();
        }
    });

    it("is off (undefined) at window.startMs", () => {
        const result = sampleFlickerEffectFill({
            args,
            timestampMs: window.startMs,
            window,
            marcherId: 4,
            baseFill: { r: 0, g: 0, b: 0, a: 1 },
            layers: [],
        });
        expect(result).toBeUndefined();
    });
});
