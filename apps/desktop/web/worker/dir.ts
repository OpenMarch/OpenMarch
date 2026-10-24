/**
 * A folder of files, as the library needs it: the browser's origin private
 * file system (OPFS) in the app, or memory in tests.
 */
export interface Dir {
    /** Names of the files (not folders) in it. */
    files(): Promise<string[]>;
    /** Names of the folders in it. */
    folders(): Promise<string[]>;
    /** A file's bytes; throws if there's no such file. */
    read(name: string): Promise<Uint8Array>;
    /**
     * Writes a whole file, replacing any with that name. Throws if not every
     * byte was written (e.g. out of space); the file may then be partial.
     */
    write(name: string, bytes: Uint8Array): Promise<void>;
    /** Removes a file or (with everything in it) a folder; no error if missing. */
    remove(name: string): Promise<void>;
    /** A folder in it, made if missing. */
    folder(name: string): Promise<Dir>;
}

/** Only in workers, so missing from the DOM types the app is checked with. */
type SyncAccessHandle = {
    truncate(size: number): void;
    write(buffer: Uint8Array, options: { at: number }): number;
    flush(): void;
    close(): void;
};

async function names(
    handle: FileSystemDirectoryHandle,
    kind: "file" | "directory",
): Promise<string[]> {
    const found: string[] = [];
    for await (const [name, entry] of (
        handle as unknown as {
            entries(): AsyncIterable<[string, FileSystemHandle]>;
        }
    ).entries())
        if (entry.kind === kind) found.push(name);
    return found;
}

/** An OPFS folder. Writes use sync access handles: worker only. */
export function opfsDir(handle: FileSystemDirectoryHandle): Dir {
    return {
        files: () => names(handle, "file"),
        folders: () => names(handle, "directory"),
        async read(name) {
            const file = await (await handle.getFileHandle(name)).getFile();
            return new Uint8Array(await file.arrayBuffer());
        },
        async write(name, bytes) {
            const file = await handle.getFileHandle(name, { create: true });
            // Sync access handles work in a worker in every current browser,
            // where createWritable doesn't (Safari).
            const access = await (
                file as unknown as {
                    createSyncAccessHandle(): Promise<SyncAccessHandle>;
                }
            ).createSyncAccessHandle();
            let written: number;
            try {
                access.truncate(0);
                written = access.write(bytes, { at: 0 });
                if (written === bytes.byteLength) access.flush();
            } finally {
                access.close();
            }
            if (written !== bytes.byteLength)
                throw new Error(
                    `Only ${written} of ${bytes.byteLength} bytes were stored`,
                );
        },
        async remove(name) {
            await handle
                .removeEntry(name, { recursive: true })
                .catch((error: DOMException) => {
                    if (error?.name !== "NotFoundError") throw error;
                });
        },
        async folder(name) {
            return opfsDir(
                await handle.getDirectoryHandle(name, { create: true }),
            );
        },
    };
}

/**
 * A folder in memory, for tests. `failWrites` makes the next writes store
 * only part of the file and throw, as a crash or a full disk would.
 */
export class MemoryDir implements Dir {
    readonly entries = new Map<string, Uint8Array>();
    readonly subfolders = new Map<string, MemoryDir>();
    /** Writes left to fail, and how many bytes each keeps. */
    failWrites: { count: number; keep: number } = { count: 0, keep: 0 };

    async files() {
        return [...this.entries.keys()];
    }
    async folders() {
        return [...this.subfolders.keys()];
    }
    async read(name: string) {
        const bytes = this.entries.get(name);
        if (!bytes) throw new Error(`NotFoundError: ${name}`);
        return bytes.slice();
    }
    async write(name: string, bytes: Uint8Array) {
        if (this.failWrites.count > 0) {
            this.failWrites.count--;
            this.entries.set(name, bytes.slice(0, this.failWrites.keep));
            throw new Error("QuotaExceededError: simulated");
        }
        this.entries.set(name, bytes.slice());
    }
    async remove(name: string) {
        this.entries.delete(name);
        this.subfolders.delete(name);
    }
    async folder(name: string) {
        let folder = this.subfolders.get(name);
        if (!folder) {
            folder = new MemoryDir();
            this.subfolders.set(name, folder);
        }
        return folder;
    }
}
