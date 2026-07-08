import { useEffect, useMemo, useRef, useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
    RadioGroup,
    RadioGroupItem,
} from "@openmarch/ui";
import { WizardFormField } from "@/components/ui/FormField";
import { T, useTranslate } from "@tolgee/react";
import type {
    NewShowEnsembleData,
    NewShowEnvironment,
} from "../../newShowTypes";
import { SOUNDSPORT_ENSEMBLE_TYPE } from "./getDefaultFieldTemplate";

const INDOOR_ENSEMBLE_TYPES = [
    "Indoor Percussion",
    "Indoor Winds",
    "Winter Guard",
    "Other",
];

const OUTDOOR_ENSEMBLE_TYPES = [
    "Marching Band",
    "Drum Corps",
    SOUNDSPORT_ENSEMBLE_TYPE,
    "Other",
];

interface EnsembleStepProps {
    ensemble: NewShowEnsembleData | null;
    onChange: (ensemble: NewShowEnsembleData) => void;
}

export default function EnsembleStep({
    ensemble,
    onChange,
}: EnsembleStepProps) {
    const { t } = useTranslate();
    const [environment, setEnvironment] = useState<NewShowEnvironment>(
        ensemble?.environment ?? "outdoor",
    );
    const availableTypes = useMemo(
        () =>
            environment === "indoor"
                ? INDOOR_ENSEMBLE_TYPES
                : OUTDOOR_ENSEMBLE_TYPES,
        [environment],
    );
    const [ensembleType, setEnsembleType] = useState(
        ensemble?.ensemble_type ?? OUTDOOR_ENSEMBLE_TYPES[0],
    );

    useEffect(() => {
        if (!availableTypes.includes(ensembleType)) {
            setEnsembleType(availableTypes[0]);
        }
    }, [availableTypes, ensembleType]);

    const hasSyncedInitial = useRef(ensemble !== null);
    useEffect(() => {
        if (hasSyncedInitial.current) return;
        hasSyncedInitial.current = true;
        onChange({ environment, ensemble_type: ensembleType });
    }, [environment, ensembleType, onChange]);

    const emitChange = (
        env: NewShowEnvironment,
        type: string = ensembleType,
    ) => {
        onChange({ environment: env, ensemble_type: type });
    };

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-16">
            <WizardFormField label={t("launchpage.newShow.environment")}>
                <RadioGroup
                    value={environment}
                    onValueChange={(v) => {
                        const env = v as NewShowEnvironment;
                        const types =
                            env === "indoor"
                                ? INDOOR_ENSEMBLE_TYPES
                                : OUTDOOR_ENSEMBLE_TYPES;
                        const nextType = types.includes(ensembleType)
                            ? ensembleType
                            : types[0];
                        setEnvironment(env);
                        if (nextType !== ensembleType) {
                            setEnsembleType(nextType);
                        }
                        emitChange(env, nextType);
                    }}
                    className="flex flex-row gap-16"
                >
                    <RadioGroupItem value="outdoor">
                        <T keyName="launchpage.newShow.outdoor" />
                    </RadioGroupItem>
                    <RadioGroupItem value="indoor">
                        <T keyName="launchpage.newShow.indoor" />
                    </RadioGroupItem>
                </RadioGroup>
            </WizardFormField>
            <WizardFormField
                label={t("launchpage.newShow.steps.ensemble.typeLabel")}
            >
                <Select
                    value={ensembleType}
                    onValueChange={(type) => {
                        setEnsembleType(type);
                        emitChange(environment, type);
                    }}
                >
                    <SelectTriggerButton label={ensembleType} />
                    <SelectContent>
                        {availableTypes.map((type) => (
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
