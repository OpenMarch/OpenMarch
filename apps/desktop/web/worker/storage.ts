/**
 * Claims this release channel's folder in the browser's origin private file
 * system (OPFS), where the show library lives (see `./library.ts`).
 *
 * One tab per release channel holds a Web Lock on it. Another tab keeps its
 * show in memory only, rather than writing over the first tab's library.
 */
import { opfsDir, type Dir } from "./dir";
import type { StorageProblem } from "../protocol";

export type StorageStatus =
    | { storage: "opfs"; dir: Dir }
    | { storage: "memory"; problem: Exclude<StorageProblem, "newer-format"> };

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
 * @param namespace keeps each release channel's shows apart, for builds
 * served from one origin (see `../renderer/channel.ts`).
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
        const folder = await root.getDirectoryHandle(`openmarch-${namespace}`, {
            create: true,
        });
        const dir = opfsDir(folder);
        // Private Browsing may hand out a folder that can't hold a file.
        await dir.write(".probe", new Uint8Array([1]));
        await dir.remove(".probe");
        return { storage: "opfs", dir };
    } catch (error) {
        console.warn("Shows will be kept in memory only:", error);
        return { storage: "memory", problem: "unsupported" };
    }
}
