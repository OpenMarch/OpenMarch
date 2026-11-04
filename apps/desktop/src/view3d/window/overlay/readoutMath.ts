/**
 * Pure helpers for the overlay readout (ui.md UI-2): the page and count at a
 * show time, and lengths in the field's measurement system.
 */
import type Page from "@/global/classes/Page";
import type { CountClock } from "@/timeline/countGrid";

export type ReadoutPage = Pick<
    Page,
    "id" | "name" | "order" | "counts" | "timestamp" | "duration"
> & { beats: readonly { timestamp: number }[] };

export interface PageCount {
    pageId: number;
    pageName: string;
    /** Counts completed into the page: 0 at its start, `total` at its set. */
    count: number;
    total: number;
}

/** Show times closer than this (ms) count as equal. */
const EPSILON_MS = 0.5;

/**
 * How many counts past the show's end a show time is (endless counts, EC-8), as the timeline's
 * "END +n": the count playing, numbered from the last page's end, as a page's count is. Null at
 * or before the end. `clock` times the counts on past the stored ones.
 */
export function countsPastEnd(
    pages: readonly ReadoutPage[],
    showMs: number,
    clock: CountClock,
): number | null {
    if (pages.length === 0) return null;
    const last = pages.reduce((a, b) => (b.order > a.order ? b : a));
    const endSeconds = last.timestamp + last.duration;
    if (showMs <= endSeconds * 1000 + EPSILON_MS) return null;
    const past = clock.beatAtTime(showMs / 1000) - clock.beatAtTime(endSeconds);
    return Math.max(1, Math.ceil(past - 1e-6));
}

/**
 * The page and count at a show time, matching the editor's convention that a
 * page's set is at its end: a page covers the times after its start, up to
 * and including its end. While the music is in count `n` of a page, the count
 * is `n`; at the set it equals the page's counts.
 *
 * Before the first page it is the first page at count 0; after the last, the
 * last page at its last count.
 */
export function pageCountAt(
    pages: readonly ReadoutPage[],
    showMs: number,
): PageCount | null {
    if (pages.length === 0) return null;
    const sorted = [...pages].sort((a, b) => a.order - b.order);
    const page =
        sorted.find(
            (p) => showMs <= (p.timestamp + p.duration) * 1000 + EPSILON_MS,
        ) ?? sorted[sorted.length - 1];
    const started = page.beats.filter(
        (beat) => beat.timestamp * 1000 < showMs - EPSILON_MS,
    ).length;
    return {
        pageId: page.id,
        pageName: page.name,
        count: Math.min(page.counts, started),
        total: page.counts,
    };
}

/**
 * The selected page and the count at a paused show time. A paused editor
 * can hold its playhead on any beat (a beat step, a click on the timeline),
 * so the count follows the time while it lies within the selected page.
 * Outside the page it is the page's set, which is what the editor shows
 * when only a page is selected.
 */
export function pausedPageCount(
    pages: readonly ReadoutPage[],
    pageId: number | null,
    showMs: number,
): PageCount | null {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return null;
    const startMs = page.timestamp * 1000;
    const endMs = (page.timestamp + page.duration) * 1000;
    const inPage =
        showMs >= startMs - EPSILON_MS && showMs <= endMs + EPSILON_MS;
    const started = page.beats.filter(
        (beat) => beat.timestamp * 1000 < showMs - EPSILON_MS,
    ).length;
    return {
        pageId: page.id,
        pageName: page.name,
        count: inPage ? Math.min(page.counts, started) : page.counts,
        total: page.counts,
    };
}
