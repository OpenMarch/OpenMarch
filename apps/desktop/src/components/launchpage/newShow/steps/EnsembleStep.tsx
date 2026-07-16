import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { WizardFormField } from "@/components/ui/FormField";
import { useTranslate } from "@tolgee/react";
import { ACTIVITY_LABELS, DEFAULT_ACTIVITY } from "@/global/classes/Activities";
import {
    ENSEMBLE_SIZES,
    DEFAULT_ENSEMBLE_SIZE,
    getEnsemblePresetTotal,
    type EnsembleSize,
} from "@/global/classes/EnsembleTemplates";
import type { NewShowEnsembleData } from "../../newShowTypes";
import { useEffect, useRef, useState } from "react";

interface EnsembleStepProps {
    ensemble: NewShowEnsembleData | null;
    onChange: (ensemble: NewShowEnsembleData) => void;
}

export default function EnsembleStep({
    ensemble,
    onChange,
}: EnsembleStepProps) {
    const { t } = useTranslate();
    const [activity, setActivity] = useState(
        ensemble?.activity ?? DEFAULT_ACTIVITY,
    );
    const [size, setSize] = useState<EnsembleSize>(
        ensemble?.size ?? DEFAULT_ENSEMBLE_SIZE,
    );

    const hasSyncedInitial = useRef(ensemble !== null);
    useEffect(() => {
        if (hasSyncedInitial.current) return;
        hasSyncedInitial.current = true;
        onChange({ activity, size });
    }, [activity, size, onChange]);

    // Size label with the preset's approximate performer count, tilde signals it is editable
    const sizeOptionLabel = (option: EnsembleSize) => {
        const label = t(
            `launchpage.newShow.steps.ensemble.size.${option.toLowerCase()}`,
        );
        const total = getEnsemblePresetTotal(activity, option);
        return total > 0
            ? t("launchpage.newShow.steps.ensemble.sizeOption", {
                  label,
                  count: total,
              })
            : label;
    };

    return (
        <div className="mx-auto flex w-full max-w-lg flex-row gap-16">
            <WizardFormField
                className="flex-1"
                label={t("launchpage.newShow.steps.ensemble.typeLabel")}
            >
                <Select
                    value={activity}
                    onValueChange={(next) => {
                        setActivity(next);
                        onChange({ activity: next, size });
                    }}
                >
                    <SelectTriggerButton label={activity} />
                    <SelectContent>
                        {ACTIVITY_LABELS.map((label) => (
                            <SelectItem key={label} value={label}>
                                {label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </WizardFormField>
            <WizardFormField
                className="flex-1"
                label={t("launchpage.newShow.steps.ensemble.sizeLabel")}
            >
                <Select
                    value={size}
                    onValueChange={(next) => {
                        const nextSize = next as EnsembleSize;
                        setSize(nextSize);
                        onChange({ activity, size: nextSize });
                    }}
                >
                    <SelectTriggerButton label={sizeOptionLabel(size)} />
                    <SelectContent>
                        {ENSEMBLE_SIZES.map((option) => (
                            <SelectItem key={option} value={option}>
                                {sizeOptionLabel(option)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </WizardFormField>
        </div>
    );
}
