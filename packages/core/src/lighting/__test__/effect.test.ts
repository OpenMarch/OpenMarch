import { describe, expect, it, vi } from "vitest";
import { createNewLightingEffect } from "../effect";
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
            durationMs: 2000,
            color: "#000000",
        });
    });
});
