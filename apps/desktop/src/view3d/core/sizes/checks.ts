/**
 * Size checks: per-kind plausible model sizes (docs/3d/props-spec.md §3
 * "Models") and the soft "WGI" warnings (§3 "Catalog", ADR 0002 D-16).
 * Both are quiet notes, never blocks (D-22).
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
// cspell:words wgi
import { WGI_RULES_2026, type CatalogSource } from "./catalog";
import { toMeters } from "./units";

/** What an imported model is (props-spec.md §2 "Kind"). */
export type ModelKind =
    | "prop"
    | "equipment"
    | "garment"
    | "floorProp"
    | "baseFloor";

export interface SizeRange {
    readonly minM: number;
    readonly maxM: number;
}

/**
 * The plausible size of a model's largest bounding-box dimension, in meters.
 * Equipment's 0.3 to 3 m is the spec's; the others are provisional, like the
 * triangle caps, and bracket the catalog: a hat to a gown for Garments, a
 * small box to a stage set for Props, a vinyl strip to the WGI maximum floor
 * (32.3 m long) for floors.
 */
export const PLAUSIBLE_SIZE: Readonly<Record<ModelKind, SizeRange>> = {
    equipment: { minM: 0.3, maxM: 3 },
    garment: { minM: 0.1, maxM: 2.5 },
    prop: { minM: 0.1, maxM: 20 },
    floorProp: { minM: 0.3, maxM: 40 },
    baseFloor: { minM: 3, maxM: 40 },
};

export function isPlausibleSize(kind: ModelKind, largestM: number): boolean {
    const { minM, maxM } = PLAUSIBLE_SIZE[kind];
    return largestM >= minM && largestM <= maxM;
}

/** The unit conversions the importer offers, in the spec's order (×0.01 cm, ×0.0254 in, ×0.3048 ft). */
export const MODEL_UNIT_CONVERSIONS = [
    { unit: "cm", factor: 0.01 },
    { unit: "in", factor: 0.0254 },
    { unit: "ft", factor: 0.3048 },
] as const;

export type ModelUnitConversion = (typeof MODEL_UNIT_CONVERSIONS)[number];

/**
 * The conversions that bring an out-of-range model into its kind's range, in
 * the spec's order. Empty when the size is already plausible, or when none
 * fits (then the size is flagged). Never applied here.
 */
export function conversionsIntoRange(
    kind: ModelKind,
    largestM: number,
): ModelUnitConversion[] {
    if (isPlausibleSize(kind, largestM)) return [];
    return MODEL_UNIT_CONVERSIONS.filter((c) =>
        isPlausibleSize(kind, largestM * c.factor),
    );
}

// ---------------------------------------------------------------- WGI

/** WGI's minimum length for flagpoles, rifles and sabres (2026 rules §4.2). */
export const WGI_MIN_EQUIPMENT_M = toMeters(24, "in");
/** WGI's maximum competition area, 78 × 106 ft (2026 rules §2.1). */
export const WGI_MAX_FLOOR_M = {
    short: toMeters(78, "ft"),
    long: toMeters(106, "ft"),
} as const;

export interface WgiNote {
    readonly tag: "WGI";
    readonly code: "equipmentUnderMinimum" | "floorOverMaximum";
    readonly source: CatalogSource;
}

/** A soft note when equipment is shorter than 24 in. */
export function equipmentWgiNote(lengthM: number): WgiNote | null {
    return lengthM < WGI_MIN_EQUIPMENT_M
        ? { tag: "WGI", code: "equipmentUnderMinimum", source: WGI_RULES_2026 }
        : null;
}

/** A soft note when a floor doesn't fit inside 78 × 106 ft, either way round. */
export function floorWgiNote(widthM: number, depthM: number): WgiNote | null {
    const short = Math.min(widthM, depthM);
    const long = Math.max(widthM, depthM);
    return short > WGI_MAX_FLOOR_M.short || long > WGI_MAX_FLOOR_M.long
        ? { tag: "WGI", code: "floorOverMaximum", source: WGI_RULES_2026 }
        : null;
}
