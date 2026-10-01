import type { Resolver } from "@openmarch/core";
import type { DbConnection } from "@/db-functions/types";
import type Page from "@/global/classes/Page";
import { readShowTiming } from "./convert/writePageConversion";
import { pageEndBeat } from "./timelineCanvas";
import { acquireExportResolver } from "./timelineExport";

/**
 * "Marchers on page N" for the exports that still speak in pages (docs/timeline/phases/
 * 07-page-parity.md P7.12): each marcher's position at page N's end beat, sampled from the
 * resolver, never read from `marcher_pages`. Page mode never calls these.
 */

/** One marcher's position on one page, in canvas pixels (the `marcher_pages` x/y units). */
export interface TimelinePagePosition {
    marcher_id: number;
    page_id: number;
    x: number;
    y: number;
}

/** What sampling needs: a resolver and the pages, read together. */
export interface TimelinePageSnapshot {
    resolver: Pick<Resolver, "marcherIds" | "positionsAt">;
    pages: readonly Pick<Page, "id" | "beats">[];
}

/**
 * Builds a private resolver (`acquireExportResolver`, not subscribed to changes) and reads the
 * pages. It takes no lock: to read one moment, call it inside `withTimelineWriteLock` together
 * with the export's other reads. A wrapped write joins that FIFO lock when it is called, so
 * every write started before the lock is taken has committed by the time this runs.
 */
export async function readTimelinePageSnapshot(
    db: DbConnection,
): Promise<TimelinePageSnapshot> {
    const resolver = await acquireExportResolver(db);
    const { pages } = await readShowTiming(db);
    return { resolver, pages };
}

/** How long sampling may hold the main thread before it yields, in milliseconds. */
const SAMPLE_SLICE_MS = 8;

const yieldToEventLoop = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Every marcher the resolver knows, on every page, at the page's end beat (the position the
 * canvas draws for that page). The output is page-major: pages in the order given, marchers in
 * resolver order within each page. Each page is one `positionsAt` call into a reused buffer,
 * and sampling yields to the event loop every few milliseconds so a large show doesn't freeze
 * the UI. Call it after releasing the write lock; the snapshot's resolver is private, so later
 * edits can't change it.
 */
export async function sampleTimelinePagePositions({
    resolver,
    pages,
}: TimelinePageSnapshot): Promise<TimelinePagePosition[]> {
    const marcherIds = resolver.marcherIds();
    const buffer = new Float64Array(2 * marcherIds.length);
    const out: TimelinePagePosition[] = [];
    let sliceStart = performance.now();
    for (const page of pages) {
        resolver.positionsAt(pageEndBeat(page), buffer);
        for (let i = 0; i < marcherIds.length; i++) {
            out.push({
                marcher_id: marcherIds[i]!,
                page_id: page.id,
                x: buffer[2 * i]!,
                y: buffer[2 * i + 1]!,
            });
        }
        if (performance.now() - sliceStart > SAMPLE_SLICE_MS) {
            await yieldToEventLoop();
            sliceStart = performance.now();
        }
    }
    return out;
}
