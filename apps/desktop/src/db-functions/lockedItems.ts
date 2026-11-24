/**
 * Locked items (props epic, fork #1239, step 2): a lock keeps an item from being edited by
 * accident. A locked item can't be clicked, boxed, lassoed or selected with Select all on the
 * field, and no marcher tool moves it; it keeps its moves and is wherever the timeline puts it.
 * Unlocking it (its right-click menu, or the Props panel) makes it a prop like any other.
 *
 * Before step 2 a lock also meant "one position for the whole show": a drag of a locked item set
 * its home and cleared its moves. That meaning is gone (owner, 2026-11-23): locking and unlocking
 * write nothing but the flag.
 *
 * The writes keep to it: a canvas edit leaves the locked items out (`withoutLockedMovesInTransaction`,
 * called by `moveMarchersInTarget`), so a locked item that is still selected, from the Props
 * panel or a right-click, isn't moved by a nudge or a tool.
 */
import { and, eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbTransaction } from "./types";

/** The marchers among `marcherIds` that are locked items. */
export async function lockedItemMarcherIdsInTransaction(
    tx: DbTransaction,
    marcherIds: readonly number[],
): Promise<Set<number>> {
    if (marcherIds.length === 0) return new Set();
    const ids = [...new Set(marcherIds)];
    // Most edits move only performers: then there is no item to ask about its lock
    const anyItem = await tx
        .select({ marcherId: schema.items.marcher_id })
        .from(schema.items)
        .where(inArray(schema.items.marcher_id, ids))
        .limit(1)
        .get();
    if (!anyItem) return new Set();
    const rows = await tx
        .select({ marcherId: schema.items.marcher_id })
        .from(schema.items)
        .where(
            and(
                inArray(schema.items.marcher_id, ids),
                eq(schema.items.locked, true),
            ),
        )
        .all();
    return new Set(rows.map((r) => r.marcherId));
}

/** A canvas edit's moves without the locked items' */
export async function withoutLockedMovesInTransaction<
    M extends { marcherId: number },
>(tx: DbTransaction, moves: readonly M[]): Promise<M[]> {
    const locked = await lockedItemMarcherIdsInTransaction(
        tx,
        moves.map((m) => m.marcherId),
    );
    return locked.size === 0
        ? [...moves]
        : moves.filter((m) => !locked.has(m.marcherId));
}
