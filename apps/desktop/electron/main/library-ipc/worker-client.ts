/**
 * Main's side of the import worker (C1.9 §5, §6): spawns the utility process
 * on first use, runs one job at a time from a queue, and kills it after
 * 60 s idle. Cancelling the running job kills the process (the pipeline's
 * heavy steps are synchronous, so killing is the only reliable stop); the
 * next job starts a new one. A crash or a 120 s timeout fails the running job
 * and leaves the queue to a fresh process.
 */
import type { ModelImportStage } from "../model-import/types";
import type {
    WorkerOp,
    WorkerOps,
    WorkerRequest,
    WorkerResponse,
} from "../import-worker/protocol";

/** The part of an Electron `UtilityProcess` the client uses. */
export interface WorkerChild {
    postMessage(message: WorkerRequest): void;
    on(event: "message", listener: (message: WorkerResponse) => void): unknown;
    on(event: "exit", listener: (code: number) => void): unknown;
    kill(): boolean;
}

export type WorkerFailureCode =
    | "cancelled"
    | "timeout"
    | "worker-crashed"
    | "not-found"
    | "failed";

export class WorkerJobError extends Error {
    constructor(
        readonly code: WorkerFailureCode,
        message: string,
    ) {
        super(message);
        this.name = "WorkerJobError";
    }
}

export interface ImportWorkerOptions {
    spawn: () => WorkerChild;
    jobTimeoutMs?: number;
    idleMs?: number;
}

interface Job {
    jobId: number;
    op: WorkerOp;
    input: unknown;
    /** Groups jobs for `cancel`, such as a session id. */
    tag: string | null;
    onStage?: (stage: ModelImportStage) => void;
    resolve: (output: unknown) => void;
    reject: (error: WorkerJobError) => void;
}

export class ImportWorkerClient {
    private child: WorkerChild | null = null;
    private running: Job | null = null;
    private readonly queue: Job[] = [];
    private nextJobId = 1;
    private jobTimer: ReturnType<typeof setTimeout> | null = null;
    private idleTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly jobTimeoutMs: number;
    private readonly idleMs: number;

    constructor(private readonly options: ImportWorkerOptions) {
        this.jobTimeoutMs = options.jobTimeoutMs ?? 120_000;
        this.idleMs = options.idleMs ?? 60_000;
    }

    /** Whether a worker process is alive. */
    get alive(): boolean {
        return this.child !== null;
    }

    run<K extends WorkerOp>(
        op: K,
        input: WorkerOps[K]["input"],
        options: {
            tag?: string;
            onStage?: (stage: ModelImportStage) => void;
        } = {},
    ): Promise<WorkerOps[K]["output"]> {
        return new Promise((resolve, reject) => {
            this.queue.push({
                jobId: this.nextJobId++,
                op,
                input,
                tag: options.tag ?? null,
                onStage: options.onStage,
                resolve: resolve as (output: unknown) => void,
                reject,
            });
            this.pump();
        });
    }

    /** Fails every queued and running job with `tag`; kills the worker if one is running. */
    cancel(tag: string): void {
        for (let i = this.queue.length - 1; i >= 0; i--) {
            if (this.queue[i].tag === tag) {
                const [job] = this.queue.splice(i, 1);
                job.reject(new WorkerJobError("cancelled", "Cancelled"));
            }
        }
        if (this.running?.tag === tag) this.killRunning("cancelled");
    }

    /** Kills the worker and fails everything: editor closed, app quitting. */
    dispose(): void {
        for (const job of this.queue.splice(0)) {
            job.reject(
                new WorkerJobError("cancelled", "Import worker stopped"),
            );
        }
        if (this.running) this.killRunning("cancelled");
        else this.stopChild();
    }

    private pump() {
        if (this.running || this.queue.length === 0) return;
        this.clearIdle();
        const job = this.queue.shift()!;
        this.running = job;
        let child: WorkerChild;
        try {
            child = this.ensureChild();
        } catch (error) {
            this.finish(job);
            job.reject(
                new WorkerJobError(
                    "worker-crashed",
                    `Couldn't start the import worker: ${String(error)}`,
                ),
            );
            // The rest of the queue tries again, so no job waits forever.
            this.pump();
            return;
        }
        this.jobTimer = setTimeout(
            () => this.killRunning("timeout"),
            this.jobTimeoutMs,
        );
        child.postMessage({
            jobId: job.jobId,
            op: job.op,
            input: job.input,
        } as WorkerRequest);
    }

    private ensureChild(): WorkerChild {
        if (this.child) return this.child;
        const child = this.options.spawn();
        this.child = child;
        child.on("message", (message) => this.onMessage(child, message));
        child.on("exit", (code) => this.onExit(child, code));
        return child;
    }

    private onMessage(child: WorkerChild, message: WorkerResponse) {
        if (child !== this.child) return;
        const job = this.running;
        if (!job || message.jobId !== job.jobId) return;
        if ("stage" in message) {
            try {
                job.onStage?.(message.stage);
            } catch {
                // Progress is best effort.
            }
            return;
        }
        this.finish(job);
        if (message.ok) job.resolve(message.output);
        else
            job.reject(
                new WorkerJobError(message.error.code, message.error.message),
            );
        this.pump();
    }

    /** An exit nobody asked for: the running job fails as a crash. */
    private onExit(child: WorkerChild, code: number) {
        if (child !== this.child) return;
        this.child = null;
        this.failRunning(
            "worker-crashed",
            `The import worker exited with code ${code}`,
        );
    }

    private killRunning(reason: "cancelled" | "timeout") {
        this.stopChild();
        this.failRunning(
            reason,
            reason === "timeout"
                ? `The import took longer than ${this.jobTimeoutMs / 1000} s`
                : "Cancelled",
        );
    }

    /** Detaches and kills the child; its later `exit` is ignored. */
    private stopChild() {
        const child = this.child;
        this.child = null;
        child?.kill();
    }

    private failRunning(code: WorkerFailureCode, message: string) {
        const job = this.running;
        if (job) {
            this.finish(job);
            job.reject(new WorkerJobError(code, message));
        }
        this.pump();
    }

    private finish(job: Job) {
        if (this.running === job) this.running = null;
        if (this.jobTimer) clearTimeout(this.jobTimer);
        this.jobTimer = null;
        if (!this.running && this.queue.length === 0) this.armIdle();
    }

    private armIdle() {
        this.clearIdle();
        if (!this.child) return;
        this.idleTimer = setTimeout(() => {
            this.idleTimer = null;
            if (!this.running && this.queue.length === 0) this.stopChild();
        }, this.idleMs);
        (this.idleTimer as { unref?: () => void }).unref?.();
    }

    private clearIdle() {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = null;
    }
}
