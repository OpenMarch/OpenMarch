import { useTranslate } from "@tolgee/react";
import type { PitVariant } from "@/view3d/core/pit/catalog";

/** A variant's label: its parts joined, or the family's name for a family with one model */
export function usePitVariantLabel(): (variant: PitVariant) => string {
    const { t } = useTranslate();
    return (variant) =>
        variant.label.length > 0
            ? variant.label.map((part) => t(part.key, part.params)).join(" · ")
            : t(`pit.family.${variant.family}`);
}
