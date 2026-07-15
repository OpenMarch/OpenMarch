import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { WizardFormField } from "@/components/ui/FormField";
import { useTranslate } from "@tolgee/react";
import { ACTIVITY_LABELS, DEFAULT_ACTIVITY } from "@/global/classes/Activities";
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

    const hasSyncedInitial = useRef(ensemble !== null);
    useEffect(() => {
        if (hasSyncedInitial.current) return;
        hasSyncedInitial.current = true;
        onChange({ activity });
    }, [activity, onChange]);

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-16">
            <WizardFormField
                label={t("launchpage.newShow.steps.ensemble.typeLabel")}
            >
                <Select
                    value={activity}
                    onValueChange={(next) => {
                        setActivity(next);
                        onChange({ activity: next });
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
        </div>
    );
}
