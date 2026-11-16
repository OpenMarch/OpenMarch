/**
 * How the show names one of its assets elsewhere: `library:<id>@<version hash>`, the form cue
 * values already use (ADR 0004), as `items.model` holds it for an imported model (ADR 0010
 * amendment 2026-11-15). Any other value, such as a built-in id like `pit/marimba-4.3`, isn't a
 * show asset.
 */
import { isSha256Hex } from "./hash";

export const SHOW_ASSET_REF_PREFIX = "library:";

/** One Version of one show asset. */
export interface ShowAssetRef {
    /** The asset's id, stable across its Versions */
    id: string;
    versionHash: string;
}

/**
 * True for an id an asset can have: some characters, none of them `@` (which ends the id in a
 * reference) or whitespace.
 */
export const isShowAssetId = (id: string): boolean => /^[^@\s]+$/.test(id);

/** The reference that names `ref`, for `items.model` or a cue value. */
export function showAssetRefValue(ref: ShowAssetRef): string {
    if (!isShowAssetId(ref.id))
        throw new Error(`Not a show asset id: ${JSON.stringify(ref.id)}`);
    if (!isSha256Hex(ref.versionHash))
        throw new Error(
            `Not a Version hash: ${JSON.stringify(ref.versionHash)}`,
        );
    return `${SHOW_ASSET_REF_PREFIX}${ref.id}@${ref.versionHash}`;
}

/** The asset Version a reference names, or null when it names no show asset. */
export function parseShowAssetRef(
    value: string | null | undefined,
): ShowAssetRef | null {
    if (!value?.startsWith(SHOW_ASSET_REF_PREFIX)) return null;
    const rest = value.slice(SHOW_ASSET_REF_PREFIX.length);
    const at = rest.lastIndexOf("@");
    if (at < 0) return null;
    const id = rest.slice(0, at);
    const versionHash = rest.slice(at + 1);
    if (!isShowAssetId(id) || !isSha256Hex(versionHash)) return null;
    return { id, versionHash };
}
