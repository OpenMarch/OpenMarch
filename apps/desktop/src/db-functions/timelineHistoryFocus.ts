import type { ChangeBatch, RowImage } from "@openmarch/core";
import { inArray } from "drizzle-orm";
import { DB, schema } from "../global/database/db";
import { DbConnection, DbTransaction } from "./types";
import {
    type GridPage,
    readPageGrid,
    timelineModeInTransaction,
} from "./timelineRipple";

/**
 * Where to look after an undo or redo in timeline mode (docs/timeline/phases/07-page-parity.md
 * P7.13).
 *
 * In page mode the app jumps to the page whose `marcher_pages` rows the action changed and selects
 * those marchers. In timeline mode those rows are frozen page-era data, so the same answer comes
 * from the action's committed change batch instead:
 *
 * - **Page of a change:** a marcher's home is where it stands on the first page. A marcher the
 *   action added or removed belongs to the current page instead (the first page when there is
 *   none): a new marcher has only a home and stands there on every page until moved, so undoing
 *   "add marcher" keeps you where you are rather than jumping to the first page. A transition,
 *   assignment or slot destination belongs to the page its move ends on: the page whose beats
 *   `(start, end]` hold the row's end beat, which is the page "move a marcher on page N" edits
 *   (D-16). A shape belongs to the pages of the transitions that end on it. Rows are read as they
 *   are after the action: the row image after it, or the one before it for a deleted row. When
 *   the action also changed `beats`, a deleted row's beats belong to the old beat grid and can't be
 *   placed on the new one, so deleted rows place nothing; rows that still exist decide.
 * - **Marchers of a change:** the marcher whose home changed; the assignment's marcher; for a slot
 *   destination, the marcher in that slot; for a transition (or a shape), every marcher with an
 *   assignment in it, unless the batch also changes that transition's assignments or destinations,
 *   which then name the marchers (so a slot count grown for a new marcher selects only that
 *   marcher). Assignments the action deleted count too: the caller drops marchers that no longer
 *   exist, and undoing a marcher delete selects the restored marchers.
 * - **Page to show:** the current page if the action changed it, so undoing an edit on the page
 *   you are looking at doesn't move you; otherwise the earliest changed page, which is where a
 *   ripple begins.
 * - **Marchers to select:** the marchers changed on that page, or no change to the selection when
 *   there are none (for example a shape no transition uses).
 */

type Change = ChangeBatch["changes"][number];

export interface TimelineHistoryFocus {
    pageIdToGoTo: number | undefined;
    marcherIdsToSelect: Set<number> | undefined;
    /** Every changed page with its changed marchers, in show order */
    marcherIdsByPageId: Map<number, Set<number>>;
}

const NO_FOCUS = (): TimelineHistoryFocus => ({
    pageIdToGoTo: undefined,
    marcherIdsToSelect: undefined,
    marcherIdsByPageId: new Map(),
});

const num = (image: RowImage | null, key: string): number | undefined => {
    const value = image?.[key];
    return typeof value === "number" ? value : undefined;
};

/**
 * The row as it is after the action: its image after it, or before it if it was deleted. With
 * `beatsChanged`, a deleted row's image is not used: its beats are on the old grid.
 */
const current = (change: Change, beatsChanged: boolean): RowImage | null =>
    change.after ?? (beatsChanged ? null : change.before);

/** The page whose beats `(start, end]` hold `endBeat`; the last page past the show's end. */
export const pageForEndBeat = (
    pages: readonly GridPage[],
    endBeat: number,
): GridPage | undefined =>
    pages.find((p) => p.start < endBeat && endBeat <= p.end) ??
    (pages.length > 0 && endBeat > pages[pages.length - 1]!.end
        ? pages[pages.length - 1]
        : pages[0]);

/** What the batch itself says, so rows the action deleted still count. */
interface BatchScan {
    /** The action changed `beats`, so deleted rows' beats can't be placed */
    beatsChanged: boolean;
    /** End beat per transition: from the batch, then overwritten by the live rows */
    transitionEnd: Map<number, number>;
    /** Assignment images before and after the action */
    assignments: RowImage[];
    shapeIds: Set<number>;
    /** Every transition the batch touches, directly or through its rows */
    transitionIds: Set<number>;
    /** Transitions whose assignments or destinations changed: those name the marchers */
    transitionsWithSlotChanges: Set<number>;
    /** Marchers whose row the action inserted or deleted, rather than only moved their home */
    addedOrRemovedMarchers: Set<number>;
}

const scanBatch = (batch: ChangeBatch, beatsChanged: boolean): BatchScan => {
    const scan: BatchScan = {
        beatsChanged,
        transitionEnd: new Map(),
        assignments: [],
        shapeIds: new Set(),
        transitionIds: new Set(),
        transitionsWithSlotChanges: new Set(),
        addedOrRemovedMarchers: new Set(),
    };
    for (const change of batch.changes) {
        const image = current(change, scan.beatsChanged);
        if (change.table === "transitions") {
            const end = num(image, "end");
            if (end !== undefined) scan.transitionEnd.set(change.rowId, end);
            scan.transitionIds.add(change.rowId);
        } else if (change.table === "assignments") {
            if (change.before) scan.assignments.push(change.before);
            if (change.after) scan.assignments.push(change.after);
            const transition = num(image, "transition");
            if (transition !== undefined) {
                scan.transitionIds.add(transition);
                scan.transitionsWithSlotChanges.add(transition);
            }
        } else if (change.table === "slot_destinations") {
            scan.transitionIds.add(change.rowId);
            scan.transitionsWithSlotChanges.add(change.rowId);
        } else if (change.table === "shapes") {
            scan.shapeIds.add(change.rowId);
        } else if (
            change.table === "marchers" &&
            (change.before === null || change.after === null)
        ) {
            scan.addedOrRemovedMarchers.add(change.rowId);
        }
    }
    return scan;
};

/** The rows as they are now: transitions into changed shapes, and the touched transitions' rows. */
const readLiveRows = async (reader: DbTransaction, scan: BatchScan) => {
    const t = schema.timeline_transitions;
    const a = schema.timeline_assignments;
    const shapeTransitions =
        scan.shapeIds.size > 0
            ? await reader
                  .select({ id: t.id })
                  .from(t)
                  .where(inArray(t.dest_shape_id, [...scan.shapeIds]))
                  .all()
            : [];
    for (const { id } of shapeTransitions) scan.transitionIds.add(id);

    const ids = [...scan.transitionIds];
    if (ids.length === 0) return { shapeTransitions, assignments: [] };
    const transitions = await reader
        .select({ id: t.id, end: t.end_beat })
        .from(t)
        .where(inArray(t.id, ids))
        .all();
    for (const row of transitions) scan.transitionEnd.set(row.id, row.end);
    const assignments = await reader
        .select({
            marcher: a.marcher_id,
            transition: a.transition_id,
            slot: a.slot_index,
        })
        .from(a)
        .where(inArray(a.transition_id, ids))
        .all();
    return { shapeTransitions, assignments };
};

/** Each changed page with the marchers changed on it. */
const changedPages = (
    batch: ChangeBatch,
    pages: readonly GridPage[],
    scan: BatchScan,
    live: Awaited<ReturnType<typeof readLiveRows>>,
    currentPage: GridPage | undefined,
): Map<number, Set<number>> => {
    /** Marchers with an assignment in `transitionId` (in `slot`, if given), now or in the batch */
    const marchersIn = (transitionId: number, slot?: number): number[] => {
        const out: number[] = [];
        for (const a of live.assignments)
            if (
                a.transition === transitionId &&
                (slot === undefined || a.slot === slot)
            )
                out.push(a.marcher);
        for (const image of scan.assignments) {
            const marcher = num(image, "marcher");
            if (
                marcher !== undefined &&
                num(image, "transition") === transitionId &&
                (slot === undefined || num(image, "slot") === slot)
            )
                out.push(marcher);
        }
        return out;
    };

    const byPage = new Map<number, Set<number>>();
    const add = (page: GridPage | undefined, marchers: Iterable<number>) => {
        if (!page) return;
        const set = byPage.get(page.id) ?? new Set<number>();
        for (const m of marchers) set.add(m);
        byPage.set(page.id, set);
    };
    const addForTransition = (transitionId: number, marchers: number[]) => {
        const end = scan.transitionEnd.get(transitionId);
        if (end !== undefined) add(pageForEndBeat(pages, end), marchers);
    };

    for (const change of batch.changes) {
        const image = current(change, scan.beatsChanged);
        switch (change.table) {
            case "marchers":
                add(
                    scan.addedOrRemovedMarchers.has(change.rowId)
                        ? (currentPage ?? pages[0])
                        : pages[0],
                    [change.rowId],
                );
                break;
            case "assignments": {
                const end = num(image, "end");
                const marcher = num(image, "marcher");
                if (end !== undefined)
                    add(
                        pageForEndBeat(pages, end),
                        marcher === undefined ? [] : [marcher],
                    );
                break;
            }
            case "transitions":
                // A slot count grown for a new marcher shouldn't select everyone in the move
                addForTransition(
                    change.rowId,
                    scan.transitionsWithSlotChanges.has(change.rowId)
                        ? []
                        : marchersIn(change.rowId),
                );
                break;
            case "slot_destinations":
                addForTransition(
                    change.rowId,
                    marchersIn(change.rowId, num(image, "slot")),
                );
                break;
            case "shapes":
                for (const { id } of live.shapeTransitions)
                    addForTransition(id, marchersIn(id));
                break;
        }
    }
    return byPage;
};

/**
 * Works out the page and marchers to show after an undo or redo whose committed batch is `batch`.
 *
 * Reads the page grid and the timeline rows as they are now; call it after the action commits,
 * under `withTimelineWriteLock` so no other edit runs in between.
 *
 * @param options.currentPageId the page the user is on, kept when the action changed it
 * @param options.beatsChanged the action changed `beats`, so deleted rows are not placed
 */
export async function timelineHistoryFocus(
    db: DbConnection | DB | DbTransaction,
    batch: ChangeBatch,
    {
        currentPageId,
        beatsChanged = false,
    }: { currentPageId?: number; beatsChanged?: boolean } = {},
): Promise<TimelineHistoryFocus> {
    if (batch.changes.length === 0) return NO_FOCUS();
    const reader = db as DbTransaction;
    const { pages } = await readPageGrid(reader);
    if (pages.length === 0) return NO_FOCUS();

    const scan = scanBatch(batch, beatsChanged);
    const live = await readLiveRows(reader, scan);
    const currentPage =
        currentPageId === undefined
            ? undefined
            : pages.find((p) => p.id === currentPageId);
    const byPage = changedPages(batch, pages, scan, live, currentPage);
    // A shape-only change (to a shape no transition uses) has no page
    if (byPage.size === 0) return NO_FOCUS();

    const marcherIdsByPageId = new Map<number, Set<number>>();
    for (const page of pages) {
        const marchers = byPage.get(page.id);
        if (marchers) marcherIdsByPageId.set(page.id, marchers);
    }
    const pageIdToGoTo =
        currentPageId !== undefined && marcherIdsByPageId.has(currentPageId)
            ? currentPageId
            : marcherIdsByPageId.keys().next().value!;
    const marchers = marcherIdsByPageId.get(pageIdToGoTo)!;
    return {
        pageIdToGoTo,
        marcherIdsToSelect: marchers.size > 0 ? marchers : undefined,
        marcherIdsByPageId,
    };
}

/** Whether the file's timeline flag is on (read from `workspace_settings`). */
export const timelineModeOn = (db: DbConnection | DB | DbTransaction) =>
    timelineModeInTransaction(db as DbTransaction);
