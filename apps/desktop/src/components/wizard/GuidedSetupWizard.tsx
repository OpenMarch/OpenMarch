import {
    useState,
    useEffect,
    useCallback,
    useMemo,
    lazy,
    Suspense,
} from "react";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import { WIZARD_STEPS, DEFAULT_WIZARD_STATE, type WizardStepId } from "./types";
import WizardLayout from "./WizardLayout";
import { completeWizard } from "./wizardCompletion";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslate, T } from "@tolgee/react";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogCancel,
    AlertDialogAction,
    Button,
} from "@openmarch/ui";
import { useWizardValidation } from "./hooks/useWizardValidation";

// Lazy load step components for better performance
const ProjectStep = lazy(() => import("./steps/ProjectStep"));
const EnsembleStep = lazy(() => import("./steps/EnsembleStep"));
const FieldSetupStep = lazy(() => import("./steps/FieldSetupStep"));
const PerformersStep = lazy(() => import("./steps/PerformersStep"));
const MusicStep = lazy(() => import("./steps/MusicStep"));

interface GuidedSetupWizardProps {
    onComplete: () => void;
    onExitWizard: () => void;
}

export default function GuidedSetupWizard({
    onComplete,
    onExitWizard,
}: GuidedSetupWizardProps) {
    const queryClient = useQueryClient();
    const { t } = useTranslate();
    const {
        wizardState,
        setWizardState,
        updateWizardStep,
        setWizardActive,
        resetWizard,
        updatePerformers,
    } = useGuidedSetupStore();

    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [isCompleting, setIsCompleting] = useState(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [completedSteps, setCompletedSteps] = useState<ReadonlySet<number>>(
        () => new Set(),
    );

    // Initialize wizard state on mount - always start fresh at step 1
    useEffect(() => {
        setWizardActive(true);
        // Initialize wizard state for a fresh setup
        setWizardState(DEFAULT_WIZARD_STATE);
        setCurrentStepIndex(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount

    // Ensure wizardState is initialized even if store doesn't have it
    const effectiveWizardState = useMemo(
        () => wizardState || DEFAULT_WIZARD_STATE,
        [wizardState],
    );

    const currentStep: WizardStepId = WIZARD_STEPS[currentStepIndex];
    const isLastStep = currentStepIndex === WIZARD_STEPS.length - 1;
    const isFirstStep = currentStepIndex === 0;

    const canGoNext = useWizardValidation(effectiveWizardState, currentStep);

    const handleStepChange = useCallback(
        (index: number, step: WizardStepId) => {
            setCurrentStepIndex(index);
            updateWizardStep(step);
            // Mark previous step as completed when moving forward
            if (index > currentStepIndex) {
                setCompletedSteps((prev) => {
                    const next = new Set(prev);
                    next.add(currentStepIndex);
                    return next;
                });
            }
        },
        [currentStepIndex, updateWizardStep],
    );

    const handleNext = useCallback(() => {
        if (currentStepIndex < WIZARD_STEPS.length - 1) {
            handleStepChange(
                currentStepIndex + 1,
                WIZARD_STEPS[currentStepIndex + 1],
            );
        }
    }, [currentStepIndex, handleStepChange]);

    const handleBack = useCallback(() => {
        if (currentStepIndex > 0) {
            handleStepChange(
                currentStepIndex - 1,
                WIZARD_STEPS[currentStepIndex - 1],
            );
        }
    }, [currentStepIndex, handleStepChange]);

    const handleComplete = useCallback(async () => {
        if (!effectiveWizardState || isCompleting) return;

        setIsCompleting(true);
        try {
            await completeWizard(effectiveWizardState, queryClient);
            resetWizard();
            onComplete();
        } catch (error) {
            console.error("Wizard completion failed:", error);
            // User-facing error handling is done in completeWizard via toast
        } finally {
            setIsCompleting(false);
        }
    }, [
        effectiveWizardState,
        isCompleting,
        queryClient,
        resetWizard,
        onComplete,
    ]);

    const handleSkip = useCallback(() => {
        if (currentStep === "performers") {
            updatePerformers({ method: "skip", marchers: [] });
        }
        if (isLastStep) {
            void handleComplete();
        } else {
            handleNext();
        }
    }, [currentStep, isLastStep, handleComplete, handleNext, updatePerformers]);

    const STEP_TITLE_FALLBACKS: Readonly<Record<WizardStepId, string>> = {
        project: "Project Information",
        ensemble: "Ensemble",
        field: "Field Setup",
        performers: "Add Performers",
        music: "Add Music",
    } as const;

    const STEP_DESCRIPTION_FALLBACKS: Readonly<Record<WizardStepId, string>> = {
        project: "Enter your project details",
        ensemble: "Select your ensemble type and environment",
        field: "Choose a field template or customize your field",
        performers: "Add performers to your show",
        music: "Import music or set tempo (optional)",
    } as const;

    const stepTitle = useMemo(
        () =>
            t(`wizard.step.${currentStep}.title`, {
                defaultValue: STEP_TITLE_FALLBACKS[currentStep],
            }),
        [t, currentStep],
    );

    const stepDescription = useMemo(
        () =>
            t(`wizard.step.${currentStep}.description`, {
                defaultValue: STEP_DESCRIPTION_FALLBACKS[currentStep],
            }),
        [t, currentStep],
    );

    const stepContent = useMemo(() => {
        if (!effectiveWizardState) return null;

        const StepComponent = {
            project: ProjectStep,
            ensemble: EnsembleStep,
            field: FieldSetupStep,
            performers: PerformersStep,
            music: MusicStep,
        }[currentStep];

        return StepComponent ? (
            <Suspense fallback={<div>Loading step...</div>}>
                <StepComponent />
            </Suspense>
        ) : null;
    }, [currentStep, effectiveWizardState]);

    const hasProgress = useMemo(
        () =>
            effectiveWizardState?.project !== null ||
            effectiveWizardState?.ensemble !== null ||
            effectiveWizardState?.field !== null ||
            effectiveWizardState?.performers !== null ||
            effectiveWizardState?.music !== null,
        [effectiveWizardState],
    );

    const handleExitWizard = useCallback(() => {
        if (hasProgress) {
            setShowExitConfirm(true);
        } else {
            resetWizard();
            onExitWizard();
        }
    }, [hasProgress, resetWizard, onExitWizard]);

    const confirmExit = useCallback(() => {
        resetWizard();
        setShowExitConfirm(false);
        onExitWizard();
    }, [resetWizard, onExitWizard]);

    const cancelExit = useCallback(() => {
        setShowExitConfirm(false);
    }, []);

    const canSkip = useMemo(
        () => currentStep === "music" || currentStep === "performers",
        [currentStep],
    );

    return (
        <>
            <WizardLayout
                currentStepIndex={currentStepIndex}
                stepTitle={stepTitle}
                stepDescription={stepDescription}
                onNext={handleNext}
                onBack={handleBack}
                canGoNext={canGoNext && !isCompleting}
                canGoBack={!isFirstStep}
                isLastStep={isLastStep}
                onComplete={handleComplete}
                onSkip={canSkip ? handleSkip : undefined}
                canSkip={canSkip}
                isCompleting={isCompleting}
                onExitWizard={handleExitWizard}
                completedSteps={completedSteps}
            >
                {stepContent}
            </WizardLayout>

            {/* Exit confirmation dialog */}
            <AlertDialog
                open={showExitConfirm}
                onOpenChange={setShowExitConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogTitle>
                        <T keyName="wizard.exitConfirm.title" />
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        <T keyName="wizard.exitConfirm.description" />
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-8">
                        <AlertDialogCancel>
                            <Button
                                variant="secondary"
                                size="compact"
                                onClick={cancelExit}
                            >
                                <T keyName="wizard.exitConfirm.cancel" />
                            </Button>
                        </AlertDialogCancel>
                        <AlertDialogAction>
                            <Button
                                variant="red"
                                size="compact"
                                onClick={confirmExit}
                            >
                                <T keyName="wizard.exitConfirm.confirm" />
                            </Button>
                        </AlertDialogAction>
                    </div>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
