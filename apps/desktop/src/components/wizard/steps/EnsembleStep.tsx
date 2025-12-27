import { useState, useEffect, useMemo } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import { WizardFormField } from "@/components/ui/FormField";
import { T } from "@tolgee/react";

const INDOOR_ENSEMBLE_TYPES = [
    "Indoor Percussion",
    "Indoor Winds",
    "Winter Guard",
    "Other",
];

const OUTDOOR_ENSEMBLE_TYPES = ["Marching Band", "Drum Corps", "Other"];

export default function EnsembleStep() {
    const { wizardState, updateEnsemble } = useGuidedSetupStore();
    const [environment, setEnvironment] = useState<"indoor" | "outdoor">(
        wizardState?.ensemble?.environment || "outdoor",
    );

    // Get available ensemble types based on environment
    const availableEnsembleTypes = useMemo(() => {
        return environment === "indoor"
            ? INDOOR_ENSEMBLE_TYPES
            : OUTDOOR_ENSEMBLE_TYPES;
    }, [environment]);

    // Initialize ensemble type - use stored value if valid, otherwise use first available
    const getInitialEnsembleType = (): string => {
        const stored = wizardState?.ensemble?.ensemble_type;
        const currentEnvTypes =
            (wizardState?.ensemble?.environment || "outdoor") === "indoor"
                ? INDOOR_ENSEMBLE_TYPES
                : OUTDOOR_ENSEMBLE_TYPES;
        if (stored && currentEnvTypes.includes(stored)) {
            return stored;
        }
        return currentEnvTypes[0] || OUTDOOR_ENSEMBLE_TYPES[0];
    };

    const [ensembleType, setEnsembleType] = useState<string>(() => {
        const initial = getInitialEnsembleType();
        // Ensure we always return a valid string, never undefined
        return initial || OUTDOOR_ENSEMBLE_TYPES[0];
    });

    // Reset ensemble type when environment changes if current type is not valid
    useEffect(() => {
        if (
            !availableEnsembleTypes.includes(ensembleType) &&
            availableEnsembleTypes.length > 0
        ) {
            // Set to first available type for the new environment
            setEnsembleType(availableEnsembleTypes[0]);
        }
    }, [environment, availableEnsembleTypes, ensembleType]);

    // Update wizard state when values change
    useEffect(() => {
        // Only update if values are different from store
        if (
            wizardState?.ensemble?.environment !== environment ||
            wizardState?.ensemble?.ensemble_type !== ensembleType
        ) {
            updateEnsemble({
                environment,
                ensemble_type: ensembleType,
            });
        }
    }, [environment, ensembleType, updateEnsemble, wizardState?.ensemble]);

    const displayedEnsembleType = availableEnsembleTypes.includes(ensembleType)
        ? ensembleType
        : availableEnsembleTypes[0];

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-32">
            <WizardFormField
                label={<T keyName="wizard.ensemble.environment" />}
                helperText={<T keyName="wizard.ensemble.environmentHelper" />}
            >
                <Select
                    value={environment}
                    onValueChange={(value) =>
                        setEnvironment(value as "indoor" | "outdoor")
                    }
                >
                    <SelectTriggerButton label={environment} />
                    <SelectContent>
                        <SelectItem value="outdoor">
                            <T keyName="wizard.ensemble.outdoor" />
                        </SelectItem>
                        <SelectItem value="indoor">
                            <T keyName="wizard.ensemble.indoor" />
                        </SelectItem>
                    </SelectContent>
                </Select>
            </WizardFormField>

            <WizardFormField
                label={<T keyName="wizard.ensemble.type" />}
                helperText={<T keyName="wizard.ensemble.typeHelper" />}
            >
                <Select
                    value={displayedEnsembleType}
                    onValueChange={setEnsembleType}
                >
                    <SelectTriggerButton label={displayedEnsembleType} />
                    <SelectContent>
                        {availableEnsembleTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                                {type}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </WizardFormField>
        </div>
    );
}
