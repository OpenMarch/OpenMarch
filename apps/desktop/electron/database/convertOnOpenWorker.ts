/**
 * The convert-on-open worker thread (P9.8). Backs up and converts one file
 * with `convertFileOnOpen`, on its own `node:sqlite` connection, so the
 * main process's event loop keeps running (Windows marks a window "Not
 * Responding" after about 5 s, and a large show takes seconds).
 *
 * `electron/main/convertWorkerHost.ts` starts it with a `ConvertWorkerRequest`
 * and gets `ConvertWorkerMessage`s back. Vite builds it as its own entry
 * (`vite.config.mts`, `dist-electron/worker/convertOnOpenWorker.js`). It must
 * load no Electron or renderer module; `convertWorkerBundle.test.ts` checks.
 *
 * The transaction, its `BEGIN IMMEDIATE` recheck, the marker and the
 * rollback are `convertFileOnOpen`'s. If the thread ends inside the
 * transaction (a crash, or the app quitting), Node closes its connection and
 * SQLite rolls the transaction back from its journal.
 */
import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { backupBeforeConversion } from "./backup";
import { convertFileOnOpen, type ConvertOnOpenResult } from "./convertOnOpen";
import {
    serializeError,
    type ConvertWorkerMessage,
    type ConvertWorkerRequest,
    type SerializedConvertResult,
} from "./convertOnOpenProtocol";

/** The exit code a test crash ends the thread with. */
export const TEST_CRASH_EXIT_CODE = 70;

const blockFor = (ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        // busy-wait: a test stand-in for a slow conversion
    }
};

function serializeResult(result: ConvertOnOpenResult): SerializedConvertResult {
    return result.status === "conversion-failed"
        ? { ...result, error: serializeError(result.error) }
        : result;
}

/** Backs up and converts `request.filePath`, posting progress and then the result. */
export async function runConvertWorker(
    request: ConvertWorkerRequest,
    post: (message: ConvertWorkerMessage) => void,
): Promise<void> {
    const { filePath, busyTimeoutMs, convertedAt, test = {} } = request;
    const db = new DatabaseSync(filePath);
    let result: ConvertOnOpenResult;
    try {
        db.exec(
            `PRAGMA busy_timeout = ${Math.max(0, Math.floor(busyTimeoutMs))}`,
        );
        result = await convertFileOnOpen(filePath, db, {
            onProgress: (progress) => {
                post({ type: "progress", progress });
                if (progress.phase === "convert" && test.blockPerPageMs)
                    blockFor(test.blockPerPageMs);
            },
            backup: (path) => {
                const backup =
                    test.backupFailure ?? backupBeforeConversion(path);
                if (backup.ok) {
                    post({
                        type: "backup-done",
                        backupPath: backup.backupPath,
                    });
                    if (test.crashAfterBackup)
                        process.exit(TEST_CRASH_EXIT_CODE);
                }
                return backup;
            },
            afterStep: (step) => {
                if (step === test.crashAfterStep)
                    process.exit(TEST_CRASH_EXIT_CODE);
                if (step === test.failAfterStep)
                    throw new Error(`disk vanished after ${step}`);
            },
            now: () => new Date(convertedAt),
        });
    } finally {
        db.close();
    }
    if (test.crashAfterCommit && result.status === "converted")
        process.exit(TEST_CRASH_EXIT_CODE);
    post({ type: "result", result: serializeResult(result) });
}

if (parentPort) {
    const port = parentPort;
    const post = (message: ConvertWorkerMessage) => port.postMessage(message);
    // Anything thrown outside `convertFileOnOpen`'s own handling (the file can't be opened, for
    // example) goes to the host as `failed`; the thread then ends.
    runConvertWorker(workerData as ConvertWorkerRequest, post).catch(
        (error: unknown) =>
            post({
                type: "failed",
                error: serializeError(
                    error instanceof Error ? error : new Error(String(error)),
                ),
            }),
    );
}
