import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
    MANIFEST_FILE_NAME,
    WORKING_FILE_NAME,
    type PublishMetrics,
    type WorkingCopyOptions,
    type WorkingCopyStatus,
    WorkingCopySession,
    WorkingCopyStorageError,
    findRecoverableFor,
    removeStaleTempFiles,
    scanWorkingCopies,
} from "../WorkingCopySession";

const errno = (code: string) =>
    Object.assign(new Error(`${code}: resource busy or locked`), { code });

/** Anything beside a show other than the show: temp files and SQLite sidecars. */
function strayFilesBeside(showPath: string): string[] {
    const name = basename(showPath);
    return fs.readdirSync(dirname(showPath)).filter((file) => file !== name);
}

function readValues(dbPath: string): string[] {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
        return (
            db.prepare("SELECT value FROM notes ORDER BY id").all() as {
                value: string;
            }[]
        ).map((row) => row.value);
    } finally {
        db.close();
    }
}

/** An edit the way the app makes one: a commit on another connection. */
function edit(session: WorkingCopySession, value: string, notify = true) {
    const db = new DatabaseSync(session.workingPath);
    try {
        db.prepare("INSERT INTO notes (value) VALUES (?)").run(value);
    } finally {
        db.close();
    }
    if (notify) session.noteActivity();
}

/** A sync app putting another version of the show in place: a new file renamed over it. */
function replaceShow(showPath: string, values: string[]) {
    const incoming = join(dirname(showPath), "incoming.tmp");
    const db = new DatabaseSync(incoming);
    db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
    for (const value of values)
        db.prepare("INSERT INTO notes (value) VALUES (?)").run(value);
    db.close();
    fs.renameSync(incoming, showPath);
}

function readManifestOf(session: WorkingCopySession) {
    return JSON.parse(
        fs.readFileSync(join(session.directory, MANIFEST_FILE_NAME), "utf8"),
    );
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000) {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs)
            throw new Error("Timed out waiting for the condition");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

describe("WorkingCopySession", () => {
    let root: string;
    let showDir: string;
    let showPath: string;
    let workingRoot: string;
    let statuses: WorkingCopyStatus[];
    let published: PublishMetrics[];
    let sessions: WorkingCopySession[];

    const options = (
        extra: Partial<WorkingCopyOptions> = {},
    ): WorkingCopyOptions => ({
        workingRoot,
        // Long timers: tests publish with flush() unless they test the timing.
        debounceMs: 60_000,
        maxWaitMs: 60_000,
        pollMs: 60_000,
        onStatus: (status) => statuses.push(status),
        onPublish: (event) => {
            if (event.ok) published.push(event.metrics);
        },
        ...extra,
    });

    async function openStarted(extra: Partial<WorkingCopyOptions> = {}) {
        const { session, staleTempFiles } = await WorkingCopySession.open(
            showPath,
            options(extra),
        );
        sessions.push(session);
        await session.start();
        return { session, staleTempFiles };
    }

    beforeEach(() => {
        root = fs.mkdtempSync(join(tmpdir(), "openmarch-wc-"));
        showDir = join(root, "OneDrive", "Band");
        fs.mkdirSync(showDir, { recursive: true });
        workingRoot = join(root, "userData", "working-copies");
        showPath = join(showDir, "Show.dots");
        const db = new DatabaseSync(showPath);
        db.exec(
            "CREATE TABLE notes (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
        );
        db.prepare("INSERT INTO notes (value) VALUES ('first')").run();
        db.close();
        statuses = [];
        published = [];
        sessions = [];
    });

    afterEach(async () => {
        for (const session of sessions) await session.close({ discard: true });
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("edits a WAL copy in user data and leaves the show untouched until it publishes", async () => {
        const before = fs.readFileSync(showPath);
        const { session } = await openStarted();

        expect(session.workingPath.startsWith(workingRoot)).toBe(true);
        edit(session, "second");

        expect(fs.readFileSync(showPath).equals(before)).toBe(true);
        expect(strayFilesBeside(showPath)).toEqual([]);
        expect(session.status().state).toBe("unsaved");

        const outcome = await session.flush("test");

        expect(outcome.ok).toBe(true);
        expect(readValues(showPath)).toEqual(["first", "second"]);
        // Only the finished file ever went beside the show, and it's gone now.
        expect(strayFilesBeside(showPath)).toEqual([]);
        expect(session.status().state).toBe("saved");
        // The published show is a plain rollback-journal file, not WAL.
        const header = fs.readFileSync(showPath).subarray(18, 20);
        expect([...header]).toEqual([1, 1]);
    });

    it("deletes temp files a crashed publish left beside the show, whatever their age", async () => {
        const fresh = join(showDir, ".~Show.dots.0a1b2c3d.tmp");
        const journal = join(showDir, ".~Show.dots.0a1b2c3d.tmp-journal");
        const other = join(showDir, ".~Other.dots.0a1b2c3d.tmp");
        for (const file of [fresh, journal, other]) fs.writeFileSync(file, "x");

        const { staleTempFiles } = await openStarted();

        expect(staleTempFiles).toBe(2);
        expect(fs.existsSync(fresh)).toBe(false);
        expect(fs.existsSync(journal)).toBe(false);
        expect(fs.existsSync(other)).toBe(true);
    });

    it("reads the show's bytes only when its stat changed", async () => {
        const { session } = await openStarted();
        edit(session, "a");
        await session.flush("test");
        edit(session, "b");
        await session.flush("test");
        expect(published.map((m) => m.hashedShow)).toEqual([false, false]);

        // Touched, same bytes: hashed, and not a conflict.
        const now = new Date(Date.now() + 5000);
        fs.utimesSync(showPath, now, now);
        edit(session, "c");
        const outcome = await session.flush("test");

        expect(outcome.ok).toBe(true);
        expect(published[2].hashedShow).toBe(true);
        expect(readValues(showPath)).toEqual(["first", "a", "b", "c"]);
    });

    it("tells a touch from a change using the hash taken in the background at open", async () => {
        const { session } = await openStarted();
        // Let the open-time hash finish.
        await session.flush("settle", true);
        const now = new Date(Date.now() + 5000);
        fs.utimesSync(showPath, now, now);
        edit(session, "mine");

        expect((await session.flush("test")).ok).toBe(true);
    });

    it("pauses instead of overwriting a show another program changed", async () => {
        const { session } = await openStarted();
        const other = new DatabaseSync(showPath);
        other.prepare("INSERT INTO notes (value) VALUES ('theirs')").run();
        other.close();
        edit(session, "mine");

        const outcome = await session.flush("test");

        expect(outcome).toMatchObject({ ok: false, state: "conflict" });
        expect(readValues(showPath)).toEqual(["first", "theirs"]);
        expect(strayFilesBeside(showPath)).toEqual([]);

        expect((await session.overwriteShow()).ok).toBe(true);
        expect(readValues(showPath)).toEqual(["first", "mine"]);
    });

    it("reports a missing show as a conflict", async () => {
        const { session } = await openStarted();
        fs.rmSync(showPath);
        edit(session, "mine");

        const outcome = await session.flush("test");

        expect(outcome).toMatchObject({ ok: false, state: "conflict" });
        expect(session.status().conflict?.reason).toBe("missing");
    });

    it("retries a blocked publish within seconds and cleans up its temp file", async () => {
        let blocked = true;
        const { session } = await openStarted({
            platform: "win32",
            renameOptions: {
                budgetMs: 0,
                rename: async (from, to) => {
                    if (blocked) throw errno("EBUSY");
                    await fs.promises.rename(from, to);
                },
            },
            retryDelaysMs: [50, 100],
        });
        edit(session, "mine");

        const started = Date.now();
        const outcome = await session.flush("test");

        expect(outcome).toMatchObject({ ok: false, state: "deferred" });
        const status = session.status();
        expect(status.errorCode).toBe("EBUSY");
        expect(status.retryAt! - started).toBeLessThan(1000);
        expect(strayFilesBeside(showPath)).toEqual([]);

        blocked = false;
        await waitFor(() => session.status().state === "saved");
        expect(readValues(showPath)).toEqual(["first", "mine"]);
        expect(published.at(-1)?.deferralsBefore).toBe(1);
    });

    it("uses the default retry delays of 2, 4, 8, 15 and 30 s", async () => {
        const { DEFAULT_TIMING } = await import("../WorkingCopySession");
        expect(DEFAULT_TIMING.retryDelaysMs).toEqual([
            2000, 4000, 8000, 15000, 30000,
        ]);
        expect(DEFAULT_TIMING.debounceMs).toBe(15_000);
        expect(DEFAULT_TIMING.maxWaitMs).toBe(30_000);
    });

    it("publishes once a burst of edits goes quiet, and notices commits nobody reported", async () => {
        const { session } = await openStarted({ debounceMs: 80, pollMs: 20 });
        for (const value of ["a", "b", "c"]) edit(session, value, false);

        await waitFor(() => published.length === 1);
        expect(published[0].reason).toBe("idle");
        expect(readValues(showPath)).toEqual(["first", "a", "b", "c"]);
    });

    it("publishes at the maximum wait while edits keep coming", async () => {
        const { session } = await openStarted({
            debounceMs: 200,
            maxWaitMs: 100,
        });
        edit(session, "a");
        await new Promise((resolve) => setTimeout(resolve, 60));
        edit(session, "b");

        await waitFor(() => published.length === 1);
        expect(published[0].reason).toBe("max-wait");
    });

    it("keeps a read-only show and offers nothing over it", async () => {
        const { session } = await openStarted();
        fs.chmodSync(showPath, 0o444);
        edit(session, "mine");

        const outcome = await session.flush("test");
        fs.chmodSync(showPath, 0o644);

        if (process.getuid?.() === 0) return; // root can write anyway
        expect(outcome).toMatchObject({ ok: false, state: "readOnly" });
        expect(readValues(showPath)).toEqual(["first"]);
    });

    it("publishes by itself once a read-only show is writable again", async () => {
        if (process.getuid?.() === 0) return; // root can write anyway
        const { session } = await openStarted({ retryDelaysMs: [50] });
        fs.chmodSync(showPath, 0o444);
        edit(session, "mine");
        expect(await session.flush("test")).toMatchObject({
            state: "readOnly",
        });

        fs.chmodSync(showPath, 0o644);

        await waitFor(() => session.status().state === "saved");
        expect(readValues(showPath)).toEqual(["first", "mine"]);
    });

    it("publishes to a new path after Save As", async () => {
        const { session } = await openStarted();
        edit(session, "mine");
        const copy = join(showDir, "Copy.dots");

        expect((await session.retarget(copy)).ok).toBe(true);

        expect(readValues(copy)).toEqual(["first", "mine"]);
        expect(readValues(showPath)).toEqual(["first"]);
        expect(session.showPath).toBe(copy);
    });

    it("keeps unpublished changes for recovery and recovers them", async () => {
        const { session } = await openStarted();
        edit(session, "unsaved");
        const { keptForRecovery } = await session.close();
        expect(keptForRecovery).toBe(true);

        const entries = scanWorkingCopies(workingRoot);
        expect(entries).toHaveLength(1);
        const entry = findRecoverableFor(entries, showPath);
        expect(entry?.manifest.showPath).toBe(showPath);

        const resumed = WorkingCopySession.resume(entry!, options());
        sessions.push(resumed);
        await resumed.start();
        expect(resumed.hasUnsavedChanges).toBe(true);

        expect((await resumed.flush("recover")).ok).toBe(true);
        expect(readValues(showPath)).toEqual(["first", "unsaved"]);
        await resumed.close();
        expect(scanWorkingCopies(workingRoot)).toEqual([]);
    });

    it("says when OpenMarch's own folder can't hold a working copy", async () => {
        // The folder for working copies can't be made: a file is in the way
        const blocked = join(root, "blocked");
        fs.writeFileSync(blocked, "");

        await expect(
            WorkingCopySession.open(showPath, {
                ...options(),
                workingRoot: blocked,
            }),
        ).rejects.toBeInstanceOf(WorkingCopyStorageError);
    });

    it("finds a show's working copy however its path is spelled", async () => {
        const { session } = await openStarted();
        edit(session, "unsaved");
        await session.close();
        // Another spelling of the same file: through a symbolic link to its folder
        const link = join(root, "linked");
        fs.symlinkSync(showDir, link, "dir");

        const entry = findRecoverableFor(
            scanWorkingCopies(workingRoot),
            join(link, basename(showPath)),
        );
        expect(entry?.manifest.showPath).toBe(showPath);
    });

    it("records unsaved changes once a failed manifest write can go through", async () => {
        const { session } = await openStarted();
        const manifestPath = join(session.directory, MANIFEST_FILE_NAME);
        // Something holds the manifest: renaming over a folder fails
        fs.rmSync(manifestPath);
        fs.mkdirSync(join(manifestPath, "held"), { recursive: true });
        edit(session, "first edit");
        fs.rmSync(manifestPath, { recursive: true });

        edit(session, "second edit");

        const onDisk = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        expect(onDisk.unsaved).toBe(true);
    });

    it.skipIf(process.platform === "win32")(
        "doesn't rename over the show when its pending identity can't be recorded",
        async () => {
            let blockManifest = false;
            let manifestPath = "";
            const { session } = await openStarted({
                platform: "darwin",
                retryDelaysMs: [60_000],
                // Copying Finder metadata is the first step before the rename: hold the
                // manifest there (renaming over a folder fails), so the write that records the
                // file about to be renamed fails, as Defender or an indexer holding it would.
                exec: async () => {
                    if (
                        blockManifest &&
                        !fs.existsSync(join(manifestPath, "held"))
                    ) {
                        fs.rmSync(manifestPath);
                        fs.mkdirSync(join(manifestPath, "held"), {
                            recursive: true,
                        });
                    }
                    return { stdout: "", stderr: "" };
                },
            });
            manifestPath = join(session.directory, MANIFEST_FILE_NAME);
            edit(session, "mine");
            blockManifest = true;
            const outcome = await session.flush("test");
            blockManifest = false;
            fs.rmSync(manifestPath, { recursive: true });

            expect(outcome).toMatchObject({ ok: false, state: "deferred" });
            expect(readValues(showPath)).toEqual(["first"]);
            expect(strayFilesBeside(showPath)).toEqual([]);

            expect(await session.flush("retry")).toMatchObject({ ok: true });
            expect(readValues(showPath)).toEqual(["first", "mine"]);
            expect(readManifestOf(session).pendingIdentity).toBeNull();
        },
    );

    it("recovers a working copy whose process died without closing it", async () => {
        const { session } = await openStarted();
        edit(session, "crash");
        // A crash: nothing closes the session. Copy its folder as the next launch finds it.
        const crashedRoot = join(root, "crashed");
        fs.cpSync(session.directory, join(crashedRoot, session.id), {
            recursive: true,
        });

        const [entry] = scanWorkingCopies(crashedRoot);
        const resumed = WorkingCopySession.resume(entry, {
            ...options(),
            workingRoot: crashedRoot,
        });
        sessions.push(resumed);
        await resumed.start();
        await resumed.flush("recover");

        expect(readValues(showPath)).toEqual(["first", "crash"]);
    });

    it("deletes the working folder on a clean close and leaves only the show", async () => {
        const { session } = await openStarted();
        edit(session, "mine");
        await session.flush("close");
        const { keptForRecovery } = await session.close();

        expect(keptForRecovery).toBe(false);
        expect(fs.existsSync(session.directory)).toBe(false);
        expect(fs.readdirSync(showDir)).toEqual(["Show.dots"]);
    });

    it("checks the show again before each blocked rename retry, and stops when a sync app replaced it", async () => {
        let renames = 0;
        const { session } = await openStarted({
            platform: "win32",
            renameOptions: {
                sleep: async () => {},
                rename: async (from, to) => {
                    renames++;
                    if (renames === 1) {
                        // The sync app finishes downloading a newer version while it holds the
                        // show.
                        replaceShow(showPath, ["first", "from the cloud"]);
                        throw errno("EBUSY");
                    }
                    await fs.promises.rename(from, to);
                },
            },
        });
        edit(session, "mine");

        const outcome = await session.flush("test");

        expect(outcome).toMatchObject({ ok: false, state: "conflict" });
        expect(readValues(showPath)).toEqual(["first", "from the cloud"]);
        expect(strayFilesBeside(showPath)).toEqual([]);
    });

    it("keeps my version only over the show the person saw, not one that changed after", async () => {
        let blocked = false;
        const { session } = await openStarted({
            platform: "win32",
            retryDelaysMs: [60_000],
            renameOptions: {
                budgetMs: 0,
                rename: async (from, to) => {
                    if (blocked) throw errno("EBUSY");
                    await fs.promises.rename(from, to);
                },
            },
        });
        replaceShow(showPath, ["first", "theirs"]);
        edit(session, "mine");
        expect(await session.flush("test")).toMatchObject({
            state: "conflict",
        });

        // "Keep my version", but the publish is held up...
        blocked = true;
        expect(await session.overwriteShow()).toMatchObject({
            state: "deferred",
        });
        // ...and meanwhile another version arrives.
        replaceShow(showPath, ["first", "theirs, again"]);
        blocked = false;

        expect(await session.flush("retry", true)).toMatchObject({
            state: "conflict",
        });
        expect(readValues(showPath)).toEqual(["first", "theirs, again"]);

        expect((await session.overwriteShow()).ok).toBe(true);
        expect(readValues(showPath)).toEqual(["first", "mine"]);
    });

    it("records the file it renamed, not one a sync app swapped in right after", async () => {
        let swapAfterRename = true;
        const { session } = await openStarted({
            renameOptions: {
                rename: async (from, to) => {
                    await fs.promises.rename(from, to);
                    if (swapAfterRename) {
                        swapAfterRename = false;
                        replaceShow(showPath, ["first", "theirs"]);
                    }
                },
            },
        });
        edit(session, "mine");
        expect((await session.flush("test")).ok).toBe(true);

        edit(session, "more");
        const outcome = await session.flush("test");

        expect(outcome).toMatchObject({ ok: false, state: "conflict" });
        expect(readValues(showPath)).toEqual(["first", "theirs"]);
    });

    it("knows its own rename when the publish failed right after it", async () => {
        let failAfterRename = true;
        const { session } = await openStarted({
            retryDelaysMs: [60_000],
            renameOptions: {
                rename: async (from, to) => {
                    await fs.promises.rename(from, to);
                    if (failAfterRename) {
                        failAfterRename = false;
                        // As a folder flush that fails, or a crash, right after the rename.
                        throw errno("EIO");
                    }
                },
            },
        });
        edit(session, "mine");
        expect(await session.flush("test")).toMatchObject({
            state: "deferred",
        });
        expect(readValues(showPath)).toEqual(["first", "mine"]);
        expect(readManifestOf(session).pendingIdentity).not.toBeNull();

        // The same session publishes again without a conflict...
        edit(session, "more");
        expect((await session.flush("test")).ok).toBe(true);
        expect(readValues(showPath)).toEqual(["first", "mine", "more"]);
        expect(readManifestOf(session).pendingIdentity).toBeNull();
    });

    it("recovers a copy whose last rename went through but wasn't recorded", async () => {
        const { session } = await openStarted({
            retryDelaysMs: [60_000],
            renameOptions: {
                rename: async (from, to) => {
                    await fs.promises.rename(from, to);
                    throw errno("EIO");
                },
            },
        });
        edit(session, "mine");
        await session.flush("test");
        // A crash now: copy the folder as the next launch finds it.
        const crashedRoot = join(root, "crashed");
        fs.cpSync(session.directory, join(crashedRoot, session.id), {
            recursive: true,
        });

        const [entry] = scanWorkingCopies(crashedRoot);
        const resumed = WorkingCopySession.resume(entry, {
            ...options(),
            workingRoot: crashedRoot,
        });
        sessions.push(resumed);
        await resumed.start();

        expect((await resumed.flush("recover")).ok).toBe(true);
        expect(readValues(showPath)).toEqual(["first", "mine"]);
    });

    it("doesn't take the old file's identity into a Save As made during a publish", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        let holdNext = true;
        const { session } = await openStarted({
            renameOptions: {
                rename: async (from, to) => {
                    if (holdNext) {
                        holdNext = false;
                        await gate;
                    }
                    await fs.promises.rename(from, to);
                },
            },
        });
        edit(session, "mine");
        const inFlight = session.flush("idle");
        await waitFor(() => !holdNext);

        const copy = join(showDir, "Copy.dots");
        const saveAs = session.retarget(copy);
        release();
        await inFlight;
        expect((await saveAs).ok).toBe(true);

        edit(session, "more");
        expect((await session.flush("test")).ok).toBe(true);
        expect(readValues(copy)).toEqual(["first", "mine", "more"]);
    });

    it("counts a commit nobody reported when it closes, and keeps it for recovery", async () => {
        const { session } = await openStarted();
        edit(session, "unreported", false);

        const { keptForRecovery } = await session.close();

        expect(keptForRecovery).toBe(true);
        expect(scanWorkingCopies(workingRoot)).toHaveLength(1);
    });

    it("deletes temp files a blocked publish left when it closes, and beside the old file after Save As", async () => {
        const { session } = await openStarted();
        const stale = join(showDir, ".~Show.dots.0badf00d.tmp");
        fs.writeFileSync(stale, "x");
        edit(session, "mine");

        await session.retarget(join(showDir, "Copy.dots"));
        await waitFor(() => !fs.existsSync(stale));

        const staleCopy = join(showDir, ".~Copy.dots.0badf00d.tmp");
        fs.writeFileSync(staleCopy, "x");
        await session.close();
        expect(fs.existsSync(staleCopy)).toBe(false);
    });

    it("holds retries while a question is open, and still publishes when the person asks", async () => {
        let blocked = true;
        let renames = 0;
        const { session } = await openStarted({
            platform: "win32",
            retryDelaysMs: [30],
            renameOptions: {
                budgetMs: 0,
                rename: async (from, to) => {
                    renames++;
                    if (blocked) throw errno("EBUSY");
                    await fs.promises.rename(from, to);
                },
            },
        });
        edit(session, "mine");
        expect(await session.flush("quit")).toMatchObject({
            state: "deferred",
        });

        const release = session.holdAutomaticPublishes();
        const triesBefore = renames;
        await new Promise((resolve) => setTimeout(resolve, 200));
        session.publishAutomatically("blur");

        // No retry and no blur publish wrote a temp file behind the question.
        expect(renames).toBe(triesBefore);
        expect(session.status().state).toBe("deferred");
        expect(strayFilesBeside(showPath)).toEqual([]);

        // Try Again publishes at once, held or not.
        blocked = false;
        expect((await session.flush("quit")).ok).toBe(true);
        expect(readValues(showPath)).toEqual(["first", "mine"]);
        release();
    });

    it("picks up a retry that came due once the question closes", async () => {
        let blocked = true;
        const { session } = await openStarted({
            platform: "win32",
            retryDelaysMs: [30],
            renameOptions: {
                budgetMs: 0,
                rename: async (from, to) => {
                    if (blocked) throw errno("EBUSY");
                    await fs.promises.rename(from, to);
                },
            },
        });
        edit(session, "mine");
        const release = session.holdAutomaticPublishes();
        await session.flush("quit");
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(session.status().state).toBe("deferred");

        blocked = false;
        release();

        await waitFor(() => session.status().state === "saved");
        expect(readValues(showPath)).toEqual(["first", "mine"]);
    });

    describe("scanWorkingCopies", () => {
        const makeFolder = (id: string, manifest: string | null) => {
            const directory = join(workingRoot, id);
            fs.mkdirSync(directory, { recursive: true });
            const db = new DatabaseSync(join(directory, WORKING_FILE_NAME));
            db.exec(
                "CREATE TABLE notes (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
            );
            db.prepare("INSERT INTO notes (value) VALUES ('unsaved')").run();
            db.close();
            if (manifest !== null)
                fs.writeFileSync(join(directory, MANIFEST_FILE_NAME), manifest);
            return directory;
        };

        it("never deletes a working copy whose manifest can't be read", () => {
            const torn = makeFolder("torn", "");
            const missing = makeFolder("missing", null);

            expect(scanWorkingCopies(workingRoot)).toEqual([]);
            expect(fs.existsSync(join(torn, WORKING_FILE_NAME))).toBe(true);
            expect(fs.existsSync(join(missing, WORKING_FILE_NAME))).toBe(true);
        });

        it("lists a copy whose manifest was only half replaced", () => {
            const directory = makeFolder("half", null);
            fs.writeFileSync(
                join(directory, `${MANIFEST_FILE_NAME}.tmp`),
                JSON.stringify({
                    version: 1,
                    id: "half",
                    showPath,
                    originalIdentity: null,
                    unsaved: true,
                    pid: 1,
                    appVersion: "",
                    openedAt: "",
                    lastEditAt: null,
                    lastSavedAt: null,
                }),
            );

            expect(
                scanWorkingCopies(workingRoot).map((e) => e.manifest.showPath),
            ).toEqual([showPath]);
        });

        it("keeps a copy whose last manifest write failed after an edit", () => {
            const manifest = (unsaved: boolean) =>
                JSON.stringify({
                    version: 1,
                    id: "stale",
                    showPath,
                    originalIdentity: null,
                    unsaved,
                    pid: 1,
                    appVersion: "",
                    openedAt: "",
                    lastEditAt: null,
                    lastSavedAt: null,
                });
            const directory = makeFolder("stale", manifest(false));
            fs.writeFileSync(
                join(directory, `${MANIFEST_FILE_NAME}.tmp`),
                manifest(true),
            );

            expect(scanWorkingCopies(workingRoot).map((e) => e.id)).toEqual([
                "stale",
            ]);
            expect(fs.existsSync(join(directory, WORKING_FILE_NAME))).toBe(
                true,
            );
        });

        it("keeps a copy whose last manifest write was cut short", () => {
            const directory = makeFolder(
                "cut",
                JSON.stringify({
                    version: 1,
                    id: "cut",
                    showPath,
                    originalIdentity: null,
                    unsaved: false,
                    pid: 1,
                    appVersion: "",
                    openedAt: "",
                    lastEditAt: null,
                    lastSavedAt: null,
                }),
            );
            // A full disk: the temp file was truncated, then nothing could be written
            fs.writeFileSync(join(directory, `${MANIFEST_FILE_NAME}.tmp`), "");

            expect(scanWorkingCopies(workingRoot).map((e) => e.id)).toEqual([
                "cut",
            ]);
        });

        it("lists a newer version's copy, and asks before it replaces the show", async () => {
            makeFolder(
                "newer",
                JSON.stringify({
                    version: 2,
                    showPath,
                    somethingNew: { unsaved: true },
                }),
            );

            const [entry] = scanWorkingCopies(workingRoot);
            expect(entry.manifest.showPath).toBe(showPath);
            const resumed = WorkingCopySession.resume(entry, options());
            sessions.push(resumed);
            await resumed.start();

            expect(await resumed.flush("recover")).toMatchObject({
                state: "conflict",
            });
            expect(readValues(showPath)).toEqual(["first"]);
        });
    });

    it("removeStaleTempFiles counts and deletes only this show's temp files", async () => {
        fs.writeFileSync(join(showDir, ".~Show.dots.ff.tmp"), "x");
        expect(await removeStaleTempFiles(showPath)).toEqual({
            found: 1,
            removed: 1,
        });
    });
});
