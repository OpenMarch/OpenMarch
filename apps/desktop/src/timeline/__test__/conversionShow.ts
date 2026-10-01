import { and, asc, eq } from "drizzle-orm";
import { Path } from "@openmarch/core";
import { schema, type DbConnection } from "@/test/base";
import { createBeats } from "@/db-functions/beat";
import { createMeasures } from "@/db-functions/measures";
import { createPages } from "@/db-functions/page";
import { createMarchers, deleteMarchers } from "@/db-functions/marcher";
import { updateMarcherPages } from "@/db-functions/marcherPage";
import { createShapePages } from "@/db-functions/shapePages";

/**
 * The conversion equality show (docs/timeline/phases/06-converter.md P6.6), built through the
 * app's own db-functions on a blank file, so it is generated rather than committed. It exercises
 * every page feature the converter handles:
 *
 * - counts: pages of 8, 4, 16, 6, 3, 1, 12, 8 and a last page of `last_page_counts` (8) beats;
 * - tempo: 120 bpm, a change to 90 bpm at a page boundary, a ritardando inside one page and a
 *   tempo change in the middle of another (the two uneven-tempo pages), and measures throughout;
 * - page shapes: a curved SVG shape (a quadratic arc) and a straight one on the same page;
 * - marchers added after the pages exist, and one marcher deleted mid-show;
 * - a page where every marcher holds, single marchers holding, and coincident marchers;
 * - a pathway (curved, kept only at its page end, C-8) and a midset (dropped);
 * - damaged-file cases page mode can't create (P6.7): a marcher with no row on one page in the
 *   middle; one with no rows on two pages in a row, after the curved-shape page and across the
 *   uneven ritardando page; one with no row on the page before its pathway row (it glides along
 *   the pathway, between non-default path positions); one with no row on the last page (it
 *   holds); and one with no page-0 row.
 */

/** Beat lengths in seconds, after the fixed zero-length beat 0, and where each page starts. */
const QUARTER_120 = 0.5;
const QUARTER_90 = 60 / 90;
const PAGE_BEATS: readonly (readonly number[])[] = [
    Array(8).fill(QUARTER_120), // page 1: 8 counts
    Array(4).fill(QUARTER_120), // page 2: 4 counts, everyone holds
    Array(16).fill(QUARTER_90), // page 3: 16 counts at a new tempo, page shapes
    [0.5, 0.55, 0.6, 0.65, 0.7, 0.75], // page 4: ritardando (uneven), coincident marchers
    Array(3).fill(0.4), // page 5: 3 counts at 150 bpm
    [0.45], // page 6: 1 count
    [...Array(6).fill(QUARTER_120), ...Array(6).fill(0.375)], // page 7: tempo change inside (uneven), pathway
    Array(8).fill(QUARTER_120), // page 8: midset; marchers added and deleted
    Array(8).fill(QUARTER_120), // page 9 (last): `last_page_counts` beats
];

export interface ConversionShow {
    /** Page ids in show order, page 0 first */
    readonly pageIds: number[];
    /** Marcher ids at the end, ascending */
    readonly marcherIds: number[];
    readonly deletedMarcherId: number;
    readonly addedMarcherIds: number[];
    /** The marcher whose page-7 row moves along a curved pathway */
    readonly pathwayMarcherId: number;
    /** The marcher with no row on page 5 (damaged file) */
    readonly gapMarcherId: number;
    /** The marcher with no rows on pages 4 and 5, after its page-3 curved-shape row */
    readonly doubleGapMarcherId: number;
    /** The marcher with no row on page 6, whose page-7 row moves along a pathway */
    readonly pathwayGapMarcherId: number;
    /** The marcher with no row on the last page: no later row, so it holds */
    readonly endGapMarcherId: number;
    /** The marcher with no page-0 row (damaged file) */
    readonly lateHomeMarcherId: number;
    /** Two marchers on the same point at the end of page 4 */
    readonly coincident: [number, number];
    /** Show orders of the pages with uneven tempo */
    readonly unevenPageOrders: number[];
}

/** A deterministic, non-integer layout: marcher `i` (0-based) on page `p`. */
function layout(p: number, i: number): [number, number] {
    switch (p) {
        case 0: // a line
            return [120 + 40 * i, 420];
        case 1: // a 3 x 5 block
            return [300 + 48 * (i % 5), 260 + 48 * Math.floor(i / 5)];
        case 4: // a slanted line
            return [200 + 37.5 * i, 300 + 12.25 * i];
        case 5:
            return [260 + 41.3 * i, 520 - 7.7 * i];
        case 6:
            return [262.5 + 41.3 * i, 516 - 7.7 * i];
        case 7: // a ring
            return [
                640 + 180 * Math.cos((2 * Math.PI * i) / 15),
                420 + 180 * Math.sin((2 * Math.PI * i) / 15),
            ];
        case 8:
            return [500 + 30 * i, 200 + (i % 3) * 33.3];
        default:
            return [400 + 25 * i, 600 - 10 * i];
    }
}

const coordinate = (x: number, y: number) => ({ x, y });

// eslint-disable-next-line max-lines-per-function
export async function buildConversionShow(
    db: DbConnection,
): Promise<ConversionShow> {
    // Beats, measures and pages
    const beats = await createBeats({
        db,
        newBeats: PAGE_BEATS.flat().map((duration) => ({
            duration,
            include_in_measure: true,
        })),
    });
    const sortedBeats = [...beats].sort((a, b) => a.position - b.position);
    const pageStarts: number[] = [];
    let index = 0;
    for (const page of PAGE_BEATS) {
        pageStarts.push(sortedBeats[index]!.id);
        index += page.length;
    }
    await createMeasures({
        db,
        newItems: sortedBeats
            .filter((_, i) => i % 4 === 0)
            .map((b) => ({ start_beat: b.id })),
    });

    // First marchers, then the pages (each copies the previous page's positions)
    const first = await createMarchers({
        db,
        newMarchers: Array.from({ length: 12 }, (_, i) => ({
            section: "Other",
            drill_prefix: "C",
            drill_order: i + 1,
        })),
    });
    await createPages({
        db,
        newPages: pageStarts.map((start_beat) => ({
            start_beat,
            is_subset: false,
        })),
    });
    const pageIds = (
        await db
            .select({ id: schema.pages.id, position: schema.beats.position })
            .from(schema.pages)
            .innerJoin(
                schema.beats,
                eq(schema.pages.start_beat, schema.beats.id),
            )
            .orderBy(asc(schema.beats.position))
            .all()
    ).map((p) => p.id);

    // Marchers added after the pages exist get a row on every page
    const added = await createMarchers({
        db,
        newMarchers: [13, 14, 15].map((drill_order) => ({
            section: "Other",
            drill_prefix: "C",
            drill_order,
        })),
    });
    const all = [...first, ...added].map((m) => m.id).sort((a, b) => a - b);

    const place = async (p: number, at: (i: number) => [number, number]) =>
        updateMarcherPages({
            db,
            modifiedMarcherPages: all.map((marcher_id, i) => {
                const [x, y] = at(i);
                return { marcher_id, page_id: pageIds[p]!, x, y };
            }),
        });
    for (const p of [0, 1, 4, 6, 7, 8, 9]) await place(p, (i) => layout(p, i));
    // Page 2: everyone holds (the page copies page 1, set explicitly anyway)
    await place(2, (i) => layout(1, i));
    // Page 5: one marcher holds where page 4 left it
    const holder = 2;
    await place(5, (i) => (i === holder ? layout(4, i) : layout(5, i)));
    // Page 4: two marchers on the same point
    const coincident: [number, number] = [all[0]!, all[1]!];
    const [cx, cy] = layout(4, 0);
    await updateMarcherPages({
        db,
        modifiedMarcherPages: [
            {
                marcher_id: all[1]!,
                page_id: pageIds[4]!,
                ...coordinate(cx, cy),
            },
        ],
    });

    // Page 3: a curved shape (quadratic arc) for 10 marchers and a straight one for the rest
    const arc = (t: number) => {
        // M 200 500 Q 600 150 1000 500, at parameter t
        const u = 1 - t;
        return [
            u * u * 200 + 2 * u * t * 600 + t * t * 1000,
            u * u * 500 + 2 * u * t * 150 + t * t * 500,
        ] as const;
    };
    await createShapePages({
        db,
        newItems: [
            {
                page_id: pageIds[3]!,
                svg_path: "M 200 500 Q 600 150 1000 500",
                marcher_coordinates: all.slice(0, 10).map((marcher_id, i) => {
                    const [x, y] = arc(i / 9);
                    return { marcher_id, ...coordinate(x, y) };
                }),
            },
            {
                page_id: pageIds[3]!,
                svg_path: "M 300 700 L 700 700",
                marcher_coordinates: all.slice(10).map((marcher_id, i) => ({
                    marcher_id,
                    ...coordinate(300 + 80 * i, 700),
                })),
            },
        ],
    });

    // Page 7: one marcher moves along a curved pathway from its page-6 spot
    const pathwayMarcherId = all[4]!;
    const [fx, fy] = layout(6, 4);
    const [tx, ty] = layout(7, 4);
    const [pathway] = await db
        .insert(schema.pathways)
        .values({
            path_data: Path.fromSvgString(
                `M ${fx} ${fy} Q ${(fx + tx) / 2 + 150} ${(fy + ty) / 2 - 220} ${tx} ${ty}`,
            ).toJson(),
        })
        .returning();
    await updateMarcherPages({
        db,
        modifiedMarcherPages: [
            {
                marcher_id: pathwayMarcherId,
                page_id: pageIds[7]!,
                x: tx,
                y: ty,
                path_data_id: pathway!.id,
            },
        ],
    });

    // Page 7: a second marcher on a pathway, from its page-5 spot, with no page-6 row (below)
    const pathwayGapMarcherId = all[9]!;
    const [gx, gy] = layout(5, 9);
    const [hx, hy] = layout(7, 9);
    const [gapPathway] = await db
        .insert(schema.pathways)
        .values({
            path_data: Path.fromSvgString(
                `M ${gx} ${gy} Q ${(gx + hx) / 2 - 120} ${(gy + hy) / 2 + 160} ${hx} ${hy}`,
            ).toJson(),
        })
        .returning();
    await updateMarcherPages({
        db,
        modifiedMarcherPages: [
            {
                marcher_id: pathwayGapMarcherId,
                page_id: pageIds[7]!,
                x: hx,
                y: hy,
                path_data_id: gapPathway!.id,
            },
        ],
    });
    // Non-default path positions: page mode starts the glide at the PREVIOUS row's
    // `path_start_position` and ends it at the pathway row's `path_end_position`, so the gap
    // page's interpolated point checks that mapping
    for (const [p, set] of [
        [5, { path_start_position: 0.2 }],
        [7, { path_end_position: 0.8 }],
    ] as const)
        await db
            .update(schema.marcher_pages)
            .set(set)
            .where(
                and(
                    eq(schema.marcher_pages.page_id, pageIds[p]!),
                    eq(schema.marcher_pages.marcher_id, pathwayGapMarcherId),
                ),
            );

    // Page 8: a midset (dropped; page mode ignores midsets too)
    const midsetRow = await db
        .select({ id: schema.marcher_pages.id })
        .from(schema.marcher_pages)
        .where(
            and(
                eq(schema.marcher_pages.page_id, pageIds[8]!),
                eq(schema.marcher_pages.marcher_id, all[5]!),
            ),
        )
        .get();
    await db.insert(schema.midsets).values({
        mp_id: midsetRow!.id,
        x: 510,
        y: 230,
        progress_placement: 0.5,
    });

    // A marcher deleted mid-show: all of its rows go
    const deletedMarcherId = all[3]!;
    await deleteMarchers({ db, marcherIds: new Set([deletedMarcherId]) });

    // Damaged-file cases, written directly: page mode never creates them
    const gapMarcherId = all[6]!;
    await db
        .delete(schema.marcher_pages)
        .where(
            and(
                eq(schema.marcher_pages.page_id, pageIds[5]!),
                eq(schema.marcher_pages.marcher_id, gapMarcherId),
            ),
        );
    const lateHomeMarcherId = all[7]!;
    const doubleGapMarcherId = all[8]!;
    const endGapMarcherId = all[10]!;
    for (const [marcherId, p] of [
        [lateHomeMarcherId, 0],
        [doubleGapMarcherId, 4],
        [doubleGapMarcherId, 5],
        [pathwayGapMarcherId, 6],
        [endGapMarcherId, 9],
    ] as const)
        await db
            .delete(schema.marcher_pages)
            .where(
                and(
                    eq(schema.marcher_pages.page_id, pageIds[p]!),
                    eq(schema.marcher_pages.marcher_id, marcherId),
                ),
            );

    const marcherIds = (
        await db
            .select({ id: schema.marchers.id })
            .from(schema.marchers)
            .orderBy(asc(schema.marchers.id))
            .all()
    ).map((m) => m.id);
    return {
        pageIds,
        marcherIds,
        deletedMarcherId,
        addedMarcherIds: added.map((m) => m.id),
        pathwayMarcherId,
        gapMarcherId,
        doubleGapMarcherId,
        pathwayGapMarcherId,
        endGapMarcherId,
        lateHomeMarcherId,
        coincident,
        unevenPageOrders: [4, 7],
    };
}
