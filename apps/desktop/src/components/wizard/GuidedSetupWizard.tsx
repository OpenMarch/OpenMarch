import { useState, useEffect } from "react";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import { WIZARD_STEPS, DEFAULT_WIZARD_STATE, type WizardStepId } from "./types";
import WizardLayout from "./WizardLayout";
import ProjectStep from "./steps/ProjectStep";
import EnsembleStep from "./steps/EnsembleStep";
import FieldSetupStep from "./steps/FieldSetupStep";
import PerformersStep from "./steps/PerformersStep";
import MusicStep from "./steps/MusicStep";
import { completeWizard } from "./wizardCompletion";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { analytics } from "@/utilities/analytics";

interface GuidedSetupWizardProps {
    onComplete: () => void;
}

export default function GuidedSetupWizard({
    onComplete,
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

    // Initialize wizard state on mount - always start fresh at step 1
    useEffect(() => {
        setWizardActive(true);
        // Initialize wizard state for a fresh setup
        setWizardState(DEFAULT_WIZARD_STATE);
        setCurrentStepIndex(0);
        analytics.trackWizardStart();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount

    // Ensure wizardState is initialized even if store doesn't have it
    const effectiveWizardState = wizardState || DEFAULT_WIZARD_STATE;

    const currentStep: WizardStepId = WIZARD_STEPS[currentStepIndex];
    const isLastStep = currentStepIndex === WIZARD_STEPS.length - 1;
    const isFirstStep = currentStepIndex === 0;

    const handleNext = () => {
        if (currentStepIndex < WIZARD_STEPS.length - 1) {
            const nextIndex = currentStepIndex + 1;
            const nextStep = WIZARD_STEPS[nextIndex];
            analytics.trackWizardStep(currentStep, currentStepIndex, "next");
            setCurrentStepIndex(nextIndex);
            updateWizardStep(nextStep);
        }
    };

    const handleBack = () => {
        if (currentStepIndex > 0) {
            const prevIndex = currentStepIndex - 1;
            const prevStep = WIZARD_STEPS[prevIndex];
            analytics.trackWizardStep(currentStep, currentStepIndex, "back");
            setCurrentStepIndex(prevIndex);
            updateWizardStep(prevStep);
        }
    };

    const handleComplete = async () => {
        if (!effectiveWizardState) return;

        setIsCompleting(true);
        try {
            await completeWizard(effectiveWizardState, queryClient);
            analytics.trackWizardComplete();
            resetWizard();
            onComplete();
        } catch (error) {
            console.error("Wizard completion failed:", error);
            // User-facing error handling is done in completeWizard via toast
        } finally {
            setIsCompleting(false);
        }
    };

    const handleSkip = () => {
        analytics.trackWizardStep(currentStep, currentStepIndex, "skip");
        // If skipping performers step, mark it as skipped
        if (currentStep === "performers") {
            updatePerformers({ method: "skip", marchers: [] });
        }

        if (isLastStep) {
            void handleComplete();
        } else {
            handleNext();
        }
    };

    const canGoNext = () => {
        if (!effectiveWizardState) return false;

        switch (currentStep) {
            case "project":
                return (
                    effectiveWizardState.project !== null &&
                    effectiveWizardState.project?.projectName?.trim().length >
                        0 &&
                    effectiveWizardState.project?.fileLocation &&
                    effectiveWizardState.project.fileLocation.trim().length > 0
                );
            case "ensemble":
                return effectiveWizardState.ensemble !== null;
            case "field":
                return effectiveWizardState.field !== null;
            case "performers":
                // Performers step is optional, can always proceed
                return true;
            case "music":
                // Music step is optional, can always proceed
                return true;
            default:
                return false;
        }
    };

    const stepTitleFallbacks: Record<WizardStepId, string> = {
        project: "Project Information",
        ensemble: "Ensemble",
        field: "Field Setup",
        performers: "Add Performers",
        music: "Add Music",
    };

    const getStepTitle = (step: WizardStepId): string => {
        return t(`wizard.step.${step}.title`, {
            defaultValue: stepTitleFallbacks[step],
        });
    };

    const stepDescriptionFallbacks: Record<WizardStepId, string> = {
        project: "Enter your project details",
        ensemble: "Select your ensemble type and environment",
        field: "Choose a field template or customize your field",
        performers: "Add performers to your show",
        music: "Import music or set tempo (optional)",
    };

    const getStepDescription = (step: WizardStepId): string | undefined => {
        return t(`wizard.step.${step}.description`, {
            defaultValue: stepDescriptionFallbacks[step],
        });
    };

    const renderStepContent = () => {
        if (!effectiveWizardState) return null;

        switch (currentStep) {
            case "project":
                return <ProjectStep />;
            case "ensemble":
                return <EnsembleStep />;
            case "field":
                return <FieldSetupStep />;
            case "performers":
                return <PerformersStep />;
            case "music":
                return <MusicStep />;
        }
    };

    return (
        <WizardLayout
            currentStepIndex={currentStepIndex}
            stepTitle={getStepTitle(currentStep)}
            stepDescription={getStepDescription(currentStep)}
            onNext={handleNext}
            onBack={handleBack}
            canGoNext={!!(canGoNext() && !isCompleting)}
            canGoBack={!isFirstStep}
            isLastStep={isLastStep}
            onComplete={handleComplete}
            onSkip={
                currentStep === "music" || currentStep === "performers"
                    ? handleSkip
                    : undefined
            }
            canSkip={currentStep === "music" || currentStep === "performers"}
            isCompleting={isCompleting}
        >
            {renderStepContent()}
        </WizardLayout>
    );
}
