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
import PitPresetCards, { PitPresetContents } from "./PitPresetCards";

/**
 * Applies a preset in front of the front sideline at the 50, as one undo step. It replaces the
 * equipment the previous preset added, and with `addPerformers` adds a player for each instrument
 * and a drum major on the podium, skipping performers the show already has. `canApply` is false
 * until the field and the first beat have loaded, or while a preset is being applied.
 */
function usePitPresetApply() {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const { data: field } = useQuery(fieldPropertiesQueryOptions());
    const { beats } = useTimingObjects()!;
    const mutation = useMutation(applyPitPresetMutationOptions(queryClient));
    const firstBeat = beats[0];
    const apply = (
        size: PitPresetSize,
        addPerformers: boolean,
        onSuccess?: () => void,
    ) => {
        if (!field || !firstBeat) return;
        mutation.mutate(
            pitPresetApplyArgs({
                size,
                field,
                beatId: firstBeat.id,
                addPerformers,
                familyName: (family) => t(`pit.family.${family}`),
            }),
            { onSuccess },
        );
    };
    return {
        apply,
        canApply: !!field && !!firstBeat && !mutation.isPending,
    };
}

/** "Also add performers", checked by default */
function AddPerformersCheckbox({
    checked,
    onChange,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="text-body flex items-center gap-8">
            <Checkbox
                checked={checked}
                onCheckedChange={(next) => onChange(next === true)}
            />
            <T keyName="frontEnsemble.presets.addPerformers" />
        </label>
    );
}

/**
 * The empty front ensemble view's first choice (owner, 2026-11-22: a lone "Start from a preset"
 * button looked lost in an empty panel, and two Add buttons hid that there are two ways to
 * start): Small, Medium and Large as pictured rows listing what each places, "Also add performers"
 * and "Use this preset".
 */
export function PitPresetStart() {
    const { t } = useTranslate();
    const [size, setSize] = useState<PitPresetSize>("medium");
    const [addPerformers, setAddPerformers] = useState(true);
    const { apply, canApply } = usePitPresetApply();
    return (
        <section
            className="flex flex-col gap-12"
            aria-label={t("frontEnsemble.presets.title")}
            data-testid="pit-preset-start"
        >
            <h4 className="text-body font-medium">
                <T keyName="frontEnsemble.presets.start" />
            </h4>
            <PitPresetCards
                value={size}
                onChange={(next) => next && setSize(next)}
                includeNone={false}
                aria-label={t("frontEnsemble.presets.size")}
            />
            <div className="flex items-center justify-between gap-12">
                <AddPerformersCheckbox
                    checked={addPerformers}
                    onChange={setAddPerformers}
                />
                <Button
                    size="compact"
                    disabled={!canApply}
                    onClick={() => apply(size, addPerformers)}
                >
                    <T keyName="frontEnsemble.presets.use" />
                </Button>
            </div>
        </section>
    );
}

/**
 * The Front ensemble's Small, Medium and Large presets (instruments.md section 6), behind one
 * small "Reset to preset" button in the header once the show has a pit, so they don't crowd out
 * adding equipment (owner, 2026-11-15). An empty show shows them in the view itself
 * (`PitPresetStart`). Its popover picks a size and applies it (`usePitPresetApply`).
 */
export default function PitPresets() {
    const { t } = useTranslate();
    const [open, setOpen] = useState(false);
    const [size, setSize] = useState<PitPresetSize>("medium");
    const [addPerformers, setAddPerformers] = useState(true);
    const { data: items } = useQuery(allItemsQueryOptions());
    const { apply, canApply } = usePitPresetApply();
    const hasPit = items?.some((item) => item.kind === "equipment") ?? false;
    const hasPreset = items?.some((item) => item.from_preset) ?? false;

    const onApply = () => apply(size, addPerformers, () => setOpen(false));

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
                    <PitPresetContents size={size} />
                    <AddPerformersCheckbox
                        checked={addPerformers}
                        onChange={setAddPerformers}
                    />
                    {hasPreset && (
                        <p className="text-sub text-text-subtitle">
                            <T keyName="frontEnsemble.presets.replaces" />
                        </p>
                    )}
                    <Button
                        size="compact"
                        className="self-end"
                        disabled={!canApply}
                        onClick={onApply}
                    >
                        <T keyName="frontEnsemble.presets.apply" />
                    </Button>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
