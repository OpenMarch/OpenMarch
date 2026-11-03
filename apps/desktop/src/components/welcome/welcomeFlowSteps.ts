import type { EditorMode } from "@/stores/EditorModeStore";

/** The welcome flow's steps (UI-19), in order. */
export type WelcomeStepId =
    | "welcome"
    | "whatsNew"
    | "language"
    | "theme"
    | "mode"
    | "analytics";

/**
 * What a returning person already chose, read once when the flow opens (the
 * flow saves language and theme as they're picked, so later reads would
 * drop steps mid-flow).
 */
export interface ReturningUserChoices {
    /** A language is stored (picked in Settings or an earlier setup). */
    languageSaved: boolean;
    /** A theme is stored (toggled in Settings or an earlier setup). */
    themeSaved: boolean;
}

/**
 * The steps to show. The analytics question is asked only when it hasn't been
 * answered (`optOutAnalytics` unset) and never in the web build, which has no
 * analytics. A returning person (`returning` set, see `isReturningUser`) gets
 * What's new after the welcome page and isn't asked again for a language or
 * theme they already chose; the mode step is new to everyone.
 */
export function getWelcomeSteps({
    analyticsChoiceMade,
    isWeb,
    returning = null,
}: {
    analyticsChoiceMade: boolean;
    isWeb: boolean;
    returning?: ReturningUserChoices | null;
}): readonly WelcomeStepId[] {
    const steps: WelcomeStepId[] = ["welcome"];
    if (returning) steps.push("whatsNew");
    if (!returning?.languageSaved) steps.push("language");
    if (!returning?.themeSaved) steps.push("theme");
    steps.push("mode");
    if (!analyticsChoiceMade && !isWeb) steps.push("analytics");
    return steps;
}

/** Whether Continue is enabled on a step: the mode step needs a choice. */
export function canContinueFrom(
    step: WelcomeStepId,
    chosenMode: EditorMode | null,
): boolean {
    if (step === "mode") return chosenMode !== null;
    return true;
}

/** Whether the flow should open: the stored mode was read and there is none. */
export function shouldShowWelcomeFlow(state: {
    loaded: boolean;
    mode: EditorMode | null;
}): boolean {
    return state.loaded && state.mode === null;
}

/** Whether the stored `optOutAnalytics` value means the person has answered. */
export function isAnalyticsChoiceMade(optOutAnalytics: unknown): boolean {
    return optOutAnalytics !== undefined && optOutAnalytics !== null;
}

/**
 * What an earlier OpenMarch (v0.1.7 and before) leaves in its settings that
 * this version's setup doesn't write before it finishes.
 */
export interface EarlierUseSignals {
    /** The `optOutAnalytics` setting: answered on the old first launch. */
    optOutAnalytics: unknown;
    /** The `databasePath` setting: the last show opened (emptied on close). */
    databasePath: unknown;
    /** How many shows the recent files list holds. */
    recentFileCount: number;
}

/**
 * Whether the person used OpenMarch before this version, so the flow says
 * "Welcome back" and shows what's new. Any one sign counts: the old app asked
 * about analytics on first launch, and opening a show fills the recent files
 * list and `databasePath`. The stored language and theme aren't signs: this
 * flow saves them as they're picked, so someone who quit halfway through
 * their first setup would come back as "returning". Never on the web, which
 * had no released version (and answers `optOutAnalytics` for everyone).
 */
export function isReturningUser(
    signals: EarlierUseSignals,
    { isWeb }: { isWeb: boolean },
): boolean {
    if (isWeb) return false;
    return (
        isAnalyticsChoiceMade(signals.optOutAnalytics) ||
        signals.recentFileCount > 0 ||
        (typeof signals.databasePath === "string" &&
            signals.databasePath !== "")
    );
}
