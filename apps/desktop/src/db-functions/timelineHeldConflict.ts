import { and, eq, sql } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbTransaction } from "./types";
import { readPageGrid } from "./timelinePageGrid";

/**
 * Who an `E-H1` refusal is about, named for its message (ADR 0001 amendment 2026-10-30). Read by
 * the commit check (`assertNoTimelineCommitViolationsInTransaction`) and the Held marks' upkeep,
 * so it loads nothing the main process's open and convert path mustn't (no ripple, no history).
 */

/** Who an E-H1 refusal is about: the marchers with a move inside their mark, and its pages. */
export interface HeldConflict {
    /** Drill numbers ("T1"), by drill order */
    readonly names: string[];
    /** The names of the pages the conflicts are on, in show order */
    readonly pages: string[];
}

/** Where a Held mark conflicts with an edit: the marcher, and a count of the conflict. */
export interface HeldConflictSpot {
    readonly marcherId: number;
    /** A count in the conflict (its first); its page is named */
    readonly beat: number;
}

/**
 * The marchers that have a move inside one of their marks (the E-H1 rows of
 * `timeline_held_violations`), named for the refusal's message, each on the page where the move
 * first overlaps the mark.
 */
export async function heldConflictInTransaction(
    tx: DbTransaction,
): Promise<HeldConflict> {
    const h = schema.timeline_held_marks;
    const a = schema.timeline_assignments;
    const rows = await tx
        .selectDistinct({
            marcherId: h.marcher_id,
            beat: sql<number>`max(${a.start_beat}, ${h.start_beat})`,
        })
        .from(h)
        .innerJoin(a, eq(a.marcher_id, h.marcher_id))
        .where(
            and(
                sql`${a.start_beat} < ${h.end_beat}`,
                sql`${h.start_beat} < ${a.end_beat}`,
            ),
        )
        .all();
    return nameHeldConflict(tx, rows);
}

/** `spots` named for an E-H1 refusal: their marchers in drill order, their pages in show order. */
export async function nameHeldConflict(
    tx: DbTransaction,
    spots: readonly HeldConflictSpot[],
): Promise<HeldConflict> {
    const m = schema.marchers;
    const marchers = await tx
        .select({ id: m.id, prefix: m.drill_prefix, order: m.drill_order })
        .from(m)
        .all();
    const conflicted = new Set(spots.map((s) => s.marcherId));
    const names = marchers
        .filter((r) => conflicted.has(r.id))
        .sort((x, y) => x.prefix.localeCompare(y.prefix) || x.order - y.order)
        .map((r) => `${r.prefix}${r.order}`);
    const grid = await readPageGrid(tx);
    const pageOf = (beat: number) =>
        grid.pages.find((p) => p.id !== 0 && p.start <= beat && beat < p.end);
    const pages = grid.pages
        .filter((p) => spots.some((s) => pageOf(s.beat) === p))
        .flatMap((p) => (p.name === undefined ? [] : [p.name]));
    return { names, pages };
}
