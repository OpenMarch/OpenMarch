// @vitest-environment node
/**
 * Convert on open (docs/timeline/phases/09-flip.md P9.3, ADR 0001 §6), on real
 * `.dots` files opened through the same steps as `setActiveDb`. Runs in the
 * node environment, as the main process does, so a converter dependency that
 * needs `window` (or `import.meta.env`) fails here.
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
import { getOrm } from "../db";
import { DrizzleMigrationService } from "../services/DrizzleMigrationService";
import { applyFileVersionDecision } from "../fileVersion";
import {
    BACKUP_NAME_SUFFIX,
    backupBeforeConversion,
    type BackupResult,
} from "../backup";
import {
    CONVERT_ON_OPEN_ENV,
    isConvertOnOpenEnabled,
    initializeNewFileAsTimeline,
    TIMELINE_CONVERTED_AT_KEY,
    withTimelineModeOn,
} from "../convertOnOpenGate";
import {
    CONVERSION_STEPS,
    findLatestBackup,
    runConvertOnOpen,
    type ConversionStep,
    type ConvertOnOpenOutcome,
    type ConvertOnOpenUi,
    type ConvertProgress,
} from "../convertOnOpen";
import { convertInWorker } from "@om-electron/main/convertWorkerHost";
import {
    buildConvertWorker,
    type BuiltConvertWorker,
} from "./buildConvertWorker";
import {
    backupsIn,
    createBlankShow,
    createPageShow,
    GATE_ON,
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

/** Records what the flow asked; answers the older-release warning with `choice`. */
function testUi(choice: "open" | "stop" = "stop") {
    const calls = { warned: [] as (string | undefined)[], prepared: 0 };
    const ui: ConvertOnOpenUi = {
        warnOlderRelease: async (backupPath) => {
            calls.warned.push(backupPath);
            return choice;
        },
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

/** The file's hash just before the convert-on-open step (opening itself writes to the file). */
let hashBeforeStep = "";

/** `runConvertOnOpen`'s options that run the conversion in the current `mode`. */
function conversionOptions(filePath: string, hooks: TestHooks = {}) {
    if (mode === "in-thread")
        return {
            hooks: {
                now: fixedNow,
                backup: (path: string) => {
                    hooks.beforeBackup?.();
                    return hooks.backupFailure ?? backupBeforeConversion(path);
                },
                afterStep: (step: ConversionStep) => {
                    if (step === hooks.failAfterStep)
                        throw new Error(`disk vanished after ${step}`);
                },
            },
        };
    return {
        convert: async (onProgress: (p: ConvertProgress) => void) => {
            hooks.beforeBackup?.();
            return convertInWorker(filePath, {
                workerPath: worker!.workerPath,
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
 * The database steps of `setActiveDb`, including the convert-on-open step. Sets
 * `hashBeforeStep`, and runs `beforeStep` after migrations, right before the step.
 * The test's connection stays open, idle, while a worker converts.
 */
async function openLikeSetActiveDb(
    filePath: string,
    {
        env = GATE_ON,
        ui = testUi().ui,
        hooks,
        beforeStep,
    }: {
        env?: Record<string, string | undefined>;
        ui?: ConvertOnOpenUi;
        hooks?: TestHooks;
        beforeStep?: () => void;
    } = {},
): Promise<ConvertOnOpenOutcome> {
    expect(setDbPath(filePath, false)).toBe(200);
    const db = connect();
    try {
        const orm = getOrm(db);
        const migrator = new DrizzleMigrationService(orm, db);
        applyFileVersionDecision(db, false);
        await migrator.applyPendingMigrations(migrationsFolder);
        hashBeforeStep = sha256(filePath);
        beforeStep?.();
        progress = [];
        return await runConvertOnOpen(filePath, db, ui, {
            env,
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

    describe("the gate", () => {
        it.each([
            [undefined, false],
            ["", false],
            ["0", false],
            ["yes", false],
            ["on", false],
            ["false", false],
            ["1", true],
            ["true", true],
            [" TRUE ", true],
        ])("%j turns it on: %s", (value, on) => {
            expect(
                isConvertOnOpenEnabled(
                    value === undefined ? {} : { [CONVERT_ON_OPEN_ENV]: value },
                ),
            ).toBe(on);
        });

        it.each([{}, { [CONVERT_ON_OPEN_ENV]: "yes" }])(
            "leaves a page-era file as it is when off (%j)",
            async (env) => {
                const before = stateOf(showPath);
                const { ui, calls } = testUi();

                const outcome = await openLikeSetActiveDb(showPath, {
                    env,
                    ui,
                });

                expect(outcome).toEqual({ kind: "disabled" });
                expect(sha256(showPath)).toBe(hashBeforeStep);
                expect(stateOf(showPath)).toEqual(before);
                expect(before.userVersion).toBe(7);
                expect(before.timelines).toBe(0);
                expect(before.timelineMode).toBeUndefined();
                expect(backupsIn(tempDir)).toEqual([]);
                expect(calls).toEqual({ warned: [], prepared: 0 });
            },
        );
    });

    it("backs up, then converts in one go: version 8, flag on, timeline rows", async () => {
        const before = stateOf(showPath);
        const { ui, calls } = testUi();

        const outcome = await openLikeSetActiveDb(showPath, { ui });

        if (outcome.kind !== "conversion" || outcome.status !== "converted")
            throw new Error(`not converted: ${JSON.stringify(outcome)}`);
        expect(calls.prepared).toBe(1);
        expect(calls.warned).toEqual([]);

        // The backup: next to the file, the pre-conversion content, still a page file.
        const expectedBackup = path.join(
            tempDir,
            `show (${BACKUP_NAME_SUFFIX}).dots`,
        );
        expect(outcome.backupPath).toBe(expectedBackup);
        expect(backupsIn(tempDir)).toEqual([path.basename(expectedBackup)]);
        expect(stateOf(expectedBackup)).toEqual(before);
        expect(sha256(showPath)).not.toBe(hashBeforeStep);

        // The file: version 8, flag on, one timeline with a transition per page 1 to 6.
        const after = stateOf(showPath);
        expect(after.userVersion).toBe(8);
        expect(after.timelineMode).toBe(true);
        expect(after.timelines).toBe(1);
        expect(after.transitions).toBe(6);
        expect(after.assignments).toBe(76 * 6);
        expect(after.marcherPages).toBe(before.marcherPages);
        // Not an undoable edit; no stale history or change-log rows; undo triggers kept.
        expect(after.history).toEqual([]);
        expect(after.historyStats).toMatchObject({
            cur_undo_group: 1,
            cur_redo_group: 1,
        });
        expect(after.changeLog).toBe(0);
        expect(after.triggers).toEqual(before.triggers);
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
        expect(JSON.parse(after.settingsJson!)).toMatchObject({
            defaultTempo: 120,
            timelineMode: true,
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

    it("converts a show with only page 0: the flag, the marker and the version, homes from page 0, no timeline rows", async () => {
        const blank = path.join(tempDir, "blank.dots");
        await createPageZeroShow(blank);

        const outcome = await openLikeSetActiveDb(blank);

        expect(outcome).toMatchObject({
            kind: "conversion",
            status: "converted",
        });
        const after = stateOf(blank);
        expect(after.userVersion).toBe(8);
        expect(after.timelineMode).toBe(true);
        expect(after.timelines).toBe(0);
        expect(after.transitions).toBe(0);
        expect(after.homes).toEqual([{ id: 1, home_x: 12.5, home_y: 40 }]);
    });

    it("a converted empty show and a new file made with the gate on end up alike", async () => {
        const converted = path.join(tempDir, "converted.dots");
        await createBlankShow(converted);
        await openLikeSetActiveDb(converted);

        const fresh = path.join(tempDir, "fresh.dots");
        await createBlankShow(fresh);
        withDb(fresh, (db) => initializeNewFileAsTimeline(db, fixedNow));

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
                timelineMode: state.timelineMode,
                marker: settings[TIMELINE_CONVERTED_AT_KEY],
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
            timelineMode: true,
            marker: CONVERTED_AT,
        });
    });

    it.each([
        ["missing", null],
        ["corrupt", "{not json"],
        ["an array", "[1, 2]"],
    ])(
        "turns the flag on when the workspace settings are %s",
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
                timelineMode: true,
                [TIMELINE_CONVERTED_AT_KEY]: CONVERTED_AT,
            });
        },
    );

    it("withTimelineModeOn keeps the other settings, sets the marker and replaces bad JSON", () => {
        const on = { timelineMode: true, [TIMELINE_CONVERTED_AT_KEY]: "t" };
        expect(
            JSON.parse(withTimelineModeOn('{"a":1,"timelineMode":false}', "t")),
        ).toEqual({ a: 1, ...on });
        expect(JSON.parse(withTimelineModeOn(undefined, "t"))).toEqual(on);
        expect(JSON.parse(withTimelineModeOn("null", "t"))).toEqual(on);
        expect(JSON.parse(withTimelineModeOn("{", "t"))).toEqual(on);
    });

    it("doesn't convert again when a converted file is reopened", async () => {
        await openLikeSetActiveDb(showPath);
        const converted = stateOf(showPath);
        const { ui, calls } = testUi();

        const outcome = await openLikeSetActiveDb(showPath, { ui });

        expect(outcome).toEqual({ kind: "none", reason: "timeline-file" });
        expect(stateOf(showPath)).toEqual(converted);
        expect(sha256(showPath)).toBe(hashBeforeStep);
        expect(backupsIn(tempDir)).toHaveLength(1);
        expect(calls).toEqual({ warned: [], prepared: 0 });
    });

    it("rechecks inside the transaction: a file converted meanwhile isn't converted twice", async () => {
        // Another app instance converts the file between the check and the transaction.
        const other = path.join(tempDir, "other.dots");
        fs.copyFileSync(showPath, other);
        await openLikeSetActiveDb(other);
        const convertedElsewhere = fs.readFileSync(other);

        const thisOpensBackup = path.join(
            tempDir,
            `show (${BACKUP_NAME_SUFFIX}).dots`,
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
        expect(sha256(showPath)).toBe(sha256(other));
        expect(stateOf(showPath).timelines).toBe(1);
        // The misleading backup is gone; the other instance's own backup is untouched.
        expect(fs.existsSync(thisOpensBackup)).toBe(false);
        expect(backupsIn(tempDir)).toEqual([
            `other (${BACKUP_NAME_SUFFIX}).dots`,
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

            // Nothing partial: version 7, no timeline rows, flag off, and the same history,
            // history stats, change log and triggers as before.
            expect(stateOf(showPath)).toEqual(before);

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

    describe("a version-7 file with timeline rows", () => {
        /**
         * What a release without the version guard does: reset to 7 and edit the show. Its edits
         * to the page-era tables are refused by the freeze triggers the file carries (P9.5), so
         * the edit here is a page's notes.
         */
        function reopenInOlderRelease() {
            withDb(showPath, (db) => {
                db.exec("PRAGMA user_version = 7");
                expect(() =>
                    db.exec("UPDATE marcher_pages SET x = x + 10 WHERE id = 1"),
                ).toThrow(/read-only in timeline mode/);
                db.exec(
                    "UPDATE pages SET notes = 'edited by an older release' WHERE id = 1",
                );
            });
        }

        it.each(["stop", "open"] as const)(
            "converted, then saved by an older release: warns, offers the backup, never converts again (%s)",
            async (choice) => {
                const first = await openLikeSetActiveDb(showPath);
                if (first.kind !== "conversion" || first.status !== "converted")
                    throw new Error("expected a conversion");
                reopenInOlderRelease();
                const before = stateOf(showPath);
                const { ui, calls } = testUi(choice);

                const outcome = await openLikeSetActiveDb(showPath, { ui });

                expect(outcome).toEqual({
                    kind: "older-release",
                    backupPath: first.backupPath,
                    choice,
                });
                expect(calls).toEqual({
                    warned: [first.backupPath],
                    prepared: 0,
                });
                expect(stateOf(showPath)).toEqual(before);
                expect(before.userVersion).toBe(7);
                expect(sha256(showPath)).toBe(hashBeforeStep);
                expect(backupsIn(tempDir)).toHaveLength(1);
            },
        );

        const removeBackups = () => {
            for (const f of backupsIn(tempDir))
                fs.rmSync(path.join(tempDir, f));
        };

        it("converted, then reset to 7, with its backup gone: the marker still warns, with no backup to offer", async () => {
            await openLikeSetActiveDb(showPath);
            reopenInOlderRelease();
            removeBackups();
            const before = stateOf(showPath);
            const { ui, calls } = testUi("stop");

            const outcome = await openLikeSetActiveDb(showPath, { ui });

            expect(outcome).toEqual({
                kind: "older-release",
                backupPath: undefined,
                choice: "stop",
            });
            expect(calls).toEqual({ warned: [undefined], prepared: 0 });
            expect(stateOf(showPath)).toEqual(before);
            expect(sha256(showPath)).toBe(hashBeforeStep);
        });

        it("a new file made with the gate on, then reset to 7 by an older release: warns (it has no timeline rows)", async () => {
            const fresh = path.join(tempDir, "fresh.dots");
            await createBlankShow(fresh);
            withDb(fresh, (db) => initializeNewFileAsTimeline(db, fixedNow));
            withDb(fresh, (db) => {
                db.exec("PRAGMA user_version = 7");
                db.exec(
                    "INSERT INTO marchers (id, section, drill_prefix, drill_order) VALUES (1, 'Trumpet', 'T', 1)",
                );
            });
            expect(stateOf(fresh).timelines).toBe(0);
            const { ui, calls } = testUi("stop");

            const outcome = await openLikeSetActiveDb(fresh, { ui });

            expect(outcome).toEqual({
                kind: "older-release",
                backupPath: undefined,
                choice: "stop",
            });
            expect(calls).toEqual({ warned: [undefined], prepared: 0 });
            expect(stateOf(fresh).userVersion).toBe(7);
        });

        it("made with the dev flag (timeline rows, no marker, no backup): opens as it is, no warning", async () => {
            await openLikeSetActiveDb(showPath);
            reopenInOlderRelease();
            removeBackups();
            // What the dev command (P6.4) leaves: rows and the flag, but no marker.
            withDb(showPath, (db) => {
                const { json_data } = db
                    .prepare("SELECT json_data FROM workspace_settings")
                    .get() as { json_data: string };
                const settings = JSON.parse(json_data) as Record<
                    string,
                    unknown
                >;
                delete settings[TIMELINE_CONVERTED_AT_KEY];
                db.prepare("UPDATE workspace_settings SET json_data = ?").run(
                    JSON.stringify(settings),
                );
            });
            const before = stateOf(showPath);
            const { ui, calls } = testUi("stop");

            const outcome = await openLikeSetActiveDb(showPath, { ui });

            expect(outcome).toEqual({
                kind: "none",
                reason: "dev-timeline-file",
            });
            expect(calls).toEqual({ warned: [], prepared: 0 });
            expect(stateOf(showPath)).toEqual(before);
            expect(sha256(showPath)).toBe(hashBeforeStep);
        });
    });

    describe("findLatestBackup", () => {
        const name = (n: number) =>
            n === 1
                ? `show (${BACKUP_NAME_SUFFIX}).dots`
                : `show (${BACKUP_NAME_SUFFIX} ${n}).dots`;

        it("finds the highest number, across gaps", () => {
            expect(findLatestBackup(showPath)).toBeUndefined();
            fs.writeFileSync(path.join(tempDir, name(1)), "");
            expect(findLatestBackup(showPath)).toBe(
                path.join(tempDir, name(1)),
            );
            fs.writeFileSync(path.join(tempDir, name(3)), "");
            expect(findLatestBackup(showPath)).toBe(
                path.join(tempDir, name(3)),
            );
            fs.rmSync(path.join(tempDir, name(1)));
            fs.writeFileSync(path.join(tempDir, name(12)), "");
            expect(findLatestBackup(showPath)).toBe(
                path.join(tempDir, name(12)),
            );
        });

        it("ignores other shows' backups and similar names", () => {
            fs.writeFileSync(
                path.join(tempDir, `other (${BACKUP_NAME_SUFFIX} 9).dots`),
                "",
            );
            fs.writeFileSync(
                path.join(tempDir, `show (${BACKUP_NAME_SUFFIX} x).dots`),
                "",
            );
            fs.writeFileSync(
                path.join(tempDir, `show (${BACKUP_NAME_SUFFIX} 4).txt`),
                "",
            );
            expect(findLatestBackup(showPath)).toBeUndefined();
        });
    });
});
