/**
 * Entry of the import worker, a `utilityProcess` main forks on first use
 * (built to `dist-electron/main/import-worker.js`). One job at a time:
 * main queues, so jobs run in the order they arrive.
 */
import { runWorkerJob } from "./ops";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const port = process.parentPort;
let chain: Promise<void> = Promise.resolve();

port.on("message", (event: { data: WorkerRequest }) => {
    const request = event.data;
    chain = chain.then(() =>
        runWorkerJob(request, (response: WorkerResponse) =>
            port.postMessage(response),
        ),
    );
});
