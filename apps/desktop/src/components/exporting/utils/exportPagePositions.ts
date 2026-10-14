import type { DbConnection } from "@/db-functions/types";
import { withTimelineWriteLock } from "@/db-functions/history";
import {
    readTimelinePageSnapshot,
    sampleTimelinePagePositions,
} from "@/timeline/timelinePagePositions";

/**
 * Page positions for the coordinate sheet and drill chart exports
 * (docs/timeline/phases/07-page-parity.md P7.7).
 *
 * The exports take each marcher's position on each page from the resolver at the page's end
 * beat. Only x and y exist there: there is no per-page appearance, rotation or notes (P7.14).
 */

/** A marcher's position on a page, sampled from the resolver at the page's end beat. */
export interface PagePosition {
    readonly marcher_id: number;
    readonly page_id: number;
    readonly x: number;
    readonly y: number;
}

/** Positions indexed both ways. */
export interface PagePositionMap<T extends PagePosition = PagePosition> {
    /** marcher id → page id → position */
    marcherPagesByMarcher: Record<number, Record<number, T>>;
    /** page id → marcher id → position */
    marcherPagesByPage: Record<number, Record<number, T>>;
}

/** Indexes positions by marcher and by page. A later row for the same pair wins. */
export function pagePositionMapFromRows<T extends PagePosition>(
    rows: readonly T[],
): PagePositionMap<T> {
    const marcherPagesByMarcher: Record<number, Record<number, T>> = {};
    const marcherPagesByPage: Record<number, Record<number, T>> = {};
    for (const row of rows) {
        (marcherPagesByMarcher[row.marcher_id] ??= {})[row.page_id] = row;
        (marcherPagesByPage[row.page_id] ??= {})[row.marcher_id] = row;
    }
    return { marcherPagesByMarcher, marcherPagesByPage };
}

/**
 * One marcher's positions, sorted by page order. Positions on pages missing from `pages` sort
 * first (`order ?? 0`).
 */
export function positionsForMarcherInPageOrder<T extends PagePosition>(
    map: Pick<PagePositionMap<T>, "marcherPagesByMarcher">,
    marcherId: number,
    pages: readonly { id: number; order: number }[],
): T[] {
    const orderById = new Map(pages.map((page) => [page.id, page.order]));
    return Object.values(map.marcherPagesByMarcher[marcherId] ?? {}).sort(
        (a, b) =>
            (orderById.get(a.page_id) ?? 0) - (orderById.get(b.page_id) ?? 0),
    );
}

/**
 * Marchers with no position on any page. Their quarter sheets are left out and their full sheet
 * shows "no marcher pages", so the export warns about them.
 */
export function marchersWithoutPositions<M extends { id: number }>(
    marchers: readonly M[],
    map: Pick<PagePositionMap, "marcherPagesByMarcher">,
): M[] {
    return marchers.filter(
        (marcher) =>
            Object.keys(map.marcherPagesByMarcher[marcher.id] ?? {}).length ===
            0,
    );
}

/** Positions sampled from the resolver, with the pages and marchers of the same snapshot. */
export interface TimelineExportPositions {
    positions: PagePositionMap;
    /** Every page id in the snapshot */
    pageIds: readonly number[];
    /** Every marcher id the snapshot's resolver knows */
    marcherIds: readonly number[];
}

/** The pages or marchers an export was started with differ from the snapshot it sampled. */
export class ShowChangedDuringExportError extends Error {
    constructor(message = "The show changed during the export. Try again.") {
        super(message);
        this.name = "ShowChangedDuringExportError";
    }
}

const sameIds = (a: readonly number[], b: readonly number[]) => {
    const set = new Set(a);
    return set.size === new Set(b).size && b.every((id) => set.has(id));
};

/**
 * Checks that the pages and marchers an export renders (from React state) are exactly the ones
 * in the snapshot it sampled. Otherwise an edit between the two reads would index the snapshot
 * with a deleted page, or miss a new marcher and shift per-marcher output.
 *
 * @throws ShowChangedDuringExportError when they differ
 */
export function assertExportMatchesSnapshot(
    snapshot: Pick<TimelineExportPositions, "pageIds" | "marcherIds">,
    rendered: {
        pages: readonly { id: number }[];
        marchers: readonly { id: number }[];
    },
    message?: string,
): void {
    const pagesMatch = sameIds(
        snapshot.pageIds,
        rendered.pages.map((page) => page.id),
    );
    const marchersMatch = sameIds(
        snapshot.marcherIds,
        rendered.marchers.map((marcher) => marcher.id),
    );
    if (!pagesMatch || !marchersMatch)
        throw new ShowChangedDuringExportError(message);
}

/**
 * Every marcher's position on every page, sampled from a private resolver at each page's end
 * beat, with the snapshot's page and marcher ids. Check the ids against the lists being rendered
 * with `assertExportMatchesSnapshot`.
 *
 * The timeline tables and the pages are read inside one `withTimelineWriteLock`, so they come
 * from the same committed state; sampling runs after the lock is released, on the private
 * resolver, so a later edit can't change the export halfway. Never call it from inside a wrapped
 * write: it would wait for itself.
 */
export async function readTimelineExportPositions(
    db: DbConnection,
): Promise<TimelineExportPositions> {
    const snapshot = await withTimelineWriteLock(() =>
        readTimelinePageSnapshot(db),
    );
    return {
        positions: pagePositionMapFromRows(
            await sampleTimelinePagePositions(snapshot),
        ),
        pageIds: snapshot.pages.map((page) => page.id),
        marcherIds: [...snapshot.resolver.marcherIds()],
    };
}

/**
 * The positions an export draws (P7.7): the resolver snapshot, after checking that `rendered`
 * lists exactly its pages and marchers.
 *
 * @throws ShowChangedDuringExportError with `showChangedMessage` when the show changed
 */
export async function readExportPositions({
    db,
    rendered,
    showChangedMessage,
}: {
    db: DbConnection;
    rendered: Parameters<typeof assertExportMatchesSnapshot>[1];
    showChangedMessage?: string;
}): Promise<PagePositionMap> {
    const timeline = await readTimelineExportPositions(db);
    assertExportMatchesSnapshot(timeline, rendered, showChangedMessage);
    return timeline.positions;
}
