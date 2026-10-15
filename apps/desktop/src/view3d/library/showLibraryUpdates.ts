/**
 * The show's Library against the local Library (props-spec.md section 2; C1.11): "update
 * available" per item, never applied silently, and "Add to my Library".
 *
 * Opening a show never writes to the Library. Both functions here only read; the caller sends
 * the request built here when the person chooses "Add to my Library".
 */
import type { AddFromShowRequest, LibraryItemSummary } from "./protocol";
import type {
    ShowLibraryItem,
    ShowLibraryMetadata,
} from "@/db-functions/showLibrary";

/** What the update check reads from an embedded Version. */
export type ShowItemForUpdates = Pick<
    ShowLibraryItem,
    "itemId" | "versionHash" | "name"
> & { metadata: ShowLibraryMetadata };

export type LibraryUpdate =
    /** The Library has a newer Version than every one the show holds */
    | {
          itemId: string;
          type: "version";
          showVersions: string[];
          latest: string;
      }
    /** Same Version, but its name, tags, license or other metadata changed */
    | { itemId: string; type: "metadata" };

const sameTags = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((tag, i) => tag === b[i]);

/**
 * Lists one update per Library item the show holds, if any.
 *
 * A Version update needs every show Version to be one the Library knows and none to be its
 * latest: a Version from another machine is neither older nor newer, so nothing is offered.
 * "Latest" is the Library's last-added Version, as the store orders them. Otherwise a metadata
 * update is offered when the name, tags or license differ. `updatedAt` isn't compared: adding a
 * Version bumps it, so the show that just added its Version would see a false update. Changes
 * to fields the Library index doesn't carry (author, attribution) aren't detected here.
 */
export function findLibraryUpdates({
    showItems,
    library,
}: {
    showItems: readonly ShowItemForUpdates[];
    library: readonly LibraryItemSummary[];
}): LibraryUpdate[] {
    const byId = new Map(library.map((entry) => [entry.id, entry]));
    const grouped = new Map<string, ShowItemForUpdates[]>();
    for (const item of showItems) {
        const list = grouped.get(item.itemId) ?? [];
        list.push(item);
        grouped.set(item.itemId, list);
    }

    const updates: LibraryUpdate[] = [];
    for (const [itemId, versions] of grouped) {
        const entry = byId.get(itemId);
        if (!entry) continue;
        const latest = entry.versions.at(-1)!;
        const hashes = versions.map((v) => v.versionHash);
        if (!hashes.every((hash) => entry.versions.includes(hash))) continue;

        if (!hashes.includes(latest)) {
            updates.push({
                itemId,
                type: "version",
                showVersions: hashes,
                latest,
            });
            continue;
        }
        const current = versions.find((v) => v.versionHash === latest)!;
        if (
            current.name !== entry.name ||
            !sameTags(current.metadata.tags, entry.tags) ||
            current.metadata.license !== entry.license
        ) {
            updates.push({ itemId, type: "metadata" });
        }
    }
    return updates;
}

/**
 * Builds the `library:add-from-show` request for an embedded Version, with every part's bytes.
 * Main recomputes the Version hash from the parts and refuses a mismatch.
 */
export async function buildAddFromShowRequest({
    item,
    readBlob,
}: {
    item: ShowLibraryItem;
    readBlob: (hash: string) => Promise<Uint8Array | undefined>;
}): Promise<AddFromShowRequest> {
    const parts: Record<string, Uint8Array<ArrayBuffer>> = {};
    for (const [role, hash] of Object.entries(item.parts)) {
        const bytes = await readBlob(hash);
        if (!bytes) {
            throw new Error(
                `The show is missing the ${role} part of ${item.itemId}`,
            );
        }
        // IPC sends plain ArrayBuffer-backed bytes; copy only a shared buffer
        parts[role] =
            bytes.buffer instanceof ArrayBuffer
                ? (bytes as Uint8Array<ArrayBuffer>)
                : new Uint8Array(bytes);
    }
    const { metadata } = item;
    return {
        itemId: item.itemId,
        kind: item.kind,
        name: item.name,
        tags: metadata.tags,
        versionHash: item.versionHash,
        parts,
        license: {
            license: metadata.license,
            licenseText: metadata.licenseText,
            author: metadata.author,
            sourceUrl: metadata.sourceUrl,
            attribution: metadata.attribution,
        },
        derivedFrom: metadata.derivedFrom,
    };
}
