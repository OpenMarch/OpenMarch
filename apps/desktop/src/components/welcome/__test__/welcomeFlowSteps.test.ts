// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    canContinueFrom,
    getWelcomeSteps,
    isAnalyticsChoiceMade,
    shouldShowWelcomeFlow,
} from "../welcomeFlowSteps";

describe("welcome flow steps", () => {
    it("asks language, theme and mode, then analytics when unanswered", () => {
        expect(
            getWelcomeSteps({ analyticsChoiceMade: false, isWeb: false }),
        ).toEqual(["welcome", "language", "theme", "mode", "analytics"]);
    });

    it("skips the analytics step when it has been answered", () => {
        expect(
            getWelcomeSteps({ analyticsChoiceMade: true, isWeb: false }),
        ).toEqual(["welcome", "language", "theme", "mode"]);
    });

    it("never asks about analytics on the web", () => {
        expect(
            getWelcomeSteps({ analyticsChoiceMade: false, isWeb: true }),
        ).toEqual(["welcome", "language", "theme", "mode"]);
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
        expect(canContinueFrom("language", null)).toBe(true);
        expect(canContinueFrom("theme", null)).toBe(true);
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
