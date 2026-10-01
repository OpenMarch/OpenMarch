import {
    moveMarchersOnPage,
    type TimelineMarcherMove,
    type TimelineMovePage,
} from "@/db-functions/timelineMoves";
import type { DbConnection } from "@/db-functions/types";
import { withTimelineWriteLock } from "@/db-functions/history";
import type { CoordinateRecord } from "@/utilities/CoordinateActions";
import { pageEndBeat } from "./timelineCanvas";
import {
    timelineResolverSettled,
    useTimelineResolverStore,
} from "./timelineStore";

/**
 * The seam between the page-era coordinate tools and timeline writes in timeline mode
 * (docs/timeline/phases/07-page-parity.md P7.2). Canvas drag, nudges, snap, align, distribute,
 * flip, swap, circle, the line tool, the inspector's distribute buttons and "set marchers to the
 * previous or next page" (P7.6) all compute new x/y
 * for the selected marchers on the selected page; in timeline mode they read the current x/y from
 * the resolver at the page's end beat (what the canvas draws) and write through
 * `moveMarchersOnPage`. With the flag off, nothing here runs.
 */

/** The x/y fields every page-era coordinate tool reads and writes. */
export interface MarcherXY {
    marcher_id: number;
    x: number;
    y: number;
}

/** The parts of a `Page` the timeline write path needs. */
export type TimelineWritePage = TimelineMovePage & { readonly id: number };

/** Thrown when timeline mode can't read positions because the resolver isn't ready yet. */
export class TimelineNotReadyError extends Error {
    constructor() {
        super("The timeline is still loading. Try again in a moment.");
        this.name = "TimelineNotReadyError";
    }
}

/**
 * `coordinates` with each x/y replaced by the resolver's position at the page's end beat, the
 * position the canvas draws in timeline mode. Other fields are kept, so `MarcherPage` objects can
 * go straight into the page-era helpers (`CoordinateActions`). Marchers the resolver doesn't know
 * are dropped.
 *
 * @throws TimelineNotReadyError when no resolver is ready
 */
export function withTimelinePositions<T extends MarcherXY>(
    page: TimelineMovePage,
    coordinates: readonly T[],
): T[] {
    const resolver = useTimelineResolverStore.getState().resolver;
    if (!resolver) throw new TimelineNotReadyError();
    const known = new Set(resolver.marcherIds());
    const beat = pageEndBeat(page);
    return coordinates
        .filter((c) => known.has(c.marcher_id))
        .map((c) => {
            const [x, y] = resolver.positionAt(c.marcher_id, beat);
            return { ...c, x, y };
        });
}

/**
 * The marchers as coordinate records on `page` at the resolver's positions, for the page-era
 * helpers (`CoordinateActions`). Built from the marcher ids alone, so it doesn't need (or trust)
 * `marcher_pages` rows. Marchers the resolver doesn't know are dropped.
 *
 * @throws TimelineNotReadyError when no resolver is ready
 */
export function timelineCoordinateRecords(
    page: TimelineWritePage,
    marcherIds: readonly number[],
): CoordinateRecord[] {
    return withTimelinePositions(
        page,
        marcherIds.map(
            (id): CoordinateRecord => ({
                marcher_id: id,
                page_id: page.id,
                x: 0,
                y: 0,
                notes: null,
            }),
        ),
    );
}

/**
 * Timeline mode's `useUpdateSelectedMarchers`: applies `transform` to the marchers' current
 * positions on `page` (from the resolver, not `marcher_pages`) and writes the result as one
 * `moveMarchersOnPage` edit.
 *
 * @returns the transformed coordinates
 * @throws TimelineNotReadyError when no resolver is ready
 */
export async function transformMarchersOnPage<R extends MarcherXY>({
    db,
    page,
    marcherIds,
    transform,
}: {
    db: DbConnection;
    page: TimelineWritePage;
    marcherIds: readonly number[];
    transform: (current: CoordinateRecord[]) => R[];
}): Promise<R[]> {
    const next = transform(timelineCoordinateRecords(page, marcherIds));
    await moveMarchersOnPage({ db, page, moves: toTimelineMoves(next) });
    return next;
}

/**
 * Settles once every timeline write queued so far has committed and reached the resolver, and no
 * cold build is pending. Call it before reading positions to plan a new write from them: without
 * it, a write still in flight (a nudge pressed just before) is missing from the resolver, and the
 * plan starts from stale positions. Never call it from inside a wrapped write.
 */
export async function timelinePositionsSettled(): Promise<void> {
    await withTimelineWriteLock(async () => undefined);
    await timelineResolverSettled();
}

/** What `copyPagePositions` plans: the marchers it covers and the moves that change something. */
export interface PagePositionCopy {
    /** The marchers set to the source page's positions, moved or already there */
    marcherIds: number[];
    /** One move per marcher whose position on the target page changes */
    moves: TimelineMarcherMove[];
}

/**
 * "Set all or selected marchers to the previous or next page" in timeline mode
 * (docs/timeline/phases/07-page-parity.md P7.6). Copies each marcher's position on `source` (the
 * resolver at its end beat, what the canvas draws there) to `page`, as moves for
 * `moveMarchersOnPage`. `marcher_pages` is never read: its rows can be stale or missing in timeline
 * mode.
 *
 * Marchers already at the source position on `page` get no move, so a marcher that holds still
 * across the two pages is not touched (it may have no move ending at the page's end beat, which
 * `moveMarchersOnPage` would refuse). Positions are compared exactly, since they are copied.
 *
 * @param marcherIds the marchers to copy; all marchers the resolver knows when omitted. Marchers
 *   the resolver doesn't know are dropped.
 * @throws TimelineNotReadyError when no resolver is ready
 */
export function copyPagePositions({
    page,
    source,
    marcherIds,
}: {
    page: TimelineMovePage;
    source: TimelineMovePage;
    marcherIds?: readonly number[];
}): PagePositionCopy {
    const resolver = useTimelineResolverStore.getState().resolver;
    if (!resolver) throw new TimelineNotReadyError();
    const known = resolver.marcherIds();
    const knownSet = new Set(known);
    const ids =
        marcherIds === undefined
            ? [...known]
            : marcherIds.filter((id) => knownSet.has(id));
    const sourceBeat = pageEndBeat(source);
    const targetBeat = pageEndBeat(page);
    const moves: TimelineMarcherMove[] = [];
    for (const marcherId of ids) {
        const [x, y] = resolver.positionAt(marcherId, sourceBeat);
        const [currentX, currentY] = resolver.positionAt(marcherId, targetBeat);
        if (x !== currentX || y !== currentY) moves.push({ marcherId, x, y });
    }
    return { marcherIds: ids, moves };
}

/** The timeline move for each changed coordinate. Any `page_id` on them is ignored. */
export const toTimelineMoves = (
    changes: readonly MarcherXY[],
): TimelineMarcherMove[] =>
    changes.map((c) => ({ marcherId: c.marcher_id, x: c.x, y: c.y }));

/** What a coordinate tool hands to the timeline write path: the page and its moves. */
export interface TimelineMoveRequest {
    page: TimelineWritePage;
    moves: TimelineMarcherMove[];
}

/**
 * The function the canvas calls when a drag or rotate ends (`OpenMarchCanvas.
 * updateMarcherPagesFunction`).
 *
 * - Flag off: `writePages` itself, so page mode is unchanged.
 * - Flag on: a function that writes the moves on `page`, the selected page. The canvas marchers'
 *   `coordinate.page_id` is not used: in timeline mode it can be left over from an earlier render.
 *   With no selected page, `onNoPage` runs instead (the canvas snaps the marchers back).
 */
export function canvasCoordinateWriter<A extends MarcherXY>({
    timelineMode,
    page,
    writePages,
    writeTimeline,
    onNoPage,
}: {
    timelineMode: boolean;
    page: TimelineWritePage | null | undefined;
    writePages: (changes: A[]) => void;
    writeTimeline: (request: TimelineMoveRequest) => void;
    onNoPage: () => void;
}): (changes: A[]) => void {
    if (!timelineMode) return writePages;
    return (changes) => {
        if (!page) {
            onNoPage();
            return;
        }
        writeTimeline({ page, moves: toTimelineMoves(changes) });
    };
}
