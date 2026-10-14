import { useEffect, useMemo, useState } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Button, Dialog, DialogContent } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import NewShowProgressIndicator from "@/components/launchpage/newShow/components/NewShowProgressIndicator";
import { useEditorModeStore, type EditorMode } from "@/stores/EditorModeStore";
import { saveAnalyticsChoice } from "@/utilities/analyticsConsent";
import {
    canContinueFrom,
    getWelcomeSteps,
    isAnalyticsChoiceMade,
    type WelcomeStepId,
} from "./welcomeFlowSteps";
import WelcomeStep from "./steps/WelcomeStep";
import ModeStep from "./steps/ModeStep";
import AnalyticsStep from "./steps/AnalyticsStep";

export interface WelcomeFlowProps {
    open: boolean;
    /**
     * Called once the choices are saved. `willReload` is true when the window
     * reloads next (after an analytics answer, as the old opt-in modal did).
     */
    onFinish: (result: { willReload: boolean }) => void;
    /** Reloads the window; replaced in tests. */
    reload?: () => void;
}

const STEP_TITLE_KEYS: Record<WelcomeStepId, string> = {
    welcome: "welcomeFlow.welcome.title",
    mode: "welcomeFlow.mode.title",
    analytics: "analyticsOptIn.title",
};

/**
 * First launch (UI-19): welcome, Basic or Expert, then the analytics opt-in
 * when it hasn't been answered. It can't be dismissed; finishing saves the mode.
 */
// eslint-disable-next-line max-lines-per-function
export default function WelcomeFlow({
    open,
    onFinish,
    reload = () => window.location.reload(),
}: WelcomeFlowProps) {
    const { t } = useTranslate();
    const setMode = useEditorModeStore((state) => state.setMode);
    const [analyticsChoiceMade, setAnalyticsChoiceMade] = useState<
        boolean | null
    >(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [chosenMode, setChosenMode] = useState<EditorMode | null>(null);

    useEffect(() => {
        if (!open) return;
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
    }, [open]);

    // Until the analytics setting is read, assume the question is asked; the
    // first step is the same either way.
    const steps = useMemo(
        () => getWelcomeSteps(analyticsChoiceMade ?? false),
        [analyticsChoiceMade],
    );
    const step = steps[Math.min(stepIndex, steps.length - 1)];
    const isFirst = stepIndex === 0;
    const isLast = stepIndex >= steps.length - 1;
    const completed = useMemo(
        () => new Set(Array.from({ length: stepIndex }, (_, i) => i)),
        [stepIndex],
    );

    const finish = (analyticsOptOut?: boolean) => {
        if (!chosenMode) return;
        setMode(chosenMode);
        const willReload = analyticsOptOut !== undefined;
        if (willReload) saveAnalyticsChoice(analyticsOptOut);
        onFinish({ willReload });
        if (willReload) reload();
    };

    const next = () => {
        if (!canContinueFrom(step, chosenMode)) return;
        // The mode step finishes when the analytics step is skipped. Wait for
        // the analytics setting so the question isn't skipped by mistake.
        if (isLast) {
            if (analyticsChoiceMade !== null) finish();
            return;
        }
        setStepIndex(stepIndex + 1);
    };

    return (
        <Dialog open={open}>
            <DialogContent
                className="w-[44rem] max-w-[calc(100vw-2rem)]"
                aria-label={t("welcomeFlow.dialogLabel")}
                aria-describedby={undefined}
                onEscapeKeyDown={(event) => event.preventDefault()}
                onPointerDownOutside={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
                data-testid="welcome-flow"
            >
                <NewShowProgressIndicator
                    currentStepIndex={stepIndex}
                    steps={steps}
                    completedSteps={completed}
                />
                <span className="sr-only">
                    {t("welcomeFlow.step", {
                        current: stepIndex + 1,
                        total: steps.length,
                    })}
                </span>
                <RadixDialog.Title className="text-h4 text-text text-center font-medium">
                    <T keyName={STEP_TITLE_KEYS[step]} />
                </RadixDialog.Title>

                <div className="min-h-0 flex-1 overflow-y-auto px-4">
                    {step === "welcome" && <WelcomeStep />}
                    {step === "mode" && (
                        <ModeStep value={chosenMode} onChange={setChosenMode} />
                    )}
                    {step === "analytics" && <AnalyticsStep />}
                </div>

                <div className="flex w-full justify-between gap-8 pt-8">
                    <div>
                        {!isFirst && (
                            <Button
                                variant="secondary"
                                onClick={() => setStepIndex(stepIndex - 1)}
                            >
                                <T keyName="welcomeFlow.back" />
                            </Button>
                        )}
                    </div>
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
                                disabled={
                                    !canContinueFrom(step, chosenMode) ||
                                    (isLast && analyticsChoiceMade === null)
                                }
                                data-testid="welcome-continue"
                            >
                                <T keyName="welcomeFlow.continue" />
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
