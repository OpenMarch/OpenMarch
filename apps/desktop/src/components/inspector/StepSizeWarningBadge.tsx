import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipClassName } from "@openmarch/ui";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useTolgee } from "@tolgee/react";

// Small red warning icon with a tooltip shown when a step size exceeds the field threshold
export default function StepSizeWarningBadge({ over }: { over: boolean }) {
    const { t } = useTolgee();
    if (!over) return null;
    const label = t("inspector.marcher.stepSizeWarning");
    return (
        <Tooltip.TooltipProvider>
            <Tooltip.Root>
                <Tooltip.Trigger type="button">
                    <WarningCircleIcon
                        size={16}
                        weight="fill"
                        className="text-red"
                        aria-label={label}
                    />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                    <Tooltip.Content className={TooltipClassName} side="right">
                        {label}
                    </Tooltip.Content>
                </Tooltip.Portal>
            </Tooltip.Root>
        </Tooltip.TooltipProvider>
    );
}
