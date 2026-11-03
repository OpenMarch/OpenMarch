// @vitest-environment node
/**
 * Convert on open (ADR 0001 §6), on real `.dots` files opened through the same
 * steps as `setActiveDb`: a page-era file is only converted once the person
 * agreed, and the conversion drops the page-era tables. Runs in the node
 * environment, as the main process does, so a converter dependency that needs
 * `window` (or `import.meta.env`) fails here.
 *
 * Every test runs twice (P9.8): with the backup and conversion on the test's
 * thread, and in the worker thread the app uses (built with Vite, as the app
 * build does). Worker crashes, responsiveness and quitting are in
 * `electron/main/__test__/convertWorkerHost.test.ts`.
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
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    closePersistentConnection,
    connect,
    setDbPath,
} from "../database.services";
import {
    BACKUP_NAME_SUFFIX,
    backupBeforeConversion,
    type BackupResult,
} from "../backup";
import {
    TIMELINE_CONVERTED_AT_KEY,
    withConversionMarker,
} from "../convertOnOpenGate";
import {
    CONVERSION_STEPS,
    runConvertOnOpen,
    type ConversionStep,
    type ConvertOnOpenOutcome,
    type ConvertOnOpenUi,
    type ConvertProgress,
    type ConvertRequest,
} from "../convertOnOpen";
import { convertInWorker } from "@om-electron/main/convertWorkerHost";
import {
    buildConvertWorker,
    type BuiltConvertWorker,
} from "./buildConvertWorker";
import {
    backupsIn,
    createBlankShow,
    createNewTimelineShow,
    createPageShow,
    migrationsFolder,
    sha256,
    stateOf,
    withDb,
} from "./convertOnOpenFixtures";

/** Where the backup and conversion run: on this thread, or in the app's worker (P9.8). */
type Mode = "in-thread" | "worker";
let mode: Mode = "in-thread";
let worker: BuiltConvertWorker | undefined;

/** Progress the last open reported to its preparing state. */
let progress: ConvertProgress[] = [];

/** Runs `fn` on a fresh connection to `filePath`, awaiting it. */
async function withDbAsync(
    filePath: string,
    fn: (db: import("node:sqlite").DatabaseSync) => Promise<void>,
) {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(filePath);
    try {
        await fn(db);
    } finally {
        db.close();
    }
}

/** Records how often the flow ran a backup and conversion. */
function testUi() {
    const calls = { prepared: 0 };
    const ui: ConvertOnOpenUi = {
        whilePreparing: async (work) => {
            calls.prepared++;
            return work((p) => progress.push(p));
        },
    };
    return { ui, calls };
}

/** Test hooks both modes support. */
interface TestHooks {
    /** Runs just before the backup. */
    beforeBackup?: () => void;
    /** Returned instead of backing up. */
    backupFailure?: Extract<BackupResult, { ok: false }>;
    /** Throws `disk vanished after <step>` inside the transaction after this step. */
    failAfterStep?: ConversionStep;
}

const CONVERTED_AT = "2026-10-01T12:00:00.000Z";
const fixedNow = () => new Date(CONVERTED_AT);

/** The file's hash just before the convert-on-open step. */
let hashBeforeStep = "";

/** `runConvertOnOpen`'s options that run the conversion in the current `mode`. */
function conversionOptions(filePath: string, hooks: TestHooks = {}) {
    if (mode === "in-thread")
        return {
            hooks: {
                now: fixedNow,
                backup: (path: string, target: string) => {
                    hooks.beforeBackup?.();
                    return (
                        hooks.backupFailure ??
                        backupBeforeConversion(path, { target })
                    );
                },
                afterStep: (step: ConversionStep) => {
                    if (step === hooks.failAfterStep)
                        throw new Error(`disk vanished after ${step}`);
                },
            },
        };
    return {
        convert: async (
            onProgress: (p: ConvertProgress) => void,
            request: ConvertRequest,
        ) => {
            hooks.beforeBackup?.();
            return convertInWorker(filePath, {
                ...request,
                workerPath: worker!.workerPath,
                migrationsFolder,
                busyTimeoutMs: 5000,
                onProgress,
                test: {
                    now: CONVERTED_AT,
                    backupFailure: hooks.backupFailure,
                    failAfterStep: hooks.failAfterStep,
                },
            });
        },
    };
}

/**
 * The convert-on-open step of `setActiveDb`, which runs before migrations. Sets
 * `hashBeforeStep`, and runs `beforeStep` right before the step. The test's
 * connection stays open, idle, while a worker converts. `confirmed` is whether
 * the person agreed to convert (the renderer asks first).
 */
async function openLikeSetActiveDb(
    filePath: string,
    {
        confirmed = true,
        backupPath,
        ui = testUi().ui,
        hooks,
        beforeStep,
    }: {
        confirmed?: boolean;
        /** The backup name the person was shown when they confirmed. */
        backupPath?: string;
        ui?: ConvertOnOpenUi;
        hooks?: TestHooks;
        beforeStep?: () => void;
    } = {},
): Promise<ConvertOnOpenOutcome> {
    expect(setDbPath(filePath, false)).toBe(200);
    const db = connect();
    try {
        hashBeforeStep = sha256(filePath);
        beforeStep?.();
        progress = [];
        return await runConvertOnOpen(filePath, db, ui, {
            confirmed,
            backupPath,
            migrationsFolder,
            ...conversionOptions(filePath, hooks),
        });
    } finally {
        db.close();
    }
}

beforeAll(async () => {
    worker = await buildConvertWorker();
}, 120_000);

afterAll(() => worker?.remove());

describe.each(["in-thread", "worker"] as const)("convert on open (%s)", (m) => {
    let tempDir: string;
    let showPath: string;

    beforeEach(async () => {
        mode = m;
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-convert-"));
        showPath = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
        await createPageShow(showPath);
    });

    afterEach(() => {
        closePersistentConnection();
        setDbPath("", false);
        try {
            fs.chmodSync(tempDir, 0o755);
        } catch {
            // already gone
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("writes nothing until the person agrees, and says where the backup will go", async () => {
        const before = stateOf(showPath);
        const { ui, calls } = testUi();

        const outcome = await openLikeSetActiveDb(showPath, {
            confirmed: false,
            ui,
        });

        expect(outcome).toEqual({
            kind: "needs-confirmation",
            backupPath: path.join(tempDir, `show.${BACKUP_NAME_SUFFIX}.dots`),
        });
        expect(sha256(showPath)).toBe(hashBeforeStep);
        expect(stateOf(showPath)).toEqual(before);
        expect(before.userVersion).toBe(7);
        expect(backupsIn(tempDir)).toEqual([]);
        expect(calls).toEqual({ prepared: 0 });
    });

    it("a timeline file opens without asking", async () => {
        const fresh = path.join(tempDir, "fresh.dots");
        await createNewTimelineShow(fresh);

        const outcome = await openLikeSetActiveDb(fresh, { confirmed: false });

        expect(outcome).toEqual({ kind: "none" });
        expect(sha256(fresh)).toBe(hashBeforeStep);
    });

    it("backs up, then converts in one go: version 8, the marker, timeline rows, no page-era tables", async () => {
        const before = stateOf(showPath);
        const { ui, calls } = testUi();

        const outcome = await openLikeSetActiveDb(showPath, { ui });

        if (outcome.kind !== "conversion" || outcome.status !== "converted")
            throw new Error(`not converted: ${JSON.stringify(outcome)}`);
        expect(calls.prepared).toBe(1);

        // The backup: `show.pre-conversion.dots` next to the file, the untouched original.
        const expectedBackup = path.join(
            tempDir,
            `show.${BACKUP_NAME_SUFFIX}.dots`,
        );
        expect(outcome.backupPath).toBe(expectedBackup);
        expect(backupsIn(tempDir)).toEqual([path.basename(expectedBackup)]);
        expect(stateOf(expectedBackup)).toEqual(before);
        expect(sha256(showPath)).not.toBe(hashBeforeStep);

        // The file: version 8, a timeline per page 1 to 6, each with the one transition spanning
        // it (C-11), and the page-era tables are gone.
        const after = stateOf(showPath);
        expect(after.userVersion).toBe(8);
        expect(after.marker).toBe(CONVERTED_AT);
        expect(after.timelines).toBe(6);
        expect(after.transitions).toBe(6);
        expect(after.assignments).toBe(76 * 6);
        expect(before.marcherPages).toBeGreaterThan(0);
        expect(after.marcherPages).toBeNull();
        expect(after.pageEraTables).toEqual([]);
        // Not an undoable edit; no stale history or change-log rows; the undo triggers of the
        // tables that are left are kept, and the tables the timeline-only migrations add (the
        // performer cues) get theirs.
        expect(after.history).toEqual([]);
        expect(after.historyStats).toMatchObject({
            cur_undo_group: 1,
            cur_redo_group: 1,
        });
        expect(after.changeLog).toBe(0);
        const onPageEraTables = withDb(expectedBackup, (db) =>
            (
                db
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('marcher_pages', 'midsets', 'pathways', 'shapes', 'shape_pages', 'shape_page_marchers')",
                    )
                    .all() as { name: string }[]
            ).map((t) => t.name),
        );
        const tablesBefore = withDb(expectedBackup, (db) =>
            (
                db
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type = 'table'",
                    )
                    .all() as { name: string }[]
            ).map((t) => t.name),
        );
        const onNewTables = withDb(showPath, (db) =>
            (
                db
                    .prepare(
                        "SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger'",
                    )
                    .all() as { name: string; tbl_name: string }[]
            )
                .filter((t) => !tablesBefore.includes(t.tbl_name))
                .map((t) => t.name),
        );
        expect(onNewTables.length).toBeGreaterThan(0);
        expect(after.triggers).toEqual(
            [
                ...before.triggers.filter((t) => !onPageEraTables.includes(t)),
                ...onNewTables,
            ].sort(),
        );
        expect(outcome.report?.pages.length).toBeGreaterThan(0);

        // Progress: the backup, then each converted page.
        expect(progress).toEqual([
            { phase: "backup" },
            ...[1, 2, 3, 4, 5, 6].map((pagesDone) => ({
                phase: "convert",
                pagesDone,
                pagesTotal: 6,
            })),
        ]);

        // Other workspace settings are kept; the conversion marker is written.
        expect(JSON.parse(after.settingsJson!)).toEqual({
            defaultBeatsPerMeasure: 4,
            defaultTempo: 120,
            defaultNewPageCounts: 16,
            [TIMELINE_CONVERTED_AT_KEY]: CONVERTED_AT,
        });
    });

    /** A blank show with one marcher on page 0 at (12.5, 40). */
    async function createPageZeroShow(filePath: string) {
        await createBlankShow(filePath);
        const blank = filePath;
        withDb(blank, (db) => {
            db.exec(
                "INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (1, 'Trumpet', 'T', 1)",
            );
            db.exec(
                "UPDATE marcher_pages SET x = 12.5, y = 40 WHERE marcher_id = 1 AND page_id = 0",
            );
        });
        const hasRow = withDb(
            blank,
            (db) =>
                db
                    .prepare(
                        "SELECT count(*) AS n FROM marcher_pages WHERE marcher_id = 1 AND page_id = 0",
                    )
                    .get() as { n: number },
        ).n;
        if (hasRow === 0)
            withDb(blank, (db) =>
                db.exec(
                    "INSERT INTO marcher_pages (marcher_id, page_id, x, y) VALUES (1, 0, 12.5, 40)",
                ),
            );
    }

    it("converts a show with only page 0: the marker and the version, homes from page 0, no timeline rows", async () => {
        const blank = path.join(tempDir, "blank.dots");
        await createPageZeroShow(blank);

        const outcome = await openLikeSetActiveDb(blank);

        expect(outcome).toMatchObject({
            kind: "conversion",
            status: "converted",
        });
        const after = stateOf(blank);
        expect(after.userVersion).toBe(8);
        expect(after.marker).toBe(CONVERTED_AT);
        expect(after.timelines).toBe(0);
        expect(after.transitions).toBe(0);
        expect(after.homes).toEqual([{ id: 1, home_x: 12.5, home_y: 40 }]);
    });

    it("a converted empty show and a new file end up alike", async () => {
        const converted = path.join(tempDir, "converted.dots");
        await createBlankShow(converted);
        await openLikeSetActiveDb(converted);

        const fresh = path.join(tempDir, "fresh.dots");
        await createNewTimelineShow(fresh, fixedNow);

        const pick = (filePath: string) => {
            const state = stateOf(filePath);
            const settings = JSON.parse(state.settingsJson!) as Record<
                string,
                unknown
            >;
            return {
                userVersion: state.userVersion,
                timelines: state.timelines,
                transitions: state.transitions,
                assignments: state.assignments,
                marker: settings[TIMELINE_CONVERTED_AT_KEY],
                pageEraTables: state.pageEraTables,
                homes: state.homes,
                changeLog: state.changeLog,
                history: state.history,
                shapes: withDb(filePath, (db) =>
                    db
                        .prepare("SELECT count(*) AS n FROM timeline_shapes")
                        .get(),
                ),
                destinations: withDb(filePath, (db) =>
                    db
                        .prepare(
                            "SELECT count(*) AS n FROM timeline_slot_destinations",
                        )
                        .get(),
                ),
            };
        };
        expect(pick(converted)).toEqual(pick(fresh));
        expect(pick(fresh)).toMatchObject({
            userVersion: 8,
            timelines: 0,
            marker: CONVERTED_AT,
            pageEraTables: [],
        });
    });

    it.each([
        ["missing", null],
        ["corrupt", "{not json"],
        ["an array", "[1, 2]"],
    ])(
        "writes the marker when the workspace settings are %s",
        async (_label, json) => {
            withDb(showPath, (db) => {
                if (json === null) db.exec("DELETE FROM workspace_settings");
                else
                    db.prepare(
                        "UPDATE workspace_settings SET json_data = ?",
                    ).run(json);
            });

            const outcome = await openLikeSetActiveDb(showPath);

            expect(outcome).toMatchObject({ status: "converted" });
            expect(JSON.parse(stateOf(showPath).settingsJson!)).toEqual({
                [TIMELINE_CONVERTED_AT_KEY]: CONVERTED_AT,
            });
        },
    );

    it("withConversionMarker keeps the other settings, drops the retired flag, sets the marker and replaces bad JSON", () => {
        const on = { [TIMELINE_CONVERTED_AT_KEY]: "t" };
        expect(
            JSON.parse(
                withConversionMarker('{"a":1,"timelineMode":false}', "t"),
            ),
        ).toEqual({ a: 1, ...on });
        expect(JSON.parse(withConversionMarker(undefined, "t"))).toEqual(on);
        expect(JSON.parse(withConversionMarker("null", "t"))).toEqual(on);
        expect(JSON.parse(withConversionMarker("{", "t"))).toEqual(on);
    });

    it("doesn't convert again when a converted file is reopened", async () => {
        await openLikeSetActiveDb(showPath);
        const converted = stateOf(showPath);
        const { ui, calls } = testUi();

        const outcome = await openLikeSetActiveDb(showPath, { ui });

        expect(outcome).toEqual({ kind: "none" });
        expect(stateOf(showPath)).toEqual(converted);
        expect(sha256(showPath)).toBe(hashBeforeStep);
        expect(backupsIn(tempDir)).toHaveLength(1);
        expect(calls).toEqual({ prepared: 0 });
    });

    it("rechecks inside the transaction: a file converted meanwhile isn't converted twice", async () => {
        // Another app instance converts the file between the check and the transaction.
        const other = path.join(tempDir, "other.dots");
        fs.copyFileSync(showPath, other);
        await openLikeSetActiveDb(other);
        const convertedElsewhere = fs.readFileSync(other);

        const thisOpensBackup = path.join(
            tempDir,
            `show.${BACKUP_NAME_SUFFIX}.dots`,
        );

        // The snapshot this open takes then holds the converted content under a "before" name.
        const outcome = await openLikeSetActiveDb(showPath, {
            hooks: {
                beforeBackup: () =>
                    fs.writeFileSync(showPath, convertedElsewhere),
            },
        });

        expect(outcome).toEqual({
            kind: "conversion",
            status: "already-converted",
        });
        expect(stateOf(showPath)).toEqual(stateOf(other));
        expect(stateOf(showPath).timelines).toBe(6);
        // The misleading backup is gone; the other instance's own backup is untouched.
        expect(fs.existsSync(thisOpensBackup)).toBe(false);
        expect(backupsIn(tempDir)).toEqual([
            `other.${BACKUP_NAME_SUFFIX}.dots`,
        ]);
    });

    describe("a failed backup", () => {
        it("converts nothing and leaves the file untouched", async () => {
            const before = stateOf(showPath);

            const outcome = await openLikeSetActiveDb(showPath, {
                hooks: {
                    backupFailure: {
                        ok: false,
                        code: "disk-full",
                        message: "There isn't enough space.",
                    },
                },
            });

            expect(outcome).toMatchObject({
                kind: "conversion",
                status: "backup-failed",
                backup: { code: "disk-full" },
            });
            expect(sha256(showPath)).toBe(hashBeforeStep);
            expect(stateOf(showPath)).toEqual(before);
        });

        it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
            "in a folder that became read-only, converts nothing",
            async () => {
                const before = stateOf(showPath);

                const outcome = await openLikeSetActiveDb(showPath, {
                    beforeStep: () => fs.chmodSync(tempDir, 0o555),
                });

                expect(outcome).toMatchObject({
                    kind: "conversion",
                    status: "backup-failed",
                    backup: { code: "directory-not-writable" },
                });
                fs.chmodSync(tempDir, 0o755);
                expect(sha256(showPath)).toBe(hashBeforeStep);
                expect(stateOf(showPath)).toEqual(before);
                expect(backupsIn(tempDir)).toEqual([]);
            },
        );
    });

    it.each(CONVERSION_STEPS)(
        "rolls back completely when the transaction fails after %s, and keeps the backup",
        async (failAfter) => {
            const before = stateOf(showPath);
            expect(before.triggers.length).toBeGreaterThan(0);
            expect(before.history).toHaveLength(2);

            const outcome = await openLikeSetActiveDb(showPath, {
                hooks: { failAfterStep: failAfter },
            });

            if (
                outcome.kind !== "conversion" ||
                outcome.status !== "conversion-failed"
            )
                throw new Error(
                    `expected a failed conversion: ${outcome.kind}`,
                );
            expect(outcome.error.message).toContain(`after ${failAfter}`);
            expect(fs.existsSync(outcome.backupPath)).toBe(true);
            expect(stateOf(outcome.backupPath)).toEqual(before);

            // Nothing partial: version 7, no timeline rows, the page-era tables, and the same
            // history, history stats, change log and triggers as before. Not even the page-era
            // migrations' trigger rebuild is left: the file is byte for byte what it was.
            expect(stateOf(showPath)).toEqual(before);
            expect(sha256(showPath)).toBe(hashBeforeStep);

            // The next open converts it (and backs it up again under the next name).
            const retry = await openLikeSetActiveDb(showPath);
            expect(retry).toMatchObject({
                kind: "conversion",
                status: "converted",
            });
            expect(stateOf(showPath).userVersion).toBe(8);
            expect(backupsIn(tempDir)).toHaveLength(2);
        },
    );

    it("rolls back the page-era migrations too: a file missing one keeps its old schema when the conversion fails", async () => {
        // A file an older release wrote before `0019_gray_brood` (the 3D View venue table).
        withDb(showPath, (db) => {
            db.exec("DROP TABLE view3d_venue");
            db.exec(
                `DELETE FROM __drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM __drizzle_migrations)`,
            );
        });
        const schemaOf = () =>
            withDb(showPath, (db) =>
                db
                    .prepare(
                        "SELECT type, name, sql FROM sqlite_master ORDER BY type, name",
                    )
                    .all(),
            );
        const schemaBefore = schemaOf();
        const migrationsBefore = withDb(showPath, (db) =>
            db.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get(),
        );

        const outcome = await openLikeSetActiveDb(showPath, {
            hooks: { failAfterStep: "user-version" },
        });

        expect(outcome).toMatchObject({ status: "conversion-failed" });
        expect(sha256(showPath)).toBe(hashBeforeStep);
        expect(schemaOf()).toEqual(schemaBefore);
        expect(
            withDb(showPath, (db) =>
                db
                    .prepare("SELECT count(*) AS n FROM __drizzle_migrations")
                    .get(),
            ),
        ).toEqual(migrationsBefore);

        // The next open applies it, inside the conversion.
        expect(await openLikeSetActiveDb(showPath)).toMatchObject({
            status: "converted",
        });
        expect(
            withDb(showPath, (db) =>
                db
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE name = 'view3d_venue'",
                    )
                    .get(),
            ),
        ).toBeDefined();
    });

    describe("the backup name the person was shown", () => {
        it("is the name the backup gets", async () => {
            const asked = await openLikeSetActiveDb(showPath, {
                confirmed: false,
            });
            if (asked.kind !== "needs-confirmation")
                throw new Error(`expected a question: ${asked.kind}`);
            const shown = asked.backupPath;

            const outcome = await openLikeSetActiveDb(showPath, {
                backupPath: shown,
            });

            expect(outcome).toMatchObject({
                status: "converted",
                backupPath: shown,
            });
        });

        it("taken since it was shown: leaves that file alone and backs up to the next free name", async () => {
            const asked = await openLikeSetActiveDb(showPath, {
                confirmed: false,
            });
            if (asked.kind !== "needs-confirmation")
                throw new Error(`expected a question: ${asked.kind}`);
            fs.writeFileSync(asked.backupPath, "someone else's file");

            const outcome = await openLikeSetActiveDb(showPath, {
                backupPath: asked.backupPath,
            });

            const next = asked.backupPath.replace(/\.dots$/, "-2.dots");
            expect(outcome).toMatchObject({
                status: "converted",
                backupPath: next,
            });
            expect(fs.readFileSync(asked.backupPath, "utf8")).toBe(
                "someone else's file",
            );
            expect(backupsIn(tempDir).sort()).toEqual(
                [path.basename(asked.backupPath), path.basename(next)].sort(),
            );
        });
    });

    /** Destinations of the file's transitions, in beat order, as plain rows. */
    const destinationsOf = (filePath: string) =>
        withDb(filePath, (db) =>
            db
                .prepare(
                    `SELECT t.start_beat, d.slot_index, d.x, d.y FROM timeline_slot_destinations d
                     JOIN timeline_transitions tr ON tr.id = d.transition_id
                     JOIN timelines t ON t.id = tr.timeline_id
                     ORDER BY t.start_beat, d.slot_index`,
                )
                .all(),
        );

    /** What an older release does to the page-era tables: marcher 1 moves 10 steps on page 1. */
    const EDIT_IN_OLDER_RELEASE =
        "UPDATE marcher_pages SET x = x + 10 WHERE marcher_id = 1 AND page_id = 1";

    /**
     * A show converted by an earlier build that kept the page-era tables (or made with the
     * retired dev flag and the marker), then edited in an older release: version 7, the
     * marker, timeline rows from before the edit, and the edit in `marcher_pages`.
     */
    async function convertedByEarlierBuildThenEditedInOlderRelease(
        filePath: string,
    ) {
        const { convertPagesToTimelineInTransaction } =
            await import("@/timeline/convert/convertPagesInTransaction");
        const { getOrm } = await import("../db");
        await withDbAsync(filePath, async (db) => {
            await getOrm(db).transaction((tx) =>
                convertPagesToTimelineInTransaction(tx as never),
            );
            db.exec(
                `UPDATE workspace_settings SET json_data = json_set(json_data, '$.${TIMELINE_CONVERTED_AT_KEY}', '2026-09-01T00:00:00.000Z')`,
            );
            db.exec(EDIT_IN_OLDER_RELEASE);
        });
    }

    /** The destinations a plain conversion of the show, with the older release's edit, gives. */
    async function destinationsWithTheEdit(): Promise<unknown[]> {
        const reference = path.join(tempDir, "reference.dots");
        await createPageShow(reference);
        withDb(reference, (db) => db.exec(EDIT_IN_OLDER_RELEASE));
        await openLikeSetActiveDb(reference);
        const destinations = destinationsOf(reference);
        for (const f of [reference, ...backupsIn(tempDir)])
            if (path.basename(f).startsWith("reference"))
                fs.rmSync(path.resolve(tempDir, path.basename(f)));
        return destinations;
    }

    describe("a converted file back at version 7", () => {
        it("converted by a build that kept the page-era tables, then edited in an older release: asks like any page-era file, then converts the edits, replacing the old timelines", async () => {
            const expected = await destinationsWithTheEdit();
            await convertedByEarlierBuildThenEditedInOlderRelease(showPath);
            // A kept spot, which goes with the assignments it marks.
            withDb(showPath, (db) =>
                db.exec(
                    "INSERT INTO timeline_kept_assignments (assignment_id) SELECT min(id) FROM timeline_assignments",
                ),
            );
            const staleDestinations = destinationsOf(showPath);
            expect(staleDestinations).not.toEqual(expected);
            const before = stateOf(showPath);

            expect(
                await openLikeSetActiveDb(showPath, { confirmed: false }),
            ).toEqual({
                kind: "needs-confirmation",
                backupPath: path.join(
                    tempDir,
                    `show.${BACKUP_NAME_SUFFIX}.dots`,
                ),
            });
            expect(sha256(showPath)).toBe(hashBeforeStep);

            const outcome = await openLikeSetActiveDb(showPath);

            if (outcome.kind !== "conversion" || outcome.status !== "converted")
                throw new Error(`not converted: ${JSON.stringify(outcome)}`);
            // The backup holds the file as it was: the old timelines and the edit.
            expect(stateOf(outcome.backupPath)).toEqual(before);
            expect(destinationsOf(outcome.backupPath)).toEqual(
                staleDestinations,
            );
            expect(stateOf(showPath)).toMatchObject({
                userVersion: 8,
                marker: CONVERTED_AT,
                timelines: 6,
                pageEraTables: [],
            });
            expect(destinationsOf(showPath)).toEqual(expected);
            // Kept spots are gone: the timeline-only migrations drop their table (holds #467)
            expect(
                withDb(showPath, (db) =>
                    db
                        .prepare(
                            "SELECT count(*) AS n FROM sqlite_schema WHERE name = 'timeline_kept_assignments'",
                        )
                        .get(),
                ),
            ).toEqual({ n: 0 });
        });

        it("a failed conversion of one leaves the file as it was and keeps the backup", async () => {
            await convertedByEarlierBuildThenEditedInOlderRelease(showPath);
            const before = stateOf(showPath);

            const outcome = await openLikeSetActiveDb(showPath, {
                hooks: { failAfterStep: "timeline-migrations" },
            });

            if (
                outcome.kind !== "conversion" ||
                outcome.status !== "conversion-failed"
            )
                throw new Error(`expected a failure: ${outcome.kind}`);
            expect(stateOf(outcome.backupPath)).toEqual(before);
            expect(stateOf(showPath)).toEqual(before);
            expect(sha256(showPath)).toBe(hashBeforeStep);
        });

        it("converted by this build, then reset to 7 by an older release (no page-era tables): asks, then fails safe with nothing to convert from", async () => {
            const first = await openLikeSetActiveDb(showPath);
            if (first.kind !== "conversion" || first.status !== "converted")
                throw new Error("expected a conversion");
            // What a release without the version guard does: resets the version, and saves an
            // edit to a table it still has.
            withDb(showPath, (db) => {
                db.exec("PRAGMA user_version = 7");
                db.exec(
                    "UPDATE pages SET notes = 'edited by an older release' WHERE id = 1",
                );
            });
            const before = stateOf(showPath);
            expect(before.pageEraTables).toEqual([]);

            expect(
                await openLikeSetActiveDb(showPath, { confirmed: false }),
            ).toMatchObject({ kind: "needs-confirmation" });
            const outcome = await openLikeSetActiveDb(showPath);

            if (
                outcome.kind !== "conversion" ||
                outcome.status !== "conversion-failed"
            )
                throw new Error(
                    `expected a failure: ${JSON.stringify(outcome)}`,
                );
            expect(outcome.error.message).toMatch(/no pages to convert/i);
            // Rolled back: the file is byte for byte what it was, and its copy is next to it.
            expect(sha256(showPath)).toBe(hashBeforeStep);
            expect(stateOf(showPath)).toEqual(before);
            expect(stateOf(outcome.backupPath)).toEqual(before);
            expect(outcome.backupPath).not.toBe(first.backupPath);
            expect(stateOf(first.backupPath).userVersion).toBe(7);
        });
    });

    it("a page-era file made with the retired dev flag (timeline rows, no marker, no backup) asks, then converts its page-era tables, replacing the rows", async () => {
        // What the dev command left: the page show plus timeline rows, and the flag, no marker.
        const { convertPagesToTimelineInTransaction } =
            await import("@/timeline/convert/convertPagesInTransaction");
        const { getOrm } = await import("../db");
        await withDbAsync(showPath, async (db) => {
            await getOrm(db).transaction((tx) =>
                convertPagesToTimelineInTransaction(tx as never),
            );
            db.exec(
                `UPDATE workspace_settings SET json_data = json_set(json_data, '$.timelineMode', json('true'))`,
            );
        });
        const before = stateOf(showPath);
        expect(before.timelines).toBe(6);

        expect(
            await openLikeSetActiveDb(showPath, { confirmed: false }),
        ).toMatchObject({ kind: "needs-confirmation" });
        const outcome = await openLikeSetActiveDb(showPath);

        if (outcome.kind !== "conversion" || outcome.status !== "converted")
            throw new Error(`not converted: ${JSON.stringify(outcome)}`);
        expect(outcome.report).toBeDefined();
        // The rows the dev flag left are in the backup.
        expect(stateOf(outcome.backupPath)).toEqual(before);
        const after = stateOf(showPath);
        expect(after.userVersion).toBe(8);
        expect(after.timelines).toBe(before.timelines);
        expect(after.assignments).toBe(before.assignments);
        expect(after.pageEraTables).toEqual([]);
        expect(JSON.parse(after.settingsJson!)).not.toHaveProperty(
            "timelineMode",
        );
    });
});
