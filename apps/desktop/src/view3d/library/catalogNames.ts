/**
 * Size catalog names in the app's language (docs/3d/props-spec.md §3). The catalog
 * (`view3d/core/sizes`) names its entries in English and is shared with the main process, so
 * it can't translate; the renderer words the entries it shows here, at display time, from
 * their stable ids. Resolved on each call: call these where the text is shown.
 */
import tolgee from "@/global/singletons/Tolgee";
import {
    catalogEntry,
    chipDims,
    type AspectSizeChip,
    type SizeKind,
} from "@/view3d/core/sizes";

/**
 * The entries the UI names (the Artwork template menu and the import's size chips: silk Cuts,
 * floors and flat props), by id, to their key under `view3d.catalog.entry`.
 */
const ENTRY_KEYS: Readonly<Record<string, string>> = {
    "silk-5ft-30x46": "silk5ftPole",
    "silk-5.5ft-33x50": "silk5_5ftPole",
    "silk-6ft-36x54": "silk6ftPole",
    "silk-7ft-42x60": "silk7ftPole",
    "silk-standard-36x56": "silkStandard",
    "silk-oversized-42x67": "silkOversized",
    "silk-teardrop-44x74": "silkTeardrop",
    "silk-swing-44x66": "silkSwing",
    "silk-super-swing-44x84": "silkSuperSwing",
    "silk-oversized-swing-56x84": "silkOversizedSwing",
    "silk-arc-45x96": "silkArc",
    "silk-narrow-arc-44x94": "silkNarrowArc",
    "silk-super-arc-54x100": "silkSuperArc",
    "floor-wgi-minimum-60x90ft": "floorWgiMinimum",
    "floor-wgi-maximum-78x106ft": "floorWgiMaximum",
    "flat-prop-4x8ft": "flatProp4x8ft",
};

/** A catalog entry's name ("6 ft pole silk"); undefined for an id the catalog doesn't have. */
export function catalogEntryName(id: string): string | undefined {
    const entry = catalogEntry(id);
    if (!entry) return undefined;
    const key = ENTRY_KEYS[id];
    return key
        ? tolgee.t(`view3d.catalog.entry.${key}`, entry.name)
        : entry.name;
}

function kindName(kind: SizeKind): string | undefined {
    switch (kind) {
        case "silk":
            return tolgee.t("view3d.catalog.kind.silk", "Silk");
        case "floor":
            return tolgee.t("view3d.catalog.kind.floor", "Floor");
        case "flatProp":
            return tolgee.t("view3d.catalog.kind.flatProp", "Flat prop");
        default:
            return undefined;
    }
}

/**
 * A size chip's label ("Silk 36 × 54 in"), which the main process words in English
 * (`catalogSizesForAspect`); the chip's own label for a kind the UI doesn't name.
 */
export function sizeChipLabel(chip: AspectSizeChip): string {
    const entry = catalogEntry(chip.catalogId);
    const kind = entry && kindName(entry.kind);
    if (!kind) return chip.label;
    return tolgee.t("view3d.catalog.chip", "{kind} {size}", {
        kind,
        size: chipDims(chip.width, chip.height),
    });
}
