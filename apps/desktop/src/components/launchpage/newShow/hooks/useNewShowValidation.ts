import { useMemo } from "react";
import type { NewShowStepId, NewShowWizardState } from "../../newShowTypes";

const OPTIONAL_STEPS: Set<NewShowStepId> = new Set([
    "performers",
    "audio",
    "tempo",
]);

export function useNewShowValidation(
    state: NewShowWizardState,
    currentStep: NewShowStepId,
): boolean {
    return useMemo(() => {
        if (OPTIONAL_STEPS.has(currentStep)) {
            return true;
        }

        switch (currentStep) {
            case "project": {
                const project = state.project;
                return (
                    project !== null &&
                    project.projectName.trim().length > 0 &&
                    project.fileLocation.trim().length > 0
                );
            }
            case "ensemble":
                return state.ensemble !== null;
            case "field":
                return state.field !== null;
            default:
                return false;
        }
    }, [state, currentStep]);
}
