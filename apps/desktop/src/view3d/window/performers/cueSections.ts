/**
 * The sections the cue compile gives a usual equipment (ADR 0015 D-6; fork #992): each section
 * whose performers all carry the same model holds that model's catalog item (a trumpet, a 6 ft
 * flag, a rifle). Every compile caller passes `cueSectionsOf` as `sections`, so the Equipment
 * default is the same wherever the show is compiled.
 */
import type { CueSection } from "@openmarch/core";
import type { ModelId } from "@/view3d/core/instruments/model";
import { sectionEquipment } from "@/cues/equipmentItems";

/**
 * Each section whose performers all carry one model, with that model's catalog item as its usual
 * equipment. Other sections are left out, so their Equipment default stays what each marcher
 * carries.
 */
export function cueSectionsOf(
    marchers: readonly { section: string; model: ModelId | null }[],
): CueSection[] {
    const models = new Map<string, Set<ModelId | null>>();
    for (const { section, model } of marchers) {
        const key = section.trim().toLowerCase();
        const set = models.get(key) ?? new Set();
        set.add(model);
        models.set(key, set);
    }
    const out: CueSection[] = [];
    const seen = new Set<string>();
    for (const { section } of marchers) {
        const key = section.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const set = models.get(key)!;
        if (set.size !== 1) continue;
        const model = [...set][0];
        const equipment = model ? sectionEquipment(model) : undefined;
        if (equipment) out.push({ name: section, equipment });
    }
    return out;
}
