/**
 * Makes the scrubbed show copy for a bug report (fork #801) on its own
 * thread, so a large show doesn't freeze every window while SQLite copies
 * and rebuilds it. Started by `electron/main/reports.ts` with
 * `{ source, destination, includeAudio }`; posts `{ ok: true }` or
 * `{ ok: false, message }`. Vite builds it beside the convert worker
 * (`dist-electron/worker/reportCopyWorker.js`). Loads no Electron module.
 */
import { parentPort, workerData } from "node:worker_threads";
import { writeReportCopy } from "./reportCopy";

const { source, destination, includeAudio } = workerData as {
    source: string;
    destination: string;
    includeAudio: boolean;
};
try {
    writeReportCopy(source, destination, { includeAudio });
    parentPort?.postMessage({ ok: true });
} catch (error) {
    parentPort?.postMessage({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
    });
}
