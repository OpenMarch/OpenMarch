import type { EditorMode } from "@/stores/EditorModeStore";

/** The welcome flow's steps (UI-19), in order. */
export type WelcomeStepId = "welcome" | "mode" | "analytics";

/**
 * The steps to show. The analytics question is skipped when the person has
 * already answered it (`optOutAnalytics` is set).
 */
export function getWelcomeSteps(
    analyticsChoiceMade: boolean,
): readonly WelcomeStepId[] {
    return analyticsChoiceMade
        ? ["welcome", "mode"]
        : ["welcome", "mode", "analytics"];
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
