/**
 * Deleting the show's copy of a Library item (props-spec.md section 2, [26.10]), and what stops
 * it: everything `libraryReferences` names, and other items' pins. Kept apart from
 * `showLibrary.ts`, which the main process loads (convert on open, prune on close).
 */
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbConnection, DbTransaction } from "./types";
import type { LibraryItemKind } from "@om-electron/main/library/types";
import {
    libraryReferences,
    LIBRARY_REFERENCE_SOURCES,
    type LibraryReference,
} from "./libraryReferences";
import {
    LibraryRefSchema,
    pruneShowLibraryInTransaction,
    safeJson,
} from "./showLibrary";

/** A prop or piece of equipment using a Library item as its model. */
export interface LibraryItemUse {
    marcherId: number;
    /** The item's name, else its drill number */
    label: string;
}

/** What stops a show's Library item from being deleted (props-spec.md section 2, [26.10]). */
export interface LibraryItemUses {
    /** True when it is the show's floor (D-23) */
    floor: boolean;
    /** Props and equipment using it as their model */
    items: LibraryItemUse[];
    /** Other embedded items whose Versions pin it, such as a Uniform pinning its Artwork */
    pinnedBy: { itemId: string; name: string }[];
}

/** Whether anything in `uses` stops the delete. */
export const isInUse = (uses: LibraryItemUses) =>
    uses.floor || uses.items.length > 0 || uses.pinnedBy.length > 0;

/**
 * What uses any Version of `itemId`, from `libraryReferences` (the floor, the Item
 * tables) and other items' pins. History isn't a use: see `deleteShowLibraryItem`. Never writes.
 */
export async function libraryItemUses({
    db,
    itemId,
}: {
    db: DbConnection | DbTransaction;
    itemId: string;
}): Promise<LibraryItemUses> {
    const refs = (await libraryReferences({ db })).filter(
        (r) => r.itemId === itemId,
    );
    return {
        floor: refs.some((r) => r.source === "floor"),
        items: await itemUses(db, refs),
        pinnedBy: await pinnedBy(db, itemId),
    };
}

async function pinnedBy(
    db: DbConnection | DbTransaction,
    itemId: string,
): Promise<{ itemId: string; name: string }[]> {
    const found = new Map<string, string>();
    const others = await db
        .select({
            item_id: schema.library_items.item_id,
            name: schema.library_items.name,
            pins: schema.library_items.pins,
        })
        .from(schema.library_items)
        .orderBy(asc(schema.library_items.name))
        .all();
    for (const other of others) {
        if (other.item_id === itemId) continue;
        const pins = z.array(LibraryRefSchema).safeParse(safeJson(other.pins));
        // A row that can't be read might pin it, so it counts as a use
        if (!pins.success || pins.data.some((pin) => pin.itemId === itemId))
            found.set(other.item_id, other.name);
    }
    return [...found].map(([id, name]) => ({ itemId: id, name }));
}

async function itemUses(
    db: DbConnection | DbTransaction,
    refs: readonly LibraryReference[],
): Promise<LibraryItemUse[]> {
    const raw = refs.flatMap((r): { marcherId: number }[] =>
        r.source === "itemModels" ? [{ marcherId: r.marcherId }] : [],
    );
    if (raw.length === 0) return [];
    const marchers = await db
        .select({
            id: schema.marchers.id,
            name: schema.marchers.name,
            drill_prefix: schema.marchers.drill_prefix,
            drill_order: schema.marchers.drill_order,
        })
        .from(schema.marchers)
        .where(
            inArray(
                schema.marchers.id,
                raw.map((r) => r.marcherId),
            ),
        )
        .all();
    const labels = new Map(
        marchers.map((m) => [
            m.id,
            m.name?.trim() || `${m.drill_prefix}${m.drill_order}`,
        ]),
    );
    const seen = new Set<string>();
    const uses: LibraryItemUse[] = [];
    for (const r of raw) {
        const key = String(r.marcherId);
        if (seen.has(key)) continue;
        seen.add(key);
        uses.push({
            ...r,
            label: labels.get(r.marcherId) ?? `#${r.marcherId}`,
        });
    }
    return uses.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * What deleting a show's Library item did:
 *
 * - `deleted`: every Version and the blobs only it named are gone;
 * - `inUse`: the floor, props or other items use it, and nothing changed;
 * - `keptForUndo`: nothing uses it now, but an undo or redo row names it, so it stays until a
 *   later prune finds nothing naming it (props-spec.md section 2: undoing an old edit must find
 *   the item it used). The show prunes when it closes.
 */
export type DeleteShowLibraryItemResult =
    | { outcome: "deleted" }
    | { outcome: "inUse"; uses: LibraryItemUses }
    | { outcome: "keptForUndo" };

async function deleteUnusedInTransaction(
    tx: DbTransaction,
    itemId: string,
): Promise<DeleteShowLibraryItemResult> {
    const history = await LIBRARY_REFERENCE_SOURCES.history.read(tx);
    if (history.some((r) => r.itemId === itemId))
        return { outcome: "keptForUndo" };
    await tx
        .delete(schema.library_items)
        .where(eq(schema.library_items.item_id, itemId))
        .run();
    // Every remaining Version is kept, so only orphan blobs go
    const remaining = await tx
        .selectDistinct({ item_id: schema.library_items.item_id })
        .from(schema.library_items)
        .all();
    await pruneShowLibraryInTransaction({
        tx,
        keep: remaining.map((r) => ({ itemId: r.item_id })),
    });
    return { outcome: "deleted" };
}

/**
 * What an item is for within its kind: an Artwork's surface (Silk, Base floor, Uniform part…) or
 * a model's kind (prop, equipment), from its sidecar; null for a Uniform or an unreadable
 * sidecar.
 */
export function libraryRoleOf(
    kind: LibraryItemKind,
    sidecar: unknown,
): string | null {
    if (kind === "uniform" || typeof sidecar !== "object" || sidecar === null)
        return null;
    const { kind: modelKind, surface } = sidecar as {
        kind?: unknown;
        surface?: unknown;
    };
    const role = kind === "model" ? modelKind : surface;
    return typeof role === "string" ? role : null;
}

/**
 * Deletes the show's copy of a Library item, every Version (props-spec.md section 2, [26.10]).
 * It's refused while anything uses it (`libraryItemUses`: the show's floor, props and equipment,
 * other items' pins). The delete itself is never in history, like embedding and pruning, so see
 * {@link DeleteShowLibraryItemResult} for when the item stays.
 */
export async function deleteShowLibraryItem({
    db,
    itemId,
}: {
    db: DbConnection;
    itemId: string;
}): Promise<DeleteShowLibraryItemResult> {
    return await db.transaction(async (tx) => {
        const uses = await libraryItemUses({ db: tx, itemId });
        if (isInUse(uses)) return { outcome: "inUse", uses };
        return await deleteUnusedInTransaction(tx, itemId);
    });
}
