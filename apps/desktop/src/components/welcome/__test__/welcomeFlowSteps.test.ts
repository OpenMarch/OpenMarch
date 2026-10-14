import { describe, expect, it } from "vitest";
import {
    canContinueFrom,
    getWelcomeSteps,
    isAnalyticsChoiceMade,
    shouldShowWelcomeFlow,
} from "../welcomeFlowSteps";

describe("welcome flow steps", () => {
    it("asks about analytics last when it hasn't been answered", () => {
        expect(getWelcomeSteps(false)).toEqual([
            "welcome",
            "mode",
            "analytics",
        ]);
    });

    it("skips the analytics step when it has been answered", () => {
        expect(getWelcomeSteps(true)).toEqual(["welcome", "mode"]);
    });

    it("treats either stored analytics answer as made, and unset as not", () => {
        expect(isAnalyticsChoiceMade(true)).toBe(true);
        expect(isAnalyticsChoiceMade(false)).toBe(true);
        expect(isAnalyticsChoiceMade(undefined)).toBe(false);
        expect(isAnalyticsChoiceMade(null)).toBe(false);
    });

    it("disables Continue on the mode step until a mode is chosen", () => {
        expect(canContinueFrom("mode", null)).toBe(false);
        expect(canContinueFrom("mode", "basic")).toBe(true);
        expect(canContinueFrom("mode", "expert")).toBe(true);
        expect(canContinueFrom("welcome", null)).toBe(true);
    });

    it("opens only once the mode is loaded and unset", () => {
        expect(shouldShowWelcomeFlow({ loaded: false, mode: null })).toBe(
            false,
        );
        expect(shouldShowWelcomeFlow({ loaded: true, mode: null })).toBe(true);
        expect(shouldShowWelcomeFlow({ loaded: true, mode: "expert" })).toBe(
            false,
        );
    });
});
