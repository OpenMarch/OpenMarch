/**
 * What the show's assets cost and who uses them, for the Assets view (fork #1001; ADR 0010
 * amendment 2026-11-15): each asset's size, how many things in the show name it now, the ones
 * nothing names (which Remove unused… may take out), and names that point at an asset the show
 * doesn't have (a prop an undo brought back, say), which draw as blocks.
 *
 * Pure: no React, no database.
 */
import type { ShowAsset } from "@/db-functions/showAssets";
import { MODEL_ASSET_KIND } from "./modelImport/rules";
import { showAssetRefValue } from "./ref";

/**
 * The kinds whose every use this build can find (props' models, cue values). Another kind, such
 * as one a later build names from elsewhere, is never called unused, so never removed.
 */
export const REMOVABLE_ASSET_KINDS: ReadonlySet<string> = new Set([
    MODEL_ASSET_KIND,
]);

/** Past this many bytes of assets, the show says it's large (ADR 0010 D-19) */
export const LARGE_SHOW_ASSET_BYTES = 500 * 1024 * 1024;

export interface AssetUse {
    asset: ShowAsset;
    /** The value that names it (`library:<id>@<hash>`) */
    value: string;
    /** Its parts' bytes, each blob once */
    bytes: number;
    /** How many things in the show name it now */
    uses: number;
}

export interface ShowAssetUse {
    /** Every asset, in the store's order */
    assets: AssetUse[];
    /** The assets nothing names, of a kind whose uses this build can find */
    unused: AssetUse[];
    /** The bytes removing the unused assets frees: blobs no used asset shares */
    unusedBytes: number;
    /** Every blob's bytes */
    totalBytes: number;
    /** Values that name an asset the show doesn't have, each once */
    missing: string[];
    /** How many things name a missing asset */
    missingUses: number;
}

const ASSET_REF = /^library:/;

/**
 * Who uses the show's `assets`, from the `references` the show holds now (props' models, cue
 * values; anything else is ignored) and each blob's size.
 */
export function showAssetUse(
    assets: readonly ShowAsset[],
    sizes: ReadonlyMap<string, number>,
    references: readonly (string | null | undefined)[],
): ShowAssetUse {
    const counts = new Map<string, number>();
    for (const value of references)
        if (value && ASSET_REF.test(value))
            counts.set(value, (counts.get(value) ?? 0) + 1);

    const blobsOf = (asset: ShowAsset) => new Set(Object.values(asset.parts));
    const rows = assets.map((asset): AssetUse => {
        const value = showAssetRefValue(asset);
        let bytes = 0;
        for (const hash of blobsOf(asset)) bytes += sizes.get(hash) ?? 0;
        return { asset, value, bytes, uses: counts.get(value) ?? 0 };
    });
    const unused = rows.filter(
        (row) => row.uses === 0 && REMOVABLE_ASSET_KINDS.has(row.asset.kind),
    );

    const kept = new Set<string>();
    for (const row of rows)
        if (row.uses > 0) for (const hash of blobsOf(row.asset)) kept.add(hash);
    const freed = new Set<string>();
    for (const row of unused)
        for (const hash of blobsOf(row.asset))
            if (!kept.has(hash)) freed.add(hash);
    let unusedBytes = 0;
    for (const hash of freed) unusedBytes += sizes.get(hash) ?? 0;
    let totalBytes = 0;
    for (const bytes of sizes.values()) totalBytes += bytes;

    const known = new Set(rows.map((row) => row.value));
    const missing = [...counts.keys()].filter((value) => !known.has(value));
    const missingUses = missing.reduce(
        (sum, value) => sum + (counts.get(value) ?? 0),
        0,
    );
    return {
        assets: rows,
        unused,
        unusedBytes,
        totalBytes,
        missing,
        missingUses,
    };
}

/** A size for people: "4.1 MB", "820 KB", "12 bytes" (the unit words are the caller's) */
export function sizeParts(bytes: number): {
    value: string;
    unit: "bytes" | "kb" | "mb" | "gb";
} {
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;
    const one = (n: number) => String(Number(n.toFixed(n < 10 ? 1 : 0)));
    if (bytes >= GB) return { value: one(bytes / GB), unit: "gb" };
    if (bytes >= MB) return { value: one(bytes / MB), unit: "mb" };
    if (bytes >= KB) return { value: one(bytes / KB), unit: "kb" };
    return { value: String(bytes), unit: "bytes" };
}
