/**
 * Pure helpers for the overlay readout (ui.md UI-2): the page and count at a
 * show time, and lengths in the field's measurement system.
 */
import type { MeasurementSystem } from "@openmarch/core";
import type Page from "@/global/classes/Page";

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

/** The selected page at its set, which is what the paused editor shows. */
export function pageAtSet(
    pages: readonly ReadoutPage[],
    pageId: number | null,
): PageCount | null {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return null;
    return {
        pageId: page.id,
        pageName: page.name,
        count: page.counts,
        total: page.counts,
    };
}

export const METERS_PER_FOOT = 0.3048;

export interface Length {
    value: string;
    unit: "ft" | "m";
}

/**
 * A length for display: whole feet for imperial fields, meters with one
 * decimal (whole meters from 100 m) for metric fields.
 */
export function formatLength(
    meters: number,
    system: MeasurementSystem,
): Length {
    const m = Number.isFinite(meters) ? Math.max(0, meters) : 0;
    if (system === "metric") {
        return { value: m >= 100 ? m.toFixed(0) : m.toFixed(1), unit: "m" };
    }
    return { value: (m / METERS_PER_FOOT).toFixed(0), unit: "ft" };
}
