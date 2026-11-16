import { useTranslate } from "@tolgee/react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerCompact,
} from "@openmarch/ui";
import { runAction } from "@/shortcuts/registry";
import { holdStyleActionOf } from "@/shortcuts/handlers/useHoldActionHandlers";
import { HOLD_STYLES, holdStyleOf, type HoldStyle } from "@/timeline/holdStyle";
import { useSelectionHoldStyle } from "@/timeline/useHoldStyle";

/** The choice's value for a hold with no style of its own (the show setting) */
const SHOW_SETTING = "default";
/** Its value where the selected holds differ; never offered as a choice */
const MIXED = "mixed";

/**
 * The marcher inspector's **Hold style** choice (ADR 0015 D-5; fork #775), under the hold line:
 * what the selected marchers' feet do over the Held hold the playhead is in, for the 3D View. The
 * show setting, or the hold's own style, which wins over it: stand, mark time or high mark time.
 * Shown only while a selected marcher is Held there, since only a stored Held hold carries a
 * style; with some of the selection Held, it sets those marchers' holds.
 *
 * It runs the hold style actions (`useHoldActionHandlers`), as the field menu and the command
 * palette do.
 */
export default function TimelineHoldStyle({
    marcherIds,
}: {
    marcherIds: readonly number[];
}) {
    const { t } = useTranslate();
    const { held, style } = useSelectionHoldStyle(marcherIds);
    if (held === 0 || style === undefined) return null;
    const label = t("inspector.marcher.timeline.holdStyle.label", {
        defaultValue: "Hold style",
    });
    const names: Record<HoldStyle, string> = {
        stand: t("inspector.marcher.timeline.holdStyle.stand", {
            defaultValue: "Stand",
        }),
        markTime: t("inspector.marcher.timeline.holdStyle.markTime", {
            defaultValue: "Mark time",
        }),
        highMarkTime: t("inspector.marcher.timeline.holdStyle.highMarkTime", {
            defaultValue: "High mark time",
        }),
    };
    return (
        <div
            className="flex items-center justify-between gap-6 px-6"
            data-testid="timeline-hold-style"
        >
            <span className="text-body leading-none opacity-80">{label}</span>
            <Select
                value={style ?? SHOW_SETTING}
                onValueChange={(next) => {
                    if (next !== MIXED)
                        runAction(holdStyleActionOf(holdStyleOf(next)));
                }}
            >
                <SelectTriggerCompact label={label} />
                <SelectContent>
                    {style === MIXED && (
                        <SelectItem value={MIXED} disabled>
                            {t("inspector.marcher.timeline.holdStyle.mixed", {
                                defaultValue: "Mixed",
                            })}
                        </SelectItem>
                    )}
                    <SelectItem value={SHOW_SETTING}>
                        {t("inspector.marcher.timeline.holdStyle.default", {
                            defaultValue: "Show setting",
                        })}
                    </SelectItem>
                    {HOLD_STYLES.map((option) => (
                        <SelectItem key={option} value={option}>
                            {names[option]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
