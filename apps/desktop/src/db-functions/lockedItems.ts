/**
 * Locked items (instruments.md section 6; ADR 0010 amendment of 2026-11-11): an item with one
 * position for the whole show and no moves, such as the front ensemble's equipment.
 *
 * The timeline resolver stays the one source of positions for 2D and 3D: a locked item is a
 * marcher with a home and no rows in the timeline tables, so the resolver puts it at its home on
 * every count with nothing special for it. The writes keep it that way:
 *
 * - a canvas edit of a locked item, whatever its target (a window on a later page, an isolated
 *   move, the homes), sets its home and clears any moves it has, in the same undo step as the
 *   rest of the edit (`splitLockedItemMovesInTransaction`, called by `moveMarchersInTarget`);
 * - locking an item clears its moves and keeps it where it was at the lock's beat
 *   (`lockItemsInTransaction`).
 */
import { and, eq, inArray } from "drizzle-orm";
import { createResolver, validateHome, type XY } from "@openmarch/core";
import { schema } from "@/global/database/db";
import { readTimelineTables } from "@/timeline/timelineRows";
import type { DbTransaction } from "./types";
import { updateMarcherHomesInTransaction } from "./marcherHome";
import { removeDeletedMarchersFromTimelinesInTransaction } from "./timelineMarchers";
import { assertValid } from "./timelineErrors";

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

/**
 * Takes items out of every move: their assignments go (shared transitions are compacted as a
 * marcher delete does) and so do their Held marks, which only mean something beside moves.
 */
export async function clearItemMovesInTransaction(
    tx: DbTransaction,
    marcherIds: readonly number[],
): Promise<void> {
    if (marcherIds.length === 0) return;
    await removeDeletedMarchersFromTimelinesInTransaction({ tx, marcherIds });
    await tx
        .delete(schema.timeline_held_marks)
        .where(inArray(schema.timeline_held_marks.marcher_id, [...marcherIds]))
        .run();
}

/**
 * Splits a canvas edit's moves into the locked items' and the rest. Each locked item's move
 * becomes its home, wherever the edit was aimed, and any moves it has are cleared, so it is at
 * the dropped spot on every page. Returns the other moves, for the edit's own target, and the
 * locked items it set.
 */
export async function splitLockedItemMovesInTransaction<
    M extends { marcherId: number; x: number; y: number },
>(
    tx: DbTransaction,
    moves: readonly M[],
): Promise<{ rest: M[]; pinned: number[] }> {
    const locked = await lockedItemMarcherIdsInTransaction(
        tx,
        moves.map((m) => m.marcherId),
    );
    if (locked.size === 0) return { rest: [...moves], pinned: [] };
    const pinnedMoves = moves.filter((m) => locked.has(m.marcherId));
    for (const m of pinnedMoves)
        assertValid(validateHome([m.x, m.y]), "position");
    await updateMarcherHomesInTransaction({
        tx,
        modifiedHomes: pinnedMoves.map((m) => ({
            marcherId: m.marcherId,
            home: [m.x, m.y],
        })),
    });
    const pinned = pinnedMoves.map((m) => m.marcherId);
    await clearItemMovesInTransaction(tx, pinned);
    return { rest: moves.filter((m) => !locked.has(m.marcherId)), pinned };
}

/**
 * Locks items to one position: where each is at `beat` (the playhead when the lock was asked
 * for) becomes its home, and its moves are cleared. With no beat, beat 0: it stays at its home.
 *
 * Decision (pit-2d, 2026-11-11): an item that already has moves keeps its position at the
 * current time, not its home, so locking never makes it jump where the designer is looking.
 * Unlocking writes nothing else: the item stays at its home and can be given moves again.
 */
export async function lockItemsInTransaction(
    tx: DbTransaction,
    marcherIds: readonly number[],
    beat = 0,
): Promise<void> {
    if (marcherIds.length === 0) return;
    const resolver = createResolver((await readTimelineTables(tx)).snapshot);
    const known = new Set(resolver.marcherIds());
    const homes = marcherIds
        .filter((id) => known.has(id))
        .map((marcherId) => ({
            marcherId,
            home: resolver.positionAt(marcherId, beat) as XY,
        }));
    await clearItemMovesInTransaction(tx, marcherIds);
    await updateMarcherHomesInTransaction({ tx, modifiedHomes: homes });
}
