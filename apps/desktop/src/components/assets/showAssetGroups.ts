/**
 * The Assets panel's This show section (owner decision Q81, props-spec.md
 * "Base floor"): everything the open show embeds, one entry per Library
 * item, against the local Library. An item the Library lacks offers "Add to
 * my Library"; a newer Version or changed details in the Library are noted,
 * never applied silently (props-spec.md section 2).
 */
import type { ShowLibraryItem } from "@/db-functions/showLibrary";
import type { LibraryItemSummary } from "@/view3d/library/protocol";
import {
    findLibraryUpdates,
    type LibraryUpdate,
} from "@/view3d/library/showLibraryUpdates";
import {
    groupOf,
    LIBRARY_GROUPS,
    sidecarJsonDetail,
    type LibraryGroup,
} from "@/components/library/browser/libraryItems";
import type { LibraryItemKind } from "@om-electron/main/library/types";

export interface ShowAssetItem {
    itemId: string;
    name: string;
    kind: LibraryItemKind;
    group: LibraryGroup;
    builtIn: boolean;
    /** The newest embedded Version, the one "Add to my Library" sends. */
    newest: ShowLibraryItem;
    /** How many Versions of it the show embeds. */
    versions: number;
    /** Null while the Library is unknown (loading or failed). */
    inLibrary: boolean | null;
    update: LibraryUpdate["type"] | null;
}

export interface ShowAssetGroup {
    group: LibraryGroup;
    items: ShowAssetItem[];
}

/**
 * One entry per Library item the show embeds, grouped like the Library
 * browser and sorted by name. `library` is null while it's unknown.
 */
export function showAssetGroups(
    show: readonly ShowLibraryItem[],
    library: readonly LibraryItemSummary[] | null,
): ShowAssetGroup[] {
    const byItem = new Map<string, ShowLibraryItem[]>();
    for (const version of show) {
        const list = byItem.get(version.itemId) ?? [];
        list.push(version);
        byItem.set(version.itemId, list);
    }
    const inLibrary = library ? new Set(library.map((l) => l.id)) : null;
    const updates = new Map(
        (library ? findLibraryUpdates({ showItems: show, library }) : []).map(
            (u) => [u.itemId, u.type],
        ),
    );

    const items: ShowAssetItem[] = [...byItem].map(([itemId, versions]) => {
        const newest = versions.reduce((a, b) =>
            b.embeddedAt > a.embeddedAt ? b : a,
        );
        return {
            itemId,
            name: newest.name,
            kind: newest.kind,
            group: groupOf(
                newest.kind,
                sidecarJsonDetail(newest.kind, newest.sidecar),
            ),
            builtIn: newest.builtIn,
            newest,
            versions: versions.length,
            inLibrary: inLibrary ? inLibrary.has(itemId) : null,
            update: updates.get(itemId) ?? null,
        };
    });

    return LIBRARY_GROUPS.map((group) => ({
        group,
        items: items
            .filter((i) => i.group === group)
            .sort(
                (a, b) =>
                    a.name.localeCompare(b.name) ||
                    a.itemId.localeCompare(b.itemId),
            ),
    })).filter((g) => g.items.length > 0);
}
