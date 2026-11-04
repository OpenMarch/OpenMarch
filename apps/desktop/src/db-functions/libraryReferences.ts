/**
 * Every place a show names a Library item (ADR 0002 D-12, props-spec.md section 2): the one
 * registry that the show Library prune keeps from and that deleting a show's Library item checks
 * for uses. A new place that stores a Library reference is added here, once, and both follow; a
 * test fails for a table with a Library column that no source reads.
 *
 * Between Library items, a Version pinning another (a Uniform's Garments and Artwork) isn't a
 * show reference: the prune keeps what a kept Version pins, and the delete checks pins itself.
 *
 * Only the schema module, never the renderer's database: the main process prunes on close.
 */
import { sql } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import { getFieldFloor } from "./fieldFloor";
import type { DbConnection, DbTransaction } from "./types";
import type { LibraryKeep } from "@/view3d/library/showLibraryPrune";

type Db = DbConnection | DbTransaction;

/** One reference to a Library item, and what holds it. */
export type LibraryReference =
    /** The show's floor, named in the field properties (D-23) */
    | { source: "floor"; itemId: string; versionHash: string }
    /** An item's model (C2.1) */
    | {
          source: "itemModels";
          itemId: string;
          versionHash: string;
          marcherId: number;
      }
    /**
     * An undo or redo row: undoing an old edit must find the item it used. Any Version of the
     * item, since the row's SQL is matched on the item id alone.
     */
    | { source: "history"; itemId: string; versionHash: null };

export type LibraryReferenceSource = LibraryReference["source"];

/** Whether the file has table `name`: some come with later migrations, or other packages. */
export async function hasTable(db: Db, name: string): Promise<boolean> {
    const found = await db
        .select({ n: sql<number>`count(*)` })
        .from(sql`sqlite_schema`)
        .where(sql`type = 'table' AND name = ${name}`)
        .get();
    return !!found?.n;
}

async function floorReferences(db: Db): Promise<LibraryReference[]> {
    const floor = await getFieldFloor({ db });
    return floor ? [{ source: "floor", ...floor }] : [];
}

/*
 * The Item table (C2.1 `items`) comes with the props packages. Read
 * by name, so a file or build without them names nothing here.
 */
async function itemModelReferences(db: Db): Promise<LibraryReference[]> {
    if (!(await hasTable(db, "items"))) return [];
    const rows = await db
        .select({
            marcherId: sql<number>`marcher_id`,
            itemId: sql<string>`library_item_id`,
            versionHash: sql<string>`library_version_hash`,
        })
        .from(sql`items`)
        .where(
            sql`library_item_id IS NOT NULL AND library_version_hash IS NOT NULL`,
        )
        .all();
    return rows.map((r) => ({ source: "itemModels", ...r }));
}

async function historyReferences(db: Db): Promise<LibraryReference[]> {
    const rows = await db
        .selectDistinct({ item_id: schema.library_items.item_id })
        .from(schema.library_items)
        .where(
            sql`EXISTS (SELECT 1 FROM history_undo WHERE instr(history_undo.sql, ${schema.library_items.item_id}) > 0)
             OR EXISTS (SELECT 1 FROM history_redo WHERE instr(history_redo.sql, ${schema.library_items.item_id}) > 0)`,
        )
        .orderBy(schema.library_items.item_id)
        .all();
    return rows.map((r) => ({
        source: "history",
        itemId: r.item_id,
        versionHash: null,
    }));
}

/**
 * The registry: each source, the tables it reads and how. `tables` is what the registry test
 * checks against the schema.
 */
export const LIBRARY_REFERENCE_SOURCES: Record<
    LibraryReferenceSource,
    { tables: readonly string[]; read: (db: Db) => Promise<LibraryReference[]> }
> = {
    floor: { tables: ["field_properties"], read: floorReferences },
    itemModels: { tables: ["items"], read: itemModelReferences },
    history: {
        tables: ["history_undo", "history_redo"],
        read: historyReferences,
    },
};

/** Every reference the show holds to a Library item, from every source. Never writes. */
export async function libraryReferences({
    db,
}: {
    db: Db;
}): Promise<LibraryReference[]> {
    const refs: LibraryReference[] = [];
    for (const source of Object.values(LIBRARY_REFERENCE_SOURCES))
        refs.push(...(await source.read(db)));
    return refs;
}

/** What the prune keeps for `refs`: a Version, or every Version of an item history names. */
export function keepsOf(refs: readonly LibraryReference[]): LibraryKeep[] {
    return refs.map((r) =>
        r.versionHash === null
            ? { itemId: r.itemId }
            : { itemId: r.itemId, versionHash: r.versionHash },
    );
}
