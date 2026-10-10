import { create } from "zustand";
import { sql } from "drizzle-orm";
import { Constants } from "../global/Constants";
import type { DbTransaction } from "./types";

/**
 * The display signal for timeline edits that never reach the change log (P7.15).
 *
 * The change log covers five tables (spec §10.2), so an edit to a `timelines` row alone (name or
 * range) or a shape rename gives an empty batch and leaves the resolver store's version where it
 * was. Those edits don't change what the resolver answers, but views that show the rows read
 * (the timeline's tracks, the inspector) must still refresh. The write wrapper and undo and redo
 * bump this version after a commit that touched `timelines`, `timeline_shapes`, `marchers` or
 * `timeline_kept_assignments`, and those views
 * follow it next to the resolver version. It never feeds the resolver.
 */
export const useTimelineDisplayStore = create<{ version: number }>(() => ({
    version: 0,
}));

/** The tables whose edits the display version follows. */
const DISPLAY_TABLES: ReadonlySet<string> = new Set([
    "timelines",
    "timeline_shapes",
    // Track labels show the marchers' drill numbers
    "marchers",
    // Kept spots (ADR 0001 amendment 2026-10-09): never in the change log
    "timeline_kept_assignments",
]);

/** Whether a commit that touched `tableNames` should bump the display version. */
export const touchesTimelineDisplayTables = (
    tableNames: Iterable<string>,
): boolean => {
    for (const name of tableNames) if (DISPLAY_TABLES.has(name)) return true;
    return false;
};

/** Bumps the display version, so views that read timeline rows reload. */
export function bumpTimelineDisplayVersion(): void {
    useTimelineDisplayStore.setState((s) => ({ version: s.version + 1 }));
}

/** The current display version. */
export const timelineDisplayVersion = (): number =>
    useTimelineDisplayStore.getState().version;

/** The table a history statement (`UPDATE "t" ...`, `DELETE FROM "t" ...`) writes, if it names one. */
export const historyStatementTable = (statement: string): string | undefined =>
    statement.match(/"(.*?)"/)?.[1];

/**
 * Whether the undo statements logged for `group` write a display table. SQL does the filtering
 * (the statements are long), and a failure is logged and counts as no: it must never abort the
 * edit it observes.
 */
export async function undoGroupTouchesDisplayTables(
    tx: DbTransaction,
    group: number,
): Promise<boolean> {
    try {
        const patterns = [...DISPLAY_TABLES].flatMap((table) => [
            `UPDATE "${table}" %`,
            `INSERT INTO "${table}" %`,
            `DELETE FROM "${table}" %`,
        ]);
        const matches = patterns
            .map((pattern) => `"sql" LIKE '${pattern}'`)
            .join(" OR ");
        const rows = (await tx.all(
            sql.raw(
                `SELECT 1 AS hit FROM ${Constants.UndoHistoryTableName} WHERE "history_group" = ${Number(group)} AND (${matches}) LIMIT 1`,
            ),
        )) as unknown[];
        return rows.length > 0;
    } catch (error) {
        console.error("Couldn't check the edit for display tables", error);
        return false;
    }
}
