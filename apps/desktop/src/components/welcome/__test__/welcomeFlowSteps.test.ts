// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    canContinueFrom,
    getWelcomeSteps,
    isAnalyticsChoiceMade,
    isReturningUser,
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

describe("returning people", () => {
    const none = {
        optOutAnalytics: undefined,
        databasePath: undefined,
        recentFileCount: 0,
    };
    const desktop = { isWeb: false };

    it("counts anyone who answered the old analytics question", () => {
        expect(
            isReturningUser({ ...none, optOutAnalytics: false }, desktop),
        ).toBe(true);
        expect(
            isReturningUser({ ...none, optOutAnalytics: true }, desktop),
        ).toBe(true);
    });

    it("counts anyone who opened a show", () => {
        expect(isReturningUser({ ...none, recentFileCount: 1 }, desktop)).toBe(
            true,
        );
        expect(
            isReturningUser(
                { ...none, databasePath: "/shows/a.dots" },
                desktop,
            ),
        ).toBe(true);
    });

    it("doesn't count a fresh install or a closed, emptied path", () => {
        expect(isReturningUser(none, desktop)).toBe(false);
        expect(isReturningUser({ ...none, databasePath: "" }, desktop)).toBe(
            false,
        );
        expect(
            isReturningUser({ ...none, optOutAnalytics: null }, desktop),
        ).toBe(false);
    });

    it("never counts on the web, which answers analytics for everyone", () => {
        expect(
            isReturningUser(
                {
                    optOutAnalytics: true,
                    databasePath: "x",
                    recentFileCount: 3,
                },
                { isWeb: true },
            ),
        ).toBe(false);
    });

    it("adds What's new and drops the choices already made", () => {
        expect(
            getWelcomeSteps({
                analyticsChoiceMade: true,
                isWeb: false,
                returning: { languageSaved: true, themeSaved: true },
            }),
        ).toEqual(["welcome", "whatsNew", "mode"]);
        expect(
            getWelcomeSteps({
                analyticsChoiceMade: false,
                isWeb: false,
                returning: { languageSaved: false, themeSaved: true },
            }),
        ).toEqual(["welcome", "whatsNew", "language", "mode", "analytics"]);
    });
});
