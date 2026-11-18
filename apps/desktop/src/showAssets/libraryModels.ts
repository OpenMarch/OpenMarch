/**
 * Imported models as the 2D field and the 3D View draw them (fork #1000): which show asset an
 * item's `items.model` names (`library:<id>@<version hash>`, ADR 0010 amendment 2026-11-15), and
 * how big its model draws for the item's Outline.
 *
 * Pure: no React, no three.js.
 */
import type { ShowAsset } from "@/db-functions/showAssets";
import { MODEL_ASSET_KIND, TRIANGLE_CAP } from "./modelImport/rules";
import type { ModelSidecar } from "./modelImport/types";
import { showAssetRefValue } from "./ref";

/** At least this many triangles, a model with a Light copy draws it once the view stutters */
export const HEAVY_MODEL_TRIANGLES = TRIANGLE_CAP * 2;

/** An imported model an item can name, with what drawing it needs */
export interface LibraryModel {
    /** The `items.model` value that names it */
    value: string;
    /** The detailed GLB's blob hash */
    modelHash: string;
    /** The distant GLB's blob hash */
    distantHash: string;
    /**
     * Beside a level heavier than Light (#1091): the Light copy's blob hash, drawn near the camera
     * instead of the model once the 3D View lightens heavy models
     */
    lightHash: string | null;
    sidecar: ModelSidecar;
}

/** Whether a show asset is an imported model with what the field and the 3D View read. */
export const isModelAsset = (
    asset: ShowAsset,
): asset is ShowAsset & { sidecar: ModelSidecar } =>
    asset.kind === MODEL_ASSET_KIND &&
    typeof (asset.sidecar as Partial<ModelSidecar>).sizeM === "object" &&
    typeof (asset.sidecar as Partial<ModelSidecar>).plan === "object";

/**
 * The show's imported models by the `items.model` value that names each. An asset without both
 * GLBs is left out: its items draw as blocks.
 */
export function libraryModels(
    assets: readonly ShowAsset[] | undefined,
): ReadonlyMap<string, LibraryModel> {
    const out = new Map<string, LibraryModel>();
    for (const asset of assets ?? []) {
        if (!isModelAsset(asset)) continue;
        const { model, distant, light } = asset.parts;
        // A Light copy helps only beside a model clearly heavier than it (#1091): an Original of
        // 21k triangles isn't worth the fallback's first step
        const heavy =
            !!light && (asset.sidecar.triangles ?? 0) >= HEAVY_MODEL_TRIANGLES;
        if (!model || !distant) continue;
        const value = showAssetRefValue(asset);
        out.set(value, {
            value,
            modelHash: model,
            distantHash: distant,
            lightHash: heavy ? light : null,
            sidecar: asset.sidecar,
        });
    }
    return out;
}

/** Below this an Outline side is taken as no size at all */
const TINY_M = 1e-6;

/**
 * How many times its real size an imported model draws for an Outline `size` (m). A model prop
 * scales uniformly (ADR 0010 amendment 2026-11-15): one factor, the one that keeps the
 * footprint's area, so a side stretched on its own grows the model evenly instead of squashing
 * it. 1 when either size is missing.
 */
export function modelScale(
    size: { width: number; depth: number },
    sizeM: { width: number; depth: number },
): number {
    if (
        !(size.width > TINY_M && size.depth > TINY_M) ||
        !(sizeM.width > TINY_M && sizeM.depth > TINY_M)
    )
        return 1;
    return Math.sqrt((size.width / sizeM.width) * (size.depth / sizeM.depth));
}

/** An Outline side a model prop's size can be given by */
export type ModelSide = "width" | "depth" | "height";

/** Whether a model stands up at all: a flat one's height is its own, apart from its footprint */
export const hasModelHeight = (sizeM: { height: number }): boolean =>
    sizeM.height > TINY_M;

/**
 * A model prop's Outline size with one side set to `value` (m) and the others in the model's
 * proportions (ADR 0010 amendment 2026-11-15: one factor for all three, fork #1078). A flat
 * model's width and depth follow each other and its height is left out, to change on its own.
 * Null when the model has no size on that side (a flat model's height), or for no size at all.
 */
export function proportionalSize(
    sizeM: { width: number; depth: number; height: number },
    side: ModelSide,
    value: number,
): { width: number; depth: number; height?: number } | null {
    if (!(sizeM[side] > TINY_M) || !(value > 0)) return null;
    const scale = value / sizeM[side];
    return {
        width: sizeM.width * scale,
        depth: sizeM.depth * scale,
        ...(hasModelHeight(sizeM) ? { height: sizeM.height * scale } : {}),
    };
}
