import { eq, inArray } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import {
    applyHoldEdgeDrag,
    holdEdgeAllows,
    holdEdgeLimits,
    type HoldMark,
} from "@/timeline/holdExtent";
import { text } from "@/timeline/timelineText";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { NothingToDo, refuse } from "./timelineErrors";
import { readPageGrid, showEndBeat } from "./timelinePageGrid";
import { readHeldMarks } from "./timelineHeldArrival";

/**
 * **Shaping a hold** (holds README decisions 3, 5 and 6; 01-edit-rules "Bar-end drag", "Split hold
 * here"; fork #475). Both commands write only Held marks (`timeline_held_marks`): nobody moves,
 * since the marcher stands still over a hold whether it is Held or Not defined. They change what
 * an edit there does, and what the timeline draws.
 *
 * - `setHoldEdge`: a Held hold's end dragged to a count, within `holdEdgeLimits` (up to the
 *   marcher's next move and the show's end). A hold's start is fixed by what last put the marcher
 *   there (`holdReachBack`).
 * - `splitHoldAt`: **Split hold here** ends the selected marchers' holds at a count strictly
 *   inside them. What follows is Not defined: an edit there starts a new move where the hold now
 *   ends (leaving early, decision 6).
 *
 * Holds that touch or overlap afterwards become one (`mergeTouchingMarks`, 04-anchors), keeping
 * the earliest's id. A changed mark keeps its id, so undo restores the same row. One undo step
 * each; one that changes nothing opens no edit.
 */

export interface SetHoldEdgeResult {
    /** The marchers whose holds changed, ascending */
    readonly changed: number[];
}

export interface SplitHoldResult {
    /** The marchers whose holds now end at the count, ascending */
    readonly split: number[];
}

/** Every row of `marcherIds`' as a beat range, by marcher. */
async function readMoves(
    tx: DbTransaction,
    marcherIds: readonly number[],
): Promise<Map<number, { start: number; end: number }[]>> {
    const out = new Map<number, { start: number; end: number }[]>();
    if (marcherIds.length === 0) return out;
    const A = schema.timeline_assignments;
    const rows = await tx
        .select({
            marcherId: A.marcher_id,
            start: A.start_beat,
            end: A.end_beat,
        })
        .from(A)
        .where(inArray(A.marcher_id, [...new Set(marcherIds)]))
        .all();
    for (const row of rows)
        out.set(row.marcherId, [
            ...(out.get(row.marcherId) ?? []),
            { start: row.start, end: row.end },
        ]);
    return out;
}

/** The show's end: the last page's flag. */
async function readShowEnd(tx: DbTransaction): Promise<number> {
    return showEndBeat(await readPageGrid(tx));
}

/**
 * Writes `after` over `before` (one marcher set's marks): those gone are deleted first, so a
 * changed mark can take a start a merged neighbor had (`UNIQUE (marcher_id, start_beat)`), then
 * changed ones are updated in place, keeping their ids.
 *
 * @returns the marchers whose marks changed, ascending
 */
async function writeMarks(
    tx: DbTransaction,
    before: readonly HoldMark[],
    after: readonly HoldMark[],
): Promise<number[]> {
    const h = schema.timeline_held_marks;
    const kept = new Map(after.map((m) => [m.id, m]));
    const gone = before.filter((m) => !kept.has(m.id));
    const changed = after.filter((m) => {
        const was = before.find((b) => b.id === m.id)!;
        return was.start !== m.start || was.end !== m.end;
    });
    if (gone.length > 0)
        await tx.delete(h).where(
            inArray(
                h.id,
                gone.map((m) => m.id),
            ),
        );
    for (const mark of changed)
        await tx
            .update(h)
            .set({ start_beat: mark.start, end_beat: mark.end })
            .where(eq(h.id, mark.id));
    return [...new Set([...gone, ...changed].map((m) => m.marcherId))].sort(
        (x, y) => x - y,
    );
}

/**
 * Drags the end of the Held holds of `marcherIds` that end at `from` to `to` (see the module
 * comment). Refused (`E-ARGS`), writing nothing, when `to` is past where any of them may go.
 * Marchers with no hold ending at `from` are left alone.
 */
export async function setHoldEdge({
    db,
    marcherIds,
    from,
    to,
}: {
    db: DbConnection;
    marcherIds: readonly number[];
    from: number;
    to: number;
}): Promise<SetHoldEdgeResult> {
    if (marcherIds.length === 0 || from === to) return { changed: [] };
    if (!Number.isInteger(to))
        refuse(text.t("timeline.refusals.holdEdge.outside"));
    try {
        return await transactionWithHistory(db, "setHoldEdge", async (tx) => {
            const ids = [...new Set(marcherIds)];
            const marks = await readHeldMarks(tx, ids);
            const dragged = marks.filter((m) => m.end === from);
            if (dragged.length === 0) throw new NothingToDo({ changed: [] });
            const moves = await readMoves(
                tx,
                dragged.map((m) => m.marcherId),
            );
            const showEnd = await readShowEnd(tx);
            for (const mark of dragged) {
                const limits = holdEdgeLimits({
                    mark,
                    moves: moves.get(mark.marcherId) ?? [],
                    showEnd,
                });
                if (!limits || !holdEdgeAllows(limits, to))
                    refuse(text.t("timeline.refusals.holdEdge.outside"));
            }
            const draggedIds = [...new Set(dragged.map((m) => m.marcherId))];
            const own = marks.filter((m) => draggedIds.includes(m.marcherId));
            const after = applyHoldEdgeDrag(own, {
                from,
                to,
                marcherIds: draggedIds,
            });
            const changed = await writeMarks(tx, own, after);
            if (changed.length === 0) throw new NothingToDo({ changed: [] });
            return { changed };
        });
    } catch (e) {
        if (e instanceof NothingToDo) return e.result as SetHoldEdgeResult;
        throw e;
    }
}

/**
 * **Split hold here**: the Held holds of `marcherIds` with `beat` strictly inside them
 * (`start < beat < end`) end at `beat`; what follows is Not defined (see the module comment).
 */
export async function splitHoldAt({
    db,
    marcherIds,
    beat,
}: {
    db: DbConnection;
    marcherIds: readonly number[];
    beat: number;
}): Promise<SplitHoldResult> {
    if (marcherIds.length === 0 || !Number.isInteger(beat))
        return { split: [] };
    try {
        return await transactionWithHistory(db, "splitHold", async (tx) => {
            const marks = (
                await readHeldMarks(tx, [...new Set(marcherIds)])
            ).filter((m) => m.start < beat && beat < m.end);
            if (marks.length === 0) throw new NothingToDo({ split: [] });
            const after = marks.map((m) => ({ ...m, end: beat }));
            return { split: await writeMarks(tx, marks, after) };
        });
    } catch (e) {
        if (e instanceof NothingToDo) return e.result as SplitHoldResult;
        throw e;
    }
}

/** Whether a Split hold here at `beat` would split any of `marks` (`start < beat < end`). */
export const splitsAnyHold = (
    marks: readonly { start: number; end: number }[],
    beat: number,
): boolean => marks.some((m) => m.start < beat && beat < m.end);
