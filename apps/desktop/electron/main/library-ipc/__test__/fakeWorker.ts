/**
 * An in-process stand-in for the import worker's utility process, on the
 * real message contract: requests go through `runWorkerJob` asynchronously,
 * like `postMessage`, and `kill` / `crash` emit `exit`.
 */
import { EventEmitter } from "node:events";
import { runWorkerJob } from "../../import-worker/ops";
import type {
    WorkerRequest,
    WorkerResponse,
} from "../../import-worker/protocol";
import type { WorkerChild } from "../worker-client";

export class FakeWorkerChild extends EventEmitter implements WorkerChild {
    killed = false;
    readonly received: WorkerRequest[] = [];

    constructor(
        /** Replaces the real job runner, for crash and hang cases. */
        private readonly run: (
            request: WorkerRequest,
            post: (response: WorkerResponse) => void,
        ) => Promise<void> = runWorkerJob,
    ) {
        super();
    }

    postMessage(message: WorkerRequest): void {
        this.received.push(structuredClone(message));
        const request = structuredClone(message);
        setImmediate(() => {
            void this.run(request, (response) => {
                if (!this.killed) {
                    this.emit("message", structuredClone(response));
                }
            });
        });
    }

    kill(): boolean {
        if (this.killed) return false;
        this.killed = true;
        setImmediate(() => this.emit("exit", 0));
        return true;
    }

    /** Dies on its own, as an out-of-memory or native crash would. */
    crash(code = 1) {
        this.killed = true;
        setImmediate(() => this.emit("exit", code));
    }
}

export function fakeSpawner(
    make: () => FakeWorkerChild = () => new FakeWorkerChild(),
) {
    const children: FakeWorkerChild[] = [];
    return {
        children,
        spawn: () => {
            const child = make();
            children.push(child);
            return child;
        },
    };
}
