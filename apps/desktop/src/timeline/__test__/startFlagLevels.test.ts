// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    clampStartFlagLevels,
    setStartFlagDots,
    setStartFlagPaths,
    startFlagLevelsDrawAnything,
} from "../startFlagLevels";

describe("start flag levels", () => {
    it("clamps paths to the dots level", () => {
        expect(clampStartFlagLevels({ dots: "off", paths: "all" })).toEqual({
            dots: "off",
            paths: "off",
        });
        expect(
            clampStartFlagLevels({ dots: "selected", paths: "all" }),
        ).toEqual({ dots: "selected", paths: "selected" });
        expect(
            clampStartFlagLevels({ dots: "all", paths: "selected" }),
        ).toEqual({ dots: "all", paths: "selected" });
    });

    it("raising paths above dots raises dots with it", () => {
        expect(
            setStartFlagPaths({ dots: "selected", paths: "off" }, "all"),
        ).toEqual({ dots: "all", paths: "all" });
        expect(
            setStartFlagPaths({ dots: "off", paths: "off" }, "selected"),
        ).toEqual({ dots: "selected", paths: "selected" });
        expect(setStartFlagPaths({ dots: "all", paths: "all" }, "off")).toEqual(
            { dots: "all", paths: "off" },
        );
    });

    it("lowering dots below paths lowers paths with it", () => {
        expect(setStartFlagDots({ dots: "all", paths: "all" }, "off")).toEqual({
            dots: "off",
            paths: "off",
        });
        expect(
            setStartFlagDots({ dots: "all", paths: "all" }, "selected"),
        ).toEqual({ dots: "selected", paths: "selected" });
        expect(
            setStartFlagDots({ dots: "selected", paths: "off" }, "all"),
        ).toEqual({ dots: "all", paths: "off" });
    });

    it("draws anything unless dots are off", () => {
        expect(startFlagLevelsDrawAnything({ dots: "off", paths: "off" })).toBe(
            false,
        );
        expect(
            startFlagLevelsDrawAnything({ dots: "selected", paths: "off" }),
        ).toBe(true);
        expect(startFlagLevelsDrawAnything({ dots: "all", paths: "all" })).toBe(
            true,
        );
        // A bad input that would draw a path without its dot still draws nothing once clamped
        expect(startFlagLevelsDrawAnything({ dots: "off", paths: "all" })).toBe(
            false,
        );
    });
});
