/**
 * Which instrument a section carries and how (docs/3d/instruments.md §3).
 * Sections without a model carry nothing. Pure.
 */
import type { HoldFamily } from "./holds";
import type { GuardModelId, ModelId, ModelOptions } from "./model";

/** A horn's plating: clear gold lacquer over brass ("brass"), or silver plate. */
export type Finish = "brass" | "silver";
export const FINISHES: readonly Finish[] = ["brass", "silver"];

/** What the Tuba section carries: the marching tuba on the shoulder, or a sousaphone. */
export type TubaModelId = "contra" | "sousaphone";
export const TUBA_MODELS: readonly TubaModelId[] = ["contra", "sousaphone"];

export interface Carry {
    model: ModelId;
    family: HoldFamily;
    /** Per-marcher options, such as a bass drum's size. */
    options?: ModelOptions;
}

const SECTIONS: Record<string, Carry> = {
    trumpet: { model: "trumpet", family: "trumpet" },
    mellophone: { model: "mellophone", family: "mellophone" },
    baritone: { model: "baritone", family: "baritone" },
    euphonium: { model: "euphonium", family: "euphonium" },
    trombone: { model: "trombone", family: "trombone" },
    "bass trombone": { model: "bassTrombone", family: "bassTrombone" },
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

/** The Tuba section carrying `model`: each has a hold of its own name. */
export function tubaCarry(model: TubaModelId): Carry {
    return { model, family: model };
}

/** Whether a section is the tubas, whose horn the show chooses. */
export function isTuba(section: string): boolean {
    return SECTIONS[section.trim().toLowerCase()]?.model === "contra";
}

const BRASS_FAMILIES: ReadonlySet<HoldFamily> = new Set<HoldFamily>([
    "trumpet",
    "mellophone",
    "baritone",
    "euphonium",
    "trombone",
    "bassTrombone",
    "contra",
    "sousaphone",
]);
const SILVER_WOODWINDS: ReadonlySet<ModelId> = new Set<ModelId>([
    "piccolo",
    "flute",
]);

/**
 * The finish a carried instrument draws in. The show's choice plates the
 * brass line; woodwinds keep the finish they are made in (silver flutes
 * and piccolos, lacquered saxophones), whatever the brass wear.
 */
export function finishFor(carry: Carry | null, brass: Finish): Finish {
    if (!carry) return "brass";
    if (BRASS_FAMILIES.has(carry.family)) return brass;
    return SILVER_WOODWINDS.has(carry.model) ? "silver" : "brass";
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
