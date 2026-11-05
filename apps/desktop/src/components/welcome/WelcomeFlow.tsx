import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@openmarch/ui";
import { T, useTolgee, useTranslate } from "@tolgee/react";
import NewShowProgressIndicator from "@/components/launchpage/newShow/components/NewShowProgressIndicator";
import { useEditorModeStore, type EditorMode } from "@/stores/EditorModeStore";
import { useWelcomeFlowStore } from "@/stores/WelcomeFlowStore";
import { useWebWelcomeStore } from "@/stores/WebWelcomeStore";
import OpenMarchLogo from "@/components/OpenMarchLogo";
import { saveAnalyticsChoice } from "@/utilities/analyticsConsent";
import { matchAppLanguage } from "@/utilities/languages";
import { isWebBuild } from "@/utilities/webBuild";
import { useTheme } from "@/context/ThemeContext";
import {
    canContinueFrom,
    getWelcomeSteps,
    isAnalyticsChoiceMade,
    isReturningUser,
    setupSteps,
    type ReturningUserChoices,
    type WelcomeStepId,
} from "./welcomeFlowSteps";
import WelcomeStep from "./steps/WelcomeStep";
import LanguageStep from "./steps/LanguageStep";
import ThemeStep from "./steps/ThemeStep";
import ModeStep from "./steps/ModeStep";
import AnalyticsStep from "./steps/AnalyticsStep";
import WhatsNewTour from "./steps/WhatsNewTour";
import { markAnalyticsAnswered } from "@/stores/AnalyticsQuestionStore";
import DevSkipSetupButton from "./DevSkipSetupButton";

export interface WelcomeFlowProps {
    /**
     * Called once the choices are saved. `willReload` is true when the window
     * reloads next (after an analytics answer, as the old opt-in modal did).
     */
    onFinish: (result: { willReload: boolean }) => void;
    /** Reloads the window; replaced in tests. */
    reload?: () => void;
}

const STEP_TITLE_KEYS: Record<
    Exclude<WelcomeStepId, "welcome" | "whatsNew">,
    string
> = {
    language: "welcomeFlow.language.title",
    theme: "welcomeFlow.theme.title",
    mode: "welcomeFlow.mode.title",
    analytics: "analyticsOptIn.title",
};

/**
 * The language step's selection and where it came from. A `saved` language
 * was chosen before (or in Settings during the flow) and is left alone; a
 * `suggested` one, from the system, is saved on Continue; a `picked` one was
 * saved when it was picked.
 */
type LanguageChoice = {
    code: string;
    source: "saved" | "suggested" | "picked";
};

/** The system's language when the app has it, else English. */
function suggestedLanguage(): string {
    return matchAppLanguage(navigator.languages ?? []) ?? "en";
}

/** A raw setting; unset (or unreadable) is undefined. */
async function readSetting(key: string): Promise<unknown> {
    try {
        return await window.electron.invoke("settings:get", key);
    } catch {
        return undefined;
    }
}

const isSaved = (value: unknown) => typeof value === "string" && value !== "";

/**
 * Whether the person used OpenMarch before, and if so which choices they
 * already made. Read once, before this flow saves anything.
 */
async function readReturningUser(): Promise<ReturningUserChoices | null> {
    const [optOutAnalytics, databasePath, language, theme, recentFiles] =
        await Promise.all([
            readSetting("optOutAnalytics"),
            readSetting("databasePath"),
            readSetting("language"),
            readSetting("theme"),
            Promise.resolve()
                .then(() => window.electron.getRecentFiles())
                .catch(() => []),
        ]);
    const returning = isReturningUser(
        {
            optOutAnalytics,
            databasePath,
            recentFileCount: Array.isArray(recentFiles)
                ? recentFiles.length
                : 0,
        },
        { isWeb: isWebBuild },
    );
    if (!returning) return null;
    return { languageSaved: isSaved(language), themeSaved: isSaved(theme) };
}

/**
 * First launch (UI-19): a welcome page, then language, light or dark, Basic or
 * Expert, and the analytics opt-in when it hasn't been answered (never on the
 * web). It fills the launch page until it's finished, then the launch page
 * shows. Language and theme apply and save as they're picked; finishing saves
 * the mode. Someone who used OpenMarch before gets "Welcome back" and What's
 * new, and isn't asked again for a language or theme they chose.
 */
// eslint-disable-next-line max-lines-per-function
export default function WelcomeFlow({
    onFinish,
    reload = () => window.location.reload(),
}: WelcomeFlowProps) {
    const { t } = useTranslate();
    const tolgee = useTolgee(["language"]);
    const { theme, setTheme } = useTheme();
    const [language, setLanguage] = useState<LanguageChoice | null>(null);
    // Languages this flow switched to, so their (possibly late) language
    // events aren't mistaken for a change made elsewhere.
    const switchedTo = useRef(new Set<string>());
    const setMode = useEditorModeStore((state) => state.setMode);
    const [analyticsChoiceMade, setAnalyticsChoiceMade] = useState<
        boolean | null
    >(null);
    // undefined while it's read; null for a new person.
    const [returning, setReturning] = useState<
        ReturningUserChoices | null | undefined
    >(undefined);
    const [stepIndex, setStepIndex] = useState(0);
    const [chosenMode, setChosenMode] = useState<EditorMode | null>(null);
    // A mode was stored when the flow opened: it opened for the analytics
    // question alone.
    const [modeChosen] = useState(
        () => useEditorModeStore.getState().mode !== null,
    );

    useEffect(() => {
        const { setShowing } = useWelcomeFlowStore.getState();
        setShowing(true);
        return () => setShowing(false);
    }, []);

    useEffect(() => {
        let active = true;
        // The raw setting: unset means never chosen. getLanguage() can't
        // tell, since it answers "en" for both.
        void Promise.resolve(window.electron.invoke("settings:get", "language"))
            .catch(() => undefined)
            .then((saved: unknown) => {
                if (!active) return;
                setLanguage(
                    (prev) =>
                        prev ??
                        (typeof saved === "string" && saved
                            ? { code: saved, source: "saved" }
                            : {
                                  code: suggestedLanguage(),
                                  source: "suggested",
                              }),
                );
            });
        // The app's language changing to something else was saved elsewhere:
        // main.tsx applying the stored one, or the Settings window.
        const { unsubscribe } = tolgee.on("language", ({ value }) => {
            if (!active || switchedTo.current.has(value)) return;
            setLanguage((prev) =>
                prev?.code === value ? prev : { code: value, source: "saved" },
            );
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, [tolgee]);

    useEffect(() => {
        let active = true;
        void readReturningUser().then((choices) => {
            if (active) setReturning(choices);
        });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        void Promise.resolve(
            window.electron.invoke("settings:get", "optOutAnalytics"),
        )
            .catch(() => undefined)
            .then((value: unknown) => {
                if (active)
                    setAnalyticsChoiceMade(isAnalyticsChoiceMade(value));
            });
        return () => {
            active = false;
        };
    }, []);

    // Until the analytics setting is read, assume the question is asked; the
    // first step is the same either way.
    const steps = useMemo(
        () =>
            getWelcomeSteps({
                analyticsChoiceMade: analyticsChoiceMade ?? false,
                isWeb: isWebBuild,
                returning,
                modeChosen,
            }),
        [analyticsChoiceMade, returning, modeChosen],
    );
    const step: WelcomeStepId | undefined =
        steps[Math.min(stepIndex, steps.length - 1)];
    const isLast = stepIndex >= steps.length - 1;
    // The welcome page and What's new aren't counted: the bar and "Step 1 of
    // 4" are the setup.
    const setup = setupSteps(steps);
    const setupIndex = step ? setup.indexOf(step) : -1;
    const setupCount = setup.length;
    const completed = useMemo(
        () => new Set(Array.from({ length: setupIndex }, (_, i) => i)),
        [setupIndex],
    );

    const chooseLanguage = (code: string) => {
        setLanguage({ code, source: "picked" });
        switchedTo.current.add(code);
        void tolgee.changeLanguage(code);
        void window.electron.setLanguage(code);
    };

    const finish = (analyticsOptOut?: boolean) => {
        if (!chosenMode && !modeChosen) return;
        if (chosenMode) setMode(chosenMode);
        const willReload = analyticsOptOut !== undefined;
        if (willReload) {
            saveAnalyticsChoice(analyticsOptOut);
            markAnalyticsAnswered();
        }
        onFinish({ willReload });
        if (willReload) reload();
    };

    // The mode step finishes when the analytics step is skipped. Off the web,
    // wait for the analytics setting so the question isn't skipped by mistake.
    const waitingForAnalytics =
        isLast && !isWebBuild && analyticsChoiceMade === null;
    const continueDisabled =
        !step ||
        !canContinueFrom(step, chosenMode) ||
        (step === "language" && language === null) ||
        waitingForAnalytics;

    // Developer builds only: Expert mode, no further questions. An unanswered
    // analytics question is answered "no" so the old opt-in modal stays away,
    // and the web build's welcome modal (waiting for this flow) is closed.
    // Off the web, it waits for the analytics setting so an earlier answer
    // isn't overwritten. Language and theme are left as they are.
    const devSkipDisabled = !isWebBuild && analyticsChoiceMade === null;
    const devSkip = () => {
        if (devSkipDisabled) return;
        setMode("expert");
        useWebWelcomeStore.getState().setOpen(false);
        const willReload = !isWebBuild && analyticsChoiceMade !== true;
        if (willReload) {
            saveAnalyticsChoice(true);
            markAnalyticsAnswered();
        }
        onFinish({ willReload });
        if (willReload) reload();
    };

    const next = () => {
        if (continueDisabled) return;
        // A language suggested from the system is saved on Continue.
        if (step === "language" && language?.source === "suggested")
            chooseLanguage(language.code);
        if (isLast) {
            finish();
            return;
        }
        setStepIndex(stepIndex + 1);
    };

    // What's new's Skip and last slide go on; Back on its first slide goes back
    const afterTour = () => setStepIndex(stepIndex + 1);
    const back = () => setStepIndex(stepIndex - 1);

    // The first page differs for returning people; show it once that's known.
    if (returning === undefined || !step)
        return (
            <main
                className="flex min-h-0 flex-1"
                aria-label={t("welcomeFlow.dialogLabel")}
                aria-busy
            />
        );

    if (step === "welcome")
        return (
            <WelcomeStep
                onStart={next}
                onDevSkip={devSkip}
                devSkipDisabled={devSkipDisabled}
                startLanguage={language?.code ?? suggestedLanguage()}
                returning={returning !== null}
                aria-label={t("welcomeFlow.dialogLabel")}
            />
        );

    if (step === "whatsNew")
        return (
            <WhatsNewTour onDone={afterTour} onSkip={afterTour} onBack={back} />
        );

    return (
        <main
            className="flex min-h-0 flex-1 p-8"
            aria-label={t("welcomeFlow.dialogLabel")}
            data-testid="welcome-flow"
        >
            <div className="bg-fg-1 border-stroke rounded-6 flex min-h-0 flex-1 flex-col overflow-y-auto border px-24 py-32">
                <div className="m-auto flex w-full max-w-[46rem] flex-col gap-24">
                    {/* A single question (analytics alone) is one short screen:
                        no progress bar or step count */}
                    <div className="flex items-center gap-24">
                        <OpenMarchLogo
                            height={28}
                            className="text-text shrink-0"
                        />
                        {setupCount > 1 && (
                            <NewShowProgressIndicator
                                currentStepIndex={setupIndex}
                                steps={setup}
                                completedSteps={completed}
                            />
                        )}
                    </div>
                    <div className="flex flex-col items-center gap-4">
                        {setupCount > 1 && (
                            <span className="text-sub text-text-subtitle tracking-wide uppercase">
                                {t("welcomeFlow.step", {
                                    current: setupIndex + 1,
                                    total: setupCount,
                                })}
                            </span>
                        )}
                        <h1 className="text-h3 text-text text-center font-medium">
                            <T keyName={STEP_TITLE_KEYS[step]} />
                        </h1>
                    </div>

                    <div key={step} className="animate-fade-in">
                        {step === "language" && (
                            <LanguageStep
                                value={language?.code ?? ""}
                                onChange={chooseLanguage}
                            />
                        )}
                        {step === "theme" && (
                            <ThemeStep value={theme} onChange={setTheme} />
                        )}
                        {step === "mode" && (
                            <ModeStep
                                value={chosenMode}
                                onChange={setChosenMode}
                            />
                        )}
                        {step === "analytics" && <AnalyticsStep />}
                    </div>

                    <div className="flex w-full justify-between gap-8 pt-8">
                        {stepIndex > 0 ? (
                            <Button
                                variant="secondary"
                                onClick={back}
                                data-testid="welcome-back"
                            >
                                <T keyName="welcomeFlow.back" />
                            </Button>
                        ) : (
                            <span />
                        )}
                        <div className="flex gap-8">
                            {step === "analytics" ? (
                                <>
                                    <Button
                                        variant="secondary"
                                        onClick={() => finish(true)}
                                        data-testid="welcome-analytics-opt-out"
                                    >
                                        <T keyName="analyticsOptIn.optOut" />
                                    </Button>
                                    <Button
                                        onClick={() => finish(false)}
                                        data-testid="welcome-analytics-opt-in"
                                    >
                                        <T keyName="analyticsOptIn.optIn" />
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    onClick={next}
                                    disabled={continueDisabled}
                                    data-testid="welcome-continue"
                                >
                                    <T
                                        keyName={
                                            isLast
                                                ? "welcomeFlow.finish"
                                                : "welcomeFlow.continue"
                                        }
                                    />
                                </Button>
                            )}
                        </div>
                    </div>
                    <DevSkipSetupButton
                        onSkip={devSkip}
                        disabled={devSkipDisabled}
                        className="-mt-16 self-end"
                    />
                </div>
            </div>
        </main>
    );
}
