import { asc, gt, eq, lt, desc, and, inArray } from "drizzle-orm";
import { DbConnection, DbTransaction } from "./types";
import { schema } from "@/global/database/db";
import { updateEndPoint } from "./pathways";
import { transactionWithHistory } from "./history";
import { refusePageEraWriteInTimelineMode } from "./pageEraFreeze";
import { assert } from "@/utilities/utils";
import {
    DatabaseShapePageMarcher,
    getSpmByMarcherPage,
    getSpmMapAll,
    getSpmMapByPageId,
    ShapePageMarcher,
} from "./shapePageMarchers";
import MarcherPage, { DatabaseMarcherPage } from "@/global/classes/MarcherPage";
import { appearanceModelRawToParsed } from "@/entity-components/appearance";

const { marcher_pages } = schema;

type MarcherPageIdentifier =
    | {
          marcherId: number;
          pageId: number;
      }
    | { marcherPageId: number };

/**
 * Filters for the marcherPageQueries.getAll function
 */
export type MarcherPageQueryFilters =
    | {
          marcher_id?: number;
          page_id?: number;
      }
    | undefined;

/**
 * Defines the editable fields of a MarcherPage.
 * `marcher_id` and `page_id` are used to identify the marcherPage and cannot be changed.
 */
export interface ModifiedMarcherPageArgs {
    marcher_id: number;
    page_id: number;
    /** The new X coordinate of the MarcherPage */
    x: number;
    /** The new Y coordinate of the MarcherPage */
    y: number;
    notes?: string | null;
    /** The ID of the pathway data */
    path_data_id?: number | null;
    /** The position along the pathway (0-1) */
    path_start_position?: number | null;
    path_end_position?: number | null;
}

async function getMarcherPageByPosition(
    tx: DbTransaction | DbConnection,
    id: MarcherPageIdentifier,
    direction: "next" | "previous",
): Promise<MarcherPage | null> {
    const idCheck = () =>
        "marcherId" in id
            ? eq(schema.marcher_pages.marcher_id, id.marcherId) &&
              eq(schema.marcher_pages.page_id, id.pageId)
            : eq(schema.marcher_pages.id, id.marcherPageId);

    // Subquery: current marcher_id and current beat position
    const cur = await tx
        .select({
            marcherId: schema.marcher_pages.marcher_id,
            curPos: schema.beats.position,
        })
        .from(schema.marcher_pages)
        .innerJoin(
            schema.pages,
            eq(schema.pages.id, schema.marcher_pages.page_id),
        )
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .where(idCheck())
        .limit(1)
        .as("cur");

    if (cur === undefined) {
        return null;
    }

    // Main query: marcher_pages for same marcher where beat.position is greater/less than curPos
    const comparison =
        direction === "next"
            ? gt(schema.beats.position, cur.curPos)
            : lt(schema.beats.position, cur.curPos);

    const ordering =
        direction === "next"
            ? asc(schema.beats.position)
            : desc(schema.beats.position);

    const rows = await tx
        .select({ mp: schema.marcher_pages })
        .from(schema.marcher_pages)
        .innerJoin(
            schema.pages,
            eq(schema.pages.id, schema.marcher_pages.page_id),
        )
        .innerJoin(schema.beats, eq(schema.beats.id, schema.pages.start_beat))
        .innerJoin(cur, eq(cur.marcherId, schema.marcher_pages.marcher_id))
        .where(comparison)
        .orderBy(ordering)
        .limit(1);

    const marcherPage = rows[0]?.mp ?? null;
    if (marcherPage == null) return null;

    const key = marcherPageToKeyString(rows[0].mp);
    const spm = await getSpmByMarcherPage({
        tx,
        marcherPage: {
            marcher_id: marcherPage.marcher_id,
            page_id: marcherPage.page_id,
        },
    });
    const map = spm ? new Map([[key, spm]]) : new Map();
    // Ensure the marcher page is decorated with the locked status and locked reason.
    // I.e. give a single entry map with the marcher page and the spm
    return lockedDecorator([marcherPage], map)[0];
}

export async function getNextMarcherPage(
    tx: DbTransaction | DbConnection,
    id: MarcherPageIdentifier,
): Promise<MarcherPage | null> {
    return getMarcherPageByPosition(tx, id, "next");
}

export async function getPreviousMarcherPage(
    tx: DbTransaction | DbConnection,
    id: MarcherPageIdentifier,
): Promise<MarcherPage | null> {
    return getMarcherPageByPosition(tx, id, "previous");
}

/**
 * Two coordinates closer than this, in pixels, are the same spot. A write that moves nothing
 * isn't always bit-exact (fabric's transform round trip on a selection drifts by ~1e-14), so
 * equality for carrying an edit forward, and for skipping a write, uses this tolerance.
 */
export const COORDINATE_TOLERANCE = 1e-6;

export const sameCoordinate = (a: number, b: number): boolean =>
    Math.abs(a - b) <= COORDINATE_TOLERANCE;

/** A marcher's later rows that one write carried its edit to (page mode). */
export interface CarriedRun {
    marcherId: number;
    /** The page the write was on */
    pageId: number;
    /** The position the run was moved to */
    x: number;
    y: number;
    /** The rows the edit carried to, in page order, with the position each had before */
    rows: { id: number; pageId: number; x: number; y: number }[];
    /** The pathway, on the row after the run, whose start moved with the run */
    nextPathwayId: number | null;
    /** The page of that row */
    nextPageId: number | null;
}

/**
 * A moved marcher whose edit stopped at a later page of its own (page mode): the first later row
 * that isn't a copy, because it is somewhere else. **Move them too** shifts that row by the same
 * offset (`moveLaterMovesToo`).
 */
export interface OwnMoveStop {
    marcherId: number;
    /** The page the write was on */
    pageId: number;
    /** The later page with the marcher's own move, where the edit stopped */
    stopPageId: number;
    /** How far the write moved the marcher on `pageId` */
    dx: number;
    dy: number;
}

export interface MarcherPagesWriteResult {
    /** Every marcher page row written, including the rows an edit carried to */
    updatedIds: number[];
    /** One entry per write that carried forward */
    carried: CarriedRun[];
    /**
     * The moved marchers whose edit stopped at a later page with their own move, on pages where
     * the write split them from others that followed there; none where every moved marcher
     * stopped (a written show) or every one followed
     */
    ownMoveStops: OwnMoveStop[];
    /** The pages any edit carried to, in page order */
    followedPageIds: number[];
    /** The pages whose pathway the write moved an end of */
    pathwayPageIds: number[];
}

export const emptyMarcherPagesWriteResult = (): MarcherPagesWriteResult => ({
    updatedIds: [],
    carried: [],
    ownMoveStops: [],
    followedPageIds: [],
    pathwayPageIds: [],
});

type MarcherPageRowState = {
    id: number;
    page_id: number;
    x: number;
    y: number;
    path_data_id: number | null;
    position: number;
};

/** SQLite caps bound parameters; batches stay well under it. */
const IN_CHUNK = 500;

const chunks = <T>(items: readonly T[]): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += IN_CHUNK)
        out.push(items.slice(i, i + IN_CHUNK));
    return out;
};

/** Every row of the given marchers, each marcher's in page (start beat) order. */
async function marcherRowsInPageOrder(
    tx: DbTransaction,
    marcherIds: number[],
): Promise<Map<number, MarcherPageRowState[]>> {
    const byMarcher = new Map<number, MarcherPageRowState[]>();
    for (const ids of chunks(marcherIds)) {
        const rows = await tx
            .select({
                id: marcher_pages.id,
                marcher_id: marcher_pages.marcher_id,
                page_id: marcher_pages.page_id,
                x: marcher_pages.x,
                y: marcher_pages.y,
                path_data_id: marcher_pages.path_data_id,
                position: schema.beats.position,
            })
            .from(marcher_pages)
            .innerJoin(schema.pages, eq(schema.pages.id, marcher_pages.page_id))
            .innerJoin(
                schema.beats,
                eq(schema.beats.id, schema.pages.start_beat),
            )
            .where(inArray(marcher_pages.marcher_id, ids))
            .orderBy(asc(schema.beats.position))
            .all();
        for (const { marcher_id, ...row } of rows) {
            const list = byMarcher.get(marcher_id) ?? [];
            list.push(row);
            byMarcher.set(marcher_id, list);
        }
    }
    return byMarcher;
}

/** The pages on which each of the given marchers is in a shape. */
async function shapePageIdsByMarcher(
    tx: DbTransaction,
    marcherIds: number[],
): Promise<Map<number, Set<number>>> {
    const byMarcher = new Map<number, Set<number>>();
    for (const ids of chunks(marcherIds)) {
        const rows = await tx
            .select({
                marcher_id: schema.shape_page_marchers.marcher_id,
                page_id: schema.shape_pages.page_id,
            })
            .from(schema.shape_page_marchers)
            .innerJoin(
                schema.shape_pages,
                eq(
                    schema.shape_pages.id,
                    schema.shape_page_marchers.shape_page_id,
                ),
            )
            .where(inArray(schema.shape_page_marchers.marcher_id, ids))
            .all();
        for (const row of rows) {
            const set = byMarcher.get(row.marcher_id) ?? new Set<number>();
            set.add(row.page_id);
            byMarcher.set(row.marcher_id, set);
        }
    }
    return byMarcher;
}

/** True when the write changes nothing but x and y. */
const writesOnlyCoordinates = (
    updateData: Omit<ModifiedMarcherPageArgs, "marcher_id" | "page_id">,
) =>
    Object.entries(updateData).every(
        ([key, value]) => key === "x" || key === "y" || value === undefined,
    );

/**
 * Writes marcher pages (page mode).
 *
 * **Carry forward** (on by default): an edit that moves a marcher on page N from `v` to `w` also
 * moves that marcher's later pages that still hold at `v` (within `COORDINATE_TOLERANCE`), in page
 * order, until the first page that differs, is in a shape, or has its own pathway. Those pages are
 * copies of page N, not moves of their own, so they follow it; the first later page with its own
 * move keeps it, and its pathway starts from `w`. Followed rows lose their copied pathway (a copy
 * is a hold). Pass `carryForward: false` to write only the given pages ("Only Page N").
 *
 * A write that moves nothing (equal within the tolerance, no other field) is skipped, so a click
 * that doesn't move a marcher can't break a later carry. If every write is skipped, the first is
 * written anyway so the caller's undo group isn't empty.
 *
 * Known limit: equality can't tell a copy from a page the designer moved back onto the same spot
 * on purpose, so such a page follows too (07b §1d, the merge leak). The toast's "Only Page N"
 * and undo are the way back.
 */
// eslint-disable-next-line max-lines-per-function
export async function updateMarcherPagesInTransaction({
    tx,
    modifiedMarcherPages,
    carryForward = true,
}: {
    tx: DbTransaction;
    modifiedMarcherPages: ModifiedMarcherPageArgs[];
    carryForward?: boolean;
}): Promise<MarcherPagesWriteResult> {
    // Timeline mode: marcher pages and their pathways are frozen (P9.5)
    await refusePageEraWriteInTimelineMode(tx);
    const result = emptyMarcherPagesWriteResult();
    if (modifiedMarcherPages.length === 0) return result;

    const marcherIds = [
        ...new Set(modifiedMarcherPages.map((m) => m.marcher_id)),
    ];
    const rowsByMarcher = await marcherRowsInPageOrder(tx, marcherIds);
    const shapePages = carryForward
        ? await shapePageIdsByMarcher(tx, marcherIds)
        : new Map<number, Set<number>>();
    const followedPositions = new Map<number, number>();
    const pathwayPageIds = new Set<number>();
    let skipped: ModifiedMarcherPageArgs | undefined;

    for (const modifiedMarcherPage of modifiedMarcherPages) {
        const { marcher_id, page_id, ...updateData } = modifiedMarcherPage;
        const rows = rowsByMarcher.get(marcher_id) ?? [];
        const index = rows.findIndex((r) => r.page_id === page_id);
        if (index < 0)
            throw new Error(
                `No marcher page for marcher ${marcher_id} on page ${page_id}`,
            );
        const row = rows[index];
        const old = { x: row.x, y: row.y, path_data_id: row.path_data_id };
        const moved =
            !sameCoordinate(old.x, updateData.x) ||
            !sameCoordinate(old.y, updateData.y);
        if (!moved && writesOnlyCoordinates(updateData)) {
            skipped ??= modifiedMarcherPage;
            continue;
        }

        // A pathway shared with the previous page was copied with it, so it isn't this page's
        // move: moving its end would bend the previous page's curve. The page holds instead.
        const sharesPreviousPathway =
            old.path_data_id != null &&
            index > 0 &&
            rows[index - 1].path_data_id === old.path_data_id;
        const set =
            moved && sharesPreviousPathway && !("path_data_id" in updateData)
                ? { ...updateData, path_data_id: null }
                : updateData;
        await tx
            .update(marcher_pages)
            .set(set)
            .where(eq(marcher_pages.id, row.id));
        row.x = set.x;
        row.y = set.y;
        if (set.path_data_id !== undefined) row.path_data_id = set.path_data_id;
        result.updatedIds.push(row.id);

        if (row.path_data_id != null) {
            await updateEndPoint({
                tx,
                pathwayId: row.path_data_id,
                newPoint: { x: row.x, y: row.y },
                type: "end",
            });
            pathwayPageIds.add(row.page_id);
        }

        // The pathway the previous row had before this write; a later row with the same one
        // shares it (a copy) rather than having its own
        let previousPathway = old.path_data_id;
        let last = index;
        const followed: CarriedRun["rows"] = [];
        if (carryForward && moved) {
            const inShape = shapePages.get(marcher_id);
            for (let j = index + 1; j < rows.length; j++) {
                const later = rows[j];
                const elsewhere =
                    !sameCoordinate(later.x, old.x) ||
                    !sameCoordinate(later.y, old.y);
                if (
                    elsewhere ||
                    inShape?.has(later.page_id) ||
                    (later.path_data_id != null &&
                        later.path_data_id !== previousPathway)
                ) {
                    // Somewhere else, and not in a shape: the marcher's own move, where it stops
                    if (elsewhere && !inShape?.has(later.page_id))
                        result.ownMoveStops.push({
                            marcherId: marcher_id,
                            pageId: page_id,
                            stopPageId: later.page_id,
                            dx: row.x - old.x,
                            dy: row.y - old.y,
                        });
                    break;
                }
                followed.push({
                    id: later.id,
                    pageId: later.page_id,
                    x: later.x,
                    y: later.y,
                });
                followedPositions.set(later.page_id, later.position);
                previousPathway = later.path_data_id;
                later.x = row.x;
                later.y = row.y;
                later.path_data_id = null;
                last = j;
            }
            for (const ids of chunks(followed.map((f) => f.id)))
                await tx
                    .update(marcher_pages)
                    .set({ x: row.x, y: row.y, path_data_id: null })
                    .where(inArray(marcher_pages.id, ids));
            result.updatedIds.push(...followed.map((f) => f.id));
        }

        // The next page's own pathway starts where this run ends. One it shares with the run's
        // last page is a copy, and is left alone.
        const next = rows[last + 1];
        const nextPathwayId =
            next?.path_data_id != null && next.path_data_id !== previousPathway
                ? next.path_data_id
                : null;
        if (nextPathwayId != null) {
            await updateEndPoint({
                tx,
                pathwayId: nextPathwayId,
                newPoint: { x: row.x, y: row.y },
                type: "start",
            });
            pathwayPageIds.add(next.page_id);
        }

        if (followed.length > 0)
            result.carried.push({
                marcherId: marcher_id,
                pageId: page_id,
                x: row.x,
                y: row.y,
                rows: followed,
                nextPathwayId,
                nextPageId: nextPathwayId != null ? next.page_id : null,
            });
    }

    // Keep the caller's undo group from being empty when nothing moved
    if (result.updatedIds.length === 0 && skipped) {
        const { marcher_id, page_id, ...updateData } = skipped;
        const written = await tx
            .update(marcher_pages)
            .set(updateData)
            .where(
                and(
                    eq(marcher_pages.marcher_id, marcher_id),
                    eq(marcher_pages.page_id, page_id),
                ),
            )
            .returning({ id: marcher_pages.id })
            .get();
        if (written) result.updatedIds.push(written.id);
    }

    // A stop on a page this write also edits for that marcher isn't left behind
    const written = new Set(
        modifiedMarcherPages.map((m) => marcherPageToKeyString(m)),
    );
    result.ownMoveStops = result.ownMoveStops.filter(
        (s) =>
            !written.has(
                marcherPageToKeyString({
                    marcher_id: s.marcherId,
                    page_id: s.stopPageId,
                }),
            ),
    );
    // Only a split is a surprise: a stop counts where another marcher this write moved followed
    // into the same page. Where everyone stopped (a written show) or followed, it says nothing
    result.ownMoveStops = result.ownMoveStops.filter((s) =>
        followedPositions.has(s.stopPageId),
    );
    result.followedPageIds = [...followedPositions.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([pageId]) => pageId);
    result.pathwayPageIds = [...pathwayPageIds];
    return result;
}

/**
 * Drops the writes that move nothing (see `updateMarcherPagesInTransaction`), reading the rows'
 * current positions in one query per batch.
 */
async function withoutNoOpWrites(
    db: DbConnection,
    modifiedMarcherPages: ModifiedMarcherPageArgs[],
): Promise<ModifiedMarcherPageArgs[]> {
    const pageIds = [...new Set(modifiedMarcherPages.map((m) => m.page_id))];
    const current = new Map<string, { x: number; y: number }>();
    for (const ids of chunks(pageIds)) {
        const rows = await db
            .select({
                marcher_id: marcher_pages.marcher_id,
                page_id: marcher_pages.page_id,
                x: marcher_pages.x,
                y: marcher_pages.y,
            })
            .from(marcher_pages)
            .where(inArray(marcher_pages.page_id, ids))
            .all();
        for (const row of rows) current.set(marcherPageToKeyString(row), row);
    }
    return modifiedMarcherPages.filter((m) => {
        const { marcher_id: _m, page_id: _p, ...updateData } = m;
        const row = current.get(marcherPageToKeyString(m));
        return (
            row == null ||
            !writesOnlyCoordinates(updateData) ||
            !sameCoordinate(row.x, m.x) ||
            !sameCoordinate(row.y, m.y)
        );
    });
}

export async function updateMarcherPages({
    db,
    modifiedMarcherPages,
    carryForward = true,
}: {
    db: DbConnection;
    modifiedMarcherPages: ModifiedMarcherPageArgs[];
    /** See `updateMarcherPagesInTransaction`; false writes only the given pages */
    carryForward?: boolean;
}): Promise<MarcherPagesWriteResult> {
    // Early return if no marcher pages to update
    if (modifiedMarcherPages.length === 0) {
        return emptyMarcherPagesWriteResult();
    }
    // Nothing moves: no undo step
    const writes = await withoutNoOpWrites(db, modifiedMarcherPages);
    if (writes.length === 0) return emptyMarcherPagesWriteResult();

    const transactionResult = await transactionWithHistory(
        db,
        "updateMarcherPages",
        async (tx) => {
            return await updateMarcherPagesInTransaction({
                tx,
                modifiedMarcherPages: writes,
                carryForward,
            });
        },
    );
    return transactionResult;
}

/**
 * **Move them too** (page mode, defined-coordinates 09): shifts each stop's row (the marcher's own
 * later move, `OwnMoveStop`) by the offset the edit moved the marcher, as its own undoable edit.
 * It carries forward like any edit, so later pages that copied the stop's page follow. Rows that
 * are gone are skipped.
 *
 * @returns the write's result (empty when nothing was left to move)
 */
export async function moveLaterMovesToo({
    db,
    stops,
}: {
    db: DbConnection;
    stops: readonly OwnMoveStop[];
}): Promise<MarcherPagesWriteResult> {
    const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [];
    for (const stop of stops) {
        const row = await db
            .select({ x: marcher_pages.x, y: marcher_pages.y })
            .from(marcher_pages)
            .where(
                and(
                    eq(marcher_pages.marcher_id, stop.marcherId),
                    eq(marcher_pages.page_id, stop.stopPageId),
                ),
            )
            .get();
        if (row)
            modifiedMarcherPages.push({
                marcher_id: stop.marcherId,
                page_id: stop.stopPageId,
                x: row.x + stop.dx,
                y: row.y + stop.dy,
            });
    }
    return await updateMarcherPages({ db, modifiedMarcherPages });
}

/**
 * "Only Page N": puts the rows an edit carried to back where they were, as its own undoable edit.
 * A row that has changed since (it no longer holds the carried position) is left alone. Restored
 * rows keep no pathway: the one they had was a copy of the edited page's.
 *
 * @returns the pages it restored (empty when nothing was left to restore)
 */
export async function restoreCarriedRuns({
    db,
    carried,
}: {
    db: DbConnection;
    carried: readonly CarriedRun[];
}): Promise<number[]> {
    const ids = carried.flatMap((run) => run.rows.map((r) => r.id));
    if (ids.length === 0) return [];
    const current = new Map<number, { x: number; y: number }>();
    for (const batch of chunks(ids)) {
        const rows = await db
            .select({
                id: marcher_pages.id,
                x: marcher_pages.x,
                y: marcher_pages.y,
            })
            .from(marcher_pages)
            .where(inArray(marcher_pages.id, batch))
            .all();
        for (const row of rows) current.set(row.id, row);
    }
    const stillCarried = (run: CarriedRun, row: CarriedRun["rows"][number]) => {
        const now = current.get(row.id);
        return (
            now != null &&
            sameCoordinate(now.x, run.x) &&
            sameCoordinate(now.y, run.y)
        );
    };
    const restoring = carried
        .map((run) => ({
            run,
            rows: run.rows.filter((row) => stillCarried(run, row)),
        }))
        .filter(({ rows }) => rows.length > 0);
    if (restoring.length === 0) return [];

    return await transactionWithHistory(
        db,
        "restoreCarriedRuns",
        async (tx) => {
            await refusePageEraWriteInTimelineMode(tx);
            const pageIds: number[] = [];
            for (const { run, rows } of restoring) {
                // Rows with the same old position are written together
                const byPosition = new Map<string, typeof rows>();
                for (const row of rows) {
                    const key = `${row.x},${row.y}`;
                    byPosition.set(key, [...(byPosition.get(key) ?? []), row]);
                }
                for (const group of byPosition.values())
                    for (const batch of chunks(group.map((r) => r.id)))
                        await tx
                            .update(marcher_pages)
                            .set({ x: group[0].x, y: group[0].y })
                            .where(inArray(marcher_pages.id, batch));
                pageIds.push(...rows.map((r) => r.pageId));

                // The next page's pathway starts from the run's last page again
                const lastRow = run.rows[run.rows.length - 1];
                if (
                    run.nextPathwayId != null &&
                    rows.includes(lastRow) &&
                    (await tx.query.pathways.findFirst({
                        where: eq(schema.pathways.id, run.nextPathwayId),
                    }))
                ) {
                    await updateEndPoint({
                        tx,
                        pathwayId: run.nextPathwayId,
                        newPoint: { x: lastRow.x, y: lastRow.y },
                        type: "start",
                    });
                    if (run.nextPageId != null) pageIds.push(run.nextPageId);
                }
            }
            return [...new Set(pageIds)];
        },
    );
}

// eslint-disable-next-line max-lines-per-function
export const _swapSpms = async ({
    tx,
    spm1,
    marcherPage1,
    spm2,
    marcherPage2,
}: {
    tx: DbTransaction;
    spm1: DatabaseShapePageMarcher | null;
    marcherPage1: { marcher_id: number; page_id: number };
    spm2: DatabaseShapePageMarcher | null;
    marcherPage2: { marcher_id: number; page_id: number };
}) => {
    // turn off foreign key checks temporarily
    if (spm1 && spm2) {
        // Delete the first SPM to avoid a unique constraint violation
        await tx
            .delete(schema.shape_page_marchers)
            .where(eq(schema.shape_page_marchers.id, spm1.id));
        await tx
            .update(schema.shape_page_marchers)
            .set({ marcher_id: marcherPage1.marcher_id })
            .where(eq(schema.shape_page_marchers.id, spm2.id));
        await tx
            .insert(schema.shape_page_marchers)
            .values({ ...spm1, marcher_id: marcherPage2.marcher_id });
    } else {
        if (spm1 != null)
            await tx
                .update(schema.shape_page_marchers)
                .set({ marcher_id: marcherPage2.marcher_id })
                .where(eq(schema.shape_page_marchers.id, spm1.id));
        if (spm2 != null)
            await tx
                .update(schema.shape_page_marchers)
                .set({ marcher_id: marcherPage1.marcher_id })
                .where(eq(schema.shape_page_marchers.id, spm2.id));
    }
};

export const swapMarchers = async ({
    db,
    pageId,
    marcher1Id,
    marcher2Id,
}: {
    db: DbConnection;
    pageId: number;
    marcher1Id: number;
    marcher2Id: number;
}) => {
    return await transactionWithHistory(db, "swapMarchers", async (tx) => {
        return await swapMarchersInTransaction({
            tx,
            pageId,
            marcher1Id,
            marcher2Id,
        });
    });
};

export const swapMarchersInTransaction = async ({
    tx,
    pageId,
    marcher1Id,
    marcher2Id,
}: {
    tx: DbTransaction;
    pageId: number;
    marcher1Id: number;
    marcher2Id: number;
}) => {
    // Timeline mode swaps positions through `moveMarchersOnPage` (P7.2); the page-era rows,
    // including shape page marchers, are frozen (P9.5)
    await refusePageEraWriteInTimelineMode(tx);
    const marcherPage1 = await tx.query.marcher_pages.findFirst({
        where: and(
            eq(schema.marcher_pages.page_id, pageId),
            eq(schema.marcher_pages.marcher_id, marcher1Id),
        ),
    });
    assert(
        marcherPage1,
        `Failed to get marcher page for marcher ${marcher1Id} on page ${pageId}`,
    );
    const marcherPage2 = await tx.query.marcher_pages.findFirst({
        where: and(
            eq(schema.marcher_pages.page_id, pageId),
            eq(schema.marcher_pages.marcher_id, marcher2Id),
        ),
    });
    assert(
        marcherPage2,
        `Failed to get marcher page for marcher ${marcher2Id} on page ${pageId}`,
    );

    const spm1 = await getSpmByMarcherPage({
        tx,
        marcherPage: { marcher_id: marcher1Id, page_id: pageId },
    });
    const spm2 = await getSpmByMarcherPage({
        tx,
        marcherPage: { marcher_id: marcher2Id, page_id: pageId },
    });

    // If either of the SPMs exist, we need to update them
    const updateSpms = spm1 || spm2;

    if (updateSpms) {
        await _swapSpms({
            tx,
            spm1,
            marcherPage1,
            spm2,
            marcherPage2,
        });
    }

    const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [
        {
            page_id: pageId,
            marcher_id: marcherPage1.marcher_id,
            x: marcherPage2.x,
            y: marcherPage2.y,
        },
        {
            page_id: pageId,
            marcher_id: marcherPage2.marcher_id,
            x: marcherPage1.x,
            y: marcherPage1.y,
        },
    ];

    const updatedMarcherPages = await updateMarcherPagesInTransaction({
        tx,
        modifiedMarcherPages,
    });

    return updatedMarcherPages;
};

/**
 * Decorates a list of marcher pages with locked status and locked reason.
 *
 * @param marcherPages
 * @param spmsByPageAndMarcher
 * @returns
 */
export const lockedDecorator = (
    marcherPages: DatabaseMarcherPage[],
    spmsByMarcherPage: Map<string, ShapePageMarcher>,
): MarcherPage[] => {
    return marcherPages.map((marcherPage) => {
        let isLocked = false;
        let lockedReason = "";
        const spm = spmsByMarcherPage.get(marcherPageToKeyString(marcherPage));
        if (spm) {
            isLocked = true;
            lockedReason += "Marcher is part of a shape\n";
        }
        return {
            ...marcherPage,
            ...appearanceModelRawToParsed(marcherPage),
            isLocked,
            lockedReason,
        };
    });
};

/**
 * Converts a marcher page to a key string.
 *
 * E.g. marcher_1-page_2 for marcher 1 on page 2
 *
 * @param marcherPage The marcher page to convert
 * @returns The key string
 */
export const marcherPageToKeyString = (marcherPage: {
    marcher_id: number;
    page_id: number;
}) => {
    return `marcher_${marcherPage.marcher_id}-page_${marcherPage.page_id}`;
};

export const getAllMarcherPages = async ({
    db,
    pinkyPromiseThatYouKnowWhatYouAreDoing = false,
}: {
    db: DbConnection | DbTransaction;
    pinkyPromiseThatYouKnowWhatYouAreDoing?: boolean;
}): Promise<MarcherPage[]> => {
    // No conditions, return all rows
    if (!pinkyPromiseThatYouKnowWhatYouAreDoing)
        console.warn(
            "Returning all marcherPage rows. This should not happen as this fetches all of the coordinates for the entire show. You should probably use getByPage or getByMarcher",
        );
    const marcherPagesResponse = await db
        .select()
        .from(schema.marcher_pages)
        .all();
    const spmsByMarcherPage = await getSpmMapAll({ db });
    return lockedDecorator(marcherPagesResponse, spmsByMarcherPage);
};

export const marcherPagesByPageId = async ({
    db,
    pageId,
}: {
    db: DbConnection | DbTransaction;
    pageId: number;
}): Promise<MarcherPage[]> => {
    const marcherPagesResponse = await db
        .select()
        .from(schema.marcher_pages)
        .where(eq(schema.marcher_pages.page_id, pageId));

    const spmsByMarcherPage = await getSpmMapByPageId({ db, pageId });

    return lockedDecorator(marcherPagesResponse, spmsByMarcherPage);
};

/**
 * Gets all marcher pages by marcher id.
 *
 * NOTE - this does not include the locked status or locked reason
 *
 * @param db The database instance
 * @param marcherId The marcher id
 * @returns
 */
export const marcherPagesByMarcherId = async ({
    db,
    marcherId,
}: {
    db: DbConnection | DbTransaction;
    marcherId: number;
}): Promise<DatabaseMarcherPage[]> => {
    const marcherPagesResponse = await db
        .select()
        .from(schema.marcher_pages)
        .where(eq(schema.marcher_pages.marcher_id, marcherId));
    return marcherPagesResponse;
};
