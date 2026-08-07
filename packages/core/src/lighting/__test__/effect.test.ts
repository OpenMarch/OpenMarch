import { describe, expect, it, vi } from "vitest";
import { createNewLightingEffect, updateLightingEffectType } from "../effect";
import { parseFadeEffectArgs } from "../effect.fade";
import { parseSolidEffectArgs } from "../effect.solid";

describe("createNewLightingEffect", () => {
    it("creates a solid effect with black default color", () => {
        const createFunction = vi.fn();

        createNewLightingEffect(createFunction);

        expect(createFunction).toHaveBeenCalledTimes(1);
        const [name, type, argsJson] = createFunction.mock.calls[0] as [
            null,
            "solid",
            string,
        ];
        expect(name).toBeNull();
        expect(type).toBe("solid");
        expect(JSON.parse(argsJson)).toMatchObject({
            color: "#000000",
        });
    });
});

describe("updateLightingEffectType", () => {
    it("carries the color over from solid to wipe, defaulting other fields", () => {
        const updateFunction = vi.fn();

        updateLightingEffectType({
            updateFunction,
            newType: "wipe",
            currentType: "solid",
            currentArgsJson: JSON.stringify({ color: "#ff00ff" }),
        });

        expect(updateFunction).toHaveBeenCalledTimes(1);
        const [type, argsJson] = updateFunction.mock.calls[0] as [
            "wipe",
            string,
        ];
        expect(type).toBe("wipe");
        expect(JSON.parse(argsJson)).toEqual({
            color: "#ff00ff",
            directionDegrees: 0,
        });
    });

    it("puts the previous color into colors[0] when switching to fade, keeping colors[1] default", () => {
        const updateFunction = vi.fn();

        updateLightingEffectType({
            updateFunction,
            newType: "fade",
            currentType: "solid",
            currentArgsJson: JSON.stringify({ color: "#ff00ff" }),
        });

        const [, argsJson] = updateFunction.mock.calls[0] as ["fade", string];
        expect(JSON.parse(argsJson)).toEqual({
            changeDurationMs: 2000,
            colors: ["#ff00ff", "#ff0000"],
        });
    });

    it("uses colors[0] as the new color when switching away from fade", () => {
        const updateFunction = vi.fn();

        updateLightingEffectType({
            updateFunction,
            newType: "solid",
            currentType: "fade",
            currentArgsJson: JSON.stringify({
                changeDurationMs: 2000,
                colors: ["#123456", "#abcdef"],
            }),
        });

        const [, argsJson] = updateFunction.mock.calls[0] as ["solid", string];
        expect(JSON.parse(argsJson)).toEqual({ color: "#123456" });
    });

    it("carries the color over to flicker, defaulting timing fields", () => {
        const updateFunction = vi.fn();

        updateLightingEffectType({
            updateFunction,
            newType: "flicker",
            currentType: "wipe",
            currentArgsJson: JSON.stringify({
                color: "#00ff00",
                directionDegrees: 90,
            }),
        });

        const [, argsJson] = updateFunction.mock.calls[0] as [
            "flicker",
            string,
        ];
        expect(JSON.parse(argsJson)).toEqual({
            color: "#00ff00",
            onMinMs: 50,
            onMaxMs: 200,
            offMinMs: 50,
            offMaxMs: 200,
        });
    });

    // cspell:disable-next-line
    it("falls back to plain defaults when the previous args are unparseable", () => {
        const updateFunction = vi.fn();

        updateLightingEffectType({
            updateFunction,
            newType: "wipe",
            currentType: "solid",
            currentArgsJson: "not-json",
        });

        const [, argsJson] = updateFunction.mock.calls[0] as ["wipe", string];
        expect(JSON.parse(argsJson)).toEqual({
            color: "#000000",
            directionDegrees: 0,
        });
    });
});

describe("default lighting effect args", () => {
    it("falls back to black defaults for invalid solid args", () => {
        expect(parseSolidEffectArgs("not-json")).toEqual({
            color: "#000000",
        });
    });

    it("strips legacy durationMs from solid args", () => {
        expect(
            parseSolidEffectArgs(
                JSON.stringify({ durationMs: 2000, color: "#ff0000" }),
            ),
        ).toEqual({
            color: "#ff0000",
        });
    });

    it("falls back to black defaults for invalid fade args", () => {
        expect(parseFadeEffectArgs("not-json")).toEqual({
            changeDurationMs: 2000,
            colors: ["#000000", "#ff0000"],
        });
    });

    it("falls back to black defaults for empty fade args", () => {
        expect(parseFadeEffectArgs("{}")).toEqual({
            changeDurationMs: 2000,
            colors: ["#000000", "#ff0000"],
        });
    });

    it("maps legacy durationMs to changeDurationMs and preserves color", () => {
        expect(
            parseFadeEffectArgs(
                JSON.stringify({ durationMs: 2000, color: "#ff0000" }),
            ),
        ).toEqual({
            changeDurationMs: 2000,
            colors: ["#ff0000", "#ff0000"],
        });
    });

    it("normalizes a single color to a two-element colors array", () => {
        expect(
            parseFadeEffectArgs(
                JSON.stringify({ changeDurationMs: 1500, color: "#aabbcc" }),
            ),
        ).toEqual({
            changeDurationMs: 1500,
            colors: ["#aabbcc", "#aabbcc"],
        });
    });

    it("pads a one-element colors array to two colors", () => {
        expect(
            parseFadeEffectArgs(
                JSON.stringify({
                    changeDurationMs: 1500,
                    colors: ["#aabbcc"],
                }),
            ),
        ).toEqual({
            changeDurationMs: 1500,
            colors: ["#aabbcc", "#aabbcc"],
        });
    });

    it("round-trips a colors array with multiple entries", () => {
        expect(
            parseFadeEffectArgs(
                JSON.stringify({
                    changeDurationMs: 1000,
                    colors: ["#ff0000", "#00ff00", "#0000ff"],
                }),
            ),
        ).toEqual({
            changeDurationMs: 1000,
            colors: ["#ff0000", "#00ff00", "#0000ff"],
        });
    });

    it("clamps change duration to the minimum", () => {
        expect(
            parseFadeEffectArgs(
                JSON.stringify({
                    changeDurationMs: 0,
                    colors: ["#ff0000", "#00ff00"],
                }),
            ),
        ).toEqual({
            changeDurationMs: 1,
            colors: ["#ff0000", "#00ff00"],
        });
    });

    it("prefers colors over color when both are present", () => {
        expect(
            parseFadeEffectArgs(
                JSON.stringify({
                    color: "#111111",
                    colors: ["#222222", "#333333"],
                }),
            ),
        ).toEqual({
            changeDurationMs: 2000,
            colors: ["#222222", "#333333"],
        });
    });
});
