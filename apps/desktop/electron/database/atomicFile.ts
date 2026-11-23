/**
 * Durable file replacement for show files (ADR 0018).
 *
 * A show is replaced by putting a complete, flushed temp file beside it and renaming it over the
 * show, then flushing the folder. Readers (a sync app, a backup, another program) see either the
 * old file or the new one, never a partial write, and no `-journal` ever appears next to the
 * show. Main process only.
 */
import * as fs from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

/**
 * A clock for retry budgets that never jumps: setting the computer's clock or a daylight-saving
 * change mustn't stretch or cut short how long a save keeps retrying.
 */
const monotonicNow = () => performance.now();

/** Flushes a file's contents to disk. On macOS libuv uses F_FULLFSYNC. */
export async function fsyncFile(filePath: string): Promise<void> {
    const handle = await fs.promises.open(filePath, "r+");
    try {
        await handle.sync();
    } finally {
        await handle.close();
    }
}

/**
 * Flushes a folder so a rename inside it survives power loss.
 *
 * Windows can't open a folder for flushing, so this does nothing there. Some file systems refuse
 * the call; that only loses the extra durability, so those errors are ignored.
 */
export async function fsyncDirectory(
    directory: string,
    platform: NodeJS.Platform = process.platform,
): Promise<void> {
    if (platform === "win32") return;
    let handle: fs.promises.FileHandle | undefined;
    try {
        handle = await fs.promises.open(directory, "r");
        await handle.sync();
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (
            code === "EINVAL" ||
            code === "EISDIR" ||
            code === "EPERM" ||
            code === "EBADF" ||
            code === "ENOTSUP"
        )
            return;
        throw error;
    } finally {
        await handle?.close();
    }
}

/**
 * Error codes for a file another process holds open: Windows gives these to a rename or delete
 * while a sync app, an antivirus or the search indexer has the file open without delete sharing.
 */
const BUSY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

export function isBusyError(error: unknown): boolean {
    return BUSY_CODES.has((error as NodeJS.ErrnoException)?.code ?? "");
}

export type RenameRetryOptions = {
    /** The platform to behave as. Retries only happen on Windows. */
    platform?: NodeJS.Platform;
    /** How long to keep retrying, in ms. */
    budgetMs?: number;
    rename?: (from: string, to: string) => Promise<void>;
    sleep?: (ms: number) => Promise<void>;
    /** The clock for the budget, in ms; a monotonic one by default. */
    now?: () => number;
    /** Called before each retry; stops retrying when it returns false. */
    shouldRetry?: () => Promise<boolean>;
};

export class RenameRetriesExhaustedError extends Error {
    readonly attempts: number;
    constructor(attempts: number, cause: unknown) {
        super(
            `Couldn't replace the file after ${attempts} attempts: ${
                (cause as Error)?.message ?? String(cause)
            }`,
            { cause },
        );
        this.name = "RenameRetriesExhaustedError";
        this.attempts = attempts;
    }
}

const defaultSleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Renames `from` over `to`.
 *
 * On Windows a rename over a file fails with EPERM, EBUSY or EACCES while another process has
 * it open without delete sharing. Those failures are retried with a growing delay (10, 20,
 * 30 ms … up to 100 ms) until `budgetMs` runs out, as VS Code and graceful-fs do. Then this
 * throws {@link RenameRetriesExhaustedError} and leaves both files where they were.
 */
export async function renameWithRetry(
    from: string,
    to: string,
    options: RenameRetryOptions = {},
): Promise<{ attempts: number }> {
    const platform = options.platform ?? process.platform;
    const budgetMs = options.budgetMs ?? 5000;
    const rename = options.rename ?? fs.promises.rename;
    const sleep = options.sleep ?? defaultSleep;
    const now = options.now ?? monotonicNow;

    const start = now();
    let attempts = 0;
    for (;;) {
        attempts++;
        try {
            await rename(from, to);
            return { attempts };
        } catch (error) {
            if (platform !== "win32" || !isBusyError(error)) throw error;
            const delay = Math.min(100, attempts * 10);
            if (now() - start + delay > budgetMs)
                throw new RenameRetriesExhaustedError(attempts, error);
            await sleep(delay);
            if (options.shouldRetry && !(await options.shouldRetry()))
                throw new RenameRetriesExhaustedError(attempts, error);
        }
    }
}

/** Deletes a file if it exists, ignoring a missing file. */
export async function removeIfPresent(filePath: string): Promise<void> {
    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
}

export type RemoveRetryOptions = Pick<
    RenameRetryOptions,
    "budgetMs" | "sleep" | "now"
> & {
    /** The longest wait between attempts, in ms. */
    maxDelayMs?: number;
    remove?: (filePath: string) => Promise<void>;
};

/**
 * Deletes a file, retrying for a while when another process holds it (a sync app uploading a
 * temp file it just saw). Returns false, instead of throwing, when it is still there at the end:
 * callers clean up best effort and must not hide the error they are handling.
 */
export async function removeWithRetry(
    filePath: string,
    {
        budgetMs = 2000,
        sleep = defaultSleep,
        now = monotonicNow,
        maxDelayMs = 200,
        remove = removeIfPresent,
    }: RemoveRetryOptions = {},
): Promise<boolean> {
    const start = now();
    for (let attempt = 1; ; attempt++) {
        try {
            await remove(filePath);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === "ENOENT")
                return true;
            const delay = Math.min(maxDelayMs, attempt * 25);
            if (!isBusyError(error) || now() - start + delay > budgetMs)
                return false;
            await sleep(delay);
        }
    }
}

/**
 * How long a temp file a sync app still holds keeps being deleted in the background. Sync apps
 * can hold a new file for 20 s or more while they upload it.
 */
export const LINGERING_DELETE_MS = 60_000;

/**
 * Deletes a file now if it can, and otherwise keeps trying in the background (every 2 s at
 * most, for {@link LINGERING_DELETE_MS}). Resolves to whether the first, short try removed it;
 * `lingering` settles when the background tries end.
 */
export async function removeNowOrLater(
    filePath: string,
    options: RemoveRetryOptions & { lingerMs?: number } = {},
): Promise<{ removed: boolean; lingering: Promise<boolean> }> {
    const { lingerMs = LINGERING_DELETE_MS, ...rest } = options;
    if (await removeWithRetry(filePath, rest))
        return { removed: true, lingering: Promise.resolve(true) };
    const lingering = removeWithRetry(filePath, {
        ...rest,
        budgetMs: lingerMs,
        maxDelayMs: 2000,
    });
    pendingDeletes.add(lingering);
    void lingering.finally(() => pendingDeletes.delete(lingering));
    return { removed: false, lingering };
}

/** Background deletes {@link removeNowOrLater} started that haven't finished. */
const pendingDeletes = new Set<Promise<boolean>>();

/** How many background deletes are still trying. */
export function pendingDeleteCount(): number {
    return pendingDeletes.size;
}

/**
 * Before the app quits: waits for the background deletes still trying, at most `capMs`, so a
 * temp file a sync app let go of a few seconds late doesn't stay beside the show. Never
 * rejects, and resolves at the cap whatever is still pending, so quitting can't hang.
 */
export async function settlePendingDeletes(
    capMs = 10_000,
): Promise<{ settled: boolean }> {
    if (pendingDeletes.size === 0) return { settled: true };
    let timer: NodeJS.Timeout | undefined;
    const cap = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), capMs);
    });
    try {
        const settled = await Promise.race([
            Promise.allSettled([...pendingDeletes]).then(() => true as const),
            cap,
        ]);
        return { settled };
    } finally {
        clearTimeout(timer);
    }
}

/** A temp file's name beside `target`: `.~<name>.<hex>.tmp`. */
export function tempPathBeside(target: string): string {
    return join(
        dirname(target),
        `.~${basename(target)}.${randomBytes(4).toString("hex")}.tmp`,
    );
}

/** Matches the temp files {@link tempPathBeside} makes for a file named `fileName`. */
export function tempFilePattern(fileName: string): RegExp {
    const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Older builds wrote the snapshot beside the show, so a crash could also leave its journal.
    return new RegExp(`^\\.~${escaped}\\.[0-9a-f]+\\.tmp(-journal)?$`);
}

export type PublishOptions = RenameRetryOptions & {
    /** Runs on the finished temp file just before the rename (copy permissions, a last check). */
    beforeRename?: (tempPath: string) => Promise<void>;
    /** Overrides for deleting the temp file after a failure, for tests. */
    removeOptions?: RemoveRetryOptions & { lingerMs?: number };
};

/**
 * Copies `source` to the new file `to` and flushes it, through the one handle that created it.
 * A sync app opens a new file as soon as it appears, often without delete sharing on Windows;
 * opening the file again to flush it would then fail with EBUSY, so it is never reopened.
 */
async function writeDurableCopy(source: string, to: string): Promise<void> {
    const out = await fs.promises.open(to, "wx");
    try {
        const input = await fs.promises.open(source, "r");
        try {
            const buffer = Buffer.allocUnsafe(1024 * 1024);
            for (;;) {
                const { bytesRead } = await input.read(
                    buffer,
                    0,
                    buffer.length,
                );
                if (bytesRead === 0) break;
                let written = 0;
                while (written < bytesRead) {
                    const { bytesWritten } = await out.write(
                        buffer,
                        written,
                        bytesRead - written,
                    );
                    written += bytesWritten;
                }
            }
        } finally {
            await input.close();
        }
        await out.sync();
    } finally {
        await out.close();
    }
}

/**
 * Puts a copy of the finished file `source` at `target`, all at once.
 *
 * `source` is built somewhere private (the app's user data); only the finished bytes go beside
 * `target`, as a temp file that is flushed and then renamed over it. The temp file is removed
 * again if anything fails. `source` is left as it is.
 */
export async function publishFile(
    source: string,
    target: string,
    options: PublishOptions = {},
): Promise<{ attempts: number; tempPath: string }> {
    const tempPath = tempPathBeside(target);
    try {
        await writeDurableCopy(source, tempPath);
        await options.beforeRename?.(tempPath);
        const result = await renameWithRetry(tempPath, target, options);
        await fsyncDirectory(dirname(target), options.platform);
        return { ...result, tempPath };
    } catch (error) {
        // A sync app may hold the new temp file for a while: keep deleting it in the background
        // rather than leave it beside the show until the next open.
        await removeNowOrLater(tempPath, {
            sleep: options.sleep,
            now: options.now,
            ...options.removeOptions,
        });
        throw error;
    }
}

/**
 * Whether `a` and `b` name the same file: the same device and inode when both exist, otherwise
 * the same real path (ignoring case on Windows and macOS, whose file systems usually do).
 */
export function isSameFile(
    a: string,
    b: string,
    platform: NodeJS.Platform = process.platform,
): boolean {
    if (!a || !b) return false;
    try {
        const statA = fs.statSync(a, { bigint: true });
        const statB = fs.statSync(b, { bigint: true });
        if (statA.ino !== 0n && statB.ino !== 0n)
            return statA.dev === statB.dev && statA.ino === statB.ino;
    } catch {
        // One of them doesn't exist (yet): compare paths.
    }
    const real = (p: string) => {
        try {
            return fs.realpathSync.native(p);
        } catch {
            try {
                return join(fs.realpathSync.native(dirname(p)), basename(p));
            } catch {
                return resolve(p);
            }
        }
    };
    const fold = (p: string) =>
        platform === "win32" || platform === "darwin" ? p.toLowerCase() : p;
    return fold(real(a)) === fold(real(b));
}
