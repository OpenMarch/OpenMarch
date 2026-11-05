// cspell:ignore IHDR IDAT IEND
/**
 * Writes the OpenMarch v0.1.7 show files in this folder, with v0.1.7's own code. This file does
 * NOT run in this repository: `generate.sh` copies it into a v0.1.7 checkout
 * (`git worktree add <dir> v0.1.7`) as `apps/desktop/src/__test__/generateV017Files.test.ts` and
 * runs it with that checkout's vitest, so every import below resolves to v0.1.7's modules.
 *
 * Each file is made the way the v0.1.7 app makes and edits one:
 * - created as v0.1.7's main process creates a new file (`user_version = 7`, its migrations
 *   0000 to 0016, `DrizzleMigrationService.initializeDatabase`);
 * - the undo triggers created as v0.1.7's renderer creates them on open;
 * - every edit through v0.1.7's renderer database functions (tempo groups, pages, marchers,
 *   positions, shapes, tags, section appearances, workspace settings, undo), whose SQL goes
 *   through v0.1.7's main-process SQL proxy (`handleSqlProxy`) to the file, as in the app;
 * - the audio file through v0.1.7's main-process `insertAudioFile`;
 * - the field (`field-image` only) as v0.1.7's Field settings set it: a template applied from the
 *   field picker, then Image > Import Image and the image settings, through v0.1.7's
 *   `updateFieldProperties` and `updateFieldPropertiesImage`.
 *
 * Next to each `<name>.dots` it writes `<name>.v017.json`: what v0.1.7 shows for that file,
 * computed with v0.1.7's own playback code (`fromDatabasePages` for the page names, counts and
 * timing, and `getCoordinatesAtTime` over the page keyframes for positions, as `useAnimation`
 * plays them).
 *
 * Deterministic: no randomness (positions come from fixed formulas). Only the created and updated
 * timestamps v0.1.7 writes differ from run to run.
 */
import { afterAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { createHash } from "crypto";
import { DatabaseSync } from "node:sqlite";
import * as DatabaseServices from "../../electron/database/database.services";
import { getOrm } from "../../electron/database/db";
import { DrizzleMigrationService } from "../../electron/database/services/DrizzleMigrationService";
import { db } from "@/global/database/db";
import {
    createAllUndoTriggers,
    createMarchers,
    createMarcherTags,
    createPages,
    createSectionAppearances,
    createShapePages,
    createTags,
    createTagAppearances,
    getBeats,
    getMeasures,
    getPages,
    getUtility,
    performUndo,
    swapMarchers,
    updateMarcherPages,
    updateUtility,
} from "@/db-functions";
import {
    getWorkspaceSettingsParsed,
    updateWorkspaceSettingsParsed,
} from "@/db-functions/workspaceSettings";
import {
    _createFromTempoGroup,
    type TempoGroup,
} from "@/components/music/TempoGroup/TempoGroup";
import { calculateTimestamps, fromDatabaseBeat } from "@/global/classes/Beat";
import { fromDatabaseMeasures } from "@/global/classes/Measure";
import { fromDatabasePages } from "@/global/classes/Page";
import {
    getCoordinatesAtTime,
    type CoordinateDefinition,
    type MarcherTimeline,
} from "@/utilities/Keyframes";
import { FieldProperties, Path } from "@openmarch/core";
import {
    getFieldProperties,
    getFieldPropertiesImage,
    getFieldPropertiesJSON,
    updateFieldProperties,
    updateFieldPropertiesImage,
} from "@/global/classes/FieldProperties";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

/** Where the files go: the folder this script was copied from. */
const OUT_DIR = process.env.V017_OUT_DIR!;
/** Comma-separated names of the files to write; every file when unset. */
const ONLY = process.env.V017_ONLY?.split(",").filter(Boolean);

type XY = { x: number; y: number };

/** A tempo group as the v0.1.7 "New tempo group" form makes one. */
interface MusicPart {
    group: TempoGroup;
    endTempo?: number;
}

interface MarcherSpec {
    section: string;
    prefix: string;
    count: number;
}

interface ShowSpec {
    name: string;
    projectName: string;
    music: MusicPart[];
    /** Counts of each page after page 0, in order; the last one is `last_page_counts` */
    pageCounts: number[];
    /** Indexes into `pageCounts` of the pages that are subsets */
    subsets: number[];
    notes: Record<number, string>;
    marchers: MarcherSpec[];
    /** Where marcher `i` of `n` stands on page `p` (1-based) */
    formation: (p: number, i: number, n: number, sectionOf: string) => XY;
    /** Pages (1-based) on which some marchers don't move: marcher indexes that hold */
    holds: Record<number, (i: number) => boolean>;
    shapes: boolean;
    tags: boolean;
    /** Marchers to sample at every count with v0.1.7's playback (all when undefined) */
    sampleEvery?: number;
    audioSeconds: number;
    /** A non-default field with an imported image (Field settings), or the new file's default */
    field?: FieldSpec;
}

/** What the person sets in v0.1.7's Field settings, in order. */
interface FieldSpec {
    /** The template picked in the field picker */
    template: keyof typeof FieldPropertiesTemplates;
    /** The file picked with Image > Import Image */
    image: Uint8Array;
    /** Image > Conform method */
    imageFillOrFit: "fill" | "fit";
    /** Image > Opacity, committed when the slider is let go */
    backgroundImageOpacity: number;
}

/** A tiny mono 16-bit PCM WAV: a quiet 440 Hz tone, the same bytes every run. */
function wav(seconds: number, sampleRate = 8000): Uint8Array {
    const n = Math.round(seconds * sampleRate);
    const buf = Buffer.alloc(44 + n * 2);
    buf.write("RIFF", 0);
    buf.writeUInt32LE(36 + n * 2, 4);
    buf.write("WAVE", 8);
    buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++)
        buf.writeInt16LE(
            Math.round(2000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)),
            44 + i * 2,
        );
    return new Uint8Array(buf);
}

/** CRC-32 (ISO 3309), as PNG chunks use it. */
function crc32(bytes: Uint8Array): number {
    let c = ~0;
    for (const byte of bytes) {
        c ^= byte;
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
}

/**
 * A small RGB PNG, the same bytes every run: a left-to-right red ramp over a top-to-bottom blue
 * ramp, with a green 1-pixel border so its edges show where it's drawn.
 */
function png(width: number, height: number): Uint8Array {
    const rows = Buffer.alloc(height * (1 + width * 3));
    for (let y = 0; y < height; y++) {
        const row = y * (1 + width * 3);
        rows[row] = 0; // filter: none
        for (let x = 0; x < width; x++) {
            const edge =
                x === 0 || y === 0 || x === width - 1 || y === height - 1;
            const at = row + 1 + x * 3;
            rows[at] = edge ? 0 : Math.round((255 * x) / (width - 1));
            rows[at + 1] = edge ? 200 : 64;
            rows[at + 2] = edge ? 0 : Math.round((255 * y) / (height - 1));
        }
    }
    const chunk = (type: string, data: Buffer) => {
        const out = Buffer.alloc(12 + data.length);
        out.writeUInt32BE(data.length, 0);
        out.write(type, 4, "latin1");
        data.copy(out, 8);
        out.writeUInt32BE(
            crc32(out.subarray(4, 8 + data.length)),
            8 + data.length,
        );
        return out;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 2; // RGB
    return new Uint8Array(
        Buffer.concat([
            Buffer.from("89504e470d0a1a0a", "hex"),
            chunk("IHDR", header),
            chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
            chunk("IEND", Buffer.alloc(0)),
        ]),
    );
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Opens `filePath` as v0.1.7's main process opens a new file. */
async function createNewFileLikeV017(filePath: string) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    expect(DatabaseServices.setDbPath(filePath, true)).toBe(200);
    const raw: DatabaseSync = DatabaseServices.connect();
    const orm = getOrm(raw);
    const migrator = new DrizzleMigrationService(orm, raw);
    raw.prepare("PRAGMA user_version = 7").run();
    await migrator.applyPendingMigrations(
        path.resolve(__dirname, "../../electron/database/migrations"),
    );
    await DrizzleMigrationService.initializeDatabase(orm, raw);
    // The renderer's SQL goes through the main process's IPC handler, as in the app.
    (window as unknown as { electron: unknown }).electron = {
        sqlProxy: (
            sql: string,
            params: unknown[],
            method: "all" | "run" | "get" | "values",
        ) => DatabaseServices.handleSqlProxy(null, sql, params, method),
        log: () => {},
    };
    // App.tsx creates the undo triggers when a file opens.
    await createAllUndoTriggers(db);
}

/**
 * Field settings as v0.1.7's UI writes them: the field picker applies a template
 * (`FieldPropertiesSelector` → `updateFieldPropertiesMutationOptions` → `updateFieldProperties`),
 * then Image > Import Image stores the file's bytes and turns the image on at full opacity
 * (`ImageTab`), then the conform method and the opacity slider each save the properties with one
 * value changed (`ImageTab`).
 */
async function setUpField(field: FieldSpec) {
    await updateFieldProperties(FieldPropertiesTemplates[field.template]);
    // Image > Import Image
    await updateFieldPropertiesImage(field.image);
    await updateFieldProperties(
        new FieldProperties({
            ...(await getFieldProperties()),
            showFieldImage: true,
            backgroundImageOpacity: 1.0,
        }),
    );
    // Image > Conform method
    await updateFieldProperties(
        new FieldProperties({
            ...(await getFieldProperties()),
            imageFillOrFit: field.imageFillOrFit,
        }),
    );
    // Image > Opacity
    await updateFieldProperties(
        new FieldProperties({
            ...(await getFieldProperties()),
            backgroundImageOpacity: field.backgroundImageOpacity,
        }),
    );
}

// eslint-disable-next-line max-lines-per-function
async function buildShow(spec: ShowSpec) {
    const filePath = path.join(OUT_DIR, `${spec.name}.dots`);
    await createNewFileLikeV017(filePath);

    // The new-show wizard's project settings
    const settings = await getWorkspaceSettingsParsed({ db });
    await updateWorkspaceSettingsParsed({
        db,
        settings: { ...settings, projectName: spec.projectName },
    });

    if (spec.field) await setUpField(spec.field);

    // Music: tempo groups, appended one after another (Music > New tempo group)
    for (const part of spec.music)
        await _createFromTempoGroup({
            tempoGroup: part.group,
            endTempo: part.endTempo,
        });

    // Pages: each starting `counts` beats after the one before (Timeline > add page)
    const beats = await getBeats({ db });
    const totalCounts = spec.pageCounts.slice(0, -1).reduce((a, b) => a + b, 0);
    // Every page, the last one included, is filled with beats
    expect(beats.length).toBeGreaterThanOrEqual(
        totalCounts + spec.pageCounts.at(-1)! + 1,
    );
    let position = 1;
    for (const [i, counts] of spec.pageCounts.entries()) {
        await createPages({
            db,
            newPages: [
                {
                    start_beat: beats[position].id,
                    is_subset: spec.subsets.includes(i),
                    notes: spec.notes[i + 1] ?? null,
                },
            ],
        });
        position += counts;
    }
    await updateUtility({
        db,
        args: { last_page_counts: spec.pageCounts.at(-1)! },
    });

    // Marchers, section by section (Marchers > add marchers)
    let order = 0;
    const sectionOf: string[] = [];
    for (const m of spec.marchers) {
        await createMarchers({
            db,
            newMarchers: Array.from({ length: m.count }, (_, k) => ({
                section: m.section,
                drill_prefix: m.prefix,
                drill_order: k + 1,
                name: k === 0 ? `${m.section} leader` : null,
                year: k % 4 === 0 ? "Senior" : null,
            })),
        });
        for (let k = 0; k < m.count; k++) sectionOf.push(m.section);
        order += m.count;
    }
    const marcherRows = await db.query.marchers.findMany({
        orderBy: (t, { asc }) => asc(t.id),
    });
    expect(marcherRows.length).toBe(order);

    // Positions: page 0 and every page, one undoable edit per page (moving marchers on the field)
    const pages = await getPages({ db });
    const beatPosition = new Map(beats.map((b) => [b.id, b.position]));
    const sortedPages = [...pages].sort(
        (a, b) =>
            beatPosition.get(a.start_beat)! - beatPosition.get(b.start_beat)!,
    );
    for (const [p, page] of sortedPages.entries()) {
        const hold = spec.holds[p];
        const modified = marcherRows
            .map((m, i) => ({ m, i }))
            .filter(({ i }) => !(hold && hold(i)))
            .map(({ m, i }) => {
                const xy = spec.formation(
                    p,
                    i,
                    marcherRows.length,
                    sectionOf[i],
                );
                return {
                    marcher_id: m.id,
                    page_id: page.id,
                    x: round(xy.x),
                    y: round(xy.y),
                };
            });
        if (p > 0 && hold) {
            // Held marchers stand where they were on the page before
            const before = await db.query.marcher_pages.findMany({
                where: (t, { eq }) => eq(t.page_id, sortedPages[p - 1].id),
            });
            for (const row of before)
                if (hold(marcherRows.findIndex((m) => m.id === row.marcher_id)))
                    modified.push({
                        marcher_id: row.marcher_id,
                        page_id: page.id,
                        x: row.x,
                        y: row.y,
                    });
        }
        await updateMarcherPages({ db, modifiedMarcherPages: modified });
    }

    if (spec.shapes) {
        // A straight-line shape on page 3 holding the first 12 marchers (the shape tools)
        const linePage = sortedPages[3];
        const lineMarchers = marcherRows.slice(0, 12);
        await createShapePages({
            db,
            newItems: [
                {
                    page_id: linePage.id,
                    svg_path: "M 300 300 L 1500 300",
                    marcher_coordinates: lineMarchers.map((m, i) => ({
                        marcher_id: m.id,
                        x: 300 + (1200 * i) / (lineMarchers.length - 1),
                        y: 300,
                    })),
                },
            ],
        });
        // A curved (quadratic) shape on page 6 holding the next 8 marchers
        const curvePage = sortedPages[6];
        const curveMarchers = marcherRows.slice(12, 20);
        await createShapePages({
            db,
            newItems: [
                {
                    page_id: curvePage.id,
                    svg_path: "M 400 650 Q 900 350 1400 650",
                    marcher_coordinates: curveMarchers.map((m, i) => {
                        const t = i / (curveMarchers.length - 1);
                        return {
                            marcher_id: m.id,
                            x: round(
                                (1 - t) ** 2 * 400 +
                                    2 * (1 - t) * t * 900 +
                                    t ** 2 * 1400,
                            ),
                            y: round(
                                (1 - t) ** 2 * 650 +
                                    2 * (1 - t) * t * 350 +
                                    t ** 2 * 650,
                            ),
                        };
                    }),
                },
            ],
        });
        // Swap two marchers on page 8 (the swap tool)
        await swapMarchers({
            db,
            pageId: sortedPages[8].id,
            marcher1Id: marcherRows[0].id,
            marcher2Id: marcherRows[marcherRows.length - 1].id,
        });
    }

    if (spec.tags) {
        const [tag] = await createTags({
            db,
            newTags: [{ name: "Soloists", color_hex: "#ff8800" }],
        });
        await createMarcherTags({
            db,
            newMarcherTags: marcherRows
                .slice(20, 24)
                .map((m) => ({ marcher_id: m.id, tag_id: tag.id })),
        });
        await createTagAppearances({
            db,
            newItems: [
                {
                    tag_id: tag.id,
                    start_page_id: sortedPages[4].id,
                    fill_color: { r: 255, g: 136, b: 0, a: 1 },
                    visible: true,
                    label_visible: true,
                },
            ],
        });
        await createSectionAppearances({
            db,
            newItems: [
                {
                    section: spec.marchers[0].section,
                    fill_color: { r: 0, g: 80, b: 200, a: 1 },
                    outline_color: { r: 0, g: 0, b: 0, a: 1 },
                    shape_type: "square",
                    visible: true,
                    label_visible: true,
                },
            ],
        });
    }

    // One last edit, then undo it: the file keeps undo and redo history
    await updateMarcherPages({
        db,
        modifiedMarcherPages: [
            {
                marcher_id: marcherRows[1].id,
                page_id: sortedPages[1].id,
                x: 1,
                y: 1,
            },
        ],
    });
    await performUndo(db);

    // Audio (File > Import audio): v0.1.7's main process writes it
    const audio = await DatabaseServices.insertAudioFile({
        data: wav(spec.audioSeconds),
        path: `/Users/director/Music/${spec.name}-show.wav`,
        nickname: `${spec.projectName} music`,
    });
    expect(audio.success).toBe(true);

    const expected = await whatV017Shows(spec);
    DatabaseServices.closePersistentConnection();
    DatabaseServices.setDbPath("", false);
    // Sanity: v0.1.7 left a version-7 file without the timeline tables
    const check = new DatabaseSync(filePath, { readOnly: true });
    expect(
        (check.prepare("PRAGMA user_version").get() as { user_version: number })
            .user_version,
    ).toBe(7);
    check.close();
    for (const suffix of ["-wal", "-shm", "-journal"])
        expect(fs.existsSync(filePath + suffix)).toBe(false);
    fs.writeFileSync(
        path.join(OUT_DIR, `${spec.name}.v017.json`),
        JSON.stringify(expected, null, 1) + "\n",
    );
}

/**
 * What v0.1.7 shows for the open file: its pages as `useTimingObjects` builds them, and each
 * sampled marcher's position at the start of every page and at every count, as `useAnimation`
 * plays it (`getCoordinatesAtTime` over every page's keyframe, at the page's end in milliseconds).
 */
// eslint-disable-next-line max-lines-per-function
async function whatV017Shows(spec: ShowSpec) {
    const workspace = await getWorkspaceSettingsParsed({ db });
    const utility = await getUtility({ db });
    const beats = calculateTimestamps(
        (await getBeats({ db }))
            .sort((a, b) => a.position - b.position)
            .map((b, i) => fromDatabaseBeat(b, i)),
    );
    const measures = fromDatabaseMeasures({
        databaseMeasures: await getMeasures({ db }),
        allBeats: beats,
        measurementNumberOffset: 1,
    });
    const pages = fromDatabasePages({
        databasePages: await getPages({ db }),
        allMeasures: measures,
        allBeats: beats,
        lastPageCounts: utility!.last_page_counts,
        pageNumberOffset: workspace.pageNumberOffset ?? 0,
    });
    const marchers = await db.query.marchers.findMany({
        orderBy: (t, { asc }) => asc(t.id),
    });
    const rows = await db.query.marcher_pages.findMany();
    const pathways = new Map(
        (await db.query.pathways.findMany()).map((p) => [
            p.id,
            Path.fromJson(p.path_data),
        ]),
    );

    // Each page's keyframe at its end, as coordinateDataQueryOptions builds it
    const timelines = new Map<number, MarcherTimeline>();
    for (const page of pages)
        for (const row of rows.filter((r) => r.page_id === page.id)) {
            const t = timelines.get(row.marcher_id) ?? {
                pathMap: new Map<number, CoordinateDefinition>(),
                sortedTimestamps: [],
            };
            t.pathMap.set((page.timestamp + page.duration) * 1000, {
                x: row.x,
                y: row.y,
                path: row.path_data_id
                    ? pathways.get(row.path_data_id)
                    : undefined,
                previousPathPosition: row.path_start_position || 0,
                nextPathPosition: row.path_end_position || 1,
            });
            timelines.set(row.marcher_id, t);
        }
    for (const t of timelines.values())
        t.sortedTimestamps = [...t.pathMap.keys()].sort((a, b) => a - b);

    /** v0.1.7 stops updating after the last keyframe: the marcher stays there. */
    const at = (marcherId: number, ms: number): [number, number] => {
        const t = timelines.get(marcherId)!;
        const c =
            getCoordinatesAtTime(ms, t) ??
            t.pathMap.get(t.sortedTimestamps.at(-1)!)!;
        return [c.x, c.y];
    };
    const every = spec.sampleEvery ?? 1;
    const sampled = marchers.filter((_, i) => i % every === 0).map((m) => m.id);

    const fieldImage = await getFieldPropertiesImage();
    const fieldJson = await getFieldPropertiesJSON();

    return {
        madeBy: "OpenMarch v0.1.7 (d10b69c06), generateV017Files.ts",
        projectName: workspace.projectName,
        /**
         * The field as v0.1.7 reads it: `field_properties.json_data` exactly as written, what
         * v0.1.7's `getFieldProperties` makes of it, and the image bytes'
         * size and SHA-256 (`getFieldPropertiesImage`), or null without one.
         */
        field: {
            jsonData: fieldJson,
            fieldProperties: JSON.parse(
                JSON.stringify(new FieldProperties(JSON.parse(fieldJson))),
            ) as unknown,
            image: fieldImage && {
                byteLength: fieldImage.byteLength,
                sha256: createHash("sha256").update(fieldImage).digest("hex"),
            },
        },
        lastPageCounts: utility!.last_page_counts,
        beats: beats.map((b) => ({
            id: b.id,
            position: b.position,
            duration: b.duration,
            timestamp: b.timestamp,
        })),
        measures: measures.map((m) => ({
            id: m.id,
            number: m.number,
            startBeat: m.startBeat.id,
            rehearsalMark: m.rehearsalMark,
            counts: m.counts,
        })),
        pages: pages.map((p) => ({
            id: p.id,
            name: p.name,
            order: p.order,
            counts: p.counts,
            isSubset: p.isSubset,
            notes: p.notes,
            timestamp: p.timestamp,
            duration: p.duration,
            beatIds: p.beats.map((b) => b.id),
        })),
        marchers: marchers.map((m) => ({
            id: m.id,
            name: m.name,
            section: m.section,
            drillPrefix: m.drill_prefix,
            drillOrder: m.drill_order,
            year: m.year,
        })),
        marcherPages: rows
            .map((r) => ({
                marcherId: r.marcher_id,
                pageId: r.page_id,
                x: r.x,
                y: r.y,
            }))
            .sort((a, b) => a.pageId - b.pageId || a.marcherId - b.marcherId),
        /**
         * For each page after page 0 and each count `c` from 0 (the page's start) to its counts
         * (its end), the time v0.1.7 plays count `c` at and each sampled marcher's position.
         */
        playback: {
            marcherIds: sampled,
            pages: pages
                .filter((p) => p.order > 0)
                .map((p) => ({
                    pageId: p.id,
                    counts: Array.from({ length: p.counts + 1 }, (_, c) => {
                        const ms =
                            (p.timestamp +
                                p.beats
                                    .slice(0, c)
                                    .reduce((s, b) => s + b.duration, 0)) *
                            1000;
                        return {
                            count: c,
                            ms,
                            positions: sampled.map((id) => at(id, ms)),
                        };
                    }),
                })),
        },
    };
}

const group = (
    name: string,
    tempo: number,
    bigBeatsPerMeasure: number,
    numOfRepeats: number,
    strongBeatIndexes?: number[],
): TempoGroup => ({
    name,
    tempo,
    bigBeatsPerMeasure,
    numOfRepeats,
    strongBeatIndexes,
});

/** A small show: two sections, five pages, one tempo change, a subset page. */
const SMALL: ShowSpec = {
    name: "small",
    projectName: "Small v0.1.7 show",
    music: [{ group: group("A", 120, 4, 6) }, { group: group("B", 144, 4, 6) }],
    pageCounts: [8, 8, 4, 12, 16],
    subsets: [2],
    notes: { 1: "Opener", 4: "Hit" },
    marchers: [
        { section: "Trumpet", prefix: "T", count: 4 },
        { section: "Snare", prefix: "S", count: 2 },
    ],
    formation: (p, i) => ({
        x: 500 + 48 * i + 24 * p + (p % 2) * 36,
        y: 400 + 32 * ((i + p) % 3) - 12 * p,
    }),
    holds: { 3: (i) => i >= 4 },
    shapes: false,
    tags: false,
    audioSeconds: 0.5,
};

/** Block, arc, company front, wedge and spiral sets for `n` marchers. */
function realisticFormation(p: number, i: number, n: number): XY {
    const cx = 900;
    const cy = 600;
    switch (p % 6) {
        case 0: {
            // Block, 8 across
            const col = i % 8;
            const row = Math.floor(i / 8);
            return { x: cx - 168 + col * 48 + p * 6, y: cy - 240 + row * 48 };
        }
        case 1: {
            // Arc
            const a = Math.PI * (0.15 + (0.7 * i) / (n - 1));
            const r = 420 + (i % 2) * 48 + p * 4;
            return { x: cx - r * Math.cos(a), y: cy + 180 - r * Math.sin(a) };
        }
        case 2: {
            // Company front, two ranks
            const rank = i % 2;
            const file = Math.floor(i / 2);
            return { x: cx - 38 * 18 + file * 36, y: cy - 60 + rank * 48 + p };
        }
        case 3: {
            // Wedge
            const side = i % 2 ? 1 : -1;
            const k = Math.floor(i / 2);
            return { x: cx + side * k * 22, y: cy - 300 + k * 18 + p * 2 };
        }
        case 4: {
            // Spiral
            const a = i * 0.42 + p * 0.1;
            const r = 60 + i * 6.5;
            return { x: cx + r * Math.cos(a), y: cy - 120 + r * Math.sin(a) };
        }
        default: {
            // Scatter on a fixed lattice
            const x = (i * 197 + p * 61) % 1300;
            const y = (i * 113 + p * 37) % 560;
            return { x: 250 + x, y: 200 + y };
        }
    }
}

/**
 * A realistic show: 76 marchers in 12 sections, 21 pages with varied counts (some ending mid
 * measure), subsets, shapes, a swap, tags and section appearances, and music with tempo changes, a
 * 3/4 section, a mixed-meter 7/8 section (uneven beats) and an accelerando.
 */
const REALISTIC: ShowSpec = {
    name: "realistic",
    projectName: "Realistic v0.1.7 show",
    music: [
        { group: group("Intro", 132, 4, 4) },
        { group: group("A", 152, 4, 12) },
        { group: group("B", 120, 3, 8) },
        { group: group("C", 180, 3, 4, [2]) }, // 7/8 as 2+2+3
        { group: group("D", 120, 4, 4), endTempo: 160 },
        { group: group("Closer", 168, 4, 28) },
    ],
    pageCounts: [
        16, 8, 8, 16, 12, 4, 16, 8, 6, 6, 12, 12, 9, 7, 8, 8, 16, 4, 12, 16, 16,
    ],
    subsets: [2, 9, 17],
    notes: { 1: "Opener", 6: "Ballad hit", 13: "Mixed meter", 21: "Final set" },
    marchers: [
        { section: "Flute", prefix: "F", count: 8 },
        { section: "Clarinet", prefix: "C", count: 8 },
        { section: "Alto Sax", prefix: "A", count: 6 },
        { section: "Tenor Sax", prefix: "N", count: 3 },
        { section: "Trumpet", prefix: "T", count: 12 },
        { section: "Mellophone", prefix: "M", count: 6 },
        { section: "Trombone", prefix: "B", count: 8 },
        { section: "Baritone", prefix: "E", count: 4 },
        { section: "Tuba", prefix: "U", count: 5 },
        { section: "Snare", prefix: "S", count: 4 },
        { section: "Bass Drum", prefix: "D", count: 5 },
        { section: "Color Guard", prefix: "G", count: 7 },
    ],
    formation: (p, i, n) => realisticFormation(p, i, n),
    holds: {
        5: (i) => i >= 63, // battery holds
        11: (i) => i < 16,
        18: (i) => i % 3 === 0,
    },
    shapes: true,
    tags: true,
    sampleEvery: 5,
    audioSeconds: 1,
};

/**
 * A small show on a non-default field with an imported image, as a director with an indoor floor
 * sets it up: the indoor 50 × 80 template, a floor image (wider than the field, so fit and fill
 * differ) conformed with "fill" at 40% opacity.
 */
const FIELD_IMAGE: ShowSpec = {
    ...SMALL,
    name: "field-image",
    projectName: "Field image v0.1.7 show",
    // Inside the 480 × 300 pixel floor
    formation: (p, i) => ({
        x: 80 + 36 * i + 14 * p + (p % 2) * 20,
        y: 90 + 28 * ((i + p) % 3) + 12 * p,
    }),
    field: {
        template: "INDOOR_50x80_6to5",
        image: png(24, 10),
        imageFillOrFit: "fill",
        backgroundImageOpacity: 0.4,
    },
};

describe("v0.1.7 show files", () => {
    afterAll(() => {
        DatabaseServices.closePersistentConnection();
        DatabaseServices.setDbPath("", false);
    });

    it.each(
        [SMALL, REALISTIC, FIELD_IMAGE].filter(
            (spec) => !ONLY || ONLY.includes(spec.name),
        ),
    )("writes $name", async (spec) => {
        await buildShow(spec);
    });
});
