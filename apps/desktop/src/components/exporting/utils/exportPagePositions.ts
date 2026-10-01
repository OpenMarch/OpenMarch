import type MarcherPage from "@/global/classes/MarcherPage";
import type { DbConnection } from "@/db-functions/types";
import { withTimelineWriteLock } from "@/db-functions/history";
import {
    isTimelineModeEnabled,
    workspaceSettingsSchema,
} from "@/settings/workspaceSettings";
import {
    readTimelinePageSnapshot,
    sampleTimelinePagePositions,
} from "@/timeline/timelinePagePositions";

/**
 * Page positions for the coordinate sheet and drill chart exports
 * (docs/timeline/phases/07-page-parity.md P7.7).
 *
 * In page mode the exports keep reading `marcher_pages` through the existing queries. In
 * timeline mode those rows are frozen page-era data, so the exports take each marcher's position
 * on each page from the resolver at the page's end beat instead. Only x and y exist there: the
 * per-page appearance, rotation and notes of `marcher_pages` are dropped in timeline mode (P7.14).
 */

/** A marcher's position on a page: what the exports read from a `marcher_pages` row. */
export type PagePosition = Pick<
    MarcherPage,
    "marcher_id" | "page_id" | "x" | "y"
>;

/**
 * Positions indexed both ways, with the same shape as `MarcherPageMap`, so a page-mode
 * `MarcherPageMap` can be passed wherever this is expected.
 */
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
 * first, as the page-mode sheet export always did (`order ?? 0`).
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

/**
 * The timeline flag. A missing row, or settings that fail to parse, mean page mode: the export
 * then reads `marcher_pages` exactly as it did before timeline mode existed.
 */
export async function readTimelineFlag(db: DbConnection): Promise<boolean> {
    const row = await db.query.workspace_settings.findFirst({
        columns: { json_data: true },
    });
    if (!row) return false;
    try {
        const parsed = workspaceSettingsSchema.safeParse(
            JSON.parse(row.json_data),
        );
        if (parsed.success) return isTimelineModeEnabled(parsed.data);
        console.warn(
            "Workspace settings failed to parse; exporting in page mode",
            parsed.error,
        );
    } catch (error) {
        console.warn(
            "Workspace settings are not valid JSON; exporting in page mode",
            error,
        );
    }
    return false;
}

/** Positions sampled in timeline mode, with the pages and marchers of the same snapshot. */
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
 * In timeline mode, every marcher's position on every page, sampled from a private resolver at
 * each page's end beat, with the snapshot's page and marcher ids; `null` in page mode, where the
 * caller reads `marcher_pages` as before. Check the ids against the lists being rendered with
 * `assertExportMatchesSnapshot`.
 *
 * The flag, the timeline tables and the pages are read inside one `withTimelineWriteLock`, so
 * they come from the same committed state; sampling runs after the lock is released, on the
 * private resolver, so a later edit can't change the export halfway. Never call it from inside a
 * wrapped write: it would wait for itself.
 */
export async function readTimelineExportPositions(
    db: DbConnection,
): Promise<TimelineExportPositions | null> {
    if (!(await readTimelineFlag(db))) return null;
    const snapshot = await withTimelineWriteLock(async () =>
        // The flag can change while the lock is awaited; the one read under it decides
        (await readTimelineFlag(db)) ? readTimelinePageSnapshot(db) : null,
    );
    if (!snapshot) return null;
    return {
        positions: pagePositionMapFromRows(
            await sampleTimelinePagePositions(snapshot),
        ),
        pageIds: snapshot.pages.map((page) => page.id),
        marcherIds: [...snapshot.resolver.marcherIds()],
    };
}

/**
 * The positions an export draws (P7.7). Timeline mode: the resolver snapshot, after checking that
 * `rendered` lists exactly its pages and marchers. Page mode: `pageModePositions`, the
 * `marcher_pages` query's map, as before.
 *
 * @throws ShowChangedDuringExportError with `messages.showChanged` when the show changed
 * @throws Error with `messages.notLoaded` in page mode while the query hasn't loaded
 */
export async function readExportPositions({
    db,
    rendered,
    pageModePositions,
    messages,
}: {
    db: DbConnection;
    rendered: Parameters<typeof assertExportMatchesSnapshot>[1];
    pageModePositions: PagePositionMap | undefined;
    messages: { notLoaded: string; showChanged: string };
}): Promise<PagePositionMap> {
    const timeline = await readTimelineExportPositions(db);
    if (timeline) {
        assertExportMatchesSnapshot(timeline, rendered, messages.showChanged);
        return timeline.positions;
    }
    if (!pageModePositions) throw new Error(messages.notLoaded);
    return pageModePositions;
}
