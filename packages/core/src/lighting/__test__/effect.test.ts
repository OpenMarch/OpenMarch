import { describe, expect, it, vi } from "vitest";
import { createNewLightingEffect, updateLightingEffectType } from "../effect";
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

    it("carries the color over from solid to fade as the start color", () => {
        const updateFunction = vi.fn();

        updateLightingEffectType({
            updateFunction,
            newType: "fade",
            currentType: "solid",
            currentArgsJson: JSON.stringify({ color: "#ff00ff" }),
        });

        const [type, argsJson] = updateFunction.mock.calls[0] as [
            "fade",
            string,
        ];
        expect(type).toBe("fade");
        expect(JSON.parse(argsJson)).toEqual({
            startColor: "#ff00ff",
            endColor: "#ffffff",
        });
    });

    it("carries the fade start color over when switching away from fade", () => {
        const updateFunction = vi.fn();

        updateLightingEffectType({
            updateFunction,
            newType: "solid",
            currentType: "fade",
            currentArgsJson: JSON.stringify({
                startColor: "#00ff00",
                endColor: "#ff0000",
            }),
        });

        const [, argsJson] = updateFunction.mock.calls[0] as ["solid", string];
        expect(JSON.parse(argsJson)).toEqual({ color: "#00ff00" });
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
});
