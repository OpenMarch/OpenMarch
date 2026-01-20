import { useCallback, useRef } from "react";
import type { WizardStepId } from "../types";
import { WIZARD_STEPS } from "../types";

const NAVIGATION_DEBOUNCE_MS = 300;

interface UseWizardNavigationProps {
    currentStepIndex: number;
    isCompleting: boolean;
    onStepChange: (index: number, step: WizardStepId) => void;
    onComplete?: () => void;
}

export function useWizardNavigation({
    currentStepIndex,
    isCompleting,
    onStepChange,
    onComplete,
}: UseWizardNavigationProps) {
    const isNavigatingRef = useRef(false);

    const navigateToStep = useCallback(
        (targetIndex: number) => {
            if (
                isNavigatingRef.current ||
                isCompleting ||
                targetIndex < 0 ||
                targetIndex >= WIZARD_STEPS.length
            ) {
                return;
            }

            isNavigatingRef.current = true;
            const targetStep = WIZARD_STEPS[targetIndex];
            onStepChange(targetIndex, targetStep);

            setTimeout(() => {
                isNavigatingRef.current = false;
            }, NAVIGATION_DEBOUNCE_MS);
        },
        [isCompleting, onStepChange],
    );

    const handleNext = useCallback(() => {
        if (currentStepIndex < WIZARD_STEPS.length - 1) {
            navigateToStep(currentStepIndex + 1);
        }
    }, [currentStepIndex, navigateToStep]);

    const handleBack = useCallback(() => {
        if (currentStepIndex > 0) {
            navigateToStep(currentStepIndex - 1);
        }
    }, [currentStepIndex, navigateToStep]);

    const handleComplete = useCallback(() => {
        if (isNavigatingRef.current || isCompleting) return;
        isNavigatingRef.current = true;
        onComplete?.();
    }, [isCompleting, onComplete]);

    return {
        handleNext,
        handleBack,
        handleComplete,
        isNavigating: () => isNavigatingRef.current,
    };
}
