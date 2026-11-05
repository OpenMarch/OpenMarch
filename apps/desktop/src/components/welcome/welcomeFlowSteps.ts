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
 * analytics. Everyone sees What's new after the language and theme steps (or
 * the welcome page when neither is asked). A returning person (`returning`
 * set, see `isReturningUser`) isn't asked again for a language or theme they
 * already chose; the mode step is new to everyone.
 *
 * With a mode already stored (`modeChosen`), the flow opened only because the
 * analytics question is unanswered: it asks just that, with no welcome page.
 */
export function getWelcomeSteps({
    analyticsChoiceMade,
    isWeb,
    returning = null,
    modeChosen = false,
}: {
    analyticsChoiceMade: boolean;
    isWeb: boolean;
    returning?: ReturningUserChoices | null;
    modeChosen?: boolean;
}): readonly WelcomeStepId[] {
    if (modeChosen) return analyticsChoiceMade || isWeb ? [] : ["analytics"];
    const steps: WelcomeStepId[] = ["welcome"];
    if (!returning?.languageSaved) steps.push("language");
    if (!returning?.themeSaved) steps.push("theme");
    steps.push("whatsNew");
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

/**
 * Where the analytics question stands: still being read, answered, or not.
 * Codegen and automated sessions count as answered (they never get asked),
 * and so does the web build, which has no analytics.
 */
export type AnalyticsQuestion = "loading" | "answered" | "unanswered";

/**
 * Whether the flow should open: once the stored mode is read, when there is
 * no mode, or when the analytics question is unanswered (the flow is the only
 * place it's asked; Settings › Privacy changes the answer later).
 */
export function shouldShowWelcomeFlow(state: {
    loaded: boolean;
    mode: EditorMode | null;
    analytics?: AnalyticsQuestion;
}): boolean {
    if (!state.loaded) return false;
    return state.mode === null || state.analytics === "unanswered";
}

/** The steps the progress bar counts: every step after the welcome page, What's new included. */
export function setupSteps(
    steps: readonly WelcomeStepId[],
): readonly WelcomeStepId[] {
    return steps.filter((step) => step !== "welcome");
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
