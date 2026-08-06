import { describe, expect, it } from "vitest";
import {
    defaultFlickerEffectArgs,
    isMarcherFlickerOn,
    MIN_FLICKER_INTERVAL_MS,
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
                    intervalMs: 200,
                    onProbability: 0.25,
                }),
            ),
        ).toEqual({
            color: "#00ff00",
            intervalMs: 200,
            onProbability: 0.25,
        });
    });

    it("clamps intervalMs to the minimum", () => {
        expect(
            parseFlickerEffectArgs(
                JSON.stringify({ intervalMs: 1, onProbability: 0.5 }),
            ).intervalMs,
        ).toBe(MIN_FLICKER_INTERVAL_MS);
    });

    it("clamps onProbability to [0, 1]", () => {
        expect(
            parseFlickerEffectArgs(JSON.stringify({ onProbability: 5 }))
                .onProbability,
        ).toBe(1);
        expect(
            parseFlickerEffectArgs(JSON.stringify({ onProbability: -5 }))
                .onProbability,
        ).toBe(0);
    });
});

describe("isMarcherFlickerOn", () => {
    it("is deterministic for the same marcher and tick", () => {
        const first = isMarcherFlickerOn(7, 42, 0.5);
        const second = isMarcherFlickerOn(7, 42, 0.5);
        expect(second).toBe(first);
    });

    it("is not synchronized across marchers at the same tick", () => {
        const results = Array.from({ length: 50 }, (_, marcherId) =>
            isMarcherFlickerOn(marcherId, 0, 0.5),
        );
        expect(results.some((r) => r)).toBe(true);
        expect(results.some((r) => !r)).toBe(true);
    });

    it("always returns false when onProbability is 0", () => {
        for (let tick = 0; tick < 20; tick++) {
            expect(isMarcherFlickerOn(1, tick, 0)).toBe(false);
        }
    });

    it("always returns true when onProbability is 1", () => {
        for (let tick = 0; tick < 20; tick++) {
            expect(isMarcherFlickerOn(1, tick, 1)).toBe(true);
        }
    });

    it("roughly matches the requested on-probability over many ticks", () => {
        const ticks = 2000;
        let onCount = 0;
        for (let tick = 0; tick < ticks; tick++) {
            if (isMarcherFlickerOn(3, tick, 0.5)) onCount++;
        }
        const fraction = onCount / ticks;
        expect(fraction).toBeGreaterThan(0.4);
        expect(fraction).toBeLessThan(0.6);
    });
});

describe("sampleFlickerEffectFill", () => {
    const args = { color: "#ff0000", intervalMs: 100, onProbability: 0.5 };
    const window = { startMs: 1000, durationMs: 5000 };

    it("returns undefined or the color depending on the marcher's flicker state", () => {
        const timestampMs = 1000;
        const tickIndex = 0;
        const expectedOn = isMarcherFlickerOn(9, tickIndex, args.onProbability);
        const result = sampleFlickerEffectFill({
            args,
            timestampMs,
            window,
            marcherId: 9,
            baseFill: { r: 0, g: 0, b: 0, a: 1 },
            layers: [],
        });

        if (expectedOn) {
            expect(result).toEqual({ r: 255, g: 0, b: 0, a: 1 });
        } else {
            expect(result).toBeUndefined();
        }
    });

    it("buckets ticks relative to window.startMs", () => {
        const withinFirstTick = sampleFlickerEffectFill({
            args,
            timestampMs: window.startMs + 50,
            window,
            marcherId: 4,
            baseFill: { r: 0, g: 0, b: 0, a: 1 },
            layers: [],
        });
        const stillFirstTick = sampleFlickerEffectFill({
            args,
            timestampMs: window.startMs + 99,
            window,
            marcherId: 4,
            baseFill: { r: 0, g: 0, b: 0, a: 1 },
            layers: [],
        });
        expect(withinFirstTick).toEqual(stillFirstTick);
    });
});
