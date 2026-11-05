// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
    canContinueFrom,
    getWelcomeSteps,
    isAnalyticsChoiceMade,
    isReturningUser,
    setupSteps,
    shouldShowWelcomeFlow,
} from "../welcomeFlowSteps";
import {
    ALL_WHATS_NEW_SLIDES,
    WHATS_NEW_SLIDES,
    visibleWhatsNewSlides,
    whatsNewKeyAction,
} from "../whatsNewSlides";

describe("welcome flow steps", () => {
    it("asks language, shows What's new, asks theme and mode, then analytics when unanswered", () => {
        expect(
            getWelcomeSteps({ analyticsChoiceMade: false, isWeb: false }),
        ).toEqual([
            "welcome",
            "language",
            "whatsNew",
            "theme",
            "mode",
            "analytics",
        ]);
    });

    it("skips the analytics step when it has been answered", () => {
        expect(
            getWelcomeSteps({ analyticsChoiceMade: true, isWeb: false }),
        ).toEqual(["welcome", "language", "whatsNew", "theme", "mode"]);
    });

    it("never asks about analytics on the web", () => {
        expect(
            getWelcomeSteps({ analyticsChoiceMade: false, isWeb: true }),
        ).toEqual(["welcome", "language", "whatsNew", "theme", "mode"]);
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

    it("drops the choices a returning person already made, What's new staying after the language step", () => {
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
        ).toEqual(["welcome", "language", "whatsNew", "mode", "analytics"]);
        expect(
            getWelcomeSteps({
                analyticsChoiceMade: true,
                isWeb: false,
                returning: { languageSaved: true, themeSaved: false },
            }),
        ).toEqual(["welcome", "whatsNew", "theme", "mode"]);
    });
});

describe("the analytics question", () => {
    it("opens the flow for an unanswered question even with a mode stored", () => {
        expect(
            shouldShowWelcomeFlow({
                loaded: true,
                mode: "basic",
                analytics: "unanswered",
            }),
        ).toBe(true);
        expect(
            shouldShowWelcomeFlow({
                loaded: true,
                mode: "basic",
                analytics: "answered",
            }),
        ).toBe(false);
        // Still being read: no flash of the flow over a stored mode.
        expect(
            shouldShowWelcomeFlow({
                loaded: true,
                mode: "basic",
                analytics: "loading",
            }),
        ).toBe(false);
        expect(
            shouldShowWelcomeFlow({
                loaded: false,
                mode: null,
                analytics: "unanswered",
            }),
        ).toBe(false);
    });

    it("asks only about analytics when a mode is stored", () => {
        expect(
            getWelcomeSteps({
                analyticsChoiceMade: false,
                isWeb: false,
                modeChosen: true,
                returning: { languageSaved: false, themeSaved: false },
            }),
        ).toEqual(["analytics"]);
        expect(
            getWelcomeSteps({
                analyticsChoiceMade: true,
                isWeb: false,
                modeChosen: true,
            }),
        ).toEqual([]);
        expect(
            getWelcomeSteps({
                analyticsChoiceMade: false,
                isWeb: true,
                modeChosen: true,
            }),
        ).toEqual([]);
    });

    it("counts every step after the welcome page in the progress bar", () => {
        expect(
            setupSteps(["welcome", "whatsNew", "theme", "mode", "analytics"]),
        ).toEqual(["whatsNew", "theme", "mode", "analytics"]);
    });
});

describe("What's new keys", () => {
    it("maps the arrows to next and back and Escape to skip", () => {
        expect(whatsNewKeyAction("ArrowRight")).toBe("next");
        expect(whatsNewKeyAction("ArrowLeft")).toBe("back");
        expect(whatsNewKeyAction("Escape")).toBe("skip");
        expect(whatsNewKeyAction("Enter")).toBeNull();
        expect(whatsNewKeyAction(" ")).toBeNull();
    });
});

describe("What's new slides", () => {
    const none = { tempoMode: false, pathways: false };
    const ids = (slides: readonly { id: string }[]) => slides.map((s) => s.id);

    it("shows the shipped features, in order, and hides Tempo and Pathways until they land", () => {
        expect(ids(WHATS_NEW_SLIDES)).toEqual([
            "timeline",
            "shapes",
            "view3d",
            "props",
        ]);
        expect(
            ids(
                visibleWhatsNewSlides(ALL_WHATS_NEW_SLIDES, {
                    shipped: none,
                    preview: false,
                }),
            ),
        ).toEqual(["timeline", "shapes", "view3d", "props"]);
    });

    it("shows a slide once its feature is switched on", () => {
        expect(
            ids(
                visibleWhatsNewSlides(ALL_WHATS_NEW_SLIDES, {
                    shipped: { tempoMode: true, pathways: false },
                    preview: false,
                }),
            ),
        ).toEqual(["timeline", "shapes", "view3d", "props", "tempo"]);
    });

    it("shows every slide when previewing", () => {
        expect(
            ids(
                visibleWhatsNewSlides(ALL_WHATS_NEW_SLIDES, {
                    shipped: none,
                    preview: true,
                }),
            ),
        ).toEqual([
            "timeline",
            "shapes",
            "view3d",
            "props",
            "tempo",
            "pathways",
        ]);
    });

    it("gives every shipped slide a clip and every slide a poster", () => {
        for (const slide of ALL_WHATS_NEW_SLIDES) {
            expect(slide.poster).toBeTruthy();
            if (!slide.requires) expect(slide.video).toBeTruthy();
        }
    });
});
