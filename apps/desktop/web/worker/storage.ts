/**
 * Keeps a copy of the open show in the browser's origin private file system
 * (OPFS), so a reload, a crash or closing the tab doesn't lose work. The copy
 * is a convenience, not the saved file: browsers can clear site storage
 * (Safari after 7 days without a visit), so the person's real copy is the
 * `.dots` file they download.
 *
 * Each copy is written to a new file named `<sequence>-<show name>`, and
 * older ones are removed only after it is complete, so a write cut short
 * leaves the previous copy to restore.
 *
 * One tab per release channel holds a Web Lock on this storage. Another tab
 * keeps its show in memory only, rather than overwriting the first tab's.
 */

export type StorageStatus =
    | { storage: "opfs" }
    | { storage: "memory"; problem: "other-tab" | "unsupported" };

let folder: FileSystemDirectoryHandle | null = null;

/** Only in workers, so missing from the DOM types the app is checked with. */
type SyncAccessHandle = {
    truncate(size: number): void;
    write(buffer: Uint8Array, options: { at: number }): number;
    flush(): void;
    close(): void;
};
let sequence = 0;
/** Writes and removals run one at a time, in order. */
let queue: Promise<unknown> = Promise.resolve();

const SQLITE_HEADER = "SQLite format 3\0";

function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
}

/** Holds `name` for the life of the worker; false if another tab has it. */
function holdLock(name: string): Promise<boolean> {
    return new Promise((resolve) => {
        navigator.locks
            .request(name, { ifAvailable: true }, (lock) => {
                resolve(lock !== null);
                // Never settles while we hold it: released when the page goes.
                return lock ? new Promise(() => {}) : undefined;
            })
            .catch(() => resolve(false));
    });
}

/**
 * Claims this release channel's storage.
 *
 * @param namespace keeps the stable and nightly builds' shows apart, since
 * they share an origin and a show migrated by nightly may not open in stable.
 */
export async function claimStorage(namespace: string): Promise<StorageStatus> {
    if (
        typeof navigator.storage?.getDirectory !== "function" ||
        !navigator.locks
    )
        return { storage: "memory", problem: "unsupported" };
    if (!(await holdLock(`openmarch-web:${namespace}:show`)))
        return { storage: "memory", problem: "other-tab" };
    try {
        const root = await navigator.storage.getDirectory();
        folder = await root.getDirectoryHandle(`openmarch-${namespace}`, {
            create: true,
        });
        return { storage: "opfs" };
    } catch (error) {
        console.warn("Shows will be kept in memory only:", error);
        return { storage: "memory", problem: "unsupported" };
    }
}

type Entry = { file: string; sequence: number; name: string };

async function entries(): Promise<Entry[]> {
    if (!folder) return [];
    const found: Entry[] = [];
    for await (const file of (
        folder as unknown as { keys(): AsyncIterable<string> }
    ).keys()) {
        const match = /^(\d+)-(.+)$/.exec(file);
        if (match)
            found.push({
                file,
                sequence: Number(match[1]),
                name: decodeURIComponent(match[2]),
            });
    }
    return found.sort((a, b) => b.sequence - a.sequence);
}

async function readFile(file: string): Promise<Uint8Array> {
    const handle = await folder!.getFileHandle(file);
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
}

const isDatabase = (bytes: Uint8Array) =>
    new TextDecoder().decode(bytes.subarray(0, 16)) === SQLITE_HEADER;

/** The newest complete copy of the show, if there is one. */
export function readShow(): Promise<{
    name: string;
    bytes: Uint8Array;
} | null> {
    return enqueue(async () => {
        for (const entry of await entries()) {
            sequence = Math.max(sequence, entry.sequence);
            const bytes = await readFile(entry.file);
            if (isDatabase(bytes)) return { name: entry.name, bytes };
        }
        return null;
    });
}

/** Replaces the stored copy with `bytes`. */
export function writeShow(name: string, bytes: Uint8Array): Promise<void> {
    return enqueue(async () => {
        if (!folder) return;
        const file = `${++sequence}-${encodeURIComponent(name)}`;
        const handle = await folder.getFileHandle(file, { create: true });
        // Sync access handles work in a worker in every current browser,
        // where createWritable doesn't (Safari).
        const access = await (
            handle as unknown as {
                createSyncAccessHandle(): Promise<SyncAccessHandle>;
            }
        ).createSyncAccessHandle();
        try {
            access.truncate(0);
            access.write(bytes, { at: 0 });
            access.flush();
        } finally {
            access.close();
        }
        for (const entry of await entries())
            if (entry.file !== file) await folder.removeEntry(entry.file);
    });
}

/** Removes the stored copy, e.g. when the show is closed. */
export function clearShow(): Promise<void> {
    return enqueue(async () => {
        if (!folder) return;
        for (const entry of await entries())
            await folder.removeEntry(entry.file);
    });
}
