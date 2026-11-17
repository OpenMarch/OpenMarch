import { inArray, isNotNull } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import { holdStyleOf, type HoldStyle } from "@/timeline/holdStyle";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { NothingToDo } from "./timelineErrors";
import {
    hasHeldMarksTable,
    isInsideHeldMark,
    readHeldMarks,
} from "./timelineHeldArrival";

/** A Held hold that carries a style of its own, in spec beats `[start, end)`. */
export interface StyledHeldMark {
    readonly marcherId: number;
    readonly start: number;
    readonly end: number;
    readonly style: HoldStyle;
}

/**
 * The Held holds that carry a style this build knows, by marcher and start: what the 3D View
 * plays over the show setting (`holdStyleSpans`). None in a file without the table.
 */
export async function readStyledHeldMarks(
    db: DbConnection | DbTransaction,
): Promise<StyledHeldMark[]> {
    if (!(await hasHeldMarksTable(db))) return [];
    const h = schema.timeline_held_marks;
    const rows = await db
        .select()
        .from(h)
        .where(isNotNull(h.style))
        .orderBy(h.marcher_id, h.start_beat)
        .all();
    return rows.flatMap((row) => {
        const style = holdStyleOf(row.style);
        return style === null
            ? []
            : [
                  {
                      marcherId: row.marcher_id,
                      start: row.start_beat,
                      end: row.end_beat,
                      style,
                  },
              ];
    });
}

/**
 * **Hold style** (ADR 0015 D-5; fork #775): sets what the feet do over the Held holds of
 * `marcherIds` that the count `beat` is inside (`isInsideHeldMark`): stand, mark time or high mark
 * time, or `null` for the show setting. The style is the whole hold's, on every page it covers.
 *
 * It writes only `timeline_held_marks.style`: nobody moves, and the resolver never reads it. The
 * 3D View plays it (`holdStyleSpans`). Marchers that aren't Held at `beat` are left alone: a hold
 * that isn't a stored Held mark uses the show setting. One undo step; one that changes nothing
 * opens no edit.
 */
export interface SetHoldStyleResult {
    /** The marchers whose hold changed style, ascending */
    readonly changed: number[];
}

export async function setHoldStyle({
    db,
    marcherIds,
    beat,
    style,
}: {
    db: DbConnection;
    marcherIds: readonly number[];
    beat: number;
    style: HoldStyle | null;
}): Promise<SetHoldStyleResult> {
    if (marcherIds.length === 0) return { changed: [] };
    try {
        return await transactionWithHistory(db, "setHoldStyle", async (tx) => {
            const marks = (
                await readHeldMarks(tx, [...new Set(marcherIds)])
            ).filter(
                (m) => isInsideHeldMark(m, beat) && (m.style ?? null) !== style,
            );
            if (marks.length === 0) throw new NothingToDo({ changed: [] });
            const h = schema.timeline_held_marks;
            await tx
                .update(h)
                .set({ style })
                .where(
                    inArray(
                        h.id,
                        marks.map((m) => m.id),
                    ),
                );
            return {
                changed: [...new Set(marks.map((m) => m.marcherId))].sort(
                    (x, y) => x - y,
                ),
            };
        });
    } catch (e) {
        if (e instanceof NothingToDo) return e.result as SetHoldStyleResult;
        throw e;
    }
}
