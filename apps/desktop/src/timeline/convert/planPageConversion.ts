import { Path, type XY } from "@openmarch/core";
import { pageEndBeat } from "../pageEndBeat";

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
 * - One timeline per page move (C-11, C-12): page N ≥ 1 becomes its own timeline over exactly
 *   its beats, the range from the previous page's flag to N's flag, which is the page timeline
 *   that page N's box selects (UI-9). Page 1's timeline starts at beat 1, page 0's flag: page 0
 *   holds only the zero-length beat 0, so beat 1 is the same show time (UI-5). Page 0 gets no
 *   timeline; it only seeds the homes. The timelines are unnamed, like every page timeline, since
 *   pages renumber when flags are added.
 * - That timeline holds one shapeless `direct` transition spanning it. Its slots are the
 *   marchers that have a `marcher_pages` row on N, in ascending marcher id; slot i's destination
 *   is that row's coordinate, copied exactly. Each of those marchers gets one layer-0 assignment
 *   over the whole transition.
 * - Only marchers that move get a slot (C-12: a coordinate exists only where the designer moved
 *   someone). A marcher whose point on N is exactly (bit for bit) where it already stands, its
 *   previous slot's point or its home, holds there without one, so a page copied from the one
 *   before converts to no rows and a later edit to the earlier page carries through it. A page
 *   where nobody moves gets no timeline, and that is not a loss.
 * - A marcher with no row on page N (only in damaged files) glides across the gap like page mode
 *   (P6.7): it gets a slot on N whose destination is linear in beats (C-7) between its neighboring
 *   rows, the point that fraction of the beats from the previous row's end beat to the next row's
 *   end beat, along the next row's pathway if it has one. The report lists it as interpolated.
 *   With no earlier row (before its first row: it waits at its home) or no later row (after its
 *   last row) it gets no assignment and holds where it is (R-6); the report lists it as held.
 * - A page with no beats, or with no slots at all, gets no timeline; the report says why. So a
 *   show with only page 0 converts to homes and no timeline rows.
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
    /** Read only to place a marcher that glides across a gap along this row's pathway (P6.7) */
    readonly path_start_position?: number | null;
    readonly path_end_position?: number | null;
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

/** The `pathways` columns the converter reads: only to place gap glides (P6.7). */
export interface ConversionPathway {
    readonly id: number;
    /** `Path` JSON, as `pathways.path_data` stores it */
    readonly path_data: string;
}

export interface PageConversionInput {
    /** Every page in show order (page 0 first) */
    readonly pages: readonly ConversionPage[];
    readonly marcherIds: readonly number[];
    readonly marcherPages: readonly ConversionMarcherPage[];
    readonly midsets?: readonly ConversionMidset[];
    readonly shapePages?: readonly ConversionShapePage[];
    readonly pathways?: readonly ConversionPathway[];
}

/**
 * One planned page move: page `pageId`'s timeline over `[startBeat, endBeat)` and the one
 * transition spanning it (C-11). Slot i belongs to `marcherIds[i]`.
 */
export interface PlannedPageTransition {
    readonly pageId: number;
    readonly startBeat: number;
    readonly endBeat: number;
    readonly marcherIds: readonly number[];
    readonly points: readonly XY[];
}

/** Why a page got no timeline. */
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
    /**
     * Marchers with no row on this page. Those in `interpolated` glide across the gap; the rest
     * hold, because they have no earlier row (they wait at their home) or no later row.
     */
    readonly missingMarchers: number[];
    /**
     * Marchers with no row on this page that glide across the gap like page mode: their slot's
     * destination is interpolated in beats between their neighboring rows (P6.7). `pathwayId` is
     * the next row's pathway when the glide follows it; then the destination is on the pathway,
     * but the move inside the page is straight (C-8), as for `pathways`. `unusablePathwayId` is the
     * next row's pathway when it couldn't be followed (missing, unreadable, or giving no finite
     * point); then the glide is a straight line, as if the row had no pathway.
     */
    readonly interpolated: GapGlideReport[];
    /** Set when the page got no timeline */
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
    /** Page moves in show order, each written as its own timeline (C-11) */
    readonly transitions: PlannedPageTransition[];
    readonly report: PageConversionReport;
}

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

/** How a marcher without a row glides across a page (P6.7). */
export interface GapGlideReport {
    readonly marcherId: number;
    /** The pathway the glide follows, or null for a straight line */
    readonly pathwayId: number | null;
    /** The next row's pathway when it couldn't be used, so the glide fell back to a straight line */
    readonly unusablePathwayId: number | null;
}

/** Where a gap glide ends, and how it got there. */
export interface GapGlide {
    readonly point: XY;
    readonly pathwayId: number | null;
    readonly unusablePathwayId: number | null;
}

/** A marcher's row on a page that has an end beat: a neighbor a gap glide is anchored to. */
interface RowAnchor {
    readonly pageIndex: number;
    readonly endBeat: number;
    readonly row: ConversionMarcherPage;
}

/**
 * Where page mode puts a marcher at `beat`, between its rows `prev` and `next` (P6.7): the same
 * arithmetic as `getCoordinatesAtTime` on keyframes at the rows' end beats (C-7). Along `next`'s
 * pathway when it has one, from `prev.path_start_position` to `next.path_end_position` (both read
 * with `||`, as `getMarcherTimelines` does); otherwise in a straight line.
 *
 * Never throws on a damaged pathway, so a damaged file still converts (and opens, once conversion
 * runs on open): when `pathOf` returns nothing or throws (unknown id, unreadable JSON), or the
 * path gives no finite point (an empty path), the glide falls back to the straight line and
 * `unusablePathwayId` names the pathway.
 */
export function interpolateGap(
    prev: { endBeat: number; row: ConversionMarcherPage },
    next: { endBeat: number; row: ConversionMarcherPage },
    beat: number,
    pathOf: (pathwayId: number) => Path | undefined = () => undefined,
): GapGlide {
    const progress = (beat - prev.endBeat) / (next.endBeat - prev.endBeat);
    const pathwayId = next.row.path_data_id;
    if (pathwayId !== null) {
        const from = prev.row.path_start_position || 0;
        const to = next.row.path_end_position || 1;
        const position = (to - from) * progress + from;
        try {
            const path = pathOf(pathwayId);
            if (path) {
                const point = path.getPointAtLength(
                    path.getTotalLength() * position,
                );
                if (Number.isFinite(point.x) && Number.isFinite(point.y))
                    return {
                        point: [point.x, point.y],
                        pathwayId,
                        unusablePathwayId: null,
                    };
            }
        } catch {
            // A damaged pathway: fall back to the straight line below
        }
    }
    return {
        point: [
            prev.row.x + progress * (next.row.x - prev.row.x),
            prev.row.y + progress * (next.row.y - prev.row.y),
        ],
        pathwayId: null,
        unusablePathwayId: pathwayId,
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

    const ranges = input.pages.map((page, i) =>
        i === 0 ? { startBeat: 0, endBeat: 1 } : pageBeatRange(page),
    );

    // Each marcher's rows on pages with an end beat, in show order: the anchors of gap glides
    const anchorsOf = new Map<number, RowAnchor[]>(
        marcherIds.map((id) => [id, []]),
    );
    for (const [pageIndex, page] of input.pages.entries()) {
        const range = ranges[pageIndex];
        if (!range) continue;
        for (const [marcherId, row] of rowOf.get(page.id)!)
            anchorsOf
                .get(marcherId)!
                .push({ pageIndex, endBeat: range.endBeat, row });
    }
    // Parsed once per pathway; a parse error is kept and rethrown for `interpolateGap` to catch
    const pathsById = new Map<number, Path | undefined | Error>();
    const pathways = new Map((input.pathways ?? []).map((p) => [p.id, p]));
    const pathOf = (id: number): Path | undefined => {
        if (!pathsById.has(id)) {
            const pathway = pathways.get(id);
            let parsed: Path | undefined | Error;
            try {
                parsed = pathway
                    ? Path.fromJson(pathway.path_data, undefined, undefined, id)
                    : undefined;
            } catch (error) {
                parsed =
                    error instanceof Error ? error : new Error(String(error));
            }
            pathsById.set(id, parsed);
        }
        const path = pathsById.get(id);
        if (path instanceof Error) throw path;
        return path;
    };
    /** Marchers without a row on page `i` that have a row before and after it glide (P6.7). */
    const gapGlides = (i: number, endBeat: number) => {
        const rows = rowOf.get(input.pages[i]!.id)!;
        const glides = new Map<number, GapGlide>();
        for (const id of marcherIds) {
            if (rows.has(id)) continue;
            const anchors = anchorsOf.get(id)!;
            const next = anchors.find((a) => a.pageIndex > i);
            const prev = anchors.findLast((a) => a.pageIndex < i);
            if (prev && next)
                glides.set(id, interpolateGap(prev, next, endBeat, pathOf));
        }
        return glides;
    };

    const transitions: PlannedPageTransition[] = [];
    // Where each marcher stands after the pages planned so far: its last slot's point, or home
    const lastPoint = new Map<number, XY>(
        homes.map(({ marcherId, home }) => [marcherId, home]),
    );
    /** Page `pageId`'s transition, with a slot for each marcher that moves there. */
    const planMoves = (
        pageId: number,
        range: { startBeat: number; endBeat: number },
        slotted: number[],
        rows: Map<number, ConversionMarcherPage>,
        glides: Map<number, GapGlide>,
    ) => {
        const pointOf = (id: number): XY => {
            const mp = rows.get(id);
            return mp ? ([mp.x, mp.y] as XY) : glides.get(id)!.point;
        };
        // A marcher already standing on its point holds there without a slot (C-12): only
        // exactly equal points are left out, so every flag's positions are unchanged
        const moved = slotted.filter((id) => {
            const [x, y] = pointOf(id);
            const [px, py] = lastPoint.get(id) ?? [NaN, NaN];
            return x !== px || y !== py;
        });
        for (const id of slotted) lastPoint.set(id, pointOf(id));
        if (moved.length > 0)
            transitions.push({
                pageId,
                startBeat: range.startBeat,
                endBeat: range.endBeat,
                marcherIds: moved,
                points: moved.map(pointOf),
            });
    };
    const pages: PageLossReport[] = input.pages.map((page, i) => {
        const rows = rowOf.get(page.id)!;
        const range = ranges[i] ?? null;
        const glides =
            i > 0 && range
                ? gapGlides(i, range.endBeat)
                : new Map<number, GapGlide>();
        const slotted = marcherIds.filter(
            (id) => rows.has(id) || glides.has(id),
        );
        const skipped: SkippedPageReason | null =
            i === 0
                ? null
                : !range
                  ? "no-beats"
                  : slotted.length === 0
                    ? "no-marchers"
                    : null;
        if (i > 0 && range && !skipped)
            planMoves(page.id, range, slotted, rows, glides);
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
            interpolated: [...glides].map(([marcherId, g]) => ({
                marcherId,
                pathwayId: g.pathwayId,
                unusablePathwayId: g.unusablePathwayId,
            })),
            skipped,
        };
    });

    return {
        homes,
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
        if (page.interpolated.length) {
            const along = page.interpolated.filter((g) => g.pathwayId !== null);
            parts.push(
                `marchers without a row glide to an interpolated point: ${ids(page.interpolated.map((g) => g.marcherId))}` +
                    (along.length
                        ? ` (along a pathway, kept only at the page end: ${ids(along.map((g) => g.marcherId))})`
                        : ""),
            );
            const unusable = page.interpolated.filter(
                (g) => g.unusablePathwayId !== null,
            );
            if (unusable.length)
                parts.push(
                    `unusable pathway(s), glided in a straight line instead (marchers ${ids(unusable.map((g) => g.marcherId))}; pathways ${ids(unusable.map((g) => g.unusablePathwayId!))})`,
                );
        }
        const glided = new Set(page.interpolated.map((g) => g.marcherId));
        const held = page.missingMarchers.filter((id) => !glided.has(id));
        if (held.length)
            parts.push(`marchers without a row hold: ${ids(held)}`);
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
