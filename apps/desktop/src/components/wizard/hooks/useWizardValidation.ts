import { useMemo } from "react";
import type { WizardState, WizardStepId } from "../types";

const OPTIONAL_STEPS: Set<WizardStepId> = new Set(["performers", "music"]);

export function useWizardValidation(
    wizardState: WizardState | null,
    currentStep: WizardStepId,
): boolean {
    return useMemo(() => {
        if (!wizardState) return false;

        // Optional steps can always proceed
        if (OPTIONAL_STEPS.has(currentStep)) return true;

        switch (currentStep) {
            case "project": {
                const project = wizardState.project;
                return (
                    project !== null &&
                    project.projectName.trim().length > 0 &&
                    (project.fileLocation?.trim().length ?? 0) > 0
                );
            }
            case "ensemble":
                return wizardState.ensemble !== null;
            case "field":
                return wizardState.field !== null;
            default:
                return false;
        }
    }, [wizardState, currentStep]);
}
