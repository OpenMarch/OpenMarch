import { inArray, sql } from "drizzle-orm";
import * as schema from "@om-electron/database/migrations/schema";
import type { DbTransaction } from "./types";
import { TimelineCommitViolationError } from "./timelineChanges";
import {
    arrivalRowSql,
    readHeldMarkArrivals,
    type HeldMarkArrival,
} from "./timelineHeldArrival";
import {
    nameHeldConflict,
    type HeldConflict,
    type HeldConflictSpot,
} from "./timelineHeldConflict";

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
 * 4. Else it had no arrival row. A mark that grows out of the marcher's **starting spot**
 *    (`homeArrivalSql`, #619: no row of the marcher starts before it) stays. One an edit gave a
 *    move starting before it, not ending at its start (a move on an earlier page, or Set as shown
 *    there), has nothing left to grow out of and is deleted: holding from where that move ends is
 *    a borrowed hold (#474). The edits that can do this say whose holds went
 *    (`startHoldsLostInTransaction`).
 * 5. **Trim** what is left of it where a row the edit re-timed now covers it (H-1): it ends where
 *    that row starts, and a part after the row is dropped (excursions are deferred, holds decision
 *    7). A mark left with no counts is deleted. Only **re-timed** rows trim: a move an edit writes
 *    over a hold is still refused at commit (`E-H1`, `timeline_held_violations`), since that is an
 *    edit, not a retime (04-anchors: "a move created over a hold's start trims it" applies only to
 *    re-times such as clip drags and resizes).
 * 6. **Merge** one marcher's marks that now touch or overlap into one (04-anchors: touching holds
 *    are one hold).
 *
 * A changed mark is deleted and inserted again with its id (`UNIQUE (marcher_id, start_beat)`
 * can't then trip over a neighbor moved in the same step), so undo restores the same row.
 */

/** Each mark's arrival row before an edit, by mark id (`readHeldMarkArrivals`). */
export type HeldArrivalsBefore = ReadonlyMap<number, number | null>;

/** A row's counts, `[start, end)`. */
interface RowCounts {
    readonly start: number;
    readonly end: number;
}

/** What the upkeep reads before an edit's function runs (`readHeldUpkeepBefore`). */
export interface HeldUpkeepBefore {
    /** Each mark's arrival row, by mark id */
    readonly arrivals: HeldArrivalsBefore;
    /**
     * Each mark's marcher and start, by mark id. Mark ids can be reused (no AUTOINCREMENT): a
     * mark whose marcher or start changed was written by the edit, so it is a new mark.
     */
    readonly marks: ReadonlyMap<number, { marcherId: number; start: number }>;
    /** The counts of every row of the marchers that have marks, by row id */
    readonly rows: ReadonlyMap<number, RowCounts>;
}

/** The marks' arrival rows, read before an edit's function runs. */
export async function readHeldArrivalsBefore(
    tx: DbTransaction,
): Promise<HeldArrivalsBefore> {
    return arrivalsOf(await readHeldMarkArrivals(tx));
}

const arrivalsOf = (marks: readonly HeldMarkArrival[]): HeldArrivalsBefore =>
    new Map(marks.map((m) => [m.id, m.arrivalId]));

/** One marcher's rows with their counts, for the marchers in `marcherIds`. */
async function readRows(tx: DbTransaction, marcherIds: readonly number[]) {
    if (marcherIds.length === 0) return [];
    const A = schema.timeline_assignments;
    return await tx
        .select({
            id: A.id,
            marcherId: A.marcher_id,
            start: A.start_beat,
            end: A.end_beat,
        })
        .from(A)
        .where(inArray(A.marcher_id, [...new Set(marcherIds)]))
        .all();
}

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
    const rows = await readRows(
        tx,
        marks.map((m) => m.marcherId),
    );
    return {
        arrivals: arrivalsOf(marks),
        marks: new Map(
            marks.map((m) => [
                m.id,
                { marcherId: m.marcherId, start: m.start },
            ]),
        ),
        rows: new Map(rows.map((r) => [r.id, { start: r.start, end: r.end }])),
    };
}

/** Whether `before` had an arrival row for `mark`, and which. */
const arrivalBefore = (
    before: HeldArrivalsBefore,
    mark: HeldMarkArrival,
): number | null => before.get(mark.id) ?? null;

/**
 * The holds from the starting spots (#619) that the upkeep after this edit will delete, named for
 * the edit's message, or `undefined` when there are none: marks that had no arrival row before the
 * edit, and now have neither a row nor the starting spot to grow out of, because the edit gave the
 * marcher a move starting before the hold that doesn't end at its start. Call it at the end of the
 * edit's function, with the arrivals read at its start (`readHeldArrivalsBefore`).
 */
export async function startHoldsLostInTransaction(
    tx: DbTransaction,
    before: HeldArrivalsBefore,
): Promise<HeldConflict | undefined> {
    const lost = (await readHeldMarkArrivals(tx)).filter(
        (m) =>
            m.arrivalId === null &&
            !m.fromHome &&
            before.has(m.id) &&
            before.get(m.id) === null,
    );
    if (lost.length === 0) return undefined;
    return nameHeldConflict(
        tx,
        lost.map((m) => ({ marcherId: m.marcherId, beat: m.start })),
    );
}

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
    const stillThere = new Set(
        (
            await tx
                .select({ id: A.id })
                .from(A)
                .where(
                    inArray(
                        A.id,
                        orphans.map((m) => arrivalBefore(before, m)!),
                    ),
                )
                .all()
        ).map((r) => r.id),
    );
    return orphans
        .filter((m) => !stillThere.has(arrivalBefore(before, m)!))
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
    const shifted = rows.filter((r) => {
        const was = before.rows.get(r.id);
        return (
            was !== undefined && (was.start !== r.start || was.end !== r.end)
        );
    });

    const kept: KeptMark[] = [];
    const refused: HeldMarkArrival[] = [];
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
            const row = was === null ? undefined : rowById.get(was);
            const rowWas = was === null ? undefined : before.rows.get(was);
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
                // 4. Nothing to grow out of any more, unless the starting spot
            } else if (!mark.fromHome) continue;
        }
        // 5. Trimmed where a re-timed row now covers it
        let end = mark.end;
        for (const r of shifted)
            if (
                r.marcherId === mark.marcherId &&
                r.start < end &&
                start < r.end
            )
                end = Math.max(start, r.start);
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
