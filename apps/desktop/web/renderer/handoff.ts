/**
 * Carries the show across a reload in a tab that keeps it in memory only
 * (a private window, or a second tab while another holds the stored copy).
 *
 * Opening or creating a show reloads the page, as Electron reloads the
 * window, and the worker reopens the show from storage. A memory-only tab
 * has no stored copy, so just before reloading it puts the show here, under
 * an id only this tab knows, and takes it back as the page starts again.
 *
 * Uses IndexedDB, which browsers allow in private windows (kept in memory
 * until the window closes) where they may not allow the origin private file
 * system.
 */
import { storageKey } from "./channel";

export type HandedOffShow = {
    bytes: Uint8Array;
    name: string;
    /** Whether the show had changes that weren't downloaded. */
    changed: boolean;
    /**
     * Whether the person has a copy elsewhere: it came from a file they
     * picked. A new show, or one with changes, wasn't backed up.
     */
    backedUp: boolean;
};

type Entry = HandedOffShow & { at: number };

const DATABASE = storageKey("handoff");
const STORE = "shows";
const TAB_KEY = storageKey("tab");
/** A show no tab took back by then was left by a tab that closed. */
const STALE_MS = 60 * 60 * 1000;

/** This tab's id. sessionStorage is per tab and survives a reload. */
function tabId(): string {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function openDatabase(): Promise<IDBDatabase> {
    const req = indexedDB.open(DATABASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    return request(req);
}

async function withStore<T>(
    mode: IDBTransactionMode,
    use: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
    const db = await openDatabase();
    try {
        const transaction = db.transaction(STORE, mode);
        const done = new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        // Reported by `use` when it fails first.
        done.catch(() => {});
        const result = await use(transaction.objectStore(STORE));
        await done;
        return result;
    } finally {
        db.close();
    }
}

/**
 * A handed-off show as stored. Entries from before `backedUp` existed
 * count as not backed up: claiming a backup that may not exist is worse.
 */
export function fromEntry(
    entry: Partial<HandedOffShow> & Pick<HandedOffShow, "bytes" | "name">,
): HandedOffShow {
    return {
        bytes: entry.bytes,
        name: entry.name,
        changed: entry.changed ?? false,
        backedUp: entry.backedUp === true,
    };
}

/**
 * The worker's `web:openShow` arguments for reopening a handed-off show:
 * not forced, and backed up only if it really was.
 */
export function openShowArgs(
    show: HandedOffShow,
): [Uint8Array, string, boolean, boolean] {
    return [show.bytes, show.name, false, show.backedUp];
}

/** Keeps `show` for this tab's next page. Throws if the browser won't. */
export async function handOffShow(show: HandedOffShow): Promise<void> {
    const id = tabId();
    const entry: Entry = { ...show, at: Date.now() };
    await withStore("readwrite", (store) => request(store.put(entry, id)));
}

/**
 * Reads back the show this tab handed off before reloading, if any. It stays
 * kept until {@link forgetHandedOffShow}, once it's open again, so a failed
 * reopen (or the page being killed first) doesn't lose it.
 */
export async function takeHandedOffShow(): Promise<HandedOffShow | null> {
    let id: string;
    try {
        id = tabId();
        if (typeof indexedDB === "undefined") return null;
    } catch {
        return null;
    }
    return withStore("readwrite", async (store) => {
        const entry = (await request(store.get(id))) as Entry | undefined;
        // Clear shows left by tabs that closed before taking theirs back.
        const ids = (await request(store.getAllKeys())) as string[];
        const entries = (await request(store.getAll())) as Entry[];
        const now = Date.now();
        for (const [index, other] of entries.entries())
            if (ids[index] !== id && now - other.at > STALE_MS)
                await request(store.delete(ids[index]));
        return entry ? fromEntry(entry) : null;
    });
}

/** Drops this tab's handed-off show once it has been opened again. */
export async function forgetHandedOffShow(): Promise<void> {
    const id = tabId();
    await withStore("readwrite", (store) => request(store.delete(id)));
}
