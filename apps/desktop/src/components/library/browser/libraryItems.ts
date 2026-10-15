/**
 * Reads the Library for the browser in the Assets tab (owner decision Q76),
 * through the C1.9 channels only: `library:list` for the items,
 * `library:read-parts` for each Version's sidecar (which says what a model
 * or artwork is for), and `library:thumbnails` for the pictures.
 *
 * `library:list` only knows model, artwork and uniform. The groups people
 * think in (Silks, Floors, Props, Equipment, Uniforms) come from the
 * sidecar's model `kind` or artwork `surface`. Sidecars are part of the
 * Version hash, so a hash's group never changes and is cached.
 */
import type { ElectronApi } from "../../../../electron/preload";
import type { LibraryApi } from "@/view3d/library/importClient";
import { ARTWORK_SURFACES } from "@/view3d/core/sizes";
import {
    type LibraryItemKind,
    type LibraryItemSummary,
    MODEL_KIND_VALUES,
    type Result,
} from "@/view3d/library/protocol";

export type LibraryBrowserApi = Pick<
    LibraryApi,
    "list" | "readParts" | "thumbnails" | "onChanged"
>;

export function editorLibraryApi(): LibraryBrowserApi {
    return (window as unknown as { electron: ElectronApi }).electron.library;
}

/** Display order. */
export const LIBRARY_GROUPS = [
    "silks",
    "floors",
    "props",
    "equipment",
    "uniforms",
    "other",
] as const;
export type LibraryGroup = (typeof LIBRARY_GROUPS)[number];

export interface LibraryBrowserItem {
    id: string;
    name: string;
    kind: LibraryItemKind;
    group: LibraryGroup;
    /** The newest Version, whose thumbnail is shown. */
    versionHash: string;
    builtIn: boolean;
}

/**
 * The group for an item, from its list kind and its sidecar's model `kind`
 * or artwork `surface` (null when unknown).
 */
export function groupOf(
    kind: LibraryItemKind,
    detail: string | null,
): LibraryGroup {
    if (kind === "uniform") return "uniforms";
    switch (detail) {
        case "silk":
            return kind === "artwork" ? "silks" : "other";
        case "baseFloor":
        case "floorProp":
            return "floors";
        case "prop":
        case "propSlot":
            return "props";
        case "equipment":
            return kind === "model" ? "equipment" : "other";
        case "garment":
        case "uniformPart":
            return "uniforms";
        default:
            return "other";
    }
}

/** The model `kind` or artwork `surface` a sidecar names, or null. */
export function sidecarDetail(
    kind: LibraryItemKind,
    bytes: Uint8Array | undefined,
): string | null {
    if (!bytes || kind === "uniform") return null;
    try {
        const json = JSON.parse(new TextDecoder().decode(bytes)) as {
            kind?: unknown;
            surface?: unknown;
        };
        const value = kind === "model" ? json.kind : json.surface;
        const known: readonly string[] =
            kind === "model" ? MODEL_KIND_VALUES : ARTWORK_SURFACES;
        return typeof value === "string" && known.includes(value)
            ? value
            : null;
    } catch {
        return null;
    }
}

/** Version hash → sidecar detail; immutable, so kept for the session. */
const detailCache = new Map<string, string | null>();

async function detailFor(
    api: LibraryBrowserApi,
    summary: LibraryItemSummary,
    versionHash: string,
): Promise<string | null> {
    if (summary.kind === "uniform") return null;
    if (detailCache.has(versionHash)) return detailCache.get(versionHash)!;
    try {
        const parts = await api.readParts({
            itemId: summary.id,
            versionHash,
            roles: ["sidecar"],
        });
        if (!parts.ok) return null; // not cached: may work next time
        const detail = sidecarDetail(summary.kind, parts.value.sidecar);
        detailCache.set(versionHash, detail);
        return detail;
    } catch {
        return null;
    }
}

/** Every Library item, grouped; a failed list is the only error. */
export async function loadLibraryItems(
    api: LibraryBrowserApi,
): Promise<Result<LibraryBrowserItem[]>> {
    let listed: Result<LibraryItemSummary[]>;
    try {
        listed = await api.list({});
    } catch (error) {
        return {
            ok: false,
            error: { code: "corrupt", message: String(error) },
        };
    }
    if (!listed.ok) return listed;
    const items = await Promise.all(
        listed.value.map(async (summary) => {
            const versionHash = summary.versions[summary.versions.length - 1];
            const detail = await detailFor(api, summary, versionHash);
            return {
                id: summary.id,
                name: summary.name,
                kind: summary.kind,
                group: groupOf(summary.kind, detail),
                versionHash,
                builtIn: summary.builtIn,
            } satisfies LibraryBrowserItem;
        }),
    );
    return { ok: true, value: items };
}

export interface LibraryGroupView {
    group: LibraryGroup;
    items: LibraryBrowserItem[];
}

/** Non-empty groups in display order, filtered by name, sorted by name. */
export function groupLibraryItems(
    items: readonly LibraryBrowserItem[],
    query: string,
): LibraryGroupView[] {
    const needle = query.trim().toLocaleLowerCase();
    const shown = needle
        ? items.filter((i) => i.name.toLocaleLowerCase().includes(needle))
        : items;
    return LIBRARY_GROUPS.map((group) => ({
        group,
        items: shown
            .filter((i) => i.group === group)
            .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.items.length > 0);
}
