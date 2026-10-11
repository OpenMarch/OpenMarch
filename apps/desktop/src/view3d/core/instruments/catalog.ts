/**
 * Which instrument a section carries and how (docs/3d/instruments.md §3).
 * Sections without a model carry nothing. Pure.
 */
import type { HoldFamily } from "./holds";
import type { GuardModelId, ModelId, ModelOptions } from "./model";

export type Finish = "brass" | "silver";

export interface Carry {
    model: ModelId;
    family: HoldFamily;
    /** Per-marcher options, such as a bass drum's size. */
    options?: ModelOptions;
}

const SECTIONS: Record<string, Carry> = {
    trumpet: { model: "trumpet", family: "brass" },
    mellophone: { model: "mellophone", family: "brass" },
    baritone: { model: "baritone", family: "brass" },
    euphonium: { model: "euphonium", family: "brass" },
    trombone: { model: "trombone", family: "trombone" },
    "bass trombone": { model: "bassTrombone", family: "trombone" },
    tuba: { model: "contra", family: "contra" },
    piccolo: { model: "piccolo", family: "piccolo" },
    flute: { model: "flute", family: "flute" },
    clarinet: { model: "clarinet", family: "clarinet" },
    "bass clarinet": { model: "bassClarinet", family: "bassClarinet" },
    "soprano sax": { model: "sopranoSax", family: "clarinet" },
    "alto sax": { model: "altoSax", family: "sax" },
    "tenor sax": { model: "tenorSax", family: "sax" },
    "bari sax": { model: "bariSax", family: "sax" },
    snare: { model: "snare", family: "snare" },
    tenors: { model: "tenors", family: "tenors" },
    "bass drum": { model: "bass", family: "bass" },
    "flub drum": { model: "bass", family: "bass" },
    cymbals: { model: "cymbals", family: "cymbals" },
    // guard: the 6 ft flag by default; swing flags and the sabre are models
    // a per-section choice selects later (owner, 2026-10-09)
    "color guard": { model: "flag6", family: "flag" },
    flag: { model: "flag6", family: "flag" },
    rifle: { model: "rifle", family: "rifle" },
};

export function carryForSection(section: string): Carry | null {
    return SECTIONS[section.trim().toLowerCase()] ?? null;
}

/** The color guard's equipment, in the order the settings list it. */
export const GUARD_EQUIPMENT: readonly GuardModelId[] = [
    "flag6",
    "swingFlag",
    "doubleSwingFlag",
    "rifle",
    "sabre",
];

/**
 * Carrying one piece of guard equipment: the 6 ft flag uses the flag hold,
 * and every other piece has a hold of its own name.
 */
export function guardCarry(model: GuardModelId): Carry {
    const family: HoldFamily = model === "flag6" ? "flag" : model;
    return { model, family };
}
