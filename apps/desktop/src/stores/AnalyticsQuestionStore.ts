import { create } from "zustand";
import {
    isAnalyticsChoiceMade,
    type AnalyticsQuestion,
} from "@/components/welcome/welcomeFlowSteps";
import { applyAnalyticsConsent } from "@/utilities/analyticsConsent";
import { isWebBuild } from "@/utilities/webBuild";

/**
 * Whether the analytics question still needs asking. The welcome flow is the
 * only place it's asked (it opens for it even with a mode stored); Settings ›
 * Privacy changes the answer later.
 */
export const useAnalyticsQuestionStore = create<{
    status: AnalyticsQuestion;
}>(() => ({ status: "loading" }));

/** Marks the question answered (the answer itself is saved by the caller). */
export function markAnalyticsAnswered(): void {
    useAnalyticsQuestionStore.setState({ status: "answered" });
}

type Env = {
    isCodegen?: boolean;
    isCI?: boolean;
    isPlaywrightSession?: boolean;
};

/**
 * Reads the stored answer. Call once at renderer startup. Nobody is asked in
 * the web build (no analytics) or in codegen sessions. Playwright and CI
 * sessions are answered "no" without asking, as the old opt-in modal did, so
 * tests never meet the question.
 */
export function initAnalyticsQuestionStore(): void {
    const electron = window.electron;
    if (!electron || isWebBuild) {
        markAnalyticsAnswered();
        return;
    }
    const load = async () => {
        let stored: unknown;
        let env: Env | undefined;
        try {
            [stored, env] = await Promise.all([
                electron.invoke("settings:get", "optOutAnalytics"),
                electron.getEnv?.() as Promise<Env> | undefined,
            ]);
        } catch (error) {
            console.warn("Failed to read the analytics setting:", error);
        }
        if (useAnalyticsQuestionStore.getState().status === "answered") return;
        if (isAnalyticsChoiceMade(stored) || env?.isCodegen) {
            markAnalyticsAnswered();
            return;
        }
        if (
            env?.isPlaywrightSession ||
            env?.isCI ||
            electron.isPlaywrightSession
        ) {
            applyAnalyticsConsent(true);
            electron.send("settings:set", { optOutAnalytics: true });
            markAnalyticsAnswered();
            return;
        }
        useAnalyticsQuestionStore.setState({ status: "unanswered" });
    };
    void load();
}
