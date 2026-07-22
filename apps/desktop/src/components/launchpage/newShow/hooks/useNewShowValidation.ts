import { useMemo } from "react";
import {
    isTempoOnlyTimeSignature,
    type NewShowStepId,
    type NewShowWizardState,
} from "../../newShowTypes";

const OPTIONAL_STEPS: Set<NewShowStepId> = new Set(["performers", "audio"]);

function isValidTempoOnlyTempo(tempo: number | undefined): boolean {
    return tempo !== undefined && tempo >= 1 && tempo <= 300;
}

export function useNewShowValidation(
    state: NewShowWizardState,
    currentStep: NewShowStepId,
): boolean {
    return useMemo(() => {
        if (OPTIONAL_STEPS.has(currentStep)) {
            return true;
        }

        switch (currentStep) {
            case "start":
                return state.start !== null;
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
            case "tempo": {
                const tempo = state.tempo;
                if (!tempo || tempo.method !== "tempo_only") {
                    return true;
                }
                return (
                    isValidTempoOnlyTempo(tempo.tempo) &&
                    isTempoOnlyTimeSignature(tempo.timeSignature)
                );
            }
            default:
                return false;
        }
    }, [state, currentStep]);
}
