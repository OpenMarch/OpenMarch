/**
 * What the main process and the convert-on-open worker (P9.8) send each
 * other. The worker (`convertOnOpenWorker.ts`) backs up and converts the file
 * on its own `node:sqlite` connection, so the main process's event loop keeps
 * running; `electron/main/convertWorkerHost.ts` starts it. Both sides are in
 * the main process, so this is not an IPC contract with the renderer.
 *
 * Light: types and plain data only, so the host can load it at startup.
 */
import type { BackupResult } from "./backup";

/** The writes of the conversion transaction, in order. */
export const CONVERSION_STEPS = [
    "drop-undo-triggers",
    "convert",
    "flag",
    "commit-check",
    "drain-change-log",
    "clear-history",
    "create-undo-triggers",
    "user-version",
] as const;
export type ConversionStep = (typeof CONVERSION_STEPS)[number];

/** How far the backup and conversion have got. */
export type ConvertProgress =
    | { phase: "backup" }
    /** Pages written so far, out of the pages that get a transition. */
    | { phase: "convert"; pagesDone: number; pagesTotal: number };

/**
 * Test hooks the worker understands. They are plain data, since functions
 * can't cross to a worker. Production passes none.
 */
export interface ConvertWorkerTestHooks {
    /** The ISO time written into the conversion marker (the host's `convertedAt`). */
    now?: string;
    /** Return this instead of backing up. */
    backupFailure?: Extract<BackupResult, { ok: false }>;
    /** Throw inside the transaction after this step (a failed conversion). */
    failAfterStep?: ConversionStep;
    /** End the worker thread inside the transaction after this step (a crash). */
    crashAfterStep?: ConversionStep;
    /** End the worker thread right after the backup, before the transaction. */
    crashAfterBackup?: boolean;
    /** End the worker thread after the transaction committed, before it posts the result. */
    crashAfterCommit?: boolean;
    /** Busy-wait this long after each page, so tests can watch a long conversion. */
    blockPerPageMs?: number;
}

/** What the worker is started with (`workerData`). */
export interface ConvertWorkerRequest {
    filePath: string;
    /** How long the worker's connection waits for another connection's lock. */
    busyTimeoutMs: number;
    /**
     * The ISO time the conversion writes as its marker. The host picks it, so
     * after a worker that ended without a result it can tell from the file
     * whether this conversion committed.
     */
    convertedAt: string;
    test?: ConvertWorkerTestHooks;
}

/** An `Error`, as plain data. */
export interface SerializedError {
    name: string;
    message: string;
    stack?: string;
    code?: string;
}

/** `ConvertOnOpenResult` with its error as plain data. */
export type SerializedConvertResult =
    | {
          status: "converted";
          backupPath: string;
          report: unknown;
      }
    | { status: "already-converted" }
    | {
          status: "backup-failed";
          backup: Extract<BackupResult, { ok: false }>;
      }
    | {
          status: "conversion-failed";
          backupPath: string;
          error: SerializedError;
      };

/**
 * Messages from the worker, in order: progress, `backup-done`, more progress,
 * then `result` (or `failed`).
 */
export type ConvertWorkerMessage =
    | { type: "progress"; progress: ConvertProgress }
    | { type: "backup-done"; backupPath: string }
    | { type: "result"; result: SerializedConvertResult }
    /** Something outside the conversion's own error handling failed; nothing follows. */
    | { type: "failed"; error: SerializedError };

export function serializeError(error: Error): SerializedError {
    const code = (error as { code?: unknown }).code;
    return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(typeof code === "string" ? { code } : {}),
    };
}

export function deserializeError(data: SerializedError): Error {
    const error = new Error(data.message);
    error.name = data.name;
    if (data.stack) error.stack = data.stack;
    if (data.code) (error as { code?: string }).code = data.code;
    return error;
}
