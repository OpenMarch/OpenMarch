import { asc } from "drizzle-orm";
import { schema, type DbConnection } from "@/test/base";
import {
    combineMarcherTimelines,
    getMarcherTimelines,
} from "@/hooks/queries/useCoordinateData";
import { pathwayMapFromArray } from "@/hooks/queries/usePathways";
import type { MarcherPagesByMarcher } from "@/global/classes/MarcherPageIndex";
import type Page from "@/global/classes/Page";
import type Beat from "@/global/classes/Beat";
import {
    getCoordinatesAtTime,
    type MarcherTimeline,
} from "@/utilities/Keyframes";
import type { PageConversionReport } from "../convert/planPageConversion";
import { readShowTiming } from "../convert/writePageConversion";
import { pageEndBeat } from "../timelineCanvas";
import { timeAtBeat } from "../timeMap";
import { useTimelineResolverStore } from "../timelineStore";

/**
 * Conversion equality (docs/timeline/phases/06-converter.md P6.6): compares a converted show's
 * resolver positions with page-mode playback, on the same database, after
 * `convertPagesToTimeline` and `startTimelineResolver`.
 *
 * The page-mode side is the app's own playback code, not a copy of it: `getMarcherTimelines` and
 * `combineMarcherTimelines` build the keyframes (one per page, at the page's end) and
 * `getCoordinatesAtTime` interpolates them, as `useAnimation` does.
 *
 * Per C-7 a timeline move follows beats, while page mode moves linearly in milliseconds. So the
 * authoritative comparison is at the same beat position: the page-mode keyframes are built a
 * second time on a beat axis (each page's keyframe at its end beat) and interpolated with the same
 * function. The millisecond playback at that beat's show time is compared too; on a page whose
 * beats have equal lengths the two agree, and on a page with uneven tempo the difference is only
 * reported.
 *
 * Each interior sample is put in one bucket:
 * - `plain`: the marcher has a row on the page and moves in a straight line. Must match.
 * - `pathway`: the marcher's next row (on this page or, across a gap, a later one) moves along a
 *   pathway, which the converter keeps only at the page end (C-8).
 * - `missingRow`: the marcher has no row on the page or on the page before it (only in damaged
 *   files), and moves in a straight line. Page mode glides across the gap, and so does the
 *   converter (P6.7), linear in beats; after its last row both hold. Must match at the same beat.
 *   Page mode's millisecond glide spans pages of different tempos, so its millisecond difference is
 *   reported on its own and never checked.
 * - `beforeFirstRow`: the marcher's first row is on a later page, so page mode has no position yet.
 *
 * At each page end, marchers without a row on that page (`gapEnd`) are compared with page mode at
 * the same beat: the converter's interpolated destinations, along a pathway too, and holds.
 */

/** Distances are in canvas pixels, like `marcher_pages.x` and `y`. */
export interface ErrorStats {
    samples: number;
    max: number;
    mean: number;
}

export interface PageEquality {
    /** Show order, 1-based for pages after page 0 */
    readonly order: number;
    readonly startBeat: number;
    readonly endBeat: number;
    /** True when the page's beats don't all have the same length */
    readonly unevenTempo: boolean;
    /** Largest distance between millisecond playback and the converted show at the same beat */
    readonly maxMsDifference: number;
    readonly pageEnd: ErrorStats;
    readonly plain: ErrorStats;
    readonly pathway: ErrorStats;
    readonly missingRow: ErrorStats;
    readonly gapEnd: ErrorStats;
}

/** One sampled moment: the same marchers, in the same order, in both modes. */
export interface EqualitySample {
    readonly beat: number;
    /** Show order of the page the beat belongs to */
    readonly pageOrder: number;
    readonly kind: "page-end" | "interior";
    readonly marcherIds: number[];
    /** Page-mode position at this beat (C-7: same beat position) */
    readonly pageMode: [number, number][];
    readonly converted: [number, number][];
}

export interface ConversionEqualityReport {
    readonly marchers: number;
    /** Pages including page 0 */
    readonly pages: number;
    readonly pageEnd: ErrorStats & { exact: number };
    readonly plain: ErrorStats;
    readonly pathway: ErrorStats;
    readonly missingRow: ErrorStats;
    /** Page ends of marchers without a row on the page, against page mode at the same beat */
    readonly gapEnd: ErrorStats;
    readonly beforeFirstRow: number;
    readonly unevenTempoPages: number;
    /** Largest millisecond-playback difference on pages with even tempo (should be ~0) */
    readonly maxMsDifferenceEvenTempo: number;
    /** Largest millisecond-playback difference on pages with uneven tempo (reported only) */
    readonly maxMsDifferenceUnevenTempo: number;
    /** Largest millisecond-playback difference on `missingRow` samples (reported only) */
    readonly maxMsDifferenceMissingRow: number;
    readonly perPage: PageEquality[];
    readonly samples: EqualitySample[];
}

export interface ConversionEqualityOptions {
    /** Interior sample beats per page, evenly spaced (default 4) */
    readonly interiorSamples?: number;
    /** Moments to keep in `samples`, spread over the show (default 6) */
    readonly keepSamples?: number;
}

class Stats {
    samples = 0;
    max = 0;
    sum = 0;
    add(error: number) {
        this.samples++;
        this.sum += error;
        if (error > this.max) this.max = error;
    }
    merge(other: Stats) {
        this.samples += other.samples;
        this.sum += other.sum;
        if (other.max > this.max) this.max = other.max;
    }
    get value(): ErrorStats {
        return {
            samples: this.samples,
            max: this.max,
            mean: this.samples ? this.sum / this.samples : 0,
        };
    }
}

const distance = (a: { x: number; y: number }, b: readonly number[]) =>
    Math.hypot(a.x - b[0]!, a.y - b[1]!);

/** True when the beats in `[startBeat, endBeat)` don't all have the same length. */
export function pageHasUnevenTempo(
    beats: readonly Beat[],
    startBeat: number,
    endBeat: number,
): boolean {
    const durations = beats
        .slice(startBeat, Math.min(endBeat, beats.length))
        .map((b) => b.duration);
    if (durations.length < 2) return false;
    const first = durations[0]!;
    return durations.some(
        (d) => Math.abs(d - first) > 1e-12 * Math.max(1, Math.abs(first)),
    );
}

type Row = typeof schema.marcher_pages.$inferSelect;

/** Page-mode keyframes for every marcher, with each page's keyframe at `at(page)`. */
function pageModeKeyframes(
    pages: readonly Page[],
    rowsByPage: Map<number, Row[]>,
    pathwaysById: ReturnType<typeof pathwayMapFromArray>,
    at: (page: Page) => number,
): Map<number, MarcherTimeline> {
    return combineMarcherTimelines(
        pages.map((page) =>
            getMarcherTimelines(
                at(page),
                Object.fromEntries(
                    (rowsByPage.get(page.id) ?? []).map((mp) => [
                        mp.marcher_id,
                        mp,
                    ]),
                ) as unknown as MarcherPagesByMarcher,
                pathwaysById,
            ),
        ),
    );
}

/** Page-mode position at `t` on `timeline`, or null before its first keyframe or after its last. */
function pageModeAt(
    timeline: MarcherTimeline | undefined,
    t: number,
): { x: number; y: number } | null {
    if (!timeline || timeline.sortedTimestamps.length === 0) return null;
    if (t < timeline.sortedTimestamps[0]!) return null;
    const last =
        timeline.sortedTimestamps[timeline.sortedTimestamps.length - 1]!;
    if (t >= last) {
        // Page mode stops updating after the last keyframe: the marcher stays on it
        const c = timeline.pathMap.get(last)!;
        return { x: c.x, y: c.y };
    }
    return getCoordinatesAtTime(t, timeline);
}

/** Picks `n` indexes spread evenly over `length` items. */
const spread = (length: number, n: number): number[] => {
    if (length <= 0 || n <= 0) return [];
    if (n >= length) return [...Array(length).keys()];
    return [
        ...new Set(
            Array.from({ length: n }, (_, i) =>
                Math.round((i * (length - 1)) / Math.max(1, n - 1)),
            ),
        ),
    ];
};

/**
 * Compares the running resolver with page-mode playback on `db`. The show must already be
 * converted and the resolver started (and settled).
 */
// eslint-disable-next-line max-lines-per-function
export async function compareConversion(
    db: DbConnection,
    { interiorSamples = 4, keepSamples = 6 }: ConversionEqualityOptions = {},
): Promise<ConversionEqualityReport> {
    const resolver = useTimelineResolverStore.getState().resolver;
    if (!resolver) throw new Error("the timeline resolver is not ready");
    const { beats, pages } = await readShowTiming(db);
    const marcherIds = (
        await db
            .select({ id: schema.marchers.id })
            .from(schema.marchers)
            .orderBy(asc(schema.marchers.id))
            .all()
    ).map((m) => m.id);
    const rows = await db.select().from(schema.marcher_pages).all();
    const rowsByPage = new Map<number, Row[]>();
    for (const row of rows) {
        const list = rowsByPage.get(row.page_id);
        if (list) list.push(row);
        else rowsByPage.set(row.page_id, [row]);
    }
    const rowOn = (pageId: number, marcherId: number) =>
        rowsByPage.get(pageId)?.find((r) => r.marcher_id === marcherId);
    /** The marcher's first row on page `pageIndex` or a later one */
    const nextRowFrom = (pageIndex: number, marcherId: number) => {
        for (const page of pages.slice(pageIndex)) {
            const row = rowOn(page.id, marcherId);
            if (row) return row;
        }
        return undefined;
    };
    const pathwaysById = pathwayMapFromArray(
        await db.select().from(schema.pathways).all(),
    );

    // The app's keyframes, in milliseconds, and the same keyframes on a beat axis (C-7)
    const msKeyframes = pageModeKeyframes(
        pages,
        rowsByPage,
        pathwaysById,
        (page) => (page.timestamp + page.duration) * 1000,
    );
    const beatKeyframes = pageModeKeyframes(
        pages,
        rowsByPage,
        pathwaysById,
        (page) => pageEndBeat(page),
    );

    const pageEnd = new Stats();
    let exact = 0;
    const totals = {
        plain: new Stats(),
        pathway: new Stats(),
        missingRow: new Stats(),
        gapEnd: new Stats(),
    };
    let beforeFirstRow = 0;
    let maxMsMissingRow = 0;
    let maxMsEven = 0;
    let maxMsUneven = 0;
    let unevenTempoPages = 0;
    const perPage: PageEquality[] = [];
    const candidates: EqualitySample[] = [];

    const sampleAt = (
        beat: number,
        pageOrder: number,
        kind: EqualitySample["kind"],
    ): EqualitySample => {
        const pageMode: [number, number][] = [];
        const converted: [number, number][] = [];
        const ids: number[] = [];
        for (const id of marcherIds) {
            const expected = pageModeAt(beatKeyframes.get(id), beat);
            if (!expected) continue;
            const [x, y] = resolver.positionAt(id, beat);
            ids.push(id);
            pageMode.push([expected.x, expected.y]);
            converted.push([x, y]);
        }
        return { beat, pageOrder, kind, marcherIds: ids, pageMode, converted };
    };

    // Page 0: the homes, at beats 0 and 1
    const page0 = pages[0];
    if (page0)
        for (const mp of rowsByPage.get(page0.id) ?? [])
            for (const beat of [0, pageEndBeat(page0)]) {
                const [x, y] = resolver.positionAt(mp.marcher_id, beat);
                pageEnd.add(Math.hypot(x - mp.x, y - mp.y));
                if (Object.is(x, mp.x) && Object.is(y, mp.y)) exact++;
            }

    for (const [pageIndex, page] of pages.entries()) {
        if (pageIndex === 0) continue;
        const previousPageId = pages[pageIndex - 1]!.id;
        const first = page.beats[0];
        const endBeat = pageEndBeat(page);
        if (!first || endBeat <= first.index) continue;
        const startBeat = first.index;
        const uneven = pageHasUnevenTempo(beats, startBeat, endBeat);
        if (uneven) unevenTempoPages++;
        const stats = {
            pageEnd: new Stats(),
            plain: new Stats(),
            pathway: new Stats(),
            missingRow: new Stats(),
            gapEnd: new Stats(),
        };
        let maxMs = 0;

        // Page end: exactly the page's marcher_pages rows
        for (const mp of rowsByPage.get(page.id) ?? []) {
            const [x, y] = resolver.positionAt(mp.marcher_id, endBeat);
            const error = Math.hypot(x - mp.x, y - mp.y);
            stats.pageEnd.add(error);
            if (Object.is(x, mp.x) && Object.is(y, mp.y)) exact++;
        }
        // Page end of marchers without a row here: where page mode is at the same beat
        for (const id of marcherIds) {
            if (rowOn(page.id, id)) continue;
            const expected = pageModeAt(beatKeyframes.get(id), endBeat);
            if (!expected) continue;
            stats.gapEnd.add(
                distance(expected, resolver.positionAt(id, endBeat)),
            );
        }

        // Interior: page mode at the same beat, and at that beat's show time
        for (let k = 1; k <= interiorSamples; k++) {
            const beat =
                startBeat + ((endBeat - startBeat) * k) / (interiorSamples + 1);
            const ms = timeAtBeat(beats, beat) * 1000;
            for (const id of marcherIds) {
                const atBeat = pageModeAt(beatKeyframes.get(id), beat);
                if (!atBeat) {
                    beforeFirstRow++;
                    continue;
                }
                const converted = resolver.positionAt(id, beat);
                const row = rowOn(page.id, id);
                // A gap also changes where page mode starts the next page's move
                const bucket =
                    (nextRowFrom(pageIndex, id)?.path_data_id ?? null) !== null
                        ? stats.pathway
                        : !row || !rowOn(previousPageId, id)
                          ? stats.missingRow
                          : stats.plain;
                bucket.add(distance(atBeat, converted));
                if (bucket === stats.plain || bucket === stats.missingRow) {
                    const atMs = pageModeAt(msKeyframes.get(id), ms);
                    if (atMs && bucket === stats.plain)
                        maxMs = Math.max(maxMs, distance(atMs, converted));
                    else if (atMs)
                        maxMsMissingRow = Math.max(
                            maxMsMissingRow,
                            distance(atMs, converted),
                        );
                }
            }
        }
        if (uneven) maxMsUneven = Math.max(maxMsUneven, maxMs);
        else maxMsEven = Math.max(maxMsEven, maxMs);
        pageEnd.merge(stats.pageEnd);
        totals.plain.merge(stats.plain);
        totals.pathway.merge(stats.pathway);
        totals.missingRow.merge(stats.missingRow);
        totals.gapEnd.merge(stats.gapEnd);
        perPage.push({
            order: page.order,
            startBeat,
            endBeat,
            unevenTempo: uneven,
            maxMsDifference: maxMs,
            pageEnd: stats.pageEnd.value,
            plain: stats.plain.value,
            pathway: stats.pathway.value,
            missingRow: stats.missingRow.value,
            gapEnd: stats.gapEnd.value,
        });
    }

    // Moments for the judgment step: alternate page ends and mid-page beats, spread over the show
    for (const i of spread(perPage.length, keepSamples)) {
        const p = perPage[i]!;
        candidates.push(
            i % 2 === 0
                ? sampleAt((p.startBeat + p.endBeat) / 2, p.order, "interior")
                : sampleAt(p.endBeat, p.order, "page-end"),
        );
    }

    return {
        marchers: marcherIds.length,
        pages: pages.length,
        pageEnd: { ...pageEnd.value, exact },
        plain: totals.plain.value,
        pathway: totals.pathway.value,
        missingRow: totals.missingRow.value,
        gapEnd: totals.gapEnd.value,
        beforeFirstRow,
        unevenTempoPages,
        maxMsDifferenceEvenTempo: maxMsEven,
        maxMsDifferenceUnevenTempo: maxMsUneven,
        maxMsDifferenceMissingRow: maxMsMissingRow,
        perPage,
        samples: candidates,
    };
}

/** Counts from a loss report, with no ids or names: safe to log for a real show. */
export function lossReportCounts(report: PageConversionReport) {
    const sum = (f: (p: PageConversionReport["pages"][number]) => number) =>
        report.pages.reduce((n, p) => n + f(p), 0);
    return {
        pagesWithPathways: report.pages.filter((p) => p.pathways.length).length,
        pathways: sum((p) => p.pathways.length),
        midsets: sum((p) => p.midsets.length),
        curvedShapes: sum((p) => p.curvedShapes.length),
        droppedRotation: sum((p) => p.droppedFields.rotation),
        droppedNotes: sum((p) => p.droppedFields.notes),
        droppedAppearance: sum((p) => p.droppedFields.appearance),
        missingMarcherRows: sum((p) => p.missingMarchers.length),
        interpolatedMarcherRows: sum((p) => p.interpolated.length),
        interpolatedAlongPathway: sum(
            (p) => p.interpolated.filter((g) => g.pathwayId !== null).length,
        ),
        interpolatedUnusablePathway: sum(
            (p) =>
                p.interpolated.filter((g) => g.unusablePathwayId !== null)
                    .length,
        ),
        skippedPages: report.pages.filter((p) => p.skipped !== null).length,
        homesFromLaterPage: report.homesFromLaterPage.length,
        marchersWithoutRows: report.marchersWithoutRows.length,
    };
}
