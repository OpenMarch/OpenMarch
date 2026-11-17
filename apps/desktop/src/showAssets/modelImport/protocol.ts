/**
 * Messages between the editor and the model import worker (fork #998). One job per worker: the
 * editor starts a fresh worker for each import and ends it when the job is done, cancelled or
 * past `IMPORT_TIMEOUT_MS`.
 */
import type {
    ModelImportChoices,
    ModelImportResult,
    PickedFile,
} from "./types";

/** The policy the worker runs under, in every environment (ADR 0010 amendment 2026-11-15) */
export const MODEL_IMPORT_WORKER_CSP =
    "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'";

/**
 * Whether a URL is the import worker's script, which gets `MODEL_IMPORT_WORKER_CSP`: the dev
 * server's `/src/showAssets/modelImport/modelImport.worker.ts?worker_file…`, or the built
 * `assets/modelImport.worker-<hash>.js`.
 */
export function isModelImportWorkerUrl(url: string): boolean {
    let pathname: string;
    try {
        pathname = new URL(url).pathname;
    } catch {
        return false;
    }
    return /\/modelImport\.worker(?:\.ts|-[A-Za-z0-9_-]+\.js)$/.test(pathname);
}

export type ModelImportRequest =
    | { type: "import"; files: PickedFile[]; choices: ModelImportChoices }
    /** Reports what the worker's policy allows (tests and checks) */
    | { type: "probe" };

export interface ModelImportProbe {
    type: "probe";
    /** "allowed", or the error */
    wasm: string;
    /** "refused", or what happened */
    fetch: string;
    /** "refused", or what happened */
    evalFunction: string;
}

export type ModelImportResponse =
    | { type: "result"; result: ModelImportResult }
    | { type: "error"; message: string }
    | ModelImportProbe;
