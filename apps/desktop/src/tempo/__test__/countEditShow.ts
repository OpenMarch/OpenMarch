/**
 * A rich show for the count edit safety tests (`countEditSafety.test.ts`, `countEditFuzz.test.ts`),
 * and the snapshots and invariants they check.
 *
 * The show starts from the `marchersAndPages` fixture converted to timelines: beat 0, then 96
 * counts of 0.5 s, pages 1 to 6 starting at counts 1, 9, 17, 25, 33 and 41 (8 counts each, the
 * last page 8 counts by `last_page_counts`), one move per page for all 76 marchers. On top of that
 * `buildRichShow` writes, through the app's own writers where there is one:
 *
 * - pages: page 3 is a subset, pages 2 and 5 have notes;
 * - counts: a hold (fermata) on count 20 of 2 s, tempo points on 9 and 29, faster counts (0.4 s)
 *   from 29 to 48, notes on counts 6 and 44;
 * - measures (see `MEASURES`): 4/4 written on m. 1, rehearsal mark A on m. 5, 7/8 counted 2+2+3 on
 *   m. 6 and carried on by m. 7, 4/4 written again on m. 8 with number 101, mark B and notes, a
 *   negative number on m. 10, mark C on m. 12, then 4-count measures to the end;
 * - moves: a keyframe move of marchers 1–3 over counts 11–14 inside page 2, a placed shape (arc
 *   recipe) of marchers 4–8 animating over counts 27–31 inside page 4, and marcher 76 Held (a held
 *   mark) over page 5;
 * - props: a riser made on count 2 with Outline changes on 13 and 17, and a flag;
 * - page-keyed data: a tag appearance on page 3, a section appearance, 3D cameras, and
 *   the music offset in `tempo_settings`.
 */
import { expect } from "vitest";
import { asc, getTableName, sql } from "drizzle-orm";
import type { Table } from "drizzle-orm";
import { schema, type DbConnection } from "@/test/base";
import { acquireExportResolver } from "@/timeline/timelineExport";
import { moveMarchersInTarget } from "@/db-functions/timelineMoves";
import { saveShapeRecipeInTransaction } from "@/db-functions/shapeRecipes";
import { unsetMarchersAt } from "@/db-functions/timelineUnset";
import { holdFromPreviousPage } from "@/db-functions/timelineHoldFromPrevious";
import { createItems, setItemGeometry } from "@/db-functions/items";

/** Measures written by `buildRichShow`: start count and facts */
export const MEASURES: readonly {
    start: number;
    meter?: string;
    grouping?: string;
    number_override?: number;
    rehearsal_mark?: string;
    notes?: string;
}[] = [
    { start: 1, meter: "4/4" },
    { start: 5 },
    { start: 9 },
    { start: 13 },
    { start: 17, rehearsal_mark: "A" },
    { start: 21, meter: "7/8", grouping: "2+2+3" },
    { start: 24 },
    {
        start: 27,
        meter: "4/4",
        number_override: 101,
        rehearsal_mark: "B",
        notes: "brass in",
    },
    { start: 31 },
    { start: 35, number_override: -3 },
    { start: 39 },
    { start: 43, rehearsal_mark: "C" },
    ...Array.from({ length: 13 }, (_, i) => ({ start: 47 + 4 * i })),
];

export const HOLD_COUNT = 20;
export const TEMPO_POINTS = [9, 29] as const;
export const KEYFRAME = { start: 11, end: 14, marchers: [1, 2, 3] } as const;
export const SHAPE = { start: 27, end: 31, marchers: [4, 5, 6, 7, 8] } as const;
export const HELD = { start: 33, end: 41, marcher: 76 } as const;
export const RISER = { made: 2, outlines: [13, 17] } as const;

/** Beat ids in order (beat 0 first) */
export const beatIds = async (db: DbConnection): Promise<number[]> =>
    (
        await db
            .select({ id: schema.beats.id })
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .all()
    ).map((b) => b.id);

/** The rich show described in the module comment, on top of a converted `marchersAndPages` */
export async function buildRichShow(db: DbConnection): Promise<void> {
    const ids = await beatIds(db);
    const id = (b: number) => ids[b]!;

    // ---- pages
    await db
        .update(schema.pages)
        .set({ is_subset: 1 })
        .where(sql`id = 3`)
        .run();
    await db
        .update(schema.pages)
        .set({ notes: "opener" })
        .where(sql`id = 2`)
        .run();
    await db
        .update(schema.pages)
        .set({ notes: "ballad" })
        .where(sql`id = 5`)
        .run();

    // ---- counts: a hold, tempo points, faster counts after 29, notes
    await db
        .update(schema.beats)
        .set({ tempo_hold: 1, duration: 2 })
        .where(sql`id = ${id(HOLD_COUNT)}`)
        .run();
    for (const b of TEMPO_POINTS)
        await db
            .update(schema.beats)
            .set({ tempo_change: 1 })
            .where(sql`id = ${id(b)}`)
            .run();
    for (let b = 29; b <= 48; b++)
        await db
            .update(schema.beats)
            .set({ duration: 0.4 })
            .where(sql`id = ${id(b)}`)
            .run();
    await db
        .update(schema.beats)
        .set({ notes: "breath" })
        .where(sql`id = ${id(6)}`)
        .run();
    await db
        .update(schema.beats)
        .set({ notes: "hit" })
        .where(sql`id = ${id(44)}`)
        .run();

    // ---- measures
    await db.delete(schema.measures).run();
    await db
        .insert(schema.measures)
        .values(
            MEASURES.filter((m) => m.start < ids.length).map(
                ({ start, ...facts }) => ({ start_beat: id(start), ...facts }),
            ),
        )
        .run();

    // ---- moves: a keyframe move inside page 2
    await moveMarchersInTarget({
        db,
        target: { kind: "range", start: KEYFRAME.start, end: KEYFRAME.end },
        moves: KEYFRAME.marchers.map((marcherId, i) => ({
            marcherId,
            x: 300 + 16 * i,
            y: 120,
        })),
    });
    // a placed shape animating over counts 27–31
    await moveMarchersInTarget({
        db,
        target: { kind: "range", start: SHAPE.start, end: SHAPE.end },
        moves: SHAPE.marchers.map((marcherId, i) => ({
            marcherId,
            x: 100 + 20 * i,
            y: 50 + 4 * i * i,
        })),
        afterWrite: async (tx, timelineId) => {
            await saveShapeRecipeInTransaction({
                tx,
                timelineId,
                recipe: {
                    kind: "arc",
                    kindVersion: 1,
                    params: { bulge: 4 },
                    orderMode: "keep",
                    reverse: false,
                },
                members: SHAPE.marchers.map((marcherId, i) => ({
                    marcherId,
                    slot: i,
                    x: 100 + 20 * i,
                    y: 50 + 4 * i * i,
                })),
            });
        },
    });
    // marcher 76 Held over page 5
    await unsetMarchersAt({
        db,
        beat: HELD.end,
        marcherIds: [HELD.marcher],
        keepLaterPages: true,
    });
    await holdFromPreviousPage({
        db,
        pageBox: { start: HELD.start, end: HELD.end },
        marcherIds: [HELD.marcher],
    });

    // ---- props
    const [riser] = await createItems({
        db,
        newItems: [
            {
                kind: "prop",
                name: "Riser",
                surfaceType: "platform",
                home: [120, 80],
                beatId: id(RISER.made),
                geometry: {
                    outlineType: "rectangle",
                    width: 2.4,
                    depth: 1.2,
                    height: 0.4,
                },
            },
            {
                kind: "prop",
                name: "Flag",
                home: [60, 40],
                beatId: id(RISER.made),
                geometry: { outlineType: "rectangle", width: 1, depth: 0.2 },
            },
        ],
    });
    for (const [i, b] of RISER.outlines.entries())
        await setItemGeometry({
            db,
            itemId: riser!.id,
            beatId: id(b),
            geometry: { outlineType: "rectangle", width: 3 + i, depth: 1.2 },
        });

    // ---- page-keyed and show-wide data
    await db.insert(schema.tags).values({ id: 1, name: "Front" }).run();
    await db
        .insert(schema.tag_appearances)
        .values({ tag_id: 1, start_page_id: 3, fill_color: "#ff0000" })
        .run();
    await db
        .insert(schema.section_appearances)
        .values({ section: "Trumpet", fill_color: "#00ff00" })
        .run();
    await db
        .insert(schema.view3d_cameras)
        .values({ id: 1, json_data: JSON.stringify({ cameras: [] }) })
        .run();
    await db
        .insert(schema.tempo_settings)
        .values({ id: 0, audio_offset_seconds: 1.25 })
        .run();
}

// ---------------------------------------------------------------------------------------------
// Snapshots

/** Tables a count edit may touch, or must not; history and logs left out */
const IGNORED_TABLES = new Set([
    "__drizzle_migrations",
    "history_undo",
    "history_redo",
    "history_stats",
    "timeline_change_log",
]);

/** Every row of every table, by table name, ordered by rowid: a full dump for undo checks */
export async function dumpAll(
    db: DbConnection,
): Promise<Record<string, unknown[]>> {
    const names = (
        (await db.all(
            sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        )) as unknown[]
    ).map(
        (r) =>
            (Array.isArray(r) ? r[0] : (r as { name: string }).name) as string,
    );
    const out: Record<string, unknown[]> = {};
    for (const name of names) {
        if (IGNORED_TABLES.has(name)) continue;
        out[name] = (await db.all(
            sql.raw(`SELECT * FROM "${name}" ORDER BY rowid`),
        )) as unknown[];
    }
    return out;
}

const TABLES_BY_NAME: Record<string, Table> = Object.fromEntries(
    Object.values(schema)
        .filter(
            (t): t is Table =>
                typeof t === "object" &&
                t !== null &&
                Symbol.for("drizzle:IsDrizzleTable") in t,
        )
        .map((t) => [getTableName(t), t]),
);

type Row = Record<string, unknown>;

/** Rows of a table as objects (drizzle), in id order */
export async function rows(db: DbConnection, name: string): Promise<Row[]> {
    const table = TABLES_BY_NAME[name];
    if (!table) throw new Error(`no table ${name}`);
    return (await db.select().from(table).all()) as Row[];
}

/** What a user sees of the show, keyed by stable ids, with beat ids turned into count numbers */
export interface ShowState {
    /** Beat id → count number (ordinal) */
    ordinal: Map<number, number>;
    /** Beat id → seconds from beat 0 at the start of that count */
    seconds: Map<number, number>;
    beats: Row[];
    measures: Row[];
    pages: Row[];
    lastPageCounts: number;
    timelines: Row[];
    transitions: Row[];
    assignments: Row[];
    held: Row[];
    geometry: Row[];
    /** Tables no count edit should change at all */
    untouched: Record<string, unknown[]>;
    /** Every marcher and prop the resolver places */
    marcherIds: number[];
    /** The marcher ids that are props (`items.marcher_id`) */
    propIds: Set<number>;
}

export const UNTOUCHED_TABLES = [
    "marchers",
    "timeline_shapes",
    "timeline_slot_destinations",
    "timeline_shape_recipes",
    "timeline_shape_recipe_marchers",
    "items",
    "tags",
    "tag_appearances",
    "section_appearances",
    "view3d_cameras",
    "tempo_settings",
    "workspace_settings",
    "field_properties",
    "audio_files",
    "marcher_tags",
] as const;

const strip = (r: Row): Row => {
    const { created_at: _c, updated_at: _u, ...rest } = r;
    return rest;
};

export async function readState(db: DbConnection): Promise<ShowState> {
    const beats = (
        await db
            .select()
            .from(schema.beats)
            .orderBy(asc(schema.beats.position))
            .all()
    ).map((b) => strip(b as Row));
    const ordinal = new Map<number, number>();
    const seconds = new Map<number, number>();
    let t = 0;
    beats.forEach((b, i) => {
        ordinal.set(b.id as number, i);
        // a count starts when the counts before it (beat 0's duration included) are over
        if (i > 0) t += beats[i - 1]!.duration as number;
        seconds.set(b.id as number, t);
    });
    const untouched: Record<string, unknown[]> = {};
    for (const name of UNTOUCHED_TABLES)
        untouched[name] = (await rows(db, name)).map(strip);
    const utility = (await rows(db, "utility"))[0];
    return {
        ordinal,
        seconds,
        beats,
        measures: (await rows(db, "measures")).map(strip),
        pages: (await rows(db, "pages")).map(strip),
        lastPageCounts: (utility?.last_page_counts as number) ?? 8,
        timelines: await rows(db, "timelines"),
        transitions: await rows(db, "timeline_transitions"),
        assignments: await rows(db, "timeline_assignments"),
        held: await rows(db, "timeline_held_marks"),
        geometry: (await rows(db, "item_geometry")).map(strip),
        untouched,
        marcherIds: ((await rows(db, "marchers")) as Row[]).map(
            (m) => m.id as number,
        ),
        propIds: new Set(
            ((await rows(db, "items")) as Row[]).map(
                (i) => i.marcher_id as number,
            ),
        ),
    };
}

type XY = readonly [number, number];

/** Each marcher's resolved position at each count in `counts`, from the app's own resolver */
export async function positionsAt(
    db: DbConnection,
    counts: Iterable<number>,
): Promise<Map<number, Map<number, XY>>> {
    const resolver = await acquireExportResolver(db);
    const out = new Map<number, Map<number, XY>>();
    for (const b of counts) {
        const at = new Map<number, XY>();
        for (const m of resolver.marcherIds()) {
            const p = resolver.positionAt(m, b);
            at.set(m, [p[0], p[1]]);
        }
        out.set(b, at);
    }
    return out;
}

/** Where a position is set: home, a move's end (its set), a hold's edge, a page start */
export type AnchorKind = "home" | "end" | "held" | "page";

/**
 * The counts where each marcher's position is set: home (0), the end of each of its moves (where
 * it arrives), the edges of its held marks, and every page start it isn't moving through. A
 * move's start is left out: a move on a higher layer (a keyframe, a shape) starts from wherever
 * the move under it has got to, which a stretched move under it changes on purpose.
 */
export function anchors(
    state: ShowState,
): Map<number, { count: number; kind: AnchorKind }[]> {
    const pageStarts = state.pages.map(
        (p) => state.ordinal.get(p.start_beat as number)!,
    );
    const out = new Map<number, { count: number; kind: AnchorKind }[]>();
    for (const m of state.marcherIds) out.set(m, [{ count: 0, kind: "home" }]);
    for (const a of state.assignments)
        out.get(a.marcher_id as number)?.push({
            count: a.end_beat as number,
            kind: "end",
        });
    for (const h of state.held) {
        out.get(h.marcher_id as number)?.push({
            count: h.start_beat as number,
            kind: "held",
        });
        out.get(h.marcher_id as number)?.push({
            count: h.end_beat as number,
            kind: "held",
        });
    }
    for (const m of state.marcherIds) {
        const own = state.assignments.filter((a) => a.marcher_id === m);
        for (const p of pageStarts)
            if (
                p > 0 &&
                !own.some(
                    (a) =>
                        (a.start_beat as number) < p &&
                        p < (a.end_beat as number),
                )
            )
                out.get(m)!.push({ count: p, kind: "page" });
    }
    return out;
}

export const allCounts = (a: ReturnType<typeof anchors>) => {
    const s = new Set<number>();
    for (const list of a.values()) for (const { count } of list) s.add(count);
    return s;
};

export const close = (a: number, b: number, eps = 1e-6) =>
    Math.abs(a - b) <= eps;

/** Fails with a readable list of differences, at most `max` */
export function expectNoProblems(problems: string[], max = 25) {
    expect(
        problems.slice(0, max),
        `${problems.length} problem(s)${problems.length > max ? ` (first ${max})` : ""}`,
    ).toEqual([]);
}
