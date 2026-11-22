import { useMutation, useQueryClient } from "@tanstack/react-query";
import { T, useTranslate } from "@tolgee/react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerCompact,
} from "@openmarch/ui";
import { updateItemsMutationOptions } from "@/hooks/queries/useItems";
import type { ItemWithMarcher } from "@/components/items/ItemRows";
import {
    pitFamily,
    pitVariant,
    pitVariantsOf,
} from "@/view3d/core/pit/catalog";
import { usePitVariantLabel } from "./usePitVariantLabel";

/**
 * An equipment item's built-in model: another variant of its family, which resizes its Outline to
 * the new model's footprint, in one undo step. Nothing for a prop or a block.
 */
export default function EquipmentModelControl({
    item,
}: {
    item: ItemWithMarcher;
}) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const updateItems = useMutation(updateItemsMutationOptions(queryClient));
    const label = usePitVariantLabel();
    const variant = item.kind === "equipment" ? pitVariant(item.model) : null;
    const family = pitFamily(item.model);
    if (!variant || !family) return null;
    const variants = pitVariantsOf(family.id);
    return (
        <label className="text-body flex flex-col gap-4">
            <span className="text-text/70">
                <T
                    keyName="frontEnsemble.equipment.model"
                    params={{ family: t(family.labelKey) }}
                />
            </span>
            <Select
                value={variant.modelId}
                disabled={variants.length < 2}
                onValueChange={(modelId) => {
                    const next = variants.find((v) => v.modelId === modelId);
                    if (!next || next === variant) return;
                    updateItems.mutate([
                        {
                            itemId: item.id,
                            model: next.modelId,
                            footprint: next.footprint,
                        },
                    ]);
                }}
            >
                <SelectTriggerCompact label={label(variant)} />
                <SelectContent>
                    {variants.map((v) => (
                        <SelectItem key={v.modelId} value={v.modelId}>
                            {label(v)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </label>
    );
}
