/**
 * Runs one model import in a fresh worker (fork #998; ADR 0010 amendment 2026-11-15, "crash
 * isolation and cancel"). The worker is ended when the job is done, on cancel and after
 * `IMPORT_TIMEOUT_MS`; nothing it does touches the show, so a failed or killed job leaves the
 * show unchanged and the next import starts clean.
 */
import type { ModelImportResponse } from "./protocol";
import { IMPORT_TIMEOUT_MS } from "./rules";
import type {
    ModelImportChoices,
    ModelImportReport,
    ModelImportResult,
    PickedFile,
    Refusal,
} from "./types";

export interface RunModelImportOptions {
    /** Starts a worker for this job (`createModelImportWorker`) */
    createWorker: () => Worker;
    /** Cancels the job: the worker ends and the promise rejects with an `AbortError` */
    signal?: AbortSignal;
    timeoutMs?: number;
}

const refusedWith = (refusal: Refusal): ModelImportResult => {
    const report: ModelImportReport = {
        cantImport: [refusal],
        needsChoice: [],
        fixedForYou: [],
        notes: [],
    };
    return { ok: false, report };
};

/**
 * Imports `files` with `choices`. Resolves with the result, or with a refusal when the worker
 * fails or runs out of time; rejects only when cancelled.
 *
 * The files' bytes are copied and the copies handed to the worker, so the caller's arrays (which
 * may be shared, such as cached blobs) stay usable.
 */
export function runModelImport(
    files: readonly PickedFile[],
    choices: ModelImportChoices,
    {
        createWorker,
        signal,
        timeoutMs = IMPORT_TIMEOUT_MS,
    }: RunModelImportOptions,
): Promise<ModelImportResult> {
    if (signal?.aborted) return Promise.reject(abortError());
    const copies = files.map((f) => ({ name: f.name, bytes: f.bytes.slice() }));
    const worker = createWorker();
    return new Promise<ModelImportResult>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (settle: () => void) => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            worker.terminate();
            settle();
        };
        const onAbort = () => finish(() => reject(abortError()));
        signal?.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(
            () =>
                finish(() =>
                    resolve(
                        refusedWith({
                            code: "timedOut",
                            seconds: Math.round(timeoutMs / 1000),
                        }),
                    ),
                ),
            timeoutMs,
        );
        worker.onmessage = (event: MessageEvent<ModelImportResponse>) => {
            const message = event.data;
            if (message.type === "result")
                finish(() => resolve(message.result));
            else if (message.type === "error")
                finish(() =>
                    resolve(
                        refusedWith({
                            code: "failed",
                            reason: message.message,
                        }),
                    ),
                );
        };
        worker.onerror = (event) => {
            event.preventDefault();
            finish(() =>
                resolve(
                    refusedWith({
                        code: "failed",
                        reason: event.message || "the import worker stopped",
                    }),
                ),
            );
        };
        worker.onmessageerror = () =>
            finish(() =>
                resolve(
                    refusedWith({
                        code: "failed",
                        reason: "the import worker's answer couldn't be read",
                    }),
                ),
            );
        worker.postMessage(
            { type: "import", files: copies, choices },
            copies.map((f) => f.bytes.buffer),
        );
    });
}

const abortError = () =>
    new DOMException("The model import was cancelled", "AbortError");
