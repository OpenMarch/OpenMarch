/**
 * The sections the cue compile gives a usual equipment: each section whose performers all carry
 * the same flag (ADR 0004). Every compile caller passes `cueSectionsOf` as `sections`, so the
 * Carry default is the same wherever the show is compiled.
 */
import type { CueEquipment, CueSection } from "@openmarch/core";
import type { HoldFamily } from "@/view3d/core/instruments/holds";

type FlagFamily = Extract<HoldFamily, "flag" | "swingFlag" | "doubleSwingFlag">;

/** The 3D View's flags (`instruments/guard.ts`). */
const FLAGS: Readonly<Record<FlagFamily, { id: string; name: string }>> = {
    flag: { id: "builtin:model.flag6", name: "6 ft flag" },
    swingFlag: { id: "builtin:model.swingFlag", name: "Swing flag" },
    doubleSwingFlag: {
        id: "builtin:model.doubleSwingFlag",
        name: "Double swing flags",
    },
};

/** The equipment a flag family is; undefined for any other family. */
export function flagEquipmentOf(
    family: HoldFamily | null,
): CueEquipment | undefined {
    const flag = family ? FLAGS[family as FlagFamily] : undefined;
    if (!flag) return undefined;
    return { id: flag.id, name: flag.name, label: "Flag", holds: "flag" };
}

/**
 * Each section whose performers all carry the same flag, with that flag as
 * its usual equipment. Other sections are left out, so their Carry default
 * stays what each marcher carries.
 */
export function cueSectionsOf(
    marchers: readonly { section: string; family: HoldFamily | null }[],
): CueSection[] {
    const families = new Map<string, Set<HoldFamily | null>>();
    for (const { section, family } of marchers) {
        const key = section.trim().toLowerCase();
        const set = families.get(key) ?? new Set();
        set.add(family);
        families.set(key, set);
    }
    const out: CueSection[] = [];
    const seen = new Set<string>();
    for (const { section } of marchers) {
        const key = section.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const set = families.get(key)!;
        if (set.size !== 1) continue;
        const equipment = flagEquipmentOf([...set][0] ?? null);
        if (equipment) out.push({ name: section, equipment });
    }
    return out;
}
