/* eslint-disable no-console */
/**
 * Editing a show through a private working copy (ADR 0018).
 *
 * The show the person picked (the "show file") is copied into a folder under the app's user
 * data. Every connection edits that working copy, in WAL mode with synchronous=NORMAL. Publishing
 * snapshots the working copy inside that folder, then puts the finished file beside the show and
 * renames it over the show, after checking that nothing else changed the show since OpenMarch
 * last loaded or published it.
 *
 * This module has no Electron imports; electron/main/workingCopyHost.ts wires it to the window,
 * dialogs and settings.
 */
import * as fs from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import {
    LINGERING_DELETE_MS,
    RenameRetriesExhaustedError,
    type RenameRetryOptions,
    isSameFile,
    publishFile,
    removeNowOrLater,
    removeWithRetry,
    tempFilePattern,
} from "../atomicFile";
import {
    type ConflictCheck,
    type FileIdentity,
    type FileStatIdentity,
    checkForConflict,
    sameStat,
    statIdentity,
} from "./fileIdentity";
import { type ExecFile, copyFileMetadata, isReadOnly } from "./fileMetadata";
import { SaveWorker } from "./saveWorker";
import { withoutPaths } from "../logSafe";

export const WORKING_FILE_NAME = "show.dots";
export const MANIFEST_FILE_NAME = "manifest.json";
/** The snapshot a publish builds before it goes beside the show. */
const SNAPSHOT_FILE_NAME = "publish.dots";

/** Stored beside each working copy so a crash can be recovered from. */
export type WorkingCopyManifest = {
    version: 1;
    id: string;
    /** The show file, as the person knows it. */
    showPath: string;
    /**
     * The show file as OpenMarch last loaded or published it. Null when there is nothing to
     * compare with, such as after Save As to a new file.
     */
    originalIdentity: FileIdentity | null;
    /**
     * The file a publish is about to rename over the show, recorded just before the rename. If
     * the app stops before it records the publish as done, the show matching this is still ours,
     * not someone else's change.
     */
    pendingIdentity?: FileIdentity | null;
    /** True from the first edit after a publish until the next publish succeeds. */
    unsaved: boolean;
    pid: number;
    appVersion: string;
    openedAt: string;
    lastEditAt: string | null;
    lastSavedAt: string | null;
};

export type WorkingCopyState =
    | "saved"
    | "unsaved"
    | "saving"
    | "conflict"
    | "deferred"
    | "readOnly"
    | "closed";

export type WorkingCopyStatus = {
    state: WorkingCopyState;
    showPath: string;
    lastSavedAt: string | null;
    /** Why the last publish didn't happen, for "conflict", "deferred" and "readOnly". */
    message?: string;
    /** The error code of a deferred publish (EBUSY, ENOSPC…), when there was one. */
    errorCode?: string;
    conflict?: { reason: "modified" | "missing"; changed: string[] };
    /** When a deferred publish will be tried again (ms since the epoch). */
    retryAt?: number;
    /** The sync app whose folder holds the show ("OneDrive"…), added by the app. */
    syncService?: string | null;
};

/** How the person resolves a show that changed on disk. */
export type WorkingCopyConflictChoice = "keepMine" | "keepTheirs" | "saveCopy";

/** A crashed session's unpublished changes, as the app lists them. */
export type RecoverableShow = {
    id: string;
    showPath: string;
    showExists: boolean;
    lastEditAt: string | null;
};

/** What one publish did, for logs and telemetry. No paths or names. */
export type PublishMetrics = {
    reason: string;
    durationMs: number;
    bytes: number;
    renameAttempts: number;
    /** Whether the show had to be read and hashed (its stat had changed). */
    hashedShow: boolean;
    /** Failed publishes in a row before this one. */
    deferralsBefore: number;
    vacuumMs: number;
};

export type SaveOutcome =
    | { ok: true; skipped?: boolean; metrics?: PublishMetrics }
    | {
          ok: false;
          state: "conflict" | "deferred" | "readOnly" | "closed";
          message: string;
      };

export type WorkingCopyOptions = {
    /** The folder that holds one sub-folder per working copy. */
    workingRoot: string;
    appVersion?: string;
    /** How long after the last edit to publish. */
    debounceMs?: number;
    /** The longest a pending publish waits while edits keep coming. */
    maxWaitMs?: number;
    /** Waits before retrying a publish that failed, in order; the last repeats. */
    retryDelaysMs?: number[];
    /** How often to look for commits no handler reported (another connection's). */
    pollMs?: number;
    platform?: NodeJS.Platform;
    onStatus?: (status: WorkingCopyStatus) => void;
    /** Called after each publish attempt that reached the disk, for telemetry. */
    onPublish?: (
        event:
            | { ok: true; metrics: PublishMetrics }
            | { ok: false; state: string; errorCode?: string; reason: string },
    ) => void;
    /** Overrides for the rename step, for tests. */
    renameOptions?: RenameRetryOptions;
    /** Runs the `xattr` tool, for tests. */
    exec?: ExecFile;
};

export type RecoverableWorkingCopy = {
    id: string;
    directory: string;
    workingPath: string;
    manifest: WorkingCopyManifest;
};

/**
 * The publish timing (ADR 0018): about 15 s after the last edit, so a burst of edits becomes
 * one upload for a sync app, and at most 30 s while edits keep coming. A blocked publish is
 * tried again after a few seconds, backing off to every 30 s.
 */
export const DEFAULT_TIMING = {
    debounceMs: 15_000,
    maxWaitMs: 30_000,
    retryDelaysMs: [2_000, 4_000, 8_000, 15_000, 30_000],
    pollMs: 2_000,
} as const;

/** Bounds the working copy's WAL: checkpoint every 1000 pages, trim it back to 32 MB. */
const WAL_PRAGMAS = [
    "PRAGMA journal_mode = WAL",
    "PRAGMA synchronous = NORMAL",
    "PRAGMA wal_autocheckpoint = 1000",
    `PRAGMA journal_size_limit = ${32 * 1024 * 1024}`,
];

class ChangedDuringPublishError extends Error {
    constructor(name: string) {
        super(`${name} changed on disk while OpenMarch was saving it`);
    }
}

/** The manifest couldn't record the file a publish was about to rename over the show. */
class ManifestNotRecordedError extends Error {
    constructor() {
        super("OpenMarch couldn't update its own record of the save");
    }
}

/** Save As moved the show while a publish to the old file was under way. */
class SavedAsDuringPublishError extends Error {
    constructor() {
        super("The show was saved under a new name during the publish");
    }
}

/**
 * Stands in for the show's identity when a manifest from another version doesn't say what it
 * was. It matches no file, so recovering such a copy asks before replacing the show.
 */
const UNKNOWN_IDENTITY: FileIdentity = {
    size: -1,
    mtimeMs: -1,
    ino: -1,
    dev: -1,
    sha256: null,
};

function isFileIdentity(value: unknown): value is FileIdentity {
    const identity = value as FileIdentity | null;
    return (
        !!identity &&
        typeof identity.size === "number" &&
        typeof identity.mtimeMs === "number" &&
        typeof identity.ino === "number" &&
        typeof identity.dev === "number"
    );
}

function getSqlite(): typeof import("node:sqlite") {
    const sqlite = process.getBuiltinModule?.("node:sqlite") as
        | typeof import("node:sqlite")
        | undefined;
    if (!sqlite?.DatabaseSync) throw new Error("node:sqlite is unavailable");
    return sqlite;
}

/**
 * Writes the manifest durably: a flushed temp file renamed over it, then the folder flushed, so
 * a power cut leaves the old manifest or the new one, never an empty file.
 */
function writeManifest(directory: string, manifest: WorkingCopyManifest) {
    const target = join(directory, MANIFEST_FILE_NAME);
    const temp = `${target}.tmp`;
    const fd = fs.openSync(temp, "w");
    try {
        fs.writeFileSync(fd, JSON.stringify(manifest, null, 2));
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    fs.renameSync(temp, target);
    if (process.platform !== "win32") {
        try {
            const dirFd = fs.openSync(directory, "r");
            try {
                fs.fsyncSync(dirFd);
            } finally {
                fs.closeSync(dirFd);
            }
        } catch {
            // Only the extra durability is lost.
        }
    }
}

function readManifestFile(file: string): WorkingCopyManifest | null {
    let parsed: Partial<WorkingCopyManifest> & { version?: unknown };
    try {
        parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
    if (!parsed || typeof parsed.showPath !== "string" || !parsed.showPath)
        return null;
    if (parsed.version === 1) return parsed as WorkingCopyManifest;
    // Another version's manifest (a newer build wrote it): keep what it says about the show,
    // assume unpublished changes, and check with the person before replacing the show.
    return {
        version: 1,
        id: typeof parsed.id === "string" ? parsed.id : "",
        showPath: parsed.showPath,
        originalIdentity: isFileIdentity(parsed.originalIdentity)
            ? parsed.originalIdentity
            : UNKNOWN_IDENTITY,
        pendingIdentity: null,
        unsaved: parsed.unsaved !== false,
        pid: typeof parsed.pid === "number" ? parsed.pid : 0,
        appVersion:
            typeof parsed.appVersion === "string" ? parsed.appVersion : "",
        openedAt: typeof parsed.openedAt === "string" ? parsed.openedAt : "",
        lastEditAt:
            typeof parsed.lastEditAt === "string" ? parsed.lastEditAt : null,
        lastSavedAt:
            typeof parsed.lastSavedAt === "string" ? parsed.lastSavedAt : null,
    };
}

/** OpenMarch's own folder can't hold a working copy: full, read-only or not allowed. */
export class WorkingCopyStorageError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "WorkingCopyStorageError";
    }
}

// cspell:ignore bavail statfs
/**
 * Makes the working copy's folder, and checks there's room for the copy (twice the show: the
 * copy and a publish snapshot), before anything is copied.
 */
function checkStorageFor(
    target: string,
    workingRoot: string,
    directory: string,
) {
    try {
        fs.mkdirSync(directory, { recursive: true });
    } catch (error) {
        throw new WorkingCopyStorageError(
            "Couldn't make a folder for the working copy",
            { cause: error },
        );
    }
    let needed = 0;
    try {
        needed = fs.statSync(target).size * 2;
    } catch {
        return; // The open reports a missing show itself
    }
    try {
        const { bavail, bsize, blocks } = fs.statfsSync(workingRoot);
        // Some network shares report no size at all: unknown, not full
        if (blocks > 0 && bavail * bsize < needed) {
            fs.rmSync(directory, { recursive: true, force: true });
            throw new WorkingCopyStorageError(
                "Not enough space for a working copy",
            );
        }
    } catch (error) {
        if (error instanceof WorkingCopyStorageError) throw error;
        // No free-space figure on this system: try the copy anyway.
    }
}

/**
 * The folder's manifest, or the one a crash left half written (its temp file). When the temp
 * file says there are unsaved changes and the manifest doesn't, the rename that would have
 * recorded them failed (Windows Defender or an indexer holding the manifest, a full disk), so
 * the folder is treated as unsaved: it may hold edits, and must never be cleared unasked.
 */
function readManifest(directory: string): WorkingCopyManifest | null {
    const target = join(directory, MANIFEST_FILE_NAME);
    const main = readManifestFile(target);
    const tempPath = `${target}.tmp`;
    const temp = readManifestFile(tempPath);
    if (!main) return temp;
    if (main.unsaved) return main;
    if (temp?.unsaved)
        return { ...main, unsaved: true, lastEditAt: temp.lastEditAt };
    // A temp file that can't be read is a write cut short (a full disk): what it would have
    // recorded is unknown, so assume there are changes.
    if (!temp && fs.existsSync(tempPath)) return { ...main, unsaved: true };
    return main;
}

/** The file a publish replaces: the show file with symbolic links resolved. */
export function resolveSaveTarget(showPath: string): string {
    try {
        return fs.realpathSync(showPath);
    } catch {
        try {
            return join(fs.realpathSync(dirname(showPath)), basename(showPath));
        } catch {
            return showPath;
        }
    }
}

/**
 * Deletes `.~<name>.<hex>.tmp` files beside the show, whatever their age: only OpenMarch makes
 * them, and a publish removes its own unless something stopped it (a crash, or a sync app
 * holding the file). Deletes are retried briefly; one still held is left for next time.
 */
export async function removeStaleTempFiles(
    showFile: string,
    {
        budgetMs = 1000,
        lingerMs = 0,
    }: {
        /** How long to retry each held file before moving on. */
        budgetMs?: number;
        /** How long to keep deleting a held file in the background afterwards; 0 for not at all. */
        lingerMs?: number;
    } = {},
): Promise<{ found: number; removed: number }> {
    const directory = dirname(showFile);
    const pattern = tempFilePattern(basename(showFile));
    let names: string[];
    try {
        names = await fs.promises.readdir(directory);
    } catch {
        return { found: 0, removed: 0 };
    }
    let found = 0;
    let removed = 0;
    for (const name of names) {
        if (!pattern.test(name)) continue;
        found++;
        const file = join(directory, name);
        const gone =
            lingerMs > 0
                ? (await removeNowOrLater(file, { budgetMs, lingerMs })).removed
                : await removeWithRetry(file, { budgetMs });
        if (gone) removed++;
    }
    return { found, removed };
}

/**
 * Lists working copies left by a previous run. Call it at startup, before any working copy is
 * open: the single-instance lock means every folder found then belongs to a process that has
 * exited.
 *
 * Folders whose show was published are deleted. Folders with unpublished changes are returned so
 * the person can recover or discard them. A folder that still holds a working copy is never
 * deleted unless its manifest says everything was published: one whose manifest can't be read
 * is kept (and listed when the show it belongs to is known).
 */
export function scanWorkingCopies(
    workingRoot: string,
    exclude: ReadonlySet<string> = new Set(),
): RecoverableWorkingCopy[] {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(workingRoot, { withFileTypes: true });
    } catch {
        return [];
    }
    const recoverable: RecoverableWorkingCopy[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || exclude.has(entry.name)) continue;
        const directory = join(workingRoot, entry.name);
        const manifest = readManifest(directory);
        const workingPath = join(directory, WORKING_FILE_NAME);
        if (!fs.existsSync(workingPath) || (manifest && !manifest.unsaved)) {
            // Nothing to recover: a clean close, a crash before the first edit, or an open that
            // never finished.
            fs.rmSync(directory, { recursive: true, force: true });
            continue;
        }
        if (!manifest) {
            // A working copy whose show isn't known: it may hold unpublished edits, so keep it.
            console.warn(
                "Kept a working copy whose manifest can't be read:",
                entry.name,
            );
            continue;
        }
        recoverable.push({
            id: entry.name,
            directory,
            workingPath,
            manifest: { ...manifest, id: manifest.id || entry.name },
        });
    }
    return recoverable.sort((a, b) =>
        (b.manifest.lastEditAt ?? "").localeCompare(
            a.manifest.lastEditAt ?? "",
        ),
    );
}

/** The recoverable working copy for `showPath`, if any: the most recently edited one. */
export function findRecoverableFor(
    entries: readonly RecoverableWorkingCopy[],
    showPath: string,
): RecoverableWorkingCopy | undefined {
    // The same file can be spelled differently (case on Windows and macOS, a symbolic link)
    return entries.find((entry) =>
        isSameFile(resolve(entry.manifest.showPath), resolve(showPath)),
    );
}

export function discardWorkingCopy(entry: { directory: string }) {
    fs.rmSync(entry.directory, { recursive: true, force: true });
}

function openWorkingConnection(workingPath: string): DatabaseSync {
    const db = new (getSqlite().DatabaseSync)(workingPath);
    for (const pragma of WAL_PRAGMAS) db.exec(pragma);
    return db;
}

export class WorkingCopySession {
    readonly id: string;
    readonly directory: string;
    readonly workingPath: string;

    private manifest: WorkingCopyManifest;
    /** The last manifest write failed, so the file on disk may be behind {@link manifest}. */
    private manifestStale = false;
    private targetPath: string;
    private expected: FileIdentity | null;
    private readonly options: Required<
        Pick<
            WorkingCopyOptions,
            "debounceMs" | "maxWaitMs" | "retryDelaysMs" | "pollMs" | "platform"
        >
    > &
        WorkingCopyOptions;

    private watcher: DatabaseSync | null = null;
    private dataVersionStatement: StatementSync | null = null;
    private lastDataVersion = 0;
    private worker: SaveWorker | null = null;
    /** The open-time hash of the show, read on the worker. */
    private expectedHash: Promise<void> = Promise.resolve();

    /** Bumped on every detected commit; a publish covers the generation it started at. */
    private editGeneration = 0;
    private savedGeneration = 0;
    private state: WorkingCopyState = "saved";
    private message: string | undefined;
    private errorCode: string | undefined;
    private conflict: WorkingCopyStatus["conflict"];
    private retryAt: number | undefined;
    private retryIndex = 0;
    /** Bumped by Save As; a publish started before it doesn't record anything for the new file. */
    private targetVersion = 0;
    /** Questions on screen that hold automatic publishes; see {@link holdAutomaticPublishes}. */
    private holds = 0;
    /** An automatic publish came due while held. */
    private automaticDue = false;
    private started = false;
    private closed = false;

    private debounceTimer: NodeJS.Timeout | null = null;
    private maxWaitTimer: NodeJS.Timeout | null = null;
    private retryTimer: NodeJS.Timeout | null = null;
    private pollTimer: NodeJS.Timeout | null = null;
    private queue: Promise<unknown> = Promise.resolve();

    private constructor(
        directory: string,
        manifest: WorkingCopyManifest,
        options: WorkingCopyOptions,
    ) {
        this.id = manifest.id;
        this.directory = directory;
        this.workingPath = join(directory, WORKING_FILE_NAME);
        this.manifest = manifest;
        this.targetPath = resolveSaveTarget(manifest.showPath);
        this.expected = manifest.originalIdentity;
        this.options = {
            ...DEFAULT_TIMING,
            retryDelaysMs: [...DEFAULT_TIMING.retryDelaysMs],
            platform: process.platform,
            ...options,
        };
    }

    /**
     * Copies `showPath` into a new working copy, in WAL mode, and returns its session, not yet
     * started: the caller runs migrations on {@link workingPath}, then calls {@link start}.
     *
     * The copy uses SQLite's backup API on a connection to the show, so a hot journal is played
     * back first (back the show and its journal up before calling this) and the copy is
     * consistent. That connection is closed before this returns. Nothing else is written to the
     * show. Temp files a crashed publish left beside it are deleted.
     */
    /**
     * Opens `showPath` through a new working copy. Throws {@link WorkingCopyStorageError} when
     * OpenMarch's own folder can't hold the copy, so the caller can edit in place instead.
     */
    static async open(
        showPath: string,
        options: WorkingCopyOptions,
    ): Promise<{
        session: WorkingCopySession;
        staleTempFiles: number;
    }> {
        const sqlite = getSqlite();
        const absoluteShowPath = resolve(showPath);
        const target = resolveSaveTarget(absoluteShowPath);
        const id = randomUUID();
        const directory = join(options.workingRoot, id);
        const workingPath = join(directory, WORKING_FILE_NAME);
        checkStorageFor(target, options.workingRoot, directory);

        try {
            const { found } = await removeStaleTempFiles(target);
            let identity: FileIdentity | null = null;
            for (let attempt = 0; attempt < 3 && !identity; attempt++) {
                for (const suffix of ["", "-wal", "-shm", "-journal"])
                    fs.rmSync(workingPath + suffix, { force: true });
                const before = statIdentity(fs.statSync(target));
                const source = new sqlite.DatabaseSync(target);
                try {
                    source.exec("PRAGMA busy_timeout = 5000");
                    await sqlite.backup(source, workingPath);
                } finally {
                    source.close();
                }
                const after = statIdentity(fs.statSync(target));
                // Opening the show can roll back a hot journal, and another program could write
                // meanwhile: copy again until it holds still. The hash comes later, off this
                // thread (start()).
                if (sameStat(before, after))
                    identity = { ...after, sha256: null };
            }
            if (!identity)
                throw new Error(
                    `The show kept changing while OpenMarch copied it: ${absoluteShowPath}`,
                );

            openWorkingConnection(workingPath).close();

            const manifest: WorkingCopyManifest = {
                version: 1,
                id,
                showPath: absoluteShowPath,
                originalIdentity: identity,
                unsaved: false,
                pid: process.pid,
                appVersion: options.appVersion ?? "",
                openedAt: new Date().toISOString(),
                lastEditAt: null,
                lastSavedAt: null,
            };
            writeManifest(directory, manifest);
            return {
                session: new WorkingCopySession(directory, manifest, options),
                staleTempFiles: found,
            };
        } catch (error) {
            fs.rmSync(directory, { recursive: true, force: true });
            // Out of room or a read-only drive while copying: OpenMarch's folder, not the show
            // (SQLite reports a full disk as SQLITE_FULL, 13, while it writes the copy)
            const code = (error as NodeJS.ErrnoException)?.code;
            const sqliteCode = (error as { errcode?: number })?.errcode;
            if (
                code === "ENOSPC" ||
                code === "EDQUOT" ||
                code === "EROFS" ||
                (code === "ERR_SQLITE_ERROR" && sqliteCode === 13)
            )
                throw new WorkingCopyStorageError(
                    "OpenMarch's folder ran out of room for the working copy",
                    { cause: error },
                );
            throw error;
        }
    }

    /**
     * Reopens a working copy left by a crash (replaying its WAL) and checks it. Like
     * {@link open}, the caller migrates it and calls {@link start}; the recovered changes are
     * then published after the usual check that the show hasn't changed since it was last
     * loaded or published.
     */
    static resume(
        entry: RecoverableWorkingCopy,
        options: WorkingCopyOptions,
    ): WorkingCopySession {
        const db = openWorkingConnection(entry.workingPath);
        try {
            const check = db.prepare("PRAGMA quick_check").get() as {
                quick_check: string;
            };
            if (check.quick_check !== "ok")
                throw new Error(
                    `The recovered working copy is damaged: ${check.quick_check}`,
                );
        } finally {
            db.close();
        }
        const manifest: WorkingCopyManifest = {
            ...entry.manifest,
            pid: process.pid,
            appVersion: options.appVersion ?? entry.manifest.appVersion,
            unsaved: true,
        };
        writeManifest(entry.directory, manifest);
        const session = new WorkingCopySession(
            entry.directory,
            manifest,
            options,
        );
        session.editGeneration = 1;
        session.state = "unsaved";
        return session;
    }

    /** The person's show file. Use this for titles, recent files and exports. */
    get showPath(): string {
        return this.manifest.showPath;
    }

    get hasUnsavedChanges(): boolean {
        return this.editGeneration !== this.savedGeneration;
    }

    status(): WorkingCopyStatus {
        return {
            state: this.state,
            showPath: this.manifest.showPath,
            lastSavedAt: this.manifest.lastSavedAt,
            ...(this.message ? { message: this.message } : {}),
            ...(this.errorCode ? { errorCode: this.errorCode } : {}),
            ...(this.conflict ? { conflict: this.conflict } : {}),
            ...(this.retryAt ? { retryAt: this.retryAt } : {}),
        };
    }

    /**
     * Starts noticing edits and publishing. Call once the working copy is migrated: changes made
     * before this (migrations) are published with the first edit, not on their own.
     */
    async start(): Promise<void> {
        if (this.started || this.closed) return;
        this.started = true;
        this.watcher = new (getSqlite().DatabaseSync)(this.workingPath);
        this.dataVersionStatement = this.watcher.prepare("PRAGMA data_version");
        this.lastDataVersion = (
            this.dataVersionStatement.get() as { data_version: number }
        ).data_version;
        this.worker = await SaveWorker.start(this.workingPath);
        this.hashShowInBackground();
        this.pollTimer = setInterval(
            () => this.noteActivity(),
            this.options.pollMs,
        );
        this.pollTimer.unref?.();
        if (this.hasUnsavedChanges) this.scheduleSave();
        this.options.onStatus?.(this.status());
    }

    /**
     * Call after anything may have written to the working copy. Notices commits from any
     * connection through `PRAGMA data_version`, which changes when another connection commits.
     */
    noteActivity(): void {
        if (this.closed || !this.dataVersionStatement) return;
        let version: number;
        try {
            version = (
                this.dataVersionStatement.get() as { data_version: number }
            ).data_version;
        } catch (error) {
            console.error(
                "Couldn't read the working copy's version:",
                withoutPaths(error),
            );
            return;
        }
        if (version === this.lastDataVersion) return;
        this.lastDataVersion = version;
        this.markDirty();
    }

    /** Records an edit and schedules a publish. */
    markDirty(): void {
        if (this.closed) return;
        this.editGeneration++;
        this.manifest.lastEditAt = new Date().toISOString();
        // Until "unsaved" is on disk, a crash would leave a folder that looks clean, so a write
        // that failed is tried again with the next edit.
        if (!this.manifest.unsaved || this.manifestStale) {
            this.manifest.unsaved = true;
            this.persistManifest();
        }
        // A conflict or a read-only show waits for the person; a deferred publish waits for its
        // retry (or the next blur, close or Ctrl/Cmd+S).
        if (
            this.state === "conflict" ||
            this.state === "readOnly" ||
            this.state === "deferred"
        )
            return;
        if (this.state !== "saving") this.setState("unsaved");
        this.scheduleSave();
    }

    /**
     * Publishes now if there are unpublished changes. Publishes run one at a time; a call made
     * during a publish waits for it and then publishes again if needed.
     */
    flush(reason = "flush", force = false): Promise<SaveOutcome> {
        // A commit no handler reported yet (the poll runs every few seconds) still counts.
        this.noteActivity();
        this.clearSaveTimers();
        const run = this.queue.then(() => this.saveIfNeeded(reason, force));
        this.queue = run.catch(() => undefined);
        return run;
    }

    /**
     * Holds the publishes nobody asked for at that moment (after an edit, a retry, the window
     * losing focus) while the person answers a question or picks a file: each one writes a
     * full temp file beside the show, which a sync app may grab, and the title bar would say
     * "Saving…" behind the question. Publishes the person asks for (Try Again, Keep my version,
     * Save As, Save Now) still run at once. Call the returned function when the question
     * closes; one that came due meanwhile then runs after the first retry delay.
     */
    holdAutomaticPublishes(): () => void {
        this.holds++;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.holds--;
            if (this.holds > 0 || !this.automaticDue || this.closed) return;
            this.automaticDue = false;
            this.clearRetryTimer();
            this.retryTimer = setTimeout(() => {
                this.retryTimer = null;
                this.publishAutomatically("resume");
            }, this.options.retryDelaysMs[0]);
            this.retryTimer.unref?.();
        };
    }

    /** A publish nobody asked for right now: a timer, or the window losing focus. */
    publishAutomatically(reason: string): void {
        if (this.closed) return;
        if (this.holds > 0) {
            this.automaticDue = true;
            this.clearSaveTimers();
            return;
        }
        void this.flush(reason);
    }

    /**
     * Publishes over the show even though it changed on disk ("Keep my version"). The choice
     * covers the show as it is now: it becomes the version publishes compare with, so a later
     * change (a sync app finishing another download) is a conflict again.
     */
    overwriteShow(): Promise<SaveOutcome> {
        const accept = this.queue.then(async () => {
            if (this.closed || !this.started) return;
            let current: Awaited<ReturnType<SaveWorker["identity"]>>;
            try {
                const worker = await this.ensureWorker();
                current = await worker.identity(this.targetPath);
            } catch (error) {
                // The conflict stays, and the person can choose again.
                console.error(
                    "Couldn't read the show to overwrite it:",
                    withoutPaths(error),
                );
                return;
            }
            this.expected = current
                ? {
                      size: current.size,
                      mtimeMs: current.mtimeMs,
                      ino: current.ino,
                      dev: current.dev,
                      sha256: current.sha256,
                  }
                : null;
            this.manifest.originalIdentity = this.expected;
            this.persistManifest();
            if (this.state === "conflict" || this.state === "readOnly")
                this.setState("unsaved");
        });
        this.queue = accept.catch(() => undefined);
        return accept.then(() => this.flush("overwrite", true));
    }

    /**
     * Makes `newShowPath` the show and publishes to it ("Save mine as a copy", or Save As). The
     * save dialog already confirmed replacing a file there.
     */
    retarget(newShowPath: string): Promise<SaveOutcome> {
        const oldTarget = this.targetPath;
        this.targetVersion++;
        this.manifest.showPath = resolve(newShowPath);
        this.manifest.originalIdentity = null;
        this.manifest.pendingIdentity = null;
        this.targetPath = resolveSaveTarget(this.manifest.showPath);
        this.expected = null;
        this.conflict = undefined;
        this.message = undefined;
        this.retryIndex = 0;
        this.editGeneration++;
        this.manifest.unsaved = true;
        this.persistManifest();
        this.setState("unsaved");
        const run = this.flush("retarget", true);
        if (oldTarget !== this.targetPath) {
            // Temp files a blocked publish left beside the old file, once nothing writes there.
            const cleanUp = () =>
                removeStaleTempFiles(oldTarget, {
                    lingerMs: LINGERING_DELETE_MS,
                });
            void run.then(cleanUp, cleanUp);
        }
        return run;
    }

    /**
     * Stops publishing and releases the working copy. Close every other connection to it first.
     * Without unpublished changes (or with `discard`) the working folder is deleted; otherwise
     * it's kept for recovery.
     */
    async close({ discard = false } = {}): Promise<{
        keptForRecovery: boolean;
    }> {
        if (this.closed) return { keptForRecovery: false };
        // A commit since the last check (the poll runs every few seconds) is an unpublished
        // change: it decides whether the folder is kept.
        this.noteActivity();
        this.clearSaveTimers();
        this.clearRetryTimer();
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = null;
        await this.queue;
        this.closed = true;
        this.dataVersionStatement = null;
        this.watcher?.close();
        this.watcher = null;
        await this.worker?.close();
        this.worker = null;
        const keep = !discard && this.hasUnsavedChanges;
        if (keep) this.persistManifest();
        else fs.rmSync(this.directory, { recursive: true, force: true });
        // Temp files a blocked publish left: sync apps can hold them for 20 s or more, so try
        // for a few seconds and then keep trying in the background while the app runs.
        await removeStaleTempFiles(this.targetPath, {
            budgetMs: 3000,
            lingerMs: LINGERING_DELETE_MS,
        });
        this.setState("closed");
        return { keptForRecovery: keep };
    }

    /** Hashes the show on the worker, so later publishes can tell a touch from a change. */
    private hashShowInBackground() {
        const expected = this.expected;
        if (!expected || expected.sha256 !== null || !this.worker) return;
        this.expectedHash = this.worker
            .identity(this.targetPath)
            .then((identity) => {
                // The hash belongs to the file as loaded only if the file is still the same.
                if (
                    identity?.sha256 &&
                    this.expected === expected &&
                    sameStat(identity, expected)
                ) {
                    expected.sha256 = identity.sha256;
                    this.persistManifest();
                }
            })
            .catch((error) =>
                console.warn(
                    "Couldn't hash the show in the background:",
                    withoutPaths(error),
                ),
            );
    }

    private persistManifest() {
        try {
            writeManifest(this.directory, this.manifest);
            this.manifestStale = false;
        } catch (error) {
            this.manifestStale = true;
            console.error(
                "Couldn't write the working copy manifest:",
                withoutPaths(error),
            );
        }
    }

    private setState(
        state: WorkingCopyState,
        details: Pick<
            WorkingCopyStatus,
            "message" | "conflict" | "retryAt" | "errorCode"
        > = {},
    ) {
        this.state = state;
        this.message = details.message;
        this.errorCode = details.errorCode;
        this.conflict = details.conflict;
        this.retryAt = details.retryAt;
        this.options.onStatus?.(this.status());
    }

    private scheduleSave() {
        if (!this.started) return;
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(
            () => this.publishAutomatically("idle"),
            this.options.debounceMs,
        );
        if (!this.maxWaitTimer)
            this.maxWaitTimer = setTimeout(
                () => this.publishAutomatically("max-wait"),
                this.options.maxWaitMs,
            );
    }

    private clearSaveTimers() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
        this.debounceTimer = null;
        this.maxWaitTimer = null;
    }

    private clearRetryTimer() {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }

    private async ensureWorker(): Promise<SaveWorker> {
        if (this.worker?.alive) return this.worker;
        await this.worker?.close();
        this.worker = await SaveWorker.start(this.workingPath);
        return this.worker;
    }

    private async saveIfNeeded(
        reason: string,
        force: boolean,
    ): Promise<SaveOutcome> {
        if (this.closed)
            return { ok: false, state: "closed", message: "Closed" };
        if (!this.started) {
            // Not migrated yet: nothing to publish.
            return { ok: true, skipped: true };
        }
        if (!force && !this.hasUnsavedChanges)
            return { ok: true, skipped: true };
        if (this.state === "conflict")
            return {
                ok: false,
                state: "conflict",
                message: this.message ?? "The show changed on disk",
            };
        this.clearRetryTimer();
        const outcome = await this.save(reason);
        if (outcome.ok && this.hasUnsavedChanges && !this.closed)
            this.scheduleSave();
        return outcome;
    }

    /**
     * Compares the show on disk with what OpenMarch last loaded or published. A show that
     * matches the file a publish was about to rename into place is ours too: that publish
     * renamed it but didn't get to record it (a failed folder flush, or a crash).
     */
    private checkShow(
        expected: FileIdentity,
        actual: FileIdentity | null,
    ): ConflictCheck {
        const check = checkForConflict(expected, actual);
        const pending = this.manifest.pendingIdentity;
        if (check.conflict && pending && actual) {
            const ours = checkForConflict(pending, actual);
            if (!ours.conflict) return ours;
        }
        return check;
    }

    // eslint-disable-next-line max-lines-per-function
    private async save(reason: string): Promise<SaveOutcome> {
        const started = performance.now();
        const generation = this.editGeneration;
        const target = this.targetPath;
        const targetVersion = this.targetVersion;
        // Save As during this publish: nothing it found or did is about the new file, and the
        // publish Save As queued takes over.
        const savedAsSince = () => this.targetVersion !== targetVersion;
        const superseded: SaveOutcome = { ok: true, skipped: true };
        const name = basename(target);
        const platform = this.options.platform;
        this.setState("saving");
        const snapshotPath = join(this.directory, SNAPSHOT_FILE_NAME);

        try {
            if (await isReadOnly(target, platform)) {
                if (savedAsSince()) return superseded;
                const message = `${name} is read-only. Use Save As to keep your changes.`;
                // Check again later: the person may make it writable again.
                this.scheduleRetry();
                this.setState("readOnly", { message });
                this.options.onPublish?.({
                    ok: false,
                    state: "readOnly",
                    reason,
                });
                return { ok: false, state: "readOnly", message };
            }
            await this.expectedHash;
            // Temp files an earlier publish couldn't delete (a sync app held them) go first.
            await removeStaleTempFiles(target);

            const worker = await this.ensureWorker();
            for (let attempt = 0; ; attempt++) {
                const expected = this.expected;
                const snapshot = await worker.snapshot({
                    snapshotPath,
                    originalPath: target,
                    expectedStat: expected,
                });
                let renameAttempts = 0;
                /** The temp file's identity, which the show has once it's renamed over it. */
                const renamed: { identity?: FileStatIdentity } = {};
                try {
                    if (expected) {
                        const check = this.checkShow(
                            expected,
                            snapshot.original,
                        );
                        if (check.conflict) {
                            if (savedAsSince()) return superseded;
                            const message =
                                check.reason === "missing"
                                    ? `${name} was moved or deleted since OpenMarch opened it.`
                                    : `${name} was changed by another program or computer since OpenMarch last saved it.`;
                            this.setState("conflict", {
                                message,
                                conflict: {
                                    reason: check.reason,
                                    changed: check.changed,
                                },
                            });
                            this.options.onPublish?.({
                                ok: false,
                                state: "conflict",
                                reason,
                            });
                            return { ok: false, state: "conflict", message };
                        }
                    }

                    const original = snapshot.original;
                    /**
                     * The worker read the show a moment ago. If it changed since (a sync app
                     * finished downloading another version), stop and check again rather than
                     * overwrite blind.
                     */
                    const assertShowUnchanged = async () => {
                        if (savedAsSince())
                            throw new SavedAsDuringPublishError();
                        let current: FileStatIdentity | null = null;
                        try {
                            current = statIdentity(
                                await fs.promises.stat(target),
                            );
                        } catch {
                            current = null;
                        }
                        const unchanged = original
                            ? current !== null && sameStat(current, original)
                            : current === null;
                        if (!unchanged)
                            throw new ChangedDuringPublishError(name);
                    };
                    ({ attempts: renameAttempts } = await publishFile(
                        snapshotPath,
                        target,
                        {
                            platform,
                            budgetMs: 5000,
                            // A rename blocked by a sync app is retried for seconds: check the
                            // show again before every try, not just the first.
                            shouldRetry: async () => {
                                await assertShowUnchanged();
                                return true;
                            },
                            ...this.options.renameOptions,
                            beforeRename: async (tempPath) => {
                                if (original)
                                    await this.copyMetadata(target, tempPath);
                                await assertShowUnchanged();
                                // A rename keeps size, modification time, inode and device, so
                                // this is the show once it's renamed. Taken before the rename, a
                                // file a sync app swaps in right after isn't mistaken for ours;
                                // recorded before it, a crash right after the rename isn't
                                // mistaken for someone else's change.
                                renamed.identity = statIdentity(
                                    await fs.promises.stat(tempPath),
                                );
                                if (savedAsSince())
                                    throw new SavedAsDuringPublishError();
                                const previousPending =
                                    this.manifest.pendingIdentity;
                                this.manifest.pendingIdentity = {
                                    ...renamed.identity,
                                    sha256: snapshot.snapshot.sha256,
                                };
                                this.persistManifest();
                                // Without this record on disk, a crash right after the rename
                                // would make recovery take OpenMarch's own save for someone
                                // else's change. Don't rename: the publish is retried.
                                if (this.manifestStale) {
                                    this.manifest.pendingIdentity =
                                        previousPending;
                                    throw new ManifestNotRecordedError();
                                }
                            },
                        },
                    ));
                } catch (error) {
                    if (
                        error instanceof ChangedDuringPublishError &&
                        attempt < 2
                    )
                        continue;
                    throw error;
                } finally {
                    await removeWithRetry(snapshotPath);
                }

                if (savedAsSince()) return superseded;
                this.expected = {
                    ...renamed.identity!,
                    sha256: snapshot.snapshot.sha256,
                };
                const deferralsBefore = this.retryIndex;
                this.savedGeneration = generation;
                this.retryIndex = 0;
                this.manifest.originalIdentity = this.expected;
                this.manifest.pendingIdentity = null;
                this.manifest.lastSavedAt = new Date().toISOString();
                this.manifest.unsaved = this.hasUnsavedChanges;
                this.persistManifest();
                this.setState(this.hasUnsavedChanges ? "unsaved" : "saved");
                // Temp files an earlier, blocked publish couldn't delete.
                void removeStaleTempFiles(target);
                const metrics: PublishMetrics = {
                    reason,
                    durationMs: performance.now() - started,
                    bytes: snapshot.snapshot.size,
                    renameAttempts,
                    hashedShow: snapshot.original?.hashed ?? false,
                    deferralsBefore,
                    vacuumMs: snapshot.timings.vacuumMs,
                };
                console.log(
                    `Saved the show (${reason}): ${(metrics.bytes / 1e6).toFixed(1)} MB in ${metrics.durationMs.toFixed(0)} ms`,
                );
                this.options.onPublish?.({ ok: true, metrics });
                return { ok: true, metrics };
            }
        } catch (error) {
            if (savedAsSince()) return superseded;
            return this.deferSave(error, reason);
        }
    }

    /** The next wait in the retry schedule (2, 4, 8, 15, then 30 s by default). */
    private nextRetryDelay(): number {
        const delays = this.options.retryDelaysMs;
        const delay = delays[Math.min(this.retryIndex, delays.length - 1)];
        this.retryIndex++;
        return delay;
    }

    /** Publishes again after `delay` (the next one in the schedule by default). */
    private scheduleRetry(delay = this.nextRetryDelay()) {
        this.clearRetryTimer();
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.publishAutomatically("retry");
        }, delay);
        this.retryTimer.unref?.();
    }

    private async copyMetadata(from: string, to: string) {
        try {
            const { failedAttributes } = await copyFileMetadata(from, to, {
                platform: this.options.platform,
                exec: this.options.exec,
            });
            if (failedAttributes.length)
                console.warn(
                    "Couldn't copy extended attributes:",
                    failedAttributes,
                );
        } catch (error) {
            console.warn("Couldn't copy file metadata:", withoutPaths(error));
        }
    }

    /**
     * A publish failed (the show is held on Windows, the folder is gone, the disk is full…). The
     * working copy keeps the changes; try again soon.
     */
    private deferSave(error: unknown, reason: string): SaveOutcome {
        const delay = this.nextRetryDelay();
        const retryAt = Date.now() + delay;
        const errorCode =
            error instanceof RenameRetriesExhaustedError
                ? (((error.cause as NodeJS.ErrnoException)?.code ??
                      "EBUSY") as string)
                : ((error as NodeJS.ErrnoException)?.code ?? undefined);
        const why =
            error instanceof RenameRetriesExhaustedError
                ? "another program is using the file"
                : // On screen only, where the person's own paths are fine; logs use withoutPaths
                  ((error as Error)?.message ?? String(error));
        const message = `Couldn't save ${basename(this.targetPath)}: ${why}. Your changes are kept and OpenMarch will try again.`;
        console.error("Publish deferred:", withoutPaths(error));
        this.scheduleRetry(delay);
        this.setState("deferred", { message, retryAt, errorCode });
        this.options.onPublish?.({
            ok: false,
            state: "deferred",
            errorCode,
            reason,
        });
        return { ok: false, state: "deferred", message };
    }
}
