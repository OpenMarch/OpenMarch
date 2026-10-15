/**
 * What pruning the show's Library removes (props-spec.md section 2, "In the show"; C1.11).
 *
 * Pure: the caller gathers the show's embedded Versions, its blob hashes and what keeps an item,
 * and deletes what the plan names.
 */

/** One embedded Version, named by `(itemId, versionHash)`. */
export interface LibraryRef {
    itemId: string;
    versionHash: string;
}

/**
 * Something that keeps a Library item: a cue, an Item table row, a history row. Without
 * `versionHash` it keeps every Version of the item.
 */
export interface LibraryKeep {
    itemId: string;
    versionHash?: string;
}

export interface PrunableLibraryItem extends LibraryRef {
    /** Part role to blob hash */
    parts: Readonly<Record<string, string>>;
    /** Versions this one pins, such as a Uniform's Garments and Artwork */
    pins: readonly LibraryRef[];
}

export interface LibraryPrunePlan {
    /** Versions nothing keeps */
    items: LibraryRef[];
    /** Blobs no kept Version points at */
    blobs: string[];
}

const keyOf = (ref: LibraryRef) => `${ref.itemId}@${ref.versionHash}`;

/**
 * Plans a prune. A Version is kept when something keeps it, or when a kept Version pins it,
 * through any depth. A blob is kept when a kept Version names it among its parts.
 */
export function planLibraryPrune({
    items,
    blobHashes,
    keep,
}: {
    items: readonly PrunableLibraryItem[];
    blobHashes: readonly string[];
    keep: readonly LibraryKeep[];
}): LibraryPrunePlan {
    const byKey = new Map(items.map((item) => [keyOf(item), item]));
    const wholeItems = new Set(
        keep.filter((k) => k.versionHash === undefined).map((k) => k.itemId),
    );

    const kept = new Set<string>();
    const queue: PrunableLibraryItem[] = [];
    const visit = (item: PrunableLibraryItem | undefined) => {
        if (!item || kept.has(keyOf(item))) return;
        kept.add(keyOf(item));
        queue.push(item);
    };

    for (const item of items) if (wholeItems.has(item.itemId)) visit(item);
    for (const k of keep)
        if (k.versionHash !== undefined)
            visit(
                byKey.get(
                    keyOf({ itemId: k.itemId, versionHash: k.versionHash }),
                ),
            );
    while (queue.length > 0) {
        for (const pin of queue.pop()!.pins) visit(byKey.get(keyOf(pin)));
    }

    const keptBlobs = new Set<string>();
    for (const item of items)
        if (kept.has(keyOf(item)))
            for (const hash of Object.values(item.parts)) keptBlobs.add(hash);

    return {
        items: items
            .filter((item) => !kept.has(keyOf(item)))
            .map(({ itemId, versionHash }) => ({ itemId, versionHash })),
        blobs: blobHashes.filter((hash) => !keptBlobs.has(hash)),
    };
}
