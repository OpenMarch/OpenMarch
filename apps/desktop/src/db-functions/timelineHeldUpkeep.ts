import { inArray, sql } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbTransaction } from "./types";
import { TimelineCommitViolationError } from "./timelineChanges";
import { holdReachBack } from "@/timeline/holdExtent";
import {
    arrivalRowSql,
    readArrival,
    readHeldMarkArrivals,
    type HeldMarkArrival,
} from "./timelineHeldArrival";
import {
    nameHeldConflict,
    type HeldConflictSpot,
} from "./timelineHeldConflict";
import { readPageGrid, showStartBeat } from "./timelinePageGrid";

/**
 * **Keeping Held marks true after an edit** (ADR 0012 amendment 2026-10-30, Upkeep; holds
 * 04-anchors "Keeping it true"; fork #473).
 *
 * `transactionWithHistory` reads, before the edit's function, each mark's arrival row
 * (`arrivalRowSql`) and the counts of every row of the marchers that have marks
 * (`readHeldUpkeepBefore`). Right after the function, before the history group is read, it keeps
 * the marks true (`keepHeldMarksTrueInTransaction`), so what that writes is in the edit's undo
 * step. It never runs during undo or redo replay, which restore what an edit changed. For each
 * mark, in this order:
 *
 * 1. **Keep** it where a row of the marcher still arrives at its start, whichever row that is:
 *    Basic rewrites a page's move as a new row ending at the same flag, and Split at playhead
 *    keeps the original rows as the half after the count. Page and beat edits have already moved
 *    a mark with its arrival (`planTimelineRipple`).
 * 2. Else, when its arrival row is still there and was **re-timed** (a clip drag, resize or merge
 *    refit of the arrival's move), **move** its start to the row's new end; its end stays. The
 *    hold follows its arrival, earlier or later (holds review R7). Should the row no longer arrive
 *    there by the arrival rule (a move on a higher layer ends there too), the edit is refused with
 *    `E-H1`, naming the marcher and the held page, rather than leave a hold nothing arrives at.
 * 3. Else, when its arrival row was **deleted** (Remove keyframe, Delete move, a page's move taken
 *    out), **delete** it: the hold meant "stand at this spot", and the spot is gone (holds
 *    decision 17). The edits that can do this as a side effect name it
 *    (`arrivalHoldsLostInTransaction`).
 * 4. Else nothing arrives at its start, and it had no arrival to lose. It **reaches back** to what
 *    last put the marcher there (`holdReachBack`, as Hold from last keyframe does; owner,
 *    2026-11-09): the marcher's last row end, the end of its own earlier hold, or the start of the
 *    show. A row ending there that doesn't arrive leaves it nothing to grow out of, and it goes.
 * 5. **Trim** what is left of it where a row the edit re-timed now covers it (H-1). A row over its
 *    start trims it from the start: it now starts where that row ends, and grows out of that end
 *    (04-anchors; a resize or clip drag of a move into it). A row starting
 *    inside it ends it where that row starts, and a part after the row is dropped (excursions are
 *    deferred, holds decision 7). A mark left with no counts is deleted. Only **re-timed** rows trim: a move an edit writes
 *    over a hold is still refused at commit (`E-H1`, `timeline_held_violations`), since that is an
 *    edit, not a retime (04-anchors: "a move created over a hold's start trims it" applies only to
 *    re-times such as clip drags and resizes). An Expert window's edit trims the holds it writes
 *    over itself (`trimHeldMarksUnderRowsInTransaction`, review R2, #476).
 * 6. **Merge** one marcher's marks that now touch or overlap into one (04-anchors: touching holds
 *    are one hold).
 *
 * A changed mark is deleted and inserted again with its id (`UNIQUE (marcher_id, start_beat)`
 * can't then trip over a neighbor moved in the same step), so undo restores the same row.
 */

/**
 * Which `timeline_assignments` row a row is: its id, marcher and move. Row ids can be reused (no
 * AUTOINCREMENT), so a row is the same row after an edit only when its marcher and move still
 * match too (`isSameRow`); otherwise the old row was deleted and the edit wrote a new one.
 */
interface RowIdentity {
    readonly id: number;
    readonly marcherId: number;
    readonly transitionId: number;
}

/** A row with its counts, `[start, end)`. */
interface RowCounts extends RowIdentity {
    readonly start: number;
    readonly end: number;
}

/** Whether `now` is the row `was` was, not a new row reusing its id. */
const isSameRow = (was: RowIdentity, now: RowIdentity): boolean =>
    was.id === now.id &&
    was.marcherId === now.marcherId &&
    was.transitionId === now.transitionId;

/** Each mark's arrival row before an edit, by mark id (`readHeldMarkArrivals`). */
export type HeldArrivalsBefore = ReadonlyMap<number, RowIdentity | null>;

/** What the upkeep reads before an edit's function runs (`readHeldUpkeepBefore`). */
export interface HeldUpkeepBefore {
    /** Each mark's arrival row, by mark id */
    readonly arrivals: HeldArrivalsBefore;
    /**
     * Each mark's marcher and start, by mark id. Mark ids can be reused (no AUTOINCREMENT): a
     * mark whose marcher or start changed was written by the edit, so it is a new mark.
     */
    readonly marks: ReadonlyMap<number, { marcherId: number; start: number }>;
    /** Every row of the marchers that have marks, with its counts, by row id */
    readonly rows: ReadonlyMap<number, RowCounts>;
}

/** The marks' arrival rows, read before an edit's function runs. */
export async function readHeldArrivalsBefore(
    tx: DbTransaction,
): Promise<HeldArrivalsBefore> {
    const marks = await readHeldMarkArrivals(tx);
    return arrivalsOf(marks, await readRowsById(tx, marks));
}

const arrivalsOf = (
    marks: readonly HeldMarkArrival[],
    rows: ReadonlyMap<number, RowCounts>,
): HeldArrivalsBefore =>
    new Map(
        marks.map((m) => [
            m.id,
            m.arrivalId === null ? null : rows.get(m.arrivalId)!,
        ]),
    );

/** The rows of the marchers in `marcherIds`, with their moves and counts. */
async function readRows(
    tx: DbTransaction,
    marcherIds: readonly number[],
): Promise<RowCounts[]> {
    if (marcherIds.length === 0) return [];
    const A = schema.timeline_assignments;
    return await tx
        .select({
            id: A.id,
            marcherId: A.marcher_id,
            transitionId: A.transition_id,
            start: A.start_beat,
            end: A.end_beat,
        })
        .from(A)
        .where(inArray(A.marcher_id, [...new Set(marcherIds)]))
        .all();
}

/** The rows of the marchers with `marks`, by row id. */
const readRowsById = async (
    tx: DbTransaction,
    marks: readonly HeldMarkArrival[],
): Promise<Map<number, RowCounts>> =>
    new Map(
        (
            await readRows(
                tx,
                marks.map((m) => m.marcherId),
            )
        ).map((r) => [r.id, r]),
    );

/**
 * What the upkeep after an edit compares against: the marks' arrival rows, and the counts of the
 * rows of the marchers with marks (so it can tell a re-timed row). Nothing when there are no marks.
 */
export async function readHeldUpkeepBefore(
    tx: DbTransaction,
): Promise<HeldUpkeepBefore> {
    const marks = await readHeldMarkArrivals(tx);
    if (marks.length === 0)
        return { arrivals: new Map(), marks: new Map(), rows: new Map() };
    const rows = await readRowsById(tx, marks);
    return {
        arrivals: arrivalsOf(marks, rows),
        marks: new Map(
            marks.map((m) => [
                m.id,
                { marcherId: m.marcherId, start: m.start },
            ]),
        ),
        rows,
    };
}

/** Whether `before` had an arrival row for `mark`, and which. */
const arrivalBefore = (
    before: HeldArrivalsBefore,
    mark: HeldMarkArrival,
): RowIdentity | null => before.get(mark.id) ?? null;

/**
 * The holds whose arrival row this edit deleted, which the upkeep after it will delete (step 3 of
 * the module comment), as the spots where they start: for an edit that takes a move away as a side
 * effect of something else (Clear this page on the page a hold arrives from) to say so. Call it at
 * the end of the edit's function, with the arrivals read at its start (`readHeldArrivalsBefore`).
 */
export async function arrivalHoldsLostInTransaction(
    tx: DbTransaction,
    before: HeldArrivalsBefore,
): Promise<HeldConflictSpot[]> {
    const orphans = (await readHeldMarkArrivals(tx)).filter(
        (m) => m.arrivalId === null && arrivalBefore(before, m) !== null,
    );
    if (orphans.length === 0) return [];
    const A = schema.timeline_assignments;
    const now = new Map(
        (
            await tx
                .select({
                    id: A.id,
                    marcherId: A.marcher_id,
                    transitionId: A.transition_id,
                })
                .from(A)
                .where(
                    inArray(
                        A.id,
                        orphans.map((m) => arrivalBefore(before, m)!.id),
                    ),
                )
                .all()
        ).map((r) => [r.id, r]),
    );
    // A row reusing the arrival's id for another marcher or move is a new row: the arrival went
    const stillThere = (was: RowIdentity) => {
        const row = now.get(was.id);
        return row !== undefined && isSameRow(was, row);
    };
    return orphans
        .filter((m) => !stillThere(arrivalBefore(before, m)!))
        .map((m) => ({ marcherId: m.marcherId, beat: m.start }));
}

/** Whether row `rowId` of `marcherId` is the arrival at `beat` (`arrivalRowSql`). */
async function arrivesAt(
    tx: DbTransaction,
    marcherId: number,
    beat: number,
    rowId: number,
): Promise<boolean> {
    const [row] = (await tx.all(
        sql`SELECT ${arrivalRowSql(sql`${marcherId}`, sql`${beat}`)} AS id`,
    )) as unknown[];
    const id = Array.isArray(row)
        ? row[0]
        : (row as Record<string, unknown> | undefined)?.id;
    return id !== null && id !== undefined && Number(id) === rowId;
}

/** A mark as the upkeep leaves it. */
interface KeptMark {
    readonly id: number;
    readonly marcherId: number;
    start: number;
    end: number;
}

/**
 * Keeps the marks true after an edit's function (see the module comment): follows re-timed
 * arrivals, drops marks whose arrival went, trims marks re-timed rows now cover and merges marks
 * that touch, or refuses (`E-H1`) an edit that left an arrival row ending somewhere it no longer
 * arrives. Writes nothing when every mark is as it was.
 */
export async function keepHeldMarksTrueInTransaction(
    tx: DbTransaction,
    before: HeldUpkeepBefore,
): Promise<void> {
    const marks = await readHeldMarkArrivals(tx);
    if (marks.length === 0) return;
    const rows = await readRows(
        tx,
        marks.map((m) => m.marcherId),
    );
    const rowById = new Map(rows.map((r) => [r.id, r]));
    /** The row with id `id` now, when it is still the row that had it before the edit */
    const sameRowNow = (id: number) => {
        const was = before.rows.get(id);
        const row = rowById.get(id);
        return was && row && isSameRow(was, row) ? row : undefined;
    };
    const shifted = rows.filter((r) => {
        const was = before.rows.get(r.id);
        return (
            was !== undefined &&
            isSameRow(was, r) &&
            (was.start !== r.start || was.end !== r.end)
        );
    });

    const kept: KeptMark[] = [];
    const refused: HeldMarkArrival[] = [];
    let showStart: number | undefined;
    for (const mark of marks) {
        let start = mark.start;
        if (mark.arrivalId === null) {
            const markWas = before.marks.get(mark.id);
            const same =
                markWas !== undefined &&
                markWas.marcherId === mark.marcherId &&
                markWas.start === mark.start;
            // A mark the edit wrote (perhaps reusing a deleted mark's id) has no arrival history
            const was = same ? arrivalBefore(before.arrivals, mark) : null;
            // A row the edit wrote reusing the arrival's id is not the arrival (#726)
            const row = was === null ? undefined : sameRowNow(was.id);
            const rowWas = was === null ? undefined : before.rows.get(was.id);
            if (was !== null && !row) {
                // 3. Its arrival was deleted: the hold goes with it
                continue;
            } else if (row && rowWas !== undefined && rowWas.end !== row.end) {
                // 2. Its arrival was re-timed: the hold's start follows it
                if (!(await arrivesAt(tx, mark.marcherId, row.end, row.id))) {
                    refused.push(mark);
                    continue;
                }
                start = row.end;
            } else if (row) {
                // Its arrival row is still there, ending where it did, but no longer arrives (another
                // row now arrives there too): refuse rather than drop the hold without a word
                refused.push(mark);
                continue;
            } else {
                // 4. Nothing arrives here: it reaches back to what last put the marcher there,
                // unless a row now covers its start (trimmed below, or refused at commit)
                const own = rows.filter((r) => r.marcherId === mark.marcherId);
                if (!own.some((r) => r.start <= start && start < r.end)) {
                    showStart ??= showStartBeat(await readPageGrid(tx));
                    const reach = holdReachBack({
                        start,
                        rows: own,
                        marks: kept.filter(
                            (m) => m.marcherId === mark.marcherId,
                        ),
                        showStart,
                    });
                    if (
                        reach.kind === "row" &&
                        !(await readArrival(tx, mark.marcherId, reach.beat))
                    )
                        continue;
                    start = reach.beat;
                }
            }
        }
        // 5. Trimmed where a re-timed row now covers it. A row over its start trims it from the
        // start, so it grows out of that row's end (holds 04-anchors; demo `normalize`); then a
        // row starting inside it ends it there. By start, so a row over the new start comes later
        const own = shifted
            .filter((r) => r.marcherId === mark.marcherId)
            .sort((x, y) => x.start - y.start);
        for (const r of own)
            if (r.start <= start && start < r.end) start = r.end;
        let end = mark.end;
        for (const r of own) if (r.start < end && start < r.end) end = r.start;
        if (end > start)
            kept.push({ id: mark.id, marcherId: mark.marcherId, start, end });
    }
    if (refused.length > 0)
        throw new TimelineCommitViolationError(
            refused.map((m) => ({
                code: "E-H1",
                transitionId: null,
                detail: `marcher ${m.marcherId} is Held over [${m.start}, ${m.end}) but its arrival no longer arrives at its start`,
            })),
            await nameHeldConflict(
                tx,
                refused.map((m) => ({ marcherId: m.marcherId, beat: m.start })),
            ),
        );

    await writeKeptMarks(tx, marks, mergeTouching(kept));
}

/** 6. One marcher's marks that touch or overlap become one, keeping the earliest's id. */
function mergeTouching(kept: KeptMark[]): KeptMark[] {
    const sorted = [...kept].sort(
        (x, y) => x.marcherId - y.marcherId || x.start - y.start,
    );
    const merged: KeptMark[] = [];
    for (const mark of sorted) {
        const last = merged[merged.length - 1];
        if (last && last.marcherId === mark.marcherId && mark.start <= last.end)
            last.end = Math.max(last.end, mark.end);
        else merged.push(mark);
    }
    return merged;
}

/**
 * Writes the marks as the upkeep leaves them: those not `kept` are deleted, and a changed one is
 * deleted and inserted again with its id (see the module comment).
 */
async function writeKeptMarks(
    tx: DbTransaction,
    marks: readonly HeldMarkArrival[],
    kept: readonly KeptMark[],
): Promise<void> {
    const original = new Map(marks.map((m) => [m.id, m]));
    const changed = kept.filter((m) => {
        const was = original.get(m.id)!;
        return was.start !== m.start || was.end !== m.end;
    });
    const keptIds = new Set(kept.map((m) => m.id));
    const gone = [
        ...marks.filter((m) => !keptIds.has(m.id)).map((m) => m.id),
        ...changed.map((m) => m.id),
    ];
    if (gone.length === 0) return;
    const h = schema.timeline_held_marks;
    await tx.delete(h).where(inArray(h.id, gone));
    if (changed.length > 0)
        await tx.insert(h).values(
            changed.map((m) => ({
                id: m.id,
                marcher_id: m.marcherId,
                start_beat: m.start,
                end_beat: m.end,
            })),
        );
}
