import { WarningCircleIcon } from "@phosphor-icons/react";
import { useTolgee } from "@tolgee/react";
import InfoTip, { InfoTipButton } from "@/components/ui/InfoTip";

// Small red warning icon with a tip shown when a step size exceeds the field threshold
export default function StepSizeWarningBadge({ over }: { over: boolean }) {
    const { t } = useTolgee();
    if (!over) return null;
    const label = t("inspector.marcher.stepSizeWarning");
    return (
        <InfoTip content={label}>
            <InfoTipButton
                aria-label={label}
                icon={
                    <WarningCircleIcon
                        size={16}
                        weight="fill"
                        className="text-red"
                        aria-hidden
                    />
                }
            />
        </InfoTip>
    );
}
