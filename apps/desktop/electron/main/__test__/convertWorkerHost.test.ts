// @vitest-environment node
/**
 * The convert-on-open worker (P9.8): its bundle, crashes, the main event loop
 * during a long conversion, and quitting. The worker is built with Vite as the
 * app build does. The P9.3 outcomes through the worker are in
 * `electron/database/__test__/convertOnOpen.test.ts`.
 */
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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
import {
    CONVERSION_STEPS,
    type ConvertProgress,
} from "@om-electron/database/convertOnOpenProtocol";
import {
    backupsIn,
    createLargePageShow,
    createPageShow,
    stateOf,
} from "@om-electron/database/__test__/convertOnOpenFixtures";
import {
    buildConvertWorker,
    type BuiltConvertWorker,
} from "@om-electron/database/__test__/buildConvertWorker";
import {
    committedConversion,
    conversionWorkersStopped,
    convertInWorker,
    runningConversionWorkers,
    stopConversionWorkersOnQuit,
    type ConvertInWorkerOptions,
} from "../convertWorkerHost";

let worker: BuiltConvertWorker;

beforeAll(async () => {
    worker = await buildConvertWorker();
}, 120_000);

afterAll(() => worker?.remove());

/** Modules that must never be in the worker's bundle. */
const RENDERER_ONLY = [
    /\/src\/global\/database\//,
    /\/src\/App\.tsx$/,
    /\/src\/stores\//,
    /\/src\/hooks\//,
    /\/src\/components\//,
    /\/src\/db-functions\/history\.ts$/,
    /\/src\/db-functions\/timelineDisplay\.ts$/,
    /\/src\/utilities\/utils\.ts$/,
    /\/electron\/database\/database\.services\.ts$/,
    /\/electron\/main\//,
];
const RENDERER_PACKAGES = [
    "react",
    "react-dom",
    "zustand",
    "sonner",
    "electron",
    "@tanstack/react-query",
];

describe("the worker bundle", () => {
    it("loads no Electron or renderer module", () => {
        expect(
            worker.moduleIds.filter((id) =>
                RENDERER_ONLY.some((pattern) => pattern.test(id)),
            ),
        ).toEqual([]);
        expect(
            worker.imports.filter((id) => RENDERER_PACKAGES.includes(id)),
        ).toEqual([]);
        // The check sees the converter at all.
        expect(
            worker.moduleIds.some((id) =>
                /\/src\/timeline\/convert\/convertPagesInTransaction\.ts$/.test(
                    id,
                ),
            ),
        ).toBe(true);
    });
});

describe("the conversion worker", () => {
    let tempDir: string;
    let showPath: string;

    beforeEach(async () => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openmarch-worker-"));
        showPath = path.join(tempDir, "show.dots");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
        await createPageShow(showPath);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    const options = (
        extra: Partial<ConvertInWorkerOptions> = {},
    ): ConvertInWorkerOptions => ({
        workerPath: worker.workerPath,
        busyTimeoutMs: 5000,
        ...extra,
    });

    /** A write from a new connection succeeds: no lock or hot journal is left behind. */
    const assertWritable = (filePath: string) => {
        const db = new DatabaseSync(filePath);
        try {
            db.exec("PRAGMA busy_timeout = 0");
            db.exec("BEGIN IMMEDIATE");
            db.exec("ROLLBACK");
        } finally {
            db.close();
        }
    };

    it.each(CONVERSION_STEPS)(
        "rolls back completely when the worker crashes after %s, and keeps the backup",
        async (step) => {
            const before = stateOf(showPath);

            const result = await convertInWorker(
                showPath,
                options({ test: { crashAfterStep: step } }),
            );

            if (result.status !== "conversion-failed")
                throw new Error(
                    `expected a failed conversion: ${result.status}`,
                );
            expect(result.error.message).toMatch(/stopped before it finished/);
            expect(stateOf(result.backupPath)).toEqual(before);
            expect(fs.existsSync(`${showPath}-journal`)).toBe(false);
            expect(stateOf(showPath)).toEqual(before);
            assertWritable(showPath);
            expect(runningConversionWorkers()).toBe(0);

            // The next open converts it.
            const retry = await convertInWorker(showPath, options());
            expect(retry.status).toBe("converted");
            expect(stateOf(showPath).userVersion).toBe(8);
            expect(backupsIn(tempDir)).toHaveLength(2);
        },
    );

    it("a crash after COMMIT, before the result is posted: classified from the file as converted", async () => {
        const result = await convertInWorker(
            showPath,
            options({ test: { crashAfterCommit: true } }),
        );

        expect(result).toMatchObject({
            status: "converted",
            report: undefined,
        });
        if (result.status === "converted")
            expect(fs.existsSync(result.backupPath)).toBe(true);
        expect(stateOf(showPath)).toMatchObject({
            userVersion: 8,
            timelineMode: true,
        });
    });

    it("a file converted by someone else (another marker) is not taken as this open's commit", async () => {
        const first = await convertInWorker(showPath, options());
        expect(first.status).toBe("converted");
        expect(committedConversion(showPath, "2000-01-01T00:00:00.000Z")).toBe(
            false,
        );
        expect(
            committedConversion(path.join(tempDir, "missing.dots"), "x"),
        ).toBe(false);
    });

    it("a crash after the backup and before the transaction: failed, file unchanged, backup kept", async () => {
        const before = stateOf(showPath);

        const result = await convertInWorker(
            showPath,
            options({ test: { crashAfterBackup: true } }),
        );

        expect(result).toMatchObject({ status: "conversion-failed" });
        expect(stateOf(showPath)).toEqual(before);
        expect(backupsIn(tempDir)).toHaveLength(1);
    });

    it("a worker that can't open the file: a failed backup, nothing written", async () => {
        const result = await convertInWorker(tempDir, options());

        expect(result).toMatchObject({
            status: "backup-failed",
            backup: { ok: false, code: "unknown" },
        });
        expect(backupsIn(tempDir)).toEqual([]);
    });

    it("a worker that doesn't start: a failed backup", async () => {
        const before = stateOf(showPath);

        const result = await convertInWorker(
            showPath,
            options({ workerPath: path.join(tempDir, "missing.cjs") }),
        );

        expect(result).toMatchObject({ status: "backup-failed" });
        expect(stateOf(showPath)).toEqual(before);
    });

    it("keeps the main event loop running during a long conversion", async () => {
        const large = path.join(tempDir, "large.dots");
        await createLargePageShow(large, { marchers: 200, pages: 40 });
        const progress: ConvertProgress[] = [];

        // A timer on this thread, as the main process's window and IPC handling would run.
        let ticks = 0;
        let longestGap = 0;
        let last = performance.now();
        const timer = setInterval(() => {
            const now = performance.now();
            longestGap = Math.max(longestGap, now - last);
            last = now;
            ticks++;
        }, 10);
        const started = performance.now();
        let result;
        try {
            result = await convertInWorker(
                large,
                options({
                    onProgress: (p) => progress.push(p),
                    // At least 40 × 30 ms of work on the worker's thread.
                    test: { blockPerPageMs: 30 },
                }),
            );
        } finally {
            clearInterval(timer);
        }
        const elapsed = performance.now() - started;

        expect(result.status).toBe("converted");
        expect(elapsed).toBeGreaterThan(1200);
        // The timer kept firing the whole time. Both checks are relative to the conversion's
        // length, so a loaded machine (slow timers) still passes, while a blocked event loop
        // (one gap about as long as the conversion, a tick or two) fails.
        expect(ticks).toBeGreaterThan(elapsed / 10 / 10);
        expect(longestGap).toBeLessThan(elapsed / 2);
        expect(progress[0]).toEqual({ phase: "backup" });
        expect(progress.at(-1)).toEqual({
            phase: "convert",
            pagesDone: 40,
            pagesTotal: 40,
        });
        expect(stateOf(large).assignments).toBe(200 * 40);
    }, 60_000);

    it("on quit, stops the worker mid-conversion, rolls back, then quits", async () => {
        const app = Object.assign(new EventEmitter(), { quit: vi.fn() });
        stopConversionWorkersOnQuit(app);
        const before = stateOf(showPath);

        let inside!: () => void;
        const converting = new Promise<void>((resolve) => (inside = resolve));
        const result = convertInWorker(
            showPath,
            options({
                onProgress: (p) => {
                    if (p.phase === "convert") inside();
                },
                // 6 pages × 2 s: still converting when the app quits.
                test: { blockPerPageMs: 2000 },
            }),
        );
        await converting;
        expect(runningConversionWorkers()).toBe(1);

        const preventDefault = vi.fn();
        app.emit("before-quit", { preventDefault });
        expect(preventDefault).toHaveBeenCalledOnce();
        expect(conversionWorkersStopped()).toBe(true);

        const outcome = await result;
        expect(outcome).toMatchObject({ status: "conversion-failed" });
        if (outcome.status === "conversion-failed")
            expect(outcome.error.message).toContain("the app quit");
        await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce());
        expect(runningConversionWorkers()).toBe(0);
        expect(stateOf(showPath)).toEqual(before);
        assertWritable(showPath);

        // Quitting again, with no worker running, isn't held up.
        const again = vi.fn();
        app.emit("before-quit", { preventDefault: again });
        expect(again).not.toHaveBeenCalled();

        // The quit was cancelled after all: the next conversion reports normally.
        const next = await convertInWorker(showPath, options());
        expect(conversionWorkersStopped()).toBe(false);
        expect(next.status).toBe("converted");
    }, 30_000);
});
