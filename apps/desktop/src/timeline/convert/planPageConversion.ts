import type { XY } from "@openmarch/core";
import { pageEndBeat } from "../timelineCanvas";

/**
 * Plans the conversion of a page show into timeline rows (docs/timeline/phases/06-converter.md
 * P6.2, P6.3). Pure: page-model rows in, the timeline rows to write and a per-page loss report
 * out. `writePageConversion.ts` reads the rows and writes the plan.
 *
 * Page semantics (P6.1, the same mapping as `pageEndBeat`): beats are 0-based indexes into
 * `beats` ordered by position (ADR 0001 §2). Page 0 holds only the zero-length beat 0, and its
 * `marcher_pages` rows are the start positions. Page N ≥ 1 moves over
 * `[first beat of N, last beat of N + 1)`, and its `marcher_pages` rows are where marchers stand
 * when that range is done: the page-mode keyframe at `(timestamp + duration) * 1000`.
 *
 * Decisions:
 * - Homes come from page 0. A marcher with no page-0 row takes the coordinate of its first page
 *   that has one; a marcher with no row anywhere keeps its current home.
 * - One timeline over `[0, end beat of the last page)`, at least `[0, 1)`, so a show with only
 *   page 0 still gets a timeline and counts as converted.
 * - Page N ≥ 1 becomes one shapeless `direct` transition over its beats. Its slots are the
 *   marchers that have a `marcher_pages` row on N, in ascending marcher id; slot i's destination
 *   is that row's coordinate, copied exactly. Each of those marchers gets one layer-0 assignment
 *   over the whole transition.
 * - A marcher with no row on page N gets no assignment there, so it holds where it was (R-6).
 *   Page mode would instead glide across the gap to its next row. The report lists it.
 * - A page with no beats, or with no rows at all, gets no transition; the report says why.
 * - Pathways, midsets and curved SVG shapes can't be expressed (C-8). Only their page-end
 *   coordinates are kept; the report lists them per page.
 * - Only x and y are copied. A row's `rotation_degrees`, `notes` and per-page appearance
 *   overrides are dropped in timeline mode (decided by the project owner; see the Phase 6
 *   handoff notes); the report counts the rows that had any, per page.
 */

/** A page in show order, as `fromDatabasePages` builds it. */
export interface ConversionPage {
    readonly id: number;
    readonly name: string;
    readonly order: number;
    /** The page's beats in order; only `index` (the 0-based beat) is read */
    readonly beats: readonly { readonly index: number }[];
}

/** The `marcher_pages` columns the converter reads. */
export interface ConversionMarcherPage {
    readonly id: number;
    readonly marcher_id: number;
    readonly page_id: number;
    readonly x: number;
    readonly y: number;
    readonly path_data_id: number | null;
    /** Dropped in timeline mode; read only to report them */
    readonly rotation_degrees?: number | null;
    readonly notes?: string | null;
    readonly fill_color?: string | null;
    readonly outline_color?: string | null;
    readonly shape_type?: string | null;
    readonly visible?: number | null;
    readonly label_visible?: number | null;
    readonly equipment_name?: string | null;
    readonly equipment_state?: string | null;
}

/** The `midsets` columns the converter reads. */
export interface ConversionMidset {
    readonly id: number;
    readonly mp_id: number;
    readonly progress_placement: number;
}

/** The `shape_pages` columns the converter reads. */
export interface ConversionShapePage {
    readonly id: number;
    readonly shape_id: number;
    readonly page_id: number;
    readonly svg_path: string;
}

export interface PageConversionInput {
    /** Every page in show order (page 0 first) */
    readonly pages: readonly ConversionPage[];
    readonly marcherIds: readonly number[];
    readonly marcherPages: readonly ConversionMarcherPage[];
    readonly midsets?: readonly ConversionMidset[];
    readonly shapePages?: readonly ConversionShapePage[];
}

/** One planned transition: page `pageId`'s move. Slot i belongs to `marcherIds[i]`. */
export interface PlannedPageTransition {
    readonly pageId: number;
    readonly startBeat: number;
    readonly endBeat: number;
    readonly marcherIds: readonly number[];
    readonly points: readonly XY[];
}

/** Why a page got no transition. */
export type SkippedPageReason = "no-beats" | "no-marchers";

/** What converting one page loses, or can't carry over (P6.3, C-8). */
export interface PageLossReport {
    readonly pageId: number;
    readonly pageName: string;
    readonly order: number;
    /** The page's beat range; for page 0, `[0, 1)` */
    readonly startBeat: number;
    readonly endBeat: number;
    /** Rows moving into this page along a pathway: kept only at the page end */
    readonly pathways: { marcherId: number; pathwayId: number }[];
    /** Midsets of this page's rows: dropped (page-mode playback ignores them too) */
    readonly midsets: {
        marcherId: number;
        midsetId: number;
        progress: number;
    }[];
    /** SVG shapes on this page with curve commands: kept only as their marchers' points */
    readonly curvedShapes: { shapePageId: number; shapeId: number }[];
    /**
     * Rows of this page whose dropped fields hold something: a non-zero `rotation_degrees`, non-empty
     * `notes`, or any per-page appearance override (a color, shape type or equipment set, or
     * `visible`/`label_visible` turned off)
     */
    readonly droppedFields: {
        rotation: number;
        notes: number;
        appearance: number;
    };
    /** Marchers with no row on this page: they hold, where page mode would glide */
    readonly missingMarchers: number[];
    /** Set when the page got no transition */
    readonly skipped: SkippedPageReason | null;
}

export interface PageConversionReport {
    readonly pages: PageLossReport[];
    /** Marchers with no page-0 row whose home came from a later page */
    readonly homesFromLaterPage: number[];
    /** Marchers with no `marcher_pages` row at all: their home is left as it is */
    readonly marchersWithoutRows: number[];
}

export interface PageConversionPlan {
    readonly homes: { marcherId: number; home: XY }[];
    readonly timeline: {
        readonly name: string;
        readonly startBeat: number;
        readonly endBeat: number;
    };
    readonly transitions: PlannedPageTransition[];
    readonly report: PageConversionReport;
}

/** The name of the converter's timeline. */
export const CONVERTED_TIMELINE_NAME = "Converted from pages";

/** SVG path commands that draw curves: cubic, smooth cubic, quadratic, smooth quadratic, arc. */
const CURVE_COMMAND = /[CcSsQqTtAa]/;

/** True when an SVG path has a curve command (C-8: the spec's freehand is a polyline). */
export function svgPathIsCurved(svgPath: string): boolean {
    return CURVE_COMMAND.test(svgPath);
}

const filled = (v: string | null | undefined) => v != null && v !== "";

/** Which of a row's dropped fields hold something. */
export function droppedFieldsOf(mp: ConversionMarcherPage): {
    rotation: boolean;
    notes: boolean;
    appearance: boolean;
} {
    return {
        rotation: mp.rotation_degrees != null && mp.rotation_degrees !== 0,
        notes: filled(mp.notes),
        appearance:
            filled(mp.fill_color) ||
            filled(mp.outline_color) ||
            filled(mp.shape_type) ||
            filled(mp.equipment_name) ||
            filled(mp.equipment_state) ||
            mp.visible === 0 ||
            mp.label_visible === 0,
    };
}

/** The beat range page `page` moves over: `[first beat, pageEndBeat)`, or null without beats. */
export function pageBeatRange(
    page: ConversionPage,
): { startBeat: number; endBeat: number } | null {
    const first = page.beats[0];
    if (!first) return null;
    const endBeat = pageEndBeat(page);
    return endBeat > first.index ? { startBeat: first.index, endBeat } : null;
}

const groupBy = <T, K>(items: readonly T[], key: (t: T) => K): Map<K, T[]> => {
    const out = new Map<K, T[]>();
    for (const item of items) {
        const k = key(item);
        const list = out.get(k);
        if (list) list.push(item);
        else out.set(k, [item]);
    }
    return out;
};

// eslint-disable-next-line max-lines-per-function
export function planPageConversion(
    input: PageConversionInput,
): PageConversionPlan {
    if (input.pages.length === 0)
        throw new Error("the show has no pages to convert");
    const marcherIds = [...new Set(input.marcherIds)].sort((a, b) => a - b);
    const known = new Set(marcherIds);
    const rowsByPage = groupBy(
        input.marcherPages.filter((mp) => known.has(mp.marcher_id)),
        (mp) => mp.page_id,
    );
    const rowById = new Map(input.marcherPages.map((mp) => [mp.id, mp]));
    const midsetsByPage = groupBy(
        (input.midsets ?? []).filter((m) => rowById.has(m.mp_id)),
        (m) => rowById.get(m.mp_id)!.page_id,
    );
    const shapesByPage = groupBy(input.shapePages ?? [], (s) => s.page_id);

    // Homes: page 0, else the first page with a row
    const homes: { marcherId: number; home: XY }[] = [];
    const homesFromLaterPage: number[] = [];
    const marchersWithoutRows: number[] = [];
    const rowOf = new Map<number, Map<number, ConversionMarcherPage>>();
    for (const page of input.pages)
        rowOf.set(
            page.id,
            new Map(
                (rowsByPage.get(page.id) ?? []).map((mp) => [
                    mp.marcher_id,
                    mp,
                ]),
            ),
        );
    for (const marcherId of marcherIds) {
        let found: ConversionMarcherPage | undefined;
        for (const [i, page] of input.pages.entries()) {
            found = rowOf.get(page.id)!.get(marcherId);
            if (found) {
                if (i > 0) homesFromLaterPage.push(marcherId);
                break;
            }
        }
        if (found) homes.push({ marcherId, home: [found.x, found.y] });
        else marchersWithoutRows.push(marcherId);
    }

    const transitions: PlannedPageTransition[] = [];
    const pages: PageLossReport[] = input.pages.map((page, i) => {
        const rows = rowOf.get(page.id)!;
        const range =
            i === 0 ? { startBeat: 0, endBeat: 1 } : pageBeatRange(page);
        const present = marcherIds.filter((id) => rows.has(id));
        const skipped: SkippedPageReason | null =
            i === 0
                ? null
                : !range
                  ? "no-beats"
                  : present.length === 0
                    ? "no-marchers"
                    : null;
        if (i > 0 && range && !skipped)
            transitions.push({
                pageId: page.id,
                startBeat: range.startBeat,
                endBeat: range.endBeat,
                marcherIds: present,
                points: present.map((id) => {
                    const mp = rows.get(id)!;
                    return [mp.x, mp.y] as XY;
                }),
            });
        const sortedRows = [...rows.values()].sort(
            (a, b) => a.marcher_id - b.marcher_id,
        );
        return {
            pageId: page.id,
            pageName: page.name,
            order: page.order,
            startBeat: range?.startBeat ?? 0,
            endBeat: range?.endBeat ?? 0,
            pathways: sortedRows
                .filter((mp) => mp.path_data_id !== null)
                .map((mp) => ({
                    marcherId: mp.marcher_id,
                    pathwayId: mp.path_data_id!,
                })),
            midsets: (midsetsByPage.get(page.id) ?? [])
                .map((m) => ({
                    marcherId: rowById.get(m.mp_id)!.marcher_id,
                    midsetId: m.id,
                    progress: m.progress_placement,
                }))
                .sort(
                    (a, b) =>
                        a.marcherId - b.marcherId || a.progress - b.progress,
                ),
            curvedShapes: (shapesByPage.get(page.id) ?? [])
                .filter((s) => svgPathIsCurved(s.svg_path))
                .map((s) => ({ shapePageId: s.id, shapeId: s.shape_id }))
                .sort((a, b) => a.shapePageId - b.shapePageId),
            droppedFields: sortedRows.reduce(
                (acc, mp) => {
                    const d = droppedFieldsOf(mp);
                    if (d.rotation) acc.rotation++;
                    if (d.notes) acc.notes++;
                    if (d.appearance) acc.appearance++;
                    return acc;
                },
                { rotation: 0, notes: 0, appearance: 0 },
            ),
            missingMarchers: marcherIds.filter((id) => !rows.has(id)),
            skipped,
        };
    });

    const lastEnd = Math.max(1, ...transitions.map((t) => t.endBeat));
    return {
        homes,
        timeline: {
            name: CONVERTED_TIMELINE_NAME,
            startBeat: 0,
            endBeat: lastEnd,
        },
        transitions,
        report: { pages, homesFromLaterPage, marchersWithoutRows },
    };
}

/** True when converting the page loses or changes something. */
export function pageHasLoss(page: PageLossReport): boolean {
    return (
        page.pathways.length > 0 ||
        page.midsets.length > 0 ||
        page.curvedShapes.length > 0 ||
        page.missingMarchers.length > 0 ||
        page.droppedFields.rotation > 0 ||
        page.droppedFields.notes > 0 ||
        page.droppedFields.appearance > 0 ||
        page.skipped !== null
    );
}

/** One line per page that loses something, for the dev console. Empty when nothing is lost. */
export function describePageConversionReport(
    report: PageConversionReport,
): string[] {
    const lines: string[] = [];
    const ids = (xs: number[]) => xs.join(", ");
    for (const page of report.pages) {
        if (!pageHasLoss(page)) continue;
        const parts: string[] = [];
        if (page.skipped) parts.push(`no transition (${page.skipped})`);
        if (page.pathways.length)
            parts.push(
                `${page.pathways.length} pathway(s), kept only at the page end (marchers ${ids(page.pathways.map((p) => p.marcherId))})`,
            );
        if (page.midsets.length)
            parts.push(`${page.midsets.length} midset(s) dropped`);
        if (page.curvedShapes.length)
            parts.push(
                `${page.curvedShapes.length} curved shape(s), kept only as points (shape pages ${ids(page.curvedShapes.map((s) => s.shapePageId))})`,
            );
        const { rotation, notes, appearance } = page.droppedFields;
        if (rotation || notes || appearance)
            parts.push(
                `dropped from rows: rotation ${rotation}, notes ${notes}, appearance overrides ${appearance}`,
            );
        if (page.missingMarchers.length)
            parts.push(
                `marchers without a row hold: ${ids(page.missingMarchers)}`,
            );
        lines.push(
            `Page ${page.pageName} [${page.startBeat}, ${page.endBeat}): ${parts.join("; ")}`,
        );
    }
    if (report.homesFromLaterPage.length)
        lines.push(
            `Homes from a later page (no page-0 row): marchers ${ids(report.homesFromLaterPage)}`,
        );
    if (report.marchersWithoutRows.length)
        lines.push(
            `Marchers with no rows, home unchanged: ${ids(report.marchersWithoutRows)}`,
        );
    return lines;
}
