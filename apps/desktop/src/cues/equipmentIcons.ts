/**
 * The icon the 2D field draws after a drill number for what a performer holds (fork #992): the
 * section icons (upstream OpenMarch #1071), one per catalog item where a section icon is that
 * item, else the "Other" icon. Pure, so the field, its tests and the guide read the same answers.
 */
import type { CompiledCues } from "@openmarch/core";
import { SECTIONS, getSectionObjectByName } from "@/global/classes/Sections";
import {
    SECTION_ICONS,
    type SectionKey,
} from "@/components/marcher/sectionIcons/SectionIcon";
import { heldValueAt } from "./equipment";
import { itemKeyOf } from "./equipmentItems";

/** An icon the field can draw: a section's, the marching (bell-front) tuba, or the sabre. */
export type EquipmentIconKey = SectionKey | "MarchingTuba" | "Sabre";

/**
 * Each catalog item's icon. Swing flags take the Flag icon, the nearest drawn; the sabre has its
 * own (`SabreIcon`); values without one take "Other" (`ITEMS_WITHOUT_ICON`).
 */
const ITEM_ICON: Readonly<Record<string, EquipmentIconKey>> = {
    flag: "Flag",
    swingFlag: "Flag",
    doubleSwingFlag: "Flag",
    rifle: "Rifle",
    sabre: "Sabre",
    trumpet: "Trumpet",
    mellophone: "Mellophone",
    baritone: "Baritone",
    euphonium: "Euphonium",
    trombone: "Trombone",
    bassTrombone: "BassTrombone",
    // The catalog's tuba is the marching (contra) tuba; SECTION_ICONS.Tuba is the sousaphone
    tuba: "MarchingTuba",
    sousaphone: "Tuba",
    piccolo: "Piccolo",
    flute: "Flute",
    clarinet: "Clarinet",
    bassClarinet: "BassClarinet",
    sopranoSax: "SopranoSax",
    altoSax: "AltoSax",
    tenorSax: "TenorSax",
    bariSax: "BariSax",
    snare: "Snare",
    tenors: "Tenors",
    bassDrum: "BassDrum",
    cymbals: "Cymbals",
};

/** Catalog items and values with no icon of their own: they show "Other". */
export const ITEMS_WITHOUT_ICON: readonly string[] = [
    "none",
    // Older shows' generic values: a wind instrument, a drum
    "winds",
    "battery",
];

/** The icon of an Equipment value (a catalog item, or Nothing for null); "Other" without one. */
export function iconOfValue(valueId: string | null): EquipmentIconKey {
    const key = valueId === null ? "none" : itemKeyOf(valueId);
    return (key && ITEM_ICON[key]) || "Other";
}

/** A section's own icon, by the name stored on a marcher; "Other" for one without an icon. */
export function sectionIconKey(sectionName: string): EquipmentIconKey {
    const section = getSectionObjectByName(sectionName);
    const key = Object.keys(SECTIONS).find((k) => SECTIONS[k] === section);
    // A few front ensemble sections have no icon drawn yet (Timpani, Rack…): Other
    return key && key in SECTION_ICONS ? (key as SectionKey) : "Other";
}

/**
 * Who shows an equipment icon on the field: nobody, only performers holding something other than
 * their own instrument (the default), or everyone, their own instrument included.
 */
export type EquipmentIcons = "off" | "changed" | "everyone";

/**
 * Where an equipment icon goes: after the drill number (the default), centered on the performer's
 * spot instead of their dot, or instead of their drill number (which still shows while they're
 * hovered or selected).
 */
export type EquipmentIconPlace = "beside" | "dot" | "label";

/**
 * Each performer's icon at `count`. A performer holding something other than their section's
 * usual item gets that item's icon; with `everyone`, the others get the icon of what they hold
 * too: their usual item's (a flag for the Color Guard). Only a usual with no item icon of its own
 * (a section without a catalog item, such as Marimba) takes the section's icon.
 */
export function equipmentIconsAt({
    compiled,
    usualValue,
    sectionOf,
    count,
    shown,
}: {
    compiled: CompiledCues;
    usualValue: ReadonlyMap<number, string | null>;
    /** A performer's section name */
    sectionOf: (id: number) => string | undefined;
    count: number;
    shown: EquipmentIcons;
}): Map<number, EquipmentIconKey> {
    const icons = new Map<number, EquipmentIconKey>();
    if (shown === "off") return icons;
    for (const [id, usual] of usualValue) {
        const held = heldValueAt(compiled, id, count);
        if (held !== usual) icons.set(id, iconOfValue(held));
        else if (shown === "everyone") {
            const own = iconOfValue(usual);
            icons.set(
                id,
                own !== "Other" ? own : sectionIconKey(sectionOf(id) ?? ""),
            );
        }
    }
    return icons;
}

/** A stable key for an icon map, so a hook only hands out a new map when an icon changes. */
export const iconsKey = (icons: ReadonlyMap<number, EquipmentIconKey>) =>
    [...icons].map(([id, icon]) => `${id}${icon}`).join(",");
