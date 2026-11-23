import { Worker } from "node:worker_threads";
import type { FileIdentity, FileStatIdentity } from "./fileIdentity";

/**
 * The publish worker's code (ADR 0018). It runs as an eval'd CommonJS worker so it works the
 * same in the bundled main process, in Vitest and in plain Node, without a separate build entry.
 *
 * The worker holds its own connection to the working copy. For each publish it:
 * 1. reads the show's identity for the conflict check, hashing the show only when its size,
 *    modification time, inode or device differ from what was expected;
 * 2. writes a consistent snapshot of the working copy with `VACUUM INTO`, into the working copy's
 *    own folder in the app's user data. A WAL reader doesn't block the editing connection, so
 *    edits continue;
 * 3. flushes the snapshot to disk and hashes it.
 * The main process then checks for conflicts and publishes the snapshot beside the show.
 */
const WORKER_SOURCE = String.raw`
const { parentPort } = require("node:worker_threads");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { DatabaseSync } = require("node:sqlite");

let db = null;

function hashFile(filePath) {
    const hash = crypto.createHash("sha256");
    const fd = fs.openSync(filePath, "r");
    try {
        const buffer = Buffer.allocUnsafe(1024 * 1024);
        let bytesRead;
        while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0)
            hash.update(buffer.subarray(0, bytesRead));
    } finally {
        fs.closeSync(fd);
    }
    return hash.digest("hex");
}

function statOf(filePath) {
    try {
        const s = fs.statSync(filePath);
        return { size: s.size, mtimeMs: s.mtimeMs, ino: s.ino, dev: s.dev };
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

function sameStat(a, b) {
    return !!a && !!b && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ino === b.ino && a.dev === b.dev;
}

/**
 * The file's identity. Hashes only when "expected" is given and the stat differs from it, or
 * when "alwaysHash" is set. The hash belongs to the stat: it is read again until they agree,
 * and left null if the file kept changing.
 */
function identityOf(filePath, expected, alwaysHash) {
    const before = statOf(filePath);
    if (!before) return null;
    if (!alwaysHash && (!expected || sameStat(before, expected)))
        return { ...before, sha256: null, hashed: false };
    let current = before;
    for (let attempt = 0; attempt < 3; attempt++) {
        const sha256 = hashFile(filePath);
        const after = statOf(filePath);
        if (!after) return null;
        if (sameStat(current, after)) return { ...after, sha256, hashed: true };
        current = after;
    }
    return { ...current, sha256: null, hashed: true };
}

function removeQuietly(filePath) {
    for (const suffix of ["", "-journal"]) {
        try {
            fs.unlinkSync(filePath + suffix);
        } catch {}
    }
}

function snapshot(msg) {
    const t0 = performance.now();
    const original = msg.originalPath
        ? identityOf(msg.originalPath, msg.expectedStat, false)
        : null;
    const t1 = performance.now();
    removeQuietly(msg.snapshotPath);
    try {
        db.prepare("VACUUM INTO ?").run(msg.snapshotPath);
        const t2 = performance.now();
        const fd = fs.openSync(msg.snapshotPath, "r+");
        try {
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        const t3 = performance.now();
        const snap = { size: fs.statSync(msg.snapshotPath).size, sha256: hashFile(msg.snapshotPath) };
        const t4 = performance.now();
        return {
            original,
            snapshot: snap,
            timings: { identityMs: t1 - t0, vacuumMs: t2 - t1, fsyncMs: t3 - t2, hashMs: t4 - t3 },
        };
    } catch (error) {
        removeQuietly(msg.snapshotPath);
        throw error;
    }
}

parentPort.on("message", (msg) => {
    try {
        let result;
        if (msg.type === "open") {
            db = new DatabaseSync(msg.workingPath);
            db.exec("PRAGMA busy_timeout = 5000");
            result = true;
        } else if (msg.type === "snapshot") {
            result = snapshot(msg);
        } else if (msg.type === "identity") {
            result = identityOf(msg.filePath, null, true);
        } else if (msg.type === "close") {
            if (db) db.close();
            db = null;
            result = true;
        } else {
            throw new Error("Unknown save worker message: " + msg.type);
        }
        parentPort.postMessage({ id: msg.id, ok: true, result });
    } catch (error) {
        parentPort.postMessage({
            id: msg.id,
            ok: false,
            error: { message: String(error && error.message), code: error && error.code },
        });
    }
});
`;

/** A file's identity as the worker read it; `hashed` says whether it read the bytes. */
export type WorkerIdentity = FileIdentity & { hashed: boolean };

export type SnapshotResult = {
    /** The show file's identity before the snapshot, or null if it's missing. */
    original: WorkerIdentity | null;
    snapshot: { size: number; sha256: string };
    timings: {
        identityMs: number;
        vacuumMs: number;
        fsyncMs: number;
        hashMs: number;
    };
};

type Pending = {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
};

/** A worker thread with its own connection to the working copy. */
export class SaveWorker {
    private readonly worker: Worker;
    private readonly pending = new Map<number, Pending>();
    private nextId = 1;
    private failure: Error | null = null;

    private constructor() {
        this.worker = new Worker(WORKER_SOURCE, { eval: true });
        this.worker.on("message", (message) => {
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.ok) pending.resolve(message.result);
            else
                pending.reject(
                    Object.assign(new Error(message.error.message), {
                        code: message.error.code,
                    }),
                );
        });
        const fail = (error: Error) => {
            this.failure = error;
            for (const pending of this.pending.values()) pending.reject(error);
            this.pending.clear();
        };
        this.worker.on("error", fail);
        this.worker.on("exit", (code) =>
            fail(new Error(`The save worker stopped (exit code ${code})`)),
        );
    }

    static async start(workingPath: string): Promise<SaveWorker> {
        const worker = new SaveWorker();
        try {
            await worker.request({ type: "open", workingPath });
        } catch (error) {
            await worker.worker.terminate();
            throw error;
        }
        return worker;
    }

    /** False once the worker has crashed or been closed. */
    get alive(): boolean {
        return this.failure === null;
    }

    /**
     * Snapshots the working copy to `snapshotPath` and reads `originalPath`'s identity, hashing
     * it only when its stat differs from `expectedStat` (null: never hash).
     */
    snapshot(args: {
        snapshotPath: string;
        originalPath: string | null;
        expectedStat: FileStatIdentity | null;
    }): Promise<SnapshotResult> {
        return this.request({ type: "snapshot", ...args });
    }

    /** Reads and hashes a file off the main thread. */
    identity(filePath: string): Promise<WorkerIdentity | null> {
        return this.request({ type: "identity", filePath });
    }

    async close(): Promise<void> {
        if (this.alive) {
            try {
                await this.request({ type: "close" });
            } catch {
                // The worker is going away either way.
            }
        }
        this.failure ??= new Error("The save worker was closed");
        await this.worker.terminate();
    }

    private request<T>(message: Record<string, unknown>): Promise<T> {
        if (this.failure) return Promise.reject(this.failure);
        const id = this.nextId++;
        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ ...message, id });
        });
    }
}
