/**
 * Starts the model import worker. A URL worker, never `blob:`: it takes its CSP from its own
 * response (`MODEL_IMPORT_WORKER_CSP`), where a `blob:` worker would take the page's, which
 * refuses WebAssembly on desktop. The chunk loads only when an import starts.
 */
import ModelImportWorker from "./modelImport.worker.ts?worker";

export const createModelImportWorker = (): Worker => new ModelImportWorker();
