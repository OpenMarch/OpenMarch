import type { ShowLibraryItem } from "@/db-functions/showLibrary";
import type { LibraryItemSummary } from "@/view3d/library/protocol";

export const h = (c: string) => c.repeat(64);
export const itemId = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** An embedded Version, as `useShowLibrary` returns it. */
export function showItem(
    n: number,
    name: string,
    patch: Partial<ShowLibraryItem> = {},
): ShowLibraryItem {
    return {
        itemId: itemId(n),
        versionHash: h("a"),
        kind: "artwork",
        name,
        builtIn: false,
        metadata: {
            tags: [],
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
            originalFilename: null,
            derivedFrom: null,
            license: "LicenseRef-Unknown",
            licenseText: null,
            author: null,
            sourceUrl: null,
            attribution: null,
            modified: false,
        },
        pins: [],
        parts: { display: h("d"), sidecar: h("e") },
        sidecar: { surface: "silk" },
        embeddedAt: "2026-10-01T00:00:00.000Z",
        ...patch,
    };
}

/** The local Library's summary of a show item. */
export function librarySummary(
    item: ShowLibraryItem,
    patch: Partial<LibraryItemSummary> = {},
): LibraryItemSummary {
    return {
        id: item.itemId,
        kind: item.kind,
        name: item.name,
        tags: item.metadata.tags,
        updatedAt: item.metadata.updatedAt,
        license: item.metadata.license,
        versions: [item.versionHash],
        builtIn: item.builtIn,
        ...patch,
    };
}
