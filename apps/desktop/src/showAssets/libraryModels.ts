/**
 * Imported models as the 2D field and the 3D View draw them (fork #1000): which show asset an
 * item's `items.model` names (`library:<id>@<version hash>`, ADR 0010 amendment 2026-11-15), and
 * how big its model draws for the item's Outline.
 *
 * Pure: no React, no three.js.
 */
import type { ShowAsset } from "@/db-functions/showAssets";
import { MODEL_ASSET_KIND } from "./modelImport/rules";
import type { ModelSidecar } from "./modelImport/types";
import { showAssetRefValue } from "./ref";

/** An imported model an item can name, with what drawing it needs */
export interface LibraryModel {
    /** The `items.model` value that names it */
    value: string;
    /** The detailed GLB's blob hash */
    modelHash: string;
    /** The distant GLB's blob hash */
    distantHash: string;
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
        const { model, distant } = asset.parts;
        if (!model || !distant) continue;
        const value = showAssetRefValue(asset);
        out.set(value, {
            value,
            modelHash: model,
            distantHash: distant,
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
