import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@openmarch/ui";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import { WIZARD_STEPS, DEFAULT_WIZARD_STATE, type WizardStepId } from "./types";
import WizardStep from "./WizardStep";
import EnsembleStep from "./steps/EnsembleStep";
import FieldSetupStep from "./steps/FieldSetupStep";
import PerformersStep from "./steps/PerformersStep";
import MusicStep from "./steps/MusicStep";
import { T } from "@tolgee/react";
import { completeWizard } from "./wizardCompletion";
import { useQueryClient } from "@tanstack/react-query";

interface GuidedSetupWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete: () => void;
}

export default function GuidedSetupWizard({
    open,
    onOpenChange,
    onComplete,
}: GuidedSetupWizardProps) {
    const queryClient = useQueryClient();
    const {
        wizardState,
        setWizardState,
        updateWizardStep,
        setWizardActive,
        resetWizard,
    } = useGuidedSetupStore();

    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [isCompleting, setIsCompleting] = useState(false);

    // Initialize wizard state when opened - always start fresh at step 1
    useEffect(() => {
        if (open) {
            setWizardActive(true);
            // Always reset wizard state and start at step 1 for a fresh setup
            resetWizard();
            setWizardState(DEFAULT_WIZARD_STATE);
            setCurrentStepIndex(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]); // Only run when open changes - store functions are stable

    // Ensure wizardState is initialized even if store doesn't have it
    const effectiveWizardState = wizardState || DEFAULT_WIZARD_STATE;

    const currentStep: WizardStepId = WIZARD_STEPS[currentStepIndex];
    const isLastStep = currentStepIndex === WIZARD_STEPS.length - 1;
    const isFirstStep = currentStepIndex === 0;

    const handleNext = () => {
        if (currentStepIndex < WIZARD_STEPS.length - 1) {
            const nextIndex = currentStepIndex + 1;
            const nextStep = WIZARD_STEPS[nextIndex];
            setCurrentStepIndex(nextIndex);
            updateWizardStep(nextStep);
        }
    };

    const handleBack = () => {
        if (currentStepIndex > 0) {
            const prevIndex = currentStepIndex - 1;
            const prevStep = WIZARD_STEPS[prevIndex];
            setCurrentStepIndex(prevIndex);
            updateWizardStep(prevStep);
        }
    };

    const handleComplete = async () => {
        if (!effectiveWizardState) return;

        setIsCompleting(true);
        try {
            await completeWizard(effectiveWizardState, queryClient);
            resetWizard();
            onComplete();
            onOpenChange(false);
        } catch (error) {
            // Error handling will be done in completeWizard
        } finally {
            setIsCompleting(false);
        }
    };

    const handleSkip = () => {
        if (isLastStep) {
            void handleComplete();
        } else {
            handleNext();
        }
    };

    const handleClose = () => {
        // TODO: Add confirmation dialog if user has made progress
        resetWizard();
        onOpenChange(false);
    };

    const canGoNext = () => {
        if (!effectiveWizardState) return false;

        switch (currentStep) {
            case "ensemble":
                return effectiveWizardState.ensemble !== null;
            case "field":
                return effectiveWizardState.field !== null;
            case "performers":
                return (
                    effectiveWizardState.performers !== null &&
                    effectiveWizardState.performers.marchers.length > 0
                );
            case "music":
                // Music step is optional, can always proceed
                return true;
            default:
                return false;
        }
    };

    const getStepTitle = (step: WizardStepId): string => {
        switch (step) {
            case "ensemble":
                return "Ensemble";
            case "field":
                return "Field Setup";
            case "performers":
                return "Add Performers";
            case "music":
                return "Add Music";
        }
    };

    const getStepDescription = (step: WizardStepId): string | undefined => {
        switch (step) {
            case "ensemble":
                return "Select your ensemble type and environment";
            case "field":
                return "Choose a field template or customize your field";
            case "performers":
                return "Add performers to your show";
            case "music":
                return "Import music or set tempo (optional)";
        }
    };

    const renderStepContent = () => {
        if (!effectiveWizardState) return null;

        switch (currentStep) {
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

    if (!open) {
        return null;
    }

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="flex h-[90vh] max-h-[90vh] w-[98vw] flex-col">
                <DialogTitle>
                    <T keyName="wizard.title" />
                </DialogTitle>

                {/* Progress indicator */}
                <div className="mb-16 flex flex-shrink-0 items-center gap-8">
                    {WIZARD_STEPS.map((step, index) => (
                        <div
                            key={step}
                            className="flex flex-1 items-center gap-8"
                        >
                            <div
                                className={`flex h-32 w-32 items-center justify-center rounded-full border-2 ${
                                    index <= currentStepIndex
                                        ? "border-accent bg-accent text-bg-1"
                                        : "border-stroke text-text/60"
                                }`}
                            >
                                {index + 1}
                            </div>
                            {index < WIZARD_STEPS.length - 1 && (
                                <div
                                    className={`h-1 flex-1 ${
                                        index < currentStepIndex
                                            ? "bg-accent"
                                            : "bg-stroke"
                                    }`}
                                />
                            )}
                        </div>
                    ))}
                </div>

                {/* Step content */}
                <WizardStep
                    title={getStepTitle(currentStep)}
                    description={getStepDescription(currentStep)}
                    onNext={handleNext}
                    onBack={handleBack}
                    canGoNext={canGoNext() && !isCompleting}
                    canGoBack={!isFirstStep}
                    isLastStep={isLastStep}
                    onComplete={handleComplete}
                    onSkip={currentStep === "music" ? handleSkip : undefined}
                    canSkip={currentStep === "music"}
                >
                    {renderStepContent()}
                </WizardStep>
            </DialogContent>
        </Dialog>
    );
}
