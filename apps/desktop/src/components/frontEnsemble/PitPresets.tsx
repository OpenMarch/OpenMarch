import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { T, useTranslate } from "@tolgee/react";
import { Button, Checkbox, SegmentedTextSwitch } from "@openmarch/ui";
import { useTimingObjects } from "@/hooks";
import { fieldPropertiesQueryOptions } from "@/hooks/queries";
import {
    allItemsQueryOptions,
    applyPitPresetMutationOptions,
} from "@/hooks/queries/useItems";
import { POPOVER_CLASS } from "@/components/ui/popupClasses";
import {
    PIT_PRESET_SIZES,
    type PitPresetSize,
} from "@/view3d/core/pit/presets";
import { pitPresetApplyArgs } from "./pitPresetArgs";

/**
 * The Front ensemble's Small, Medium and Large presets (instruments.md section 6), behind one
 * small button so they don't crowd out adding equipment (owner, 2026-11-15): "Start from a
 * preset" in a show with no pit, "Reset to preset" once it has one. Its popover picks a size and
 * applies it, in front of the front sideline at the 50, as one undo step. It replaces the
 * equipment the previous preset added, and with "Also add performers" adds a player for each
 * instrument and a drum major on the podium, skipping performers the show already has.
 */
export default function PitPresets() {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [size, setSize] = useState<PitPresetSize>("medium");
    const [addPerformers, setAddPerformers] = useState(true);
    const { data: field } = useQuery(fieldPropertiesQueryOptions());
    const { data: items } = useQuery(allItemsQueryOptions());
    const { beats } = useTimingObjects()!;
    const apply = useMutation(applyPitPresetMutationOptions(queryClient));
    const hasPit = items?.some((item) => item.kind === "equipment") ?? false;
    const hasPreset = items?.some((item) => item.from_preset) ?? false;
    const firstBeat = beats[0];

    const onApply = () => {
        if (!field || !firstBeat) return;
        apply.mutate(
            pitPresetApplyArgs({
                size,
                field,
                beatId: firstBeat.id,
                addPerformers,
                familyName: (family) => t(`pit.family.${family}`),
            }),
            { onSuccess: () => setOpen(false) },
        );
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <Button
                    size="compact"
                    variant="secondary"
                    data-testid="pit-presets-button"
                >
                    {hasPit
                        ? t("frontEnsemble.presets.reset")
                        : t("frontEnsemble.presets.start")}
                </Button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    align="end"
                    sideOffset={8}
                    className={`${POPOVER_CLASS} z-50 flex w-[20rem] flex-col gap-8`}
                    aria-label={t("frontEnsemble.presets.title")}
                >
                    <SegmentedTextSwitch
                        ariaLabel={t("frontEnsemble.presets.size")}
                        className="self-start"
                        options={PIT_PRESET_SIZES.map((value) => ({
                            value,
                            label: t(`frontEnsemble.presets.${value}`),
                            testId: `pit-preset-${value}`,
                        }))}
                        selected={size}
                        setSelected={(value) => setSize(value as PitPresetSize)}
                    />
                    <div className="text-sub text-text-subtitle flex flex-col gap-4">
                        <p>{t(`frontEnsemble.presets.summary.${size}`)}</p>
                        <p>
                            <T keyName="frontEnsemble.presets.always" />
                        </p>
                    </div>
                    <label className="text-body flex items-center gap-8">
                        <Checkbox
                            checked={addPerformers}
                            onCheckedChange={(checked) =>
                                setAddPerformers(checked === true)
                            }
                        />
                        <T keyName="frontEnsemble.presets.addPerformers" />
                    </label>
                    {hasPreset && (
                        <p className="text-sub text-text-subtitle">
                            <T keyName="frontEnsemble.presets.replaces" />
                        </p>
                    )}
                    <Button
                        size="compact"
                        className="self-end"
                        disabled={!field || !firstBeat || apply.isPending}
                        onClick={onApply}
                    >
                        <T keyName="frontEnsemble.presets.apply" />
                    </Button>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
