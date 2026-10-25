/**
 * The shows this browser keeps, in the origin private file system (OPFS):
 *
 *     openmarch-<channel>/            (one per release channel)
 *       library/
 *         index.<n>.json              which shows there are (see webLibrary.ts)
 *         shows/<id>/
 *           show.<n>.dots             the show
 *           meta.<n>.json             its name, to rebuild the index from
 *           v-<version id>.dots       its versions
 *           deleted                   marks a delete in progress
 *
 * Crash-safe writes: the index and each show are written to a new file
 * (generation `<n>` + 1) and the older generations are removed only once it
 * is complete. Reading takes the newest generation that is whole, so a write
 * cut short by a crash or a full disk leaves the previous one in place.
 * A version file is listed in the index only after it is written.
 *
 * Nothing the index doesn't describe is deleted: a show folder it doesn't
 * list (a crash between writing a show and the index) is added back, and if
 * no index can be read at all, the index is rebuilt from the folders. An
 * index in a newer format than this build knows leaves the library read
 * only. See docs/adr/0002-web-show-library.md.
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

/** Why a library can't be changed: it was written by a newer version. */
export type ReadOnlyReason = "newer-format";

/** Names a recovered show when its name can't be read. */
const RECOVERED_NAME = "Recovered show";

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

/** Whether an index file is in a format newer than this build reads. */
function isNewerFormat(bytes: Uint8Array): boolean {
    try {
        const value = JSON.parse(new TextDecoder().decode(bytes)) as {
            format?: unknown;
        };
        return typeof value?.format === "number" && value.format > 1;
    } catch {
        return false;
    }
}

function parseMeta(bytes: Uint8Array): { name: string } | null {
    try {
        const value = JSON.parse(new TextDecoder().decode(bytes)) as {
            name?: unknown;
        };
        return typeof value?.name === "string" ? { name: value.name } : null;
    } catch {
        return null;
    }
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
        /** Set when this build must not change the library. */
        readonly readOnly: ReadOnlyReason | null = null,
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
        // A newer build's library: list nothing, change nothing.
        for (const file of await root.files()) {
            if (parseGeneration(file, "index", "json") === null) continue;
            const bytes = await root.read(file).catch(() => null);
            if (bytes && isNewerFormat(bytes))
                return new Library(
                    root,
                    emptyIndex(),
                    now,
                    newId,
                    "newer-format",
                );
        }
        const index = await readGeneration(root, "index", "json", parseIndex);
        const library = new Library(root, index ?? emptyIndex(), now, newId);
        if (!index) await library.migrateLegacy(base);
        await library.reconcile();
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
        this.assertWritable();
        await writeGeneration(
            this.root,
            "index",
            "json",
            new TextEncoder().encode(JSON.stringify(next)),
        );
        this.index = next;
    }

    private assertWritable() {
        if (this.readOnly)
            throw new Error(
                "These shows were saved by a newer version of OpenMarch. Use that version to change them.",
            );
    }

    /** Records a show's name beside it, so a lost index can be rebuilt. */
    private async writeMeta(id: string, name: string) {
        await writeGeneration(
            await this.showDir(id),
            "meta",
            "json",
            new TextEncoder().encode(JSON.stringify({ name })),
        ).catch((error) =>
            // Only used to rebuild a lost index; the show is stored.
            console.warn("Couldn't record the show's name beside it:", error),
        );
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

    /**
     * Brings the index in line with the folders without deleting anything
     * it doesn't describe: adds back show folders it doesn't list (or all of
     * them, when no index could be read), finishes deletes that were cut
     * short, lists version files it lost, and forgets versions whose files
     * are gone (e.g. dropped to make room before the index was written).
     */
    private async reconcile() {
        const shows = await this.root.folder("shows");
        let next = this.index;
        for (const id of await shows.folders()) {
            const dir = await shows.folder(id);
            const files = await dir.files();
            if (files.includes("deleted")) {
                // Its delete was cut short after the index dropped it: it
                // was meant to go. Still listed: the delete never happened.
                if (!findShow(next, id)) {
                    await shows.remove(id);
                    continue;
                }
                await dir.remove("deleted");
            }
            let show = findShow(next, id);
            if (!show) {
                const bytes = await readGeneration(dir, "show", "dots", (b) =>
                    isDatabase(b) ? b : null,
                );
                // No whole show here: leave the folder as it is.
                if (!bytes) continue;
                const meta = await readGeneration(
                    dir,
                    "meta",
                    "json",
                    parseMeta,
                );
                next = addShow(next, {
                    id,
                    name: meta?.name ?? RECOVERED_NAME,
                    now: this.now(),
                    backedUp: false,
                });
                show = findShow(next, id)!;
            }
            const present = new Set(files);
            const listed = new Set(show.versions.map(versionFile));
            const kept = show.versions.filter((v) =>
                present.has(versionFile(v)),
            );
            if (kept.length !== show.versions.length)
                next = {
                    ...next,
                    shows: next.shows.map((s) =>
                        s.id === id ? { ...s, versions: kept } : s,
                    ),
                };
            for (const file of files) {
                const match = /^v-(\d+)\.dots$/.exec(file);
                if (!match || listed.has(file)) continue;
                const result = addVersion(next, id, {
                    id: match[1],
                    at: Number(match[1]),
                    reason: "edit",
                });
                next = result.index;
                for (const old of result.dropped)
                    await dir.remove(versionFile(old));
            }
        }
        if (next !== this.index)
            await this.commit(next).catch((error) => {
                // Use it anyway; the next change writes it.
                console.warn("Couldn't write the reconciled index:", error);
                this.index = next;
            });
    }

    /** Adds a show; returns its id. */
    addShow(
        name: string,
        bytes: Uint8Array,
        { backedUp }: { backedUp: boolean },
    ): Promise<string> {
        return this.enqueue(async () => {
            this.assertWritable();
            const id = this.newId();
            await writeGeneration(
                await this.showDir(id),
                "show",
                "dots",
                bytes,
            );
            const next = addShow(this.index, {
                id,
                name,
                now: this.now(),
                backedUp,
            });
            await this.writeMeta(id, findShow(next, id)!.name);
            await this.commit(next);
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
            this.assertWritable();
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
        // Files first: on a full disk even the index can't be written until
        // they're gone. An index listing a missing version is tolerated.
        const dir = await this.showDir(id);
        for (const version of dropped) await dir.remove(versionFile(version));
        this.index = index;
        await this.commit(index).catch((error) =>
            console.warn(
                "Couldn't write the index after freeing space:",
                error,
            ),
        );
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
            if (this.readOnly) return;
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
            this.assertWritable();
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
        return this.enqueue(async () => {
            const next = renameShow(this.index, id, name);
            await this.commit(next);
            await this.writeMeta(id, findShow(next, id)!.name);
        });
    }

    /** Adds a copy of a show (without its versions); returns the copy's id. */
    duplicate(
        id: string,
        copyName?: (name: string) => string,
    ): Promise<string> {
        return this.enqueue(async () => {
            this.assertWritable();
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
            const next = duplicateShow(
                this.index,
                id,
                newId,
                this.now(),
                copyName,
            );
            await this.writeMeta(newId, findShow(next, newId)!.name);
            await this.commit(next);
            return newId;
        });
    }

    remove(id: string): Promise<void> {
        return this.enqueue(async () => {
            this.assertWritable();
            const shows = await this.root.folder("shows");
            // Marked first, so a delete cut short after the index is
            // written finishes on the next start instead of coming back.
            await (
                await shows.folder(id)
            ).write("deleted", new Uint8Array([1]));
            await this.commit(removeShow(this.index, id));
            await shows.remove(id);
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
