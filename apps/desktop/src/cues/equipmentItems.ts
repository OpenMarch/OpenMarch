/**
 * The Equipment catalog's items in the app (fork #992): each item's 3D View model, and the
 * section items a show's sections hold by default (the 2D field's icons are `equipmentIcons.ts`). The catalog itself
 * (ids, names, families) is core's (`equipmentCatalog`). Pure.
 */
import {
    equipmentCatalog,
    EQUIPMENT_NONE,
    EQUIPMENT_USUAL,
    type CueEquipment,
    type CueValue,
    type EquipmentFamily,
} from "@openmarch/core";
import type { ModelId } from "@/view3d/core/instruments/model";

const PREFIX = "builtin:equipment.";

/** An item's key: "trumpet" for `builtin:equipment.trumpet`. */
export const itemKeyOf = (valueId: string): string | null =>
    valueId.startsWith(PREFIX) ? valueId.slice(PREFIX.length) : null;

/** The value id of the item `key`. */
export const itemValueId = (key: string): string => `${PREFIX}${key}`;

/**
 * Each catalog item's 3D View model. Every item has its own model; a future item without one
 * takes its family's nearest.
 */
export const ITEM_MODEL: Readonly<Record<string, ModelId>> = {
    flag: "flag6",
    swingFlag: "swingFlag",
    doubleSwingFlag: "doubleSwingFlag",
    rifle: "rifle",
    sabre: "sabre",
    trumpet: "trumpet",
    mellophone: "mellophone",
    baritone: "baritone",
    euphonium: "euphonium",
    trombone: "trombone",
    bassTrombone: "bassTrombone",
    tuba: "contra",
    sousaphone: "sousaphone",
    piccolo: "piccolo",
    flute: "flute",
    clarinet: "clarinet",
    bassClarinet: "bassClarinet",
    sopranoSax: "sopranoSax",
    altoSax: "altoSax",
    tenorSax: "tenorSax",
    bariSax: "bariSax",
    snare: "snare",
    tenors: "tenors",
    bassDrum: "bass",
    cymbals: "cymbals",
};

/** The 3D model of an Equipment value, or null for one without a model (Nothing, a fallback). */
export function modelOfValue(valueId: string | null): ModelId | null {
    const key = valueId === null ? null : itemKeyOf(valueId);
    return key ? (ITEM_MODEL[key] ?? null) : null;
}

/** The catalog item a 3D model is, as a value id; null for a model that isn't one. */
export function valueOfModel(model: ModelId): string | null {
    const key = Object.keys(ITEM_MODEL).find((k) => ITEM_MODEL[k] === model);
    return key ? itemValueId(key) : null;
}

/** The catalog, by family, for menus. */
export function catalogByFamily(): readonly {
    family: EquipmentFamily;
    items: readonly CueValue[];
}[] {
    const families: EquipmentFamily[] = [
        "guard",
        "brass",
        "woodwinds",
        "drums",
    ];
    return families.map((family) => ({
        family,
        items: equipmentCatalog(family),
    }));
}

/** The catalog item of a value id, or undefined (Nothing, their own instrument, a fallback). */
export const catalogItem = (valueId: string): CueValue | undefined =>
    equipmentCatalog().find((v) => v.id === valueId);

/** A section's usual equipment as the compile reads it: the catalog item its model is. */
export function sectionEquipment(model: ModelId): CueEquipment | undefined {
    const id = valueOfModel(model);
    const item = id ? catalogItem(id) : undefined;
    if (!item || !item.holds) return undefined;
    return {
        id: item.id,
        name: item.name,
        label: item.label,
        holds: item.holds,
    };
}

export { EQUIPMENT_NONE, EQUIPMENT_USUAL };
