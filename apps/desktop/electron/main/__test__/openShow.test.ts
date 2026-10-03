// @vitest-environment node
/**
 * The main-process open path (`openShow.ts`) with convert on open (P9.3):
 * the dialogs it shows, the stop status, serialized opens, the renderer's SQL
 * held off during a conversion, and new files. Real files; fake dialogs.
 * "Through the worker" runs the conversion in the app's worker thread (P9.8).
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
import * as DatabaseServices from "@om-electron/database/database.services";
import { OPEN_STOPPED_STATUS } from "@om-electron/database/convertOnOpenGate";
import type { ConvertOnOpenHooks } from "@om-electron/database/convertOnOpen";
import type {
    ConvertProgress,
    ConvertWorkerTestHooks,
} from "@om-electron/database/convertOnOpenProtocol";
import {
    buildConvertWorker,
    type BuiltConvertWorker,
} from "@om-electron/database/__test__/buildConvertWorker";
import {
    backupsIn,
    createPageShow,
    GATE_ON,
    migrationsFolder,
    sha256,
    stateOf,
    withDb,
} from "@om-electron/database/__test__/convertOnOpenFixtures";
import type { ConvertOnOpenDialogs } from "../convertOnOpenFlow";
import {
    openOnce,
    openShowFile,
    pendingOpenCount,
    resumeSqlProxyAfterReload,
    withOpenLock,
    type OpenShowResult,
} from "../openShow";
import { EventEmitter } from "events";
import type { DatabaseSync } from "node:sqlite";

/** Fake dialogs that record every call. */
function fakeDialogs({
    olderRelease = "stop",
    preparing,
    onProgress,
}: {
    olderRelease?: "open" | "stop";
    /** Runs inside the preparing state, before the work. */
    preparing?: () => Promise<void>;
    /** Receives the progress the work reports. */
    onProgress?: (progress: ConvertProgress) => void;
} = {}) {
    const calls: string[] = [];
    const dialogs: ConvertOnOpenDialogs = {
        async warnOlderRelease(fileName) {
            calls.push(`warn ${fileName}`);
            return olderRelease;
        },
        async whilePreparing(fileName, work) {
            calls.push(`preparing ${fileName}`);
            await preparing?.();
            return work(onProgress);
        },
        converted(fileName) {
            calls.push(`converted ${fileName}`);
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

async function open(
    filePath: string,
    {
        isNewFile = false,
        env = GATE_ON,
        dialogs = fakeDialogs().dialogs,
        hooks,
        convertWorker,
        onConnect,
        resume = true,
    }: {
        isNewFile?: boolean;
        env?: Record<string, string | undefined>;
        dialogs?: ConvertOnOpenDialogs;
        hooks?: ConvertOnOpenHooks;
        convertWorker?: { workerPath: string; test?: ConvertWorkerTestHooks };
        onConnect?: (db: DatabaseSync) => void;
        /** Resume the renderer's SQL right away, as setActiveDb does once the window reloaded. */
        resume?: boolean;
    } = {},
): Promise<OpenShowResult> {
    const result = await openShowFile(filePath, isNewFile, {
        migrationsFolder,
        env,
        dialogs: () => dialogs,
        hooks,
        convertWorker,
        onConnect,
    });
    result.db?.close();
    if (resume && result.sqlSuspension !== undefined)
        DatabaseServices.resumeSqlProxy(result.sqlSuspension);
    return result;
}

const sqlProxyWorks = () =>
    DatabaseServices.handleSqlProxy(null, "SELECT 1", [], "get").then(
        () => true,
        () => false,
    );

describe("opening a show with convert on open", () => {
    let tempDir: string;
    let showPath: string;

    beforeEach(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-open-"));
        showPath = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
        await createPageShow(showPath);
    });

    afterEach(() => {
        DatabaseServices.forceResumeSqlProxy();
        DatabaseServices.closePersistentConnection();
        DatabaseServices.setDbPath("", false);
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("gate off: opens as before, no dialogs, nothing converted", async () => {
        const { dialogs, calls } = fakeDialogs();
        const result = await open(showPath, { env: {}, dialogs });

        expect(result).toMatchObject({ status: 200 });
        expect(result.sqlSuspension).toBeUndefined();
        expect(calls).toEqual([]);
        expect(stateOf(showPath)).toMatchObject({
            userVersion: 7,
            timelines: 0,
        });
        expect(DatabaseServices.getDbPath()).toBe(showPath);
    });

    it("converts, says so, and holds the renderer's SQL off while it does", async () => {
        let sqlDuringConversion: boolean | undefined;
        const { dialogs, calls } = fakeDialogs({
            preparing: async () => {
                sqlDuringConversion = await sqlProxyWorks();
            },
        });

        const result = await open(showPath, { dialogs });

        expect(result.status).toBe(200);
        expect(result.sqlSuspension).toEqual(expect.any(Number));
        expect(sqlDuringConversion).toBe(false);
        expect(await sqlProxyWorks()).toBe(true);
        expect(calls).toEqual(["preparing show.dots", "converted show.dots"]);
        expect(stateOf(showPath)).toMatchObject({
            userVersion: 8,
            timelineMode: true,
        });
    });

    it("a failed backup stops the open with OPEN_STOPPED_STATUS and opens nothing", async () => {
        const { dialogs, calls } = fakeDialogs();
        const result = await open(showPath, {
            dialogs,
            hooks: {
                backup: () => ({
                    ok: false,
                    code: "file-busy",
                    message: "busy",
                }),
            },
        });

        expect(result.status).toBe(OPEN_STOPPED_STATUS);
        expect(result.db).toBeUndefined();
        expect(DatabaseServices.getDbPath()).toBe("");
        expect(calls).toEqual([
            "preparing show.dots",
            "backup failed show.dots",
        ]);
        expect(stateOf(showPath).userVersion).toBe(7);
    });

    it("a failed conversion stops the open, keeps the backup and leaves the file at 7", async () => {
        const { dialogs, calls } = fakeDialogs();
        const result = await open(showPath, {
            dialogs,
            hooks: {
                afterStep: (step) => {
                    if (step === "user-version") throw new Error("boom");
                },
            },
        });

        expect(result.status).toBe(OPEN_STOPPED_STATUS);
        expect(DatabaseServices.getDbPath()).toBe("");
        expect(calls).toEqual([
            "preparing show.dots",
            "conversion failed show.dots",
        ]);
        expect(stateOf(showPath)).toMatchObject({
            userVersion: 7,
            timelines: 0,
        });
        expect(backupsIn(tempDir)).toHaveLength(1);
    });

    it.each([
        ["stop", OPEN_STOPPED_STATUS],
        ["open", 200],
    ] as const)(
        "older release, the person chooses %s: status %i",
        async (choice, status) => {
            await open(showPath);
            withDb(showPath, (db) => db.exec("PRAGMA user_version = 7"));
            const { dialogs, calls } = fakeDialogs({ olderRelease: choice });

            const result = await open(showPath, { dialogs });

            expect(result.status).toBe(status);
            expect(calls).toEqual(["warn show.dots"]);
            expect(DatabaseServices.getDbPath()).toBe(
                choice === "open" ? showPath : "",
            );
            expect(stateOf(showPath).userVersion).toBe(7);
        },
    );

    it("two opens of the same file at once: converted once, both open quietly", async () => {
        const first = fakeDialogs();
        const second = fakeDialogs();

        const results = await Promise.all([
            open(showPath, { dialogs: first.dialogs }),
            open(showPath, { dialogs: second.dialogs }),
        ]);

        expect(results.map((r) => r.status)).toEqual([200, 200]);
        expect(first.calls).toEqual([
            "preparing show.dots",
            "converted show.dots",
        ]);
        expect(second.calls).toEqual([]);
        expect(backupsIn(tempDir)).toHaveLength(1);
        expect(stateOf(showPath)).toMatchObject({
            userVersion: 8,
            // One timeline per page move (pages 1 to 6)
            timelines: 6,
        });
        expect(DatabaseServices.getDbPath()).toBe(showPath);
    });

    it("a second file opened mid-conversion waits for the first", async () => {
        const otherPath = path.join(tempDir, "other.dots");
        await createPageShow(otherPath);
        let release!: () => void;
        const released = new Promise<void>((r) => (release = r));
        let entered!: () => void;
        const inConversion = new Promise<void>((r) => (entered = r));
        const first = fakeDialogs({
            preparing: async () => {
                entered();
                await released;
            },
        });

        const firstOpen = open(showPath, { dialogs: first.dialogs });
        await inConversion;
        const otherHashBefore = sha256(otherPath);
        const secondOpen = open(otherPath);
        // Give the second open every chance to start; it must not.
        await new Promise((r) => setTimeout(r, 50));

        expect(DatabaseServices.getDbPath()).toBe(showPath);
        expect(sha256(otherPath)).toBe(otherHashBefore);
        expect(await sqlProxyWorks()).toBe(false);

        release();
        const [a, b] = await Promise.all([firstOpen, secondOpen]);
        expect([a.status, b.status]).toEqual([200, 200]);
        expect(DatabaseServices.getDbPath()).toBe(otherPath);
        expect(stateOf(showPath).userVersion).toBe(8);
        expect(stateOf(otherPath).userVersion).toBe(8);
    });

    describe("the renderer's SQL", () => {
        it("only a suspension's own token lifts it", () => {
            const a = DatabaseServices.suspendSqlProxy("a");
            const b = DatabaseServices.suspendSqlProxy("b");
            expect(DatabaseServices.resumeSqlProxy(a)).toBe(false);
            expect(DatabaseServices.isSqlProxySuspended()).toBe(true);
            expect(DatabaseServices.resumeSqlProxy(b)).toBe(true);
            expect(DatabaseServices.isSqlProxySuspended()).toBe(false);
        });

        it("A's resume after its reload doesn't lift B's suspension while B is preparing", async () => {
            const otherPath = path.join(tempDir, "other.dots");
            await createPageShow(otherPath);

            // A opens and converts; setActiveDb arms the resume for after the reload.
            const a = await open(showPath, { resume: false });
            expect(a.status).toBe(200);
            const reloadA = new EventEmitter();
            const resumedA = resumeSqlProxyAfterReload(
                a.sqlSuspension!,
                reloadA as never,
            );

            // B opens (queued behind nothing now) and waits in its preparing state.
            let release!: () => void;
            const released = new Promise<void>((r) => (release = r));
            let entered!: () => void;
            const inPreparing = new Promise<void>((r) => (entered = r));
            const b = fakeDialogs({
                preparing: async () => {
                    entered();
                    await released;
                },
            });
            const openB = open(otherPath, {
                dialogs: b.dialogs,
                resume: false,
            });
            await inPreparing;

            // A's page finishes reloading now: its resume must leave B's suspension alone.
            reloadA.emit("did-navigate");
            await resumedA;
            expect(await sqlProxyWorks()).toBe(false);

            release();
            const resultB = await openB;
            expect(resultB.status).toBe(200);
            expect(await sqlProxyWorks()).toBe(false);
            const reloadB = new EventEmitter();
            const resumedB = resumeSqlProxyAfterReload(
                resultB.sqlSuspension!,
                reloadB as never,
            );
            reloadB.emit("did-navigate");
            await resumedB;
            expect(await sqlProxyWorks()).toBe(true);
            expect(stateOf(otherPath).userVersion).toBe(8);
        });

        it("resumes after the fallback when the reload never navigates, and at once without a window", async () => {
            const token = DatabaseServices.suspendSqlProxy("test");
            await resumeSqlProxyAfterReload(
                token,
                new EventEmitter() as never,
                20,
            );
            expect(DatabaseServices.isSqlProxySuspended()).toBe(false);

            const token2 = DatabaseServices.suspendSqlProxy("test");
            await resumeSqlProxyAfterReload(token2, null);
            expect(DatabaseServices.isSqlProxySuspended()).toBe(false);
        });

        it("a failed open lifts its own suspension", async () => {
            await expect(
                openShowFile(showPath, false, {
                    migrationsFolder: path.join(tempDir, "no-migrations-here"),
                    env: GATE_ON,
                    dialogs: () => fakeDialogs().dialogs,
                }),
            ).rejects.toThrow();
            expect(DatabaseServices.isSqlProxySuspended()).toBe(false);
        });
    });

    it("closes its connection when an open throws", async () => {
        let connection: DatabaseSync | undefined;
        await expect(
            openShowFile(showPath, false, {
                migrationsFolder: path.join(tempDir, "no-migrations-here"),
                env: GATE_ON,
                dialogs: () => fakeDialogs().dialogs,
                onConnect: (db) => (connection = db),
            }),
        ).rejects.toThrow();
        expect(connection).toBeDefined();
        expect(connection!.isOpen).toBe(false);
    });

    it("a second open of a file that is waiting on a dialog returns the first open's result", async () => {
        await open(showPath);
        withDb(showPath, (db) => db.exec("PRAGMA user_version = 7"));
        let answer!: (choice: "open" | "stop") => void;
        const answered = new Promise<"open" | "stop">((r) => (answer = r));
        let warnings = 0;
        const dialogs: ConvertOnOpenDialogs = {
            ...fakeDialogs().dialogs,
            warnOlderRelease: async () => {
                warnings++;
                return answered;
            },
        };
        const deps = {
            migrationsFolder,
            env: GATE_ON,
            dialogs: () => dialogs,
        };

        const first = openOnce(showPath, () =>
            openShowFile(showPath, false, deps),
        );
        const second = openOnce(path.join(tempDir, ".", "show.dots"), () =>
            openShowFile(showPath, false, deps),
        );
        expect(pendingOpenCount()).toBe(1);
        answer("stop");
        const [a, b] = await Promise.all([first, second]);

        expect(a).toBe(b);
        expect(a.status).toBe(OPEN_STOPPED_STATUS);
        expect(warnings).toBe(1);
        expect(pendingOpenCount()).toBe(0);
        if (a.sqlSuspension !== undefined)
            DatabaseServices.resumeSqlProxy(a.sqlSuspension);
    });

    describe("new files", () => {
        it("gate on: created converted, with no backup and no dialogs", async () => {
            const newPath = path.join(tempDir, "new.dots");
            const { dialogs, calls } = fakeDialogs();

            const result = await open(newPath, { isNewFile: true, dialogs });

            expect(result).toMatchObject({ status: 200 });
            expect(result.sqlSuspension).toBeUndefined();
            expect(calls).toEqual([]);
            expect(backupsIn(tempDir)).toEqual([]);
            const state = stateOf(newPath);
            expect(state).toMatchObject({
                userVersion: 8,
                timelineMode: true,
                timelines: 0,
            });
            expect(JSON.parse(state.settingsJson!)).toMatchObject({
                defaultTempo: 120,
            });

            // Opening it again changes nothing.
            const again = fakeDialogs();
            expect(
                (await open(newPath, { dialogs: again.dialogs })).status,
            ).toBe(200);
            expect(again.calls).toEqual([]);
        });

        it("gate off: created at 7 in page mode, as before", async () => {
            const newPath = path.join(tempDir, "new.dots");

            const result = await open(newPath, { isNewFile: true, env: {} });

            expect(result.status).toBe(200);
            expect(stateOf(newPath)).toMatchObject({
                userVersion: 7,
                timelineMode: undefined,
            });
        });
    });

    describe("through the worker (P9.8)", () => {
        let worker: BuiltConvertWorker;
        beforeAll(async () => {
            worker = await buildConvertWorker();
        }, 120_000);
        afterAll(() => worker?.remove());

        it("converts with its connection closed, reopens it, and reports progress", async () => {
            const connections: DatabaseSync[] = [];
            const progress: ConvertProgress[] = [];
            const openWhileConverting: boolean[] = [];
            let sqlDuringConversion: boolean | undefined;
            const { dialogs, calls } = fakeDialogs({
                preparing: async () => {
                    sqlDuringConversion = await sqlProxyWorks();
                },
                onProgress: (p) => {
                    progress.push(p);
                    openWhileConverting.push(
                        connections.some((db) => db.isOpen),
                    );
                },
            });

            const result = await openShowFile(showPath, false, {
                migrationsFolder,
                env: GATE_ON,
                dialogs: () => dialogs,
                convertWorker: { workerPath: worker.workerPath },
                onConnect: (db) => connections.push(db),
            });

            try {
                expect(result.status).toBe(200);
                expect(calls).toEqual([
                    "preparing show.dots",
                    "converted show.dots",
                ]);
                // The worker had the file to itself; the open then reconnected.
                expect(openWhileConverting.length).toBeGreaterThan(1);
                expect(openWhileConverting.every((open) => !open)).toBe(true);
                expect(connections).toHaveLength(2);
                expect(connections[0]!.isOpen).toBe(false);
                expect(result.db).toBe(connections[1]);
                expect(result.db!.prepare("PRAGMA user_version").get()).toEqual(
                    { user_version: 8 },
                );
                expect(progress[0]).toEqual({ phase: "backup" });
                expect(progress.at(-1)).toEqual({
                    phase: "convert",
                    pagesDone: 6,
                    pagesTotal: 6,
                });
                // The renderer's SQL stayed suspended until the window reloads.
                expect(sqlDuringConversion).toBe(false);
                expect(await sqlProxyWorks()).toBe(false);
            } finally {
                result.db?.close();
                DatabaseServices.resumeSqlProxy(result.sqlSuspension!);
            }
            expect(await sqlProxyWorks()).toBe(true);
            expect(DatabaseServices.getDbPath()).toBe(showPath);
        });

        it("a worker crash stops the open, leaves the file at 7 and keeps the backup", async () => {
            const before = stateOf(showPath);
            const { dialogs, calls } = fakeDialogs();

            const result = await open(showPath, {
                dialogs,
                convertWorker: {
                    workerPath: worker.workerPath,
                    test: { crashAfterStep: "convert" },
                },
            });

            expect(result.status).toBe(OPEN_STOPPED_STATUS);
            expect(result.db).toBeUndefined();
            expect(DatabaseServices.getDbPath()).toBe("");
            expect(calls).toEqual([
                "preparing show.dots",
                "conversion failed show.dots",
            ]);
            expect(stateOf(showPath)).toEqual(before);
            expect(backupsIn(tempDir)).toHaveLength(1);
        });

        it("a close during the worker's conversion waits for the open, which reopens its own file", async () => {
            const order: string[] = [];
            let close: Promise<void> | undefined;
            const { dialogs } = fakeDialogs({
                onProgress: (p) => {
                    if (p.phase !== "convert" || close) return;
                    order.push("converting");
                    // What "Close File" does (closeCurrentFile): it waits for the open lock.
                    close = withOpenLock(async () => {
                        order.push("close");
                        DatabaseServices.setDbPath("", false);
                    });
                },
            });

            const result = await openShowFile(showPath, false, {
                migrationsFolder,
                env: GATE_ON,
                dialogs: () => dialogs,
                convertWorker: {
                    workerPath: worker.workerPath,
                    test: { blockPerPageMs: 50 },
                },
            });
            order.push("opened");
            try {
                expect(result.status).toBe(200);
                expect(result.db!.prepare("PRAGMA user_version").get()).toEqual(
                    { user_version: 8 },
                );
            } finally {
                result.db?.close();
                DatabaseServices.resumeSqlProxy(result.sqlSuspension!);
            }
            await close;
            expect(order).toEqual(["converting", "opened", "close"]);
            expect(DatabaseServices.getDbPath()).toBe("");
        });

        it("reopens its own file even when the active path changed mid-conversion", async () => {
            let changed = false;
            const { dialogs, calls } = fakeDialogs({
                onProgress: (p) => {
                    if (p.phase !== "convert" || changed) return;
                    changed = true;
                    // A path change that doesn't wait for the lock.
                    DatabaseServices.setDbPath("", false);
                },
            });

            const result = await openShowFile(showPath, false, {
                migrationsFolder,
                env: GATE_ON,
                dialogs: () => dialogs,
                convertWorker: { workerPath: worker.workerPath },
            });
            try {
                expect(changed).toBe(true);
                expect(result.status).toBe(200);
                expect(calls).toEqual([
                    "preparing show.dots",
                    "converted show.dots",
                ]);
                expect(result.db!.prepare("PRAGMA user_version").get()).toEqual(
                    { user_version: 8 },
                );
                expect(result.db!.prepare("PRAGMA busy_timeout").get()).toEqual(
                    { timeout: 5000 },
                );
            } finally {
                result.db?.close();
                DatabaseServices.resumeSqlProxy(result.sqlSuspension!);
            }
        });

        it("a second file opened while the worker converts waits for it", async () => {
            const otherPath = path.join(tempDir, "other.dots");
            await createPageShow(otherPath);
            const order: string[] = [];
            const first = open(showPath, {
                dialogs: fakeDialogs({
                    onProgress: (p) => {
                        if (p.phase === "convert" && p.pagesDone === 1)
                            order.push("first converting");
                    },
                }).dialogs,
                convertWorker: {
                    workerPath: worker.workerPath,
                    test: { blockPerPageMs: 100 },
                },
            }).then((r) => {
                order.push("first done");
                return r;
            });
            const second = open(otherPath, {
                dialogs: fakeDialogs({
                    preparing: async () => {
                        order.push("second preparing");
                    },
                }).dialogs,
                convertWorker: { workerPath: worker.workerPath },
            });

            const results = await Promise.all([first, second]);

            expect(results.map((r) => r.status)).toEqual([200, 200]);
            expect(order).toEqual([
                "first converting",
                "first done",
                "second preparing",
            ]);
            expect(stateOf(showPath).userVersion).toBe(8);
            expect(stateOf(otherPath).userVersion).toBe(8);
            expect(DatabaseServices.getDbPath()).toBe(otherPath);
        });
    });
});
