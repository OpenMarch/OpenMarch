import { describe, expect, it } from "vitest";
import { parseWipeEffectArgs } from "../effect.wipe";

describe("default wipe effect args", () => {
    it("falls back to defaults for invalid wipe args", () => {
        expect(parseWipeEffectArgs("not-json")).toEqual({
            color: "#000000",
            cycleDurationMs: 2000,
            cycleFrequencyMs: 1000,
        });
    });

    it("falls back to defaults for empty wipe args", () => {
        expect(parseWipeEffectArgs("{}")).toEqual({
            color: "#000000",
            cycleDurationMs: 2000,
            cycleFrequencyMs: 1000,
        });
    });

    it("round-trips valid wipe args", () => {
        expect(
            parseWipeEffectArgs(
                JSON.stringify({
                    color: "#ff0000",
                    cycleDurationMs: 3000,
                    cycleFrequencyMs: 500,
                }),
            ),
        ).toEqual({
            color: "#ff0000",
            cycleDurationMs: 3000,
            cycleFrequencyMs: 500,
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
        });
    });
});
