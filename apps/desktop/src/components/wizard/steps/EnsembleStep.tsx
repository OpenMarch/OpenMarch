import { useState, useEffect } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import { StaticFormField } from "@/components/ui/FormField";
import { T } from "@tolgee/react";

const ENSEMBLE_TYPES = [
    "Marching Band",
    "Drum Corps",
    "Indoor Winds",
    "Indoor Percussion",
    "Color Guard",
    "Other",
];

export default function EnsembleStep() {
    const { wizardState, updateEnsemble } = useGuidedSetupStore();
    const [environment, setEnvironment] = useState<"indoor" | "outdoor">(
        wizardState?.ensemble?.environment || "outdoor",
    );
    const [ensembleType, setEnsembleType] = useState<string>(
        wizardState?.ensemble?.ensemble_type || "Marching Band",
    );

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

    return (
        <div className="flex flex-col gap-16">
            <StaticFormField
                label={<T keyName="wizard.ensemble.environment" />}
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
            </StaticFormField>

            <StaticFormField label={<T keyName="wizard.ensemble.type" />}>
                <Select value={ensembleType} onValueChange={setEnsembleType}>
                    <SelectTriggerButton label={ensembleType} />
                    <SelectContent>
                        {ENSEMBLE_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                                {type}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </StaticFormField>
        </div>
    );
}
