/**
 * A small Library for the browser's tests, served through the import
 * review's fake `window.electron.library`.
 */
import type { LibraryItemSummary } from "@/view3d/library/protocol";
import { ok, type FakeLibrary } from "../../import/__test__/fakeLibrary";

const id = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (n: number) => n.toString(16).padStart(64, "c");

interface FixtureItem {
    summary: LibraryItemSummary;
    /** The sidecar's model `kind` or artwork `surface`; null = unreadable. */
    detail: string | null;
    thumbnail: boolean;
}

function item(
    n: number,
    kind: LibraryItemSummary["kind"],
    name: string,
    detail: string | null,
    thumbnail = true,
): FixtureItem {
    return {
        summary: {
            id: id(n),
            kind,
            name,
            tags: [],
            updatedAt: "2026-10-12T00:00:00.000Z",
            license: "LicenseRef-Unknown",
            versions: [hash(n * 1000), hash(n * 1000 + 1)],
            builtIn: false,
        },
        detail,
        thumbnail,
    };
}

/** One item per group, and one whose sidecar can't be read. */
export function sampleLibrary(seed = 1): FixtureItem[] {
    const n = seed * 100;
    return [
        item(n + 1, "artwork", "Home silk", "silk"),
        item(n + 2, "artwork", "Away silk", "silk"),
        item(n + 3, "artwork", "Field tarp", "baseFloor"),
        item(n + 4, "model", "Riser 8 × 4", "prop", false),
        item(n + 5, "model", "Drum major mace", "equipment"),
        item(n + 6, "uniform", "Band default", null),
        item(n + 7, "model", "Mystery", null),
    ];
}

export function itemIdOf(items: FixtureItem[], name: string): string {
    return items.find((i) => i.summary.name === name)!.summary.id;
}

/** Answers list, read-parts and thumbnails from `items` (mutable). */
export function serveLibrary(lib: FakeLibrary, items: FixtureItem[]) {
    lib.on("list", () => ok(items.map((i) => i.summary)));
    lib.on("readParts", (request: { itemId: string }) => {
        const found = items.find((i) => i.summary.id === request.itemId);
        if (!found?.detail) {
            return {
                ok: false,
                error: { code: "not-found", message: "no sidecar" },
            };
        }
        const key = found.summary.kind === "model" ? "kind" : "surface";
        return ok({
            sidecar: new TextEncoder().encode(
                JSON.stringify({ [key]: found.detail }),
            ),
        });
    });
    lib.on(
        "thumbnails",
        (request: { items: { itemId: string; versionHash: string }[] }) =>
            ok(
                request.items.map(({ itemId }) =>
                    items.find((i) => i.summary.id === itemId)?.thumbnail
                        ? {
                              mimeType: "image/png",
                              bytes: new Uint8Array([137, 80]),
                          }
                        : null,
                ),
            ),
    );
}

export { item as libraryItem };
