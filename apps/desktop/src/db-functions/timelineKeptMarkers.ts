import { eq, inArray } from "drizzle-orm";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "./types";

/**
 * The stored **kept** markers (`timeline_kept_assignments`, ADR 0001 amendment 2026-10-09): which
 * assignments are a marcher's kept spot on a page, not just a move that happens to go nowhere.
 * Low-level reads and writes only, used by the keep commands (`timelineKeepHere.ts`) and by the
 * edits that turn a kept move into an ordinary one (`timelineMoves.ts`).
 *
 * The markers aren't in the change log, so an edit that only writes them gives an empty change
 * batch; they are a display table instead (`timelineDisplay.ts`).
 */

/** Every kept assignment's id. */
export async function readKeptAssignmentIds(
    db: DbConnection | DbTransaction,
): Promise<Set<number>> {
    const k = schema.timeline_kept_assignments;
    const rows = await db.select({ id: k.assignment_id }).from(k).all();
    return new Set(rows.map((r) => r.id));
}

/** Marks `assignmentIds` as kept. Already-kept ids are left alone. */
export async function markAssignmentsKeptInTransaction(
    tx: DbTransaction,
    assignmentIds: readonly number[],
): Promise<void> {
    const kept = await keptAmong(tx, assignmentIds);
    const toMark = [...new Set(assignmentIds)].filter((id) => !kept.has(id));
    if (toMark.length === 0) return;
    await tx
        .insert(schema.timeline_kept_assignments)
        .values(toMark.map((id) => ({ assignment_id: id })))
        .run();
}

/**
 * Clears the kept marker of each of `assignmentIds` that has one, so its move is an ordinary own
 * move. Writes nothing (and logs no undo row) for ids without one.
 *
 * @returns the ids whose marker was cleared
 */
export async function clearKeptMarkersInTransaction(
    tx: DbTransaction,
    assignmentIds: readonly number[],
): Promise<number[]> {
    const kept = [...(await keptAmong(tx, assignmentIds))].sort(
        (a, b) => a - b,
    );
    if (kept.length === 0) return [];
    const k = schema.timeline_kept_assignments;
    await tx.delete(k).where(inArray(k.assignment_id, kept)).run();
    return kept;
}

/** The ones among `assignmentIds` that are kept. */
export async function keptAmong(
    db: DbConnection | DbTransaction,
    assignmentIds: readonly number[],
): Promise<Set<number>> {
    if (assignmentIds.length === 0) return new Set();
    const k = schema.timeline_kept_assignments;
    const rows = await db
        .select({ id: k.assignment_id })
        .from(k)
        .where(inArray(k.assignment_id, [...new Set(assignmentIds)]))
        .all();
    return new Set(rows.map((r) => r.id));
}

/**
 * The transitions among `transitionIds` that hold a kept assignment: a kept move is its marcher's
 * own one-slot transition, so this names the kept moves by transition (**Move them too** leaves
 * them alone).
 */
export async function keptTransitionIds({
    db,
    transitionIds,
}: {
    db: DbConnection | DbTransaction;
    transitionIds: readonly number[];
}): Promise<Set<number>> {
    if (transitionIds.length === 0) return new Set();
    const a = schema.timeline_assignments;
    const k = schema.timeline_kept_assignments;
    const rows = await db
        .selectDistinct({ id: a.transition_id })
        .from(a)
        .innerJoin(k, eq(k.assignment_id, a.id))
        .where(inArray(a.transition_id, [...new Set(transitionIds)]))
        .all();
    return new Set(rows.map((r) => r.id));
}
