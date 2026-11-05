// @vitest-environment node
/**
 * Show files made by the last public release, OpenMarch v0.1.7, open correctly in this build
 * (ADR 0008 §6, convert on open).
 *
 * The files in `v017-files/` were written by v0.1.7's own code (see `v017-files/README.md`), and
 * each `<name>.v017.json` records what v0.1.7 shows for its file, computed by v0.1.7's playback
 * code. Each file is opened through the main process's open path (`openShowFile`): first without
 * the person's answer (nothing is written), then with it, in this thread and in the app's convert
 * worker. Then:
 * - the file is a timeline file on this build's schema, with every migration applied and a
 *   backup next to it with exactly the v0.1.7 file's contents;
 * - every marcher is where v0.1.7 shows it at the start of every page and at every count;
 * - pages, beats, measures, marchers, audio, tags and settings are kept;
 * - the undo history is dropped (conversion isn't an undoable edit) and reopening converts nothing.
 */
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as DatabaseServices from "../database.services";
import { getOrm } from "../db";
import { NEEDS_CONVERSION_STATUS } from "../convertOnOpenGate";
import { DrizzleMigrationService } from "../services/DrizzleMigrationService";
import type { ConvertOnOpenDialogs } from "@om-electron/main/convertOnOpenFlow";
import { openShowFile } from "@om-electron/main/openShow";
import { createResolver } from "@openmarch/core";
import { readTimelineTables } from "@/timeline/timelineRows";
import { readShowTiming } from "@/timeline/showTiming";
import type { DbConnection } from "@/db-functions/types";
import {
    buildConvertWorker,
    type BuiltConvertWorker,
} from "./buildConvertWorker";
import {
    backupsIn,
    migrationsFolder,
    sha256,
    stateOf,
    withDb,
} from "./convertOnOpenFixtures";

const FIXTURES_DIR = path.resolve(__dirname, "v017-files");

/** What v0.1.7 shows for a file (`generateV017Files.ts`). */
interface V017View {
    projectName: string;
    lastPageCounts: number;
    beats: {
        id: number;
        position: number;
        duration: number;
        timestamp: number;
    }[];
    measures: { id: number; startBeat: number; rehearsalMark: string | null }[];
    pages: {
        id: number;
        name: string;
        order: number;
        counts: number;
        isSubset: boolean;
        notes: string | null;
        timestamp: number;
        duration: number;
        beatIds: number[];
    }[];
    marchers: {
        id: number;
        name: string | null;
        section: string;
        drillPrefix: string;
        drillOrder: number;
        year: string | null;
    }[];
    marcherPages: { marcherId: number; pageId: number; x: number; y: number }[];
    playback: {
        marcherIds: number[];
        pages: {
            pageId: number;
            counts: {
                count: number;
                ms: number;
                positions: [number, number][];
            }[];
        }[];
    };
}

const FIXTURES = ["small", "realistic"].map((name) => ({
    name,
    file: path.join(FIXTURES_DIR, `${name}.dots`),
    view: JSON.parse(
        fs.readFileSync(path.join(FIXTURES_DIR, `${name}.v017.json`), "utf-8"),
    ) as V017View,
}));

/** Canvas pixels. The converter copies positions, so they should agree to rounding. */
const TOLERANCE = 1e-6;

/** One page keyframe of a marcher: its page-end time in milliseconds and in beats. */
interface Keyframe {
    ms: number;
    beat: number;
    x: number;
    y: number;
}

/**
 * Where v0.1.7 shows a marcher: straight lines between its page keyframes, each at its page's
 * end (`getCoordinatesAtTime`); it stays on its last keyframe after it. The v0.1.7 files have no
 * pathways (v0.1.7 can't make one), so every move is a straight line. v0.1.7 plays on the `ms`
 * axis; the `beat` axis is the same keyframes at their page-end beats, which is what a timeline
 * move follows (C-7).
 */
function positionAt(
    keyframes: Keyframe[],
    axis: "ms" | "beat",
    t: number,
): [number, number] {
    const last = keyframes[keyframes.length - 1]!;
    if (t >= last[axis]) return [last.x, last.y];
    let i = 0;
    while (keyframes[i + 1]![axis] <= t) i++;
    const a = keyframes[i]!;
    const b = keyframes[i + 1]!;
    const u = (t - a[axis]) / (b[axis] - a[axis]);
    return [a.x + u * (b.x - a.x), a.y + u * (b.y - a.y)];
}

/** Each marcher's page keyframes, from the file's v0.1.7 `marcher_pages` rows. */
function v017Keyframes(view: V017View) {
    const beatIndex = new Map(view.beats.map((b, i) => [b.id, i]));
    const ends = new Map(
        view.pages.map((p) => [
            p.id,
            {
                ms: (p.timestamp + p.duration) * 1000,
                // Page 0 holds beat 0, whose length is 0: page 1's move starts at beat 1
                beat:
                    p.order === 0
                        ? 1
                        : beatIndex.get(p.beatIds[0]!)! + p.counts,
            },
        ]),
    );
    const byMarcher = new Map<number, Keyframe[]>();
    for (const row of view.marcherPages) {
        const list = byMarcher.get(row.marcherId) ?? [];
        list.push({ ...ends.get(row.pageId)!, x: row.x, y: row.y });
        byMarcher.set(row.marcherId, list);
    }
    for (const list of byMarcher.values()) list.sort((a, b) => a.ms - b.ms);
    return byMarcher;
}

/**
 * Pages whose beats don't all have the same length, by file and page name, and the largest
 * distance (canvas pixels) at a count between this build and v0.1.7 on them. v0.1.7 moves a
 * marcher evenly in milliseconds across a page; a timeline move goes evenly by count (C-7,
 * `docs/timeline/phases/06-converter.md` P6.6), so on these pages the counts inside the page
 * differ. Page starts and ends are the same. Recorded so a change shows up here.
 */
const UNEVEN_TEMPO_DIFFERENCES: Record<string, Record<string, number>> = {
    // A tempo change from 120 to 144 bpm four counts into the page
    small: { "3": 3.2059 },
    realistic: {
        // Mixed-meter 7/8 (2+2+3): the long beat is 1.5 times the others
        "8": 74.2933,
        "8A": 68.2717,
        // The 120 to 160 bpm accelerando, and the page running from it into the closer
        "9": 27.9288,
        "10": 17.8366,
    },
};

/** Fake convert-on-open dialogs that record every call. */
function fakeDialogs() {
    const calls: string[] = [];
    const dialogs: ConvertOnOpenDialogs = {
        async whilePreparing(work) {
            calls.push("preparing");
            return work(undefined);
        },
        async backupFailed(fileName) {
            calls.push(`backup failed ${fileName}`);
        },
        async conversionFailed(fileName) {
            calls.push(`conversion failed ${fileName}`);
        },
    };
    return { dialogs, calls };
}

let worker: BuiltConvertWorker | undefined;

beforeAll(async () => {
    worker = await buildConvertWorker();
}, 120_000);

afterAll(() => worker?.remove());

describe.each(["in-thread", "worker"] as const)(
    "OpenMarch v0.1.7 files open (%s)",
    (mode) => {
        let tempDir: string;

        /** Opens `filePath` as the app does, closing the connection and resuming the renderer's SQL. */
        async function open(filePath: string, confirmed: boolean) {
            const { dialogs, calls } = fakeDialogs();
            const result = await openShowFile(
                filePath,
                false,
                {
                    migrationsFolder,
                    dialogs: () => dialogs,
                    convertWorker:
                        mode === "worker"
                            ? { workerPath: worker!.workerPath }
                            : undefined,
                },
                { conversionConfirmed: confirmed },
            );
            result.db?.close();
            if (result.sqlSuspension !== undefined)
                DatabaseServices.resumeSqlProxy(result.sqlSuspension);
            return { result, calls };
        }

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-v017-"));
            vi.spyOn(console, "log").mockImplementation(() => {});
            vi.spyOn(console, "debug").mockImplementation(() => {});
            vi.spyOn(console, "error").mockImplementation(() => {});
        });

        afterEach(() => {
            DatabaseServices.forceResumeSqlProxy();
            DatabaseServices.closePersistentConnection();
            DatabaseServices.setDbPath("", false);
            fs.rmSync(tempDir, { recursive: true, force: true });
            vi.restoreAllMocks();
        });

        // v0.1.7 keeps a field image in `field_properties.image`. The generated files have none
        // (README "Not covered"), so this writes one into that column of `small.dots` the way
        // v0.1.7's main process stores it, and checks the conversion keeps its bytes.
        it("keeps a field image through the conversion", async () => {
            const showPath = path.join(tempDir, "with-image.dots");
            fs.copyFileSync(FIXTURES[0]!.file, showPath);
            const image = new Uint8Array(
                Buffer.from(
                    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
                        "1f15c4890000000d49444154789c6360f8cfc0f01f0005fe02fea7d6" +
                        "a4c40000000049454e44ae426082",
                    "hex",
                ),
            );
            withDb(showPath, (raw) =>
                raw
                    .prepare(
                        "UPDATE field_properties SET image = ? WHERE id = 1",
                    )
                    .run(image),
            );
            const fieldBefore = withDb(showPath, (raw) =>
                raw
                    .prepare("SELECT json_data, image FROM field_properties")
                    .get(),
            );

            const { result } = await open(showPath, true);

            expect(result.status).toBe(200);
            expect(
                withDb(showPath, (raw) =>
                    raw
                        .prepare(
                            "SELECT json_data, image FROM field_properties",
                        )
                        .get(),
                ),
            ).toEqual(fieldBefore);
        });

        describe.each(FIXTURES.map((f) => [f.name, f] as const))(
            "%s.dots",
            (name, { file, view }) => {
                let showPath: string;

                beforeEach(() => {
                    showPath = path.join(tempDir, `${name}.dots`);
                    fs.copyFileSync(file, showPath);
                });

                it("is a v0.1.7 page-era file: asks first and writes nothing", async () => {
                    expect(v017StateOf(showPath)).toMatchObject({
                        userVersion: 7,
                        timelineTables: [],
                        migrations: 17,
                    });
                    const { result, calls } = await open(showPath, false);

                    expect(result.status).toBe(NEEDS_CONVERSION_STATUS);
                    expect(result.backupPath).toBe(
                        path.join(tempDir, `${name}.pre-conversion.dots`),
                    );
                    expect(calls).toEqual([]);
                    expect(sha256(showPath)).toBe(sha256(file));
                    expect(backupsIn(tempDir)).toEqual([]);
                });

                // eslint-disable-next-line max-lines-per-function
                it("converts once confirmed, shows every marcher where v0.1.7 does, and keeps the show", async () => {
                    const before = v017StateOf(showPath);
                    expect(before.undo).toBeGreaterThan(0);
                    expect(before.redo).toBeGreaterThan(0);

                    const { result, calls } = await open(showPath, true);

                    expect(result.status).toBe(200);
                    expect(calls).toEqual(["preparing"]);

                    // The backup: the v0.1.7 file's contents, exactly (`VACUUM INTO` rewrites pages)
                    expect(backupsIn(tempDir)).toEqual([
                        `${name}.pre-conversion.dots`,
                    ]);
                    expect(
                        contentsOf(
                            path.join(tempDir, `${name}.pre-conversion.dots`),
                        ),
                    ).toEqual(contentsOf(file));

                    // This build's schema: a timeline file with every migration applied
                    const after = stateOf(showPath);
                    expect(after.userVersion).toBe(8);
                    expect(after.marker).toEqual(expect.any(String));
                    expect(after.pageEraTables).toEqual([]);
                    expect(after.timelines).toBeGreaterThan(0);
                    const migrationHashes = fs
                        .readdirSync(migrationsFolder)
                        .filter((f) => f.endsWith(".sql"))
                        .sort()
                        .map((f) => ({
                            f,
                            hash: createHash("sha256")
                                .update(
                                    fs.readFileSync(
                                        path.join(migrationsFolder, f),
                                    ),
                                )
                                .digest("hex"),
                        }));
                    expect(migrationHashes.map((m) => m.f)).toEqual(
                        expect.arrayContaining([
                            "0017_timeline_model.sql",
                            "0018_drop_page_era.sql",
                        ]),
                    );
                    withDb(showPath, (raw) => {
                        const migrator = new DrizzleMigrationService(
                            getOrm(raw),
                            raw,
                        );
                        expect(
                            migrator.hasPendingMigrations(migrationsFolder),
                        ).toBe(false);
                        expect(
                            migrator
                                .getAppliedMigrations()
                                .map((m) => m.hash)
                                .sort(),
                        ).toEqual(migrationHashes.map((m) => m.hash).sort());
                    });

                    // Conversion isn't an undoable edit: v0.1.7's undo and redo history is dropped
                    expect(after.history).toEqual([]);
                    expect(after.historyStats).toMatchObject({
                        cur_undo_group: 1,
                        cur_redo_group: 1,
                    });

                    const raw = new DatabaseSync(showPath, { readOnly: true });
                    try {
                        const orm = getOrm(raw) as unknown as DbConnection;
                        await checkPositions(orm, name, view);
                        await checkShowKept(orm, raw, view);
                    } finally {
                        raw.close();
                    }
                });

                it("reopening the converted file converts nothing and changes no row", async () => {
                    expect((await open(showPath, true)).result.status).toBe(
                        200,
                    );
                    DatabaseServices.closePersistentConnection();
                    DatabaseServices.setDbPath("", false);
                    const converted = contentsOf(showPath);

                    const { result, calls } = await open(showPath, false);

                    expect(result.status).toBe(200);
                    expect(calls).toEqual([]);
                    DatabaseServices.closePersistentConnection();
                    expect(contentsOf(showPath)).toEqual(converted);
                    expect(backupsIn(tempDir)).toEqual([
                        `${name}.pre-conversion.dots`,
                    ]);
                });
            },
        );
    },
);

/** A file's version, schema and every row of every table, for comparing files by contents. */
function contentsOf(filePath: string) {
    return withDb(filePath, (db) => {
        const schema = db
            .prepare(
                "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name",
            )
            .all() as { type: string; name: string }[];
        return {
            userVersion: db.prepare("PRAGMA user_version").get(),
            schema,
            rows: Object.fromEntries(
                schema
                    .filter((t) => t.type === "table")
                    .map((t) => [
                        t.name,
                        db.prepare(`SELECT * FROM "${t.name}"`).all(),
                    ]),
            ),
        };
    });
}

/** What a v0.1.7 file has: no timeline tables, its 17 migrations, undo and redo history. */
function v017StateOf(filePath: string) {
    return withDb(filePath, (db) => {
        const n = (sql: string) =>
            Number((db.prepare(sql).get() as { n: number }).n);
        return {
            userVersion: Number(
                (
                    db.prepare("PRAGMA user_version").get() as {
                        user_version: number;
                    }
                ).user_version,
            ),
            timelineTables: (
                db
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'timeline%'",
                    )
                    .all() as { name: string }[]
            ).map((t) => t.name),
            migrations: n("SELECT count(*) AS n FROM __drizzle_migrations"),
            marcherPages: n("SELECT count(*) AS n FROM marcher_pages"),
            undo: n("SELECT count(*) AS n FROM history_undo"),
            redo: n("SELECT count(*) AS n FROM history_redo"),
        };
    });
}

/** A mismatch between this build and the reference, for the failure message. */
interface Mismatch {
    page: string;
    count: number;
    marcher: string;
    expected: [number, number];
    actual: [number, number];
}

/**
 * Every marcher at every page start and every count, against this build's resolver. Checks first
 * that the reference reproduces v0.1.7's own samples in the JSON. Then every page start and end,
 * and every count of a page whose beats are all the same length, must be exactly where v0.1.7
 * shows the marcher. On a page with uneven beats the counts inside it follow beats (C-7): they
 * must be exactly on the beat-axis line between the same keyframes, and their distance from
 * v0.1.7 must be what `UNEVEN_TEMPO_DIFFERENCES` records.
 */
// eslint-disable-next-line max-lines-per-function
async function checkPositions(orm: DbConnection, name: string, view: V017View) {
    const keyframes = v017Keyframes(view);
    const label = new Map(
        view.marchers.map((m) => [m.id, `${m.drillPrefix}${m.drillOrder}`]),
    );
    const duration = new Map(view.beats.map((b) => [b.id, b.duration]));

    // The reference is v0.1.7's playback: it reproduces every sample v0.1.7 computed
    for (const page of view.playback.pages)
        for (const sample of page.counts)
            view.playback.marcherIds.forEach((id, k) => {
                const [x, y] = positionAt(keyframes.get(id)!, "ms", sample.ms);
                const [ex, ey] = sample.positions[k]!;
                expect(Math.hypot(x - ex, y - ey)).toBeLessThan(1e-9);
            });

    const resolver = createResolver((await readTimelineTables(orm)).snapshot);
    const { pages } = await readShowTiming(orm);
    const forkPage = new Map(pages.map((p) => [p.id, p]));
    const mismatches: Mismatch[] = [];
    const unevenDifferences: Record<string, number> = {};
    let compared = 0;
    for (const page of view.pages) {
        const startBeat = forkPage.get(page.id)!.beats[0]!.index;
        const lengths = page.beatIds.map((id) => duration.get(id)!);
        const uneven =
            page.order > 0 &&
            lengths.some((d) => Math.abs(d - lengths[0]!) > 1e-12);
        const lastCount = page.order === 0 ? 0 : page.counts;
        for (let count = 0; count <= lastCount; count++) {
            const ms =
                (page.timestamp +
                    lengths.slice(0, count).reduce((s, d) => s + d, 0)) *
                1000;
            const inside = count > 0 && count < lastCount;
            for (const m of view.marchers) {
                const actual = resolver.positionAt(m.id, startBeat + count);
                const shown = positionAt(keyframes.get(m.id)!, "ms", ms);
                const expected =
                    uneven && inside
                        ? positionAt(
                              keyframes.get(m.id)!,
                              "beat",
                              startBeat + count,
                          )
                        : shown;
                compared++;
                const off = (xy: [number, number]) =>
                    Math.hypot(actual[0] - xy[0], actual[1] - xy[1]);
                if (off(expected) > TOLERANCE)
                    mismatches.push({
                        page: page.name,
                        count,
                        marcher: label.get(m.id)!,
                        expected,
                        actual: [actual[0], actual[1]],
                    });
                if (uneven)
                    unevenDifferences[page.name] = Math.max(
                        unevenDifferences[page.name] ?? 0,
                        off(shown),
                    );
            }
        }
    }
    expect(compared).toBe(
        view.marchers.length *
            view.pages.reduce(
                (n, p) => n + (p.order === 0 ? 1 : p.counts + 1),
                0,
            ),
    );
    expect(mismatches.slice(0, 20)).toEqual([]);
    const rounded = Object.fromEntries(
        Object.entries(unevenDifferences).map(([page, d]) => [
            page,
            Math.round(d * 1e4) / 1e4,
        ]),
    );
    expect(rounded).toEqual(UNEVEN_TEMPO_DIFFERENCES[name]);
}

/** Pages, beats, measures, marchers, audio, tags and settings: as v0.1.7 had them. */
async function checkShowKept(
    orm: DbConnection,
    raw: DatabaseSync,
    view: V017View,
) {
    const { beats, pages } = await readShowTiming(orm);
    expect(
        pages.map((p) => ({
            id: p.id,
            name: p.name,
            order: p.order,
            counts: p.counts,
            isSubset: p.isSubset,
            notes: p.notes,
            beatIds: p.beats.map((b) => b.id),
        })),
    ).toEqual(
        view.pages.map((p) => ({
            id: p.id,
            name: p.name,
            order: p.order,
            counts: p.counts,
            isSubset: p.isSubset,
            notes: p.notes,
            beatIds: p.beatIds,
        })),
    );
    pages.forEach((p, i) => {
        expect(p.timestamp).toBeCloseTo(view.pages[i]!.timestamp, 9);
        expect(p.duration).toBeCloseTo(view.pages[i]!.duration, 9);
    });
    expect(
        beats.map((b) => ({
            id: b.id,
            position: b.position,
            duration: b.duration,
        })),
    ).toEqual(
        view.beats.map((b) => ({
            id: b.id,
            position: b.position,
            duration: b.duration,
        })),
    );
    expect(
        raw
            .prepare(
                "SELECT id, start_beat AS startBeat, rehearsal_mark AS rehearsalMark FROM measures ORDER BY id",
            )
            .all()
            .map((r) => ({ ...r })),
    ).toEqual(
        view.measures.map(({ id, startBeat, rehearsalMark }) => ({
            id,
            startBeat,
            rehearsalMark,
        })),
    );
    expect(
        (
            raw.prepare("SELECT last_page_counts FROM utility").get() as {
                last_page_counts: number;
            }
        ).last_page_counts,
    ).toBe(view.lastPageCounts);
    expect(
        raw
            .prepare(
                "SELECT id, name, section, drill_prefix AS drillPrefix, drill_order AS drillOrder, year FROM marchers ORDER BY id",
            )
            .all()
            .map((r) => ({ ...r })),
    ).toEqual(view.marchers);

    // Audio: the v0.1.7 row and its bytes
    const audio = raw
        .prepare("SELECT path, nickname, selected, data FROM audio_files")
        .all() as {
        path: string;
        nickname: string;
        selected: number;
        data: Uint8Array;
    }[];
    expect(audio).toHaveLength(1);
    expect(audio[0]).toMatchObject({
        path: expect.stringMatching(/-show\.wav$/),
        nickname: `${view.projectName} music`,
        selected: 1,
    });
    expect(Buffer.from(audio[0]!.data).subarray(0, 4).toString()).toBe("RIFF");

    const settings = JSON.parse(
        (
            raw.prepare("SELECT json_data FROM workspace_settings").get() as {
                json_data: string;
            }
        ).json_data,
    ) as Record<string, unknown>;
    expect(settings.projectName).toBe(view.projectName);
}
