/**
 * The silk shapes a designer picks from (fork #973): the owner's reference
 * chart of common guard silk shapes, in the chart's order, each drawn by a
 * catalog Cut (`./silkCuts`) at that Cut's catalog size. The chart's
 * Standard is the curve family with the recommended sag and its Rectangle
 * the 6 ft pole silk with none (Q40); its C-swing is the super swing. The
 * swing flag's own Cut comes last, so a show can put it on the 6 ft flag too.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
// cspell:words teardrop
import { catalogDims, catalogEntry, type CatalogEntryOf } from "./catalog";
import {
    CUT_FROM_SHAPE_CHART_NOTE,
    CUT_FROM_VENDOR_PHOTO_NOTE,
    catalogSilkCutPath,
    recommendedSilkSag,
    silkCutShape,
    type CutPath,
    type SilkCutOptions,
} from "./silkCuts";
import type { Length } from "./units";

export const SILK_SHAPE_IDS = [
    "standard",
    "curvedTail",
    "cSwing",
    "rainbow",
    "arc",
    "teardrop",
    "distressed",
    "rounded",
    "rectangle",
    "curvedAngle",
    "wings",
    "snake",
    "swing",
] as const;
export type SilkShapeId = (typeof SILK_SHAPE_IDS)[number];

/** A show without a choice keeps the 6 ft flag's plain rectangle. */
export const DEFAULT_SILK_SHAPE: SilkShapeId = "rectangle";

interface SilkShapeDef {
    readonly catalogId: string;
    /** The curve family's sag: the recommended quarter of the header. */
    readonly sag?: true;
}

const DEFS: Readonly<Record<SilkShapeId, SilkShapeDef>> = {
    standard: { catalogId: "silk-standard-36x56", sag: true },
    curvedTail: { catalogId: "silk-curved-tail-36x62" },
    cSwing: { catalogId: "silk-super-swing-44x84" },
    rainbow: { catalogId: "silk-rainbow-36x56" },
    arc: { catalogId: "silk-arc-45x96" },
    teardrop: { catalogId: "silk-teardrop-44x74" },
    distressed: { catalogId: "silk-distressed-36x56" },
    rounded: { catalogId: "silk-rounded-36x54" },
    rectangle: { catalogId: "silk-6ft-36x54" },
    curvedAngle: { catalogId: "silk-oversized-curved-angle-34x88" },
    wings: { catalogId: "silk-wings-72x36" },
    snake: { catalogId: "silk-snake-36x117" },
    swing: { catalogId: "silk-swing-44x66" },
};

/** A show's stored shape, or the default for anything this build doesn't know. */
export function silkShapeOf(value: unknown): SilkShapeId {
    return SILK_SHAPE_IDS.includes(value as SilkShapeId)
        ? (value as SilkShapeId)
        : DEFAULT_SILK_SHAPE;
}

export interface SilkShape {
    readonly id: SilkShapeId;
    readonly entry: CatalogEntryOf<"silk">;
    /** Along the pole. */
    readonly header: Length;
    /** Out from the pole to the fly's farthest point. */
    readonly fly: Length;
    /** The Cut's options: the sag of a sagged curve. */
    readonly cutOptions: SilkCutOptions;
    /** The outline in meters, from the top of the pole edge. */
    readonly path: CutPath;
    /** What the template must warn about the shape's source. */
    readonly notes: readonly string[];
}

const cache = new Map<SilkShapeId, SilkShape>();

export function silkShape(id: SilkShapeId): SilkShape {
    const hit = cache.get(id);
    if (hit) return hit;
    const def = DEFS[id];
    const entry = catalogEntry(def.catalogId);
    if (entry?.kind !== "silk")
        throw new Error(`${id}: no catalog silk ${def.catalogId}`);
    const dims = catalogDims(entry);
    const cutOptions: SilkCutOptions = def.sag
        ? { sag: recommendedSilkSag(dims.header) }
        : {};
    const cut = silkCutShape(entry.id);
    const notes: string[] = [];
    if (cut?.fromVendorPhoto) notes.push(CUT_FROM_VENDOR_PHOTO_NOTE);
    if (cut?.fromShapeChart) notes.push(CUT_FROM_SHAPE_CHART_NOTE);
    const shape: SilkShape = {
        id,
        entry,
        header: dims.header,
        fly: dims.fly,
        cutOptions,
        path: catalogSilkCutPath(entry, cutOptions),
        notes,
    };
    cache.set(id, shape);
    return shape;
}
