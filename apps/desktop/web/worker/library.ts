/**
 * The shows this browser keeps, in the origin private file system (OPFS):
 *
 *     openmarch-<channel>/            (one per release channel)
 *       library/
 *         index.<n>.json              which shows there are (see webLibrary.ts)
 *         shows/<id>/
 *           show.<n>.dots             the show
 *           v-<version id>.dots       its versions
 *
 * Crash-safe writes: the index and each show are written to a new file
 * (generation `<n>` + 1) and the older generations are removed only once it
 * is complete. Reading takes the newest generation that is whole, so a write
 * cut short by a crash or a full disk leaves the previous one in place.
 * A version file is listed in the index only after it is written.
 *
 * Earlier builds kept one show as `openmarch-<channel>/<sequence>-<name>`;
 * {@link Library.open} moves it into the library.
 */
import {
    addShow,
    addVersion,
    dropOldestVersions,
    duplicateShow,
    emptyIndex,
    findShow,
    isLibraryIndex,
    newVersionId,
    parseGeneration,
    parseLegacyName,
    recordBackup,
    recordEdit,
    removeShow,
    renameShow,
    setOpen,
    shouldKeepVersion,
    summaries,
    type LibraryIndex,
    type ShowSummary,
    type VersionEntry,
    type VersionReason,
} from "@/utilities/webLibrary";
import type { Dir } from "./dir";

const SQLITE_HEADER = "SQLite format 3\0";

export const isDatabase = (bytes: Uint8Array) =>
    bytes.byteLength >= 100 &&
    new TextDecoder().decode(bytes.subarray(0, 16)) === SQLITE_HEADER;

/** Writes `bytes` as the next generation of `<base>.<n>.<ext>`, then removes the older ones. */
export async function writeGeneration(
    dir: Dir,
    base: string,
    ext: string,
    bytes: Uint8Array,
): Promise<void> {
    const existing = (await dir.files())
        .map((file) => ({ file, n: parseGeneration(file, base, ext) }))
        .filter((entry): entry is { file: string; n: number } =>
            Number.isFinite(entry.n),
        );
    const next = Math.max(0, ...existing.map((entry) => entry.n)) + 1;
    const file = `${base}.${next}.${ext}`;
    try {
        await dir.write(file, bytes);
    } catch (error) {
        // Cut short: drop the partial file; the previous generation stays.
        await dir.remove(file).catch(() => {});
        throw error;
    }
    for (const entry of existing) await dir.remove(entry.file);
}

/** The newest generation of `<base>.<n>.<ext>` that `isWhole` accepts. */
export async function readGeneration<T>(
    dir: Dir,
    base: string,
    ext: string,
    accept: (bytes: Uint8Array) => T | null,
): Promise<T | null> {
    const candidates = (await dir.files())
        .map((file) => ({ file, n: parseGeneration(file, base, ext) }))
        .filter((entry): entry is { file: string; n: number } =>
            Number.isFinite(entry.n),
        )
        .sort((a, b) => b.n - a.n);
    for (const { file } of candidates) {
        try {
            const value = accept(await dir.read(file));
            if (value !== null) return value;
        } catch {
            // Unreadable: try the one before.
        }
    }
    return null;
}

function parseIndex(bytes: Uint8Array): LibraryIndex | null {
    try {
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
        return isLibraryIndex(value) ? value : null;
    } catch {
        return null;
    }
}

const versionFile = (version: Pick<VersionEntry, "id">) =>
    `v-${version.id}.dots`;

/** How many old versions to drop to make room when a save runs out of space. */
const VERSIONS_FREED_WHEN_FULL = 5;

export class Library {
    private index: LibraryIndex;
    /** Changes run one at a time, in order. */
    private queue: Promise<unknown> = Promise.resolve();

    private constructor(
        private readonly root: Dir,
        index: LibraryIndex,
        private readonly now: () => number,
        private readonly newId: () => string,
    ) {
        this.index = index;
    }

    /**
     * Opens the library in `base` (this channel's folder), moving a show
     * kept by an earlier build into it.
     */
    static async open(
        base: Dir,
        {
            now = Date.now,
            newId = () => crypto.randomUUID(),
        }: { now?: () => number; newId?: () => string } = {},
    ): Promise<Library> {
        const root = await base.folder("library");
        const index = await readGeneration(root, "index", "json", parseIndex);
        const library = new Library(root, index ?? emptyIndex(), now, newId);
        if (!index) await library.migrateLegacy(base);
        await library.removeStrays();
        return library;
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const result = this.queue.then(task, task);
        this.queue = result.catch(() => {});
        return result;
    }

    /** The current index (read-only). */
    get current(): LibraryIndex {
        return this.index;
    }

    list(): ShowSummary[] {
        return summaries(this.index);
    }

    private async commit(next: LibraryIndex) {
        await writeGeneration(
            this.root,
            "index",
            "json",
            new TextEncoder().encode(JSON.stringify(next)),
        );
        this.index = next;
    }

    private async showDir(id: string) {
        return (await this.root.folder("shows")).folder(id);
    }

    /** The single show of an earlier build becomes the library's first, still open. */
    private async migrateLegacy(base: Dir) {
        const legacy = (await base.files())
            .map((file) => ({ file, parsed: parseLegacyName(file) }))
            .filter(
                (
                    entry,
                ): entry is {
                    file: string;
                    parsed: { sequence: number; name: string };
                } => entry.parsed !== null,
            )
            .sort((a, b) => b.parsed.sequence - a.parsed.sequence);
        for (const { file, parsed } of legacy) {
            const bytes = await base.read(file).catch(() => null);
            if (!bytes || !isDatabase(bytes)) continue;
            const id = this.newId();
            await writeGeneration(
                await this.showDir(id),
                "show",
                "dots",
                bytes,
            );
            await this.commit(
                setOpen(
                    addShow(this.index, {
                        id,
                        name: parsed.name,
                        now: this.now(),
                        backedUp: false,
                    }),
                    id,
                ),
            );
            break;
        }
        // Only once the library has it (or there was nothing whole to keep)
        for (const { file } of legacy) await base.remove(file);
    }

    /** Removes show folders and version files the index doesn't list (left by a crash). */
    private async removeStrays() {
        const shows = await this.root.folder("shows");
        for (const id of await shows.folders()) {
            const show = findShow(this.index, id);
            if (!show) {
                await shows.remove(id);
                continue;
            }
            const listed = new Set(show.versions.map(versionFile));
            const dir = await shows.folder(id);
            for (const file of await dir.files())
                if (file.startsWith("v-") && !listed.has(file))
                    await dir.remove(file);
        }
    }

    /** Adds a show; returns its id. */
    addShow(
        name: string,
        bytes: Uint8Array,
        { backedUp }: { backedUp: boolean },
    ): Promise<string> {
        return this.enqueue(async () => {
            const id = this.newId();
            await writeGeneration(
                await this.showDir(id),
                "show",
                "dots",
                bytes,
            );
            await this.commit(
                addShow(this.index, { id, name, now: this.now(), backedUp }),
            );
            return id;
        });
    }

    readShow(id: string): Promise<Uint8Array> {
        return this.enqueue(async () => {
            if (!findShow(this.index, id)) throw new Error(`No show ${id}`);
            const bytes = await readGeneration(
                await this.showDir(id),
                "show",
                "dots",
                (b) => (isDatabase(b) ? b : null),
            );
            if (!bytes) throw new Error(`The stored copy of ${id} is missing`);
            return bytes;
        });
    }

    /**
     * Stores the show's latest bytes, which have changes, and keeps a
     * version if one is due. If the disk is full, drops the oldest versions
     * and tries once more.
     */
    saveShow(id: string, bytes: Uint8Array): Promise<void> {
        return this.enqueue(async () => {
            const dir = await this.showDir(id);
            try {
                await writeGeneration(dir, "show", "dots", bytes);
            } catch (error) {
                if (!(await this.freeVersions(id))) throw error;
                await writeGeneration(dir, "show", "dots", bytes);
            }
            const now = this.now();
            await this.commit(recordEdit(this.index, id, now));
            await this.keepVersionNow(id, "edit", bytes).catch((error) =>
                // The show itself is stored; a version can wait.
                console.warn("Couldn't keep a version:", error),
            );
        });
    }

    private async freeVersions(id: string): Promise<boolean> {
        const show = findShow(this.index, id);
        if (!show?.versions.length) return false;
        const { index, dropped } = dropOldestVersions(
            this.index,
            id,
            VERSIONS_FREED_WHEN_FULL,
        );
        await this.commit(index);
        const dir = await this.showDir(id);
        for (const version of dropped) await dir.remove(versionFile(version));
        return true;
    }

    private async keepVersionNow(
        id: string,
        reason: VersionReason,
        bytes: Uint8Array,
    ) {
        const show = findShow(this.index, id);
        const now = this.now();
        if (!show || !shouldKeepVersion(show, reason, now)) return;
        const version: VersionEntry = {
            id: newVersionId(show, now),
            at: now,
            reason,
        };
        const dir = await this.showDir(id);
        await dir.write(versionFile(version), bytes).catch(async (error) => {
            await dir.remove(versionFile(version)).catch(() => {});
            throw error;
        });
        const { index, dropped } = addVersion(this.index, id, version);
        await this.commit(index);
        for (const old of dropped) await dir.remove(versionFile(old));
    }

    /** Keeps a version of the stored show now if it changed since its newest one. */
    keepVersion(id: string, reason: VersionReason): Promise<void> {
        return this.enqueue(async () => {
            const bytes = await readGeneration(
                await this.showDir(id),
                "show",
                "dots",
                (b) => (isDatabase(b) ? b : null),
            );
            if (bytes) await this.keepVersionNow(id, reason, bytes);
        });
    }

    readVersion(id: string, versionId: string): Promise<Uint8Array> {
        return this.enqueue(async () => {
            const show = findShow(this.index, id);
            const version = show?.versions.find((v) => v.id === versionId);
            if (!version) throw new Error(`No version ${versionId} of ${id}`);
            const bytes = await (
                await this.showDir(id)
            ).read(versionFile(version));
            if (!isDatabase(bytes))
                throw new Error(`Version ${versionId} of ${id} is damaged`);
            return bytes;
        });
    }

    /**
     * Makes version `versionId` the show's current state. The state it
     * replaces is kept as a version first, so nothing is lost.
     */
    restoreVersion(id: string, versionId: string): Promise<void> {
        return this.enqueue(async () => {
            const show = findShow(this.index, id);
            const version = show?.versions.find((v) => v.id === versionId);
            if (!show || !version)
                throw new Error(`No version ${versionId} of ${id}`);
            const dir = await this.showDir(id);
            const restored = await dir.read(versionFile(version));
            if (!isDatabase(restored))
                throw new Error(`Version ${versionId} of ${id} is damaged`);
            const current = await readGeneration(dir, "show", "dots", (b) =>
                isDatabase(b) ? b : null,
            );
            if (current) {
                // Always kept, even if a version has the same state: this
                // one is newest, so pruning can't take it first.
                await this.commit({
                    ...this.index,
                    shows: this.index.shows.map((s) =>
                        s.id === id ? { ...s, changedSinceVersion: true } : s,
                    ),
                });
                await this.keepVersionNow(id, "before-restore", current);
            }
            await writeGeneration(dir, "show", "dots", restored);
            await this.commit(recordEdit(this.index, id, this.now()));
        });
    }

    rename(id: string, name: string): Promise<void> {
        return this.enqueue(() =>
            this.commit(renameShow(this.index, id, name)),
        );
    }

    /** Adds a copy of a show (without its versions); returns the copy's id. */
    duplicate(
        id: string,
        copyName?: (name: string) => string,
    ): Promise<string> {
        return this.enqueue(async () => {
            const bytes = await readGeneration(
                await this.showDir(id),
                "show",
                "dots",
                (b) => (isDatabase(b) ? b : null),
            );
            if (!bytes) throw new Error(`The stored copy of ${id} is missing`);
            const newId = this.newId();
            await writeGeneration(
                await this.showDir(newId),
                "show",
                "dots",
                bytes,
            );
            await this.commit(
                duplicateShow(this.index, id, newId, this.now(), copyName),
            );
            return newId;
        });
    }

    remove(id: string): Promise<void> {
        return this.enqueue(async () => {
            await this.commit(removeShow(this.index, id));
            await (await this.root.folder("shows")).remove(id);
        });
    }

    setOpen(id: string | null): Promise<void> {
        return this.enqueue(() => this.commit(setOpen(this.index, id)));
    }

    recordBackup(id: string): Promise<void> {
        return this.enqueue(() =>
            this.commit(recordBackup(this.index, id, this.now())),
        );
    }
}
