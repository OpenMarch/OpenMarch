import type { FieldProperties } from "@openmarch/core";
import type { ApplyPitPresetArgs } from "@/db-functions/pitPreset";
import { pitVariant, type PitFamilyId } from "@/view3d/core/pit/catalog";
import {
    pitPreset,
    pitPresetOnCanvas,
    type PitPresetSize,
} from "@/view3d/core/pit/presets";

/**
 * What applying the `size` preset to a show on `field` writes (`applyPitPreset`): its equipment,
 * named "<family name> <n>", on field from `beatId` (the show's first beat, so the pit is there
 * all show), and with `addPerformers` a player for each instrument and a drum major on the podium.
 * The Front ensemble panel and a new show's "Front ensemble?" question both apply presets this way.
 */
export function pitPresetApplyArgs({
    size,
    field,
    beatId,
    addPerformers,
    familyName,
}: {
    size: PitPresetSize;
    field: FieldProperties;
    beatId: number;
    addPerformers: boolean;
    /** The family's name in the app's language (`pit.family.<id>`) */
    familyName: (family: PitFamilyId) => string;
}): ApplyPitPresetArgs {
    const placed = pitPresetOnCanvas(pitPreset(size), field);
    return {
        beatId,
        equipment: placed.equipment.map((e) => ({
            variant: pitVariant(e.variantId)!,
            baseName: familyName(e.familyId),
            home: e.home,
            rotation: e.rotation,
        })),
        performers: addPerformers
            ? placed.performers.map(({ section, home }) => ({ section, home }))
            : [],
        performerReach: placed.reach,
    };
}
