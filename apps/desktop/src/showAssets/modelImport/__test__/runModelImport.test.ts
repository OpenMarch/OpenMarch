import { describe, expect, it, vi } from "vitest";
import { runModelImport } from "../runModelImport";
import type { ModelImportResult } from "../types";

/** A worker that records what it was sent and answers when told to. */
class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    sent: { message: unknown; transfer: Transferable[] }[] = [];
    terminated = false;
    postMessage(message: unknown, transfer: Transferable[]) {
        this.sent.push({ message, transfer });
    }
    terminate() {
        this.terminated = true;
    }
    answer(data: unknown) {
        this.onmessage?.({ data } as MessageEvent);
    }
}

const ok: ModelImportResult = {
    ok: false,
    report: {
        cantImport: [{ code: "noGeometry" }],
        needsChoice: [],
        fixedForYou: [],
        notes: [],
    },
};

function start(options: { timeoutMs?: number; signal?: AbortSignal } = {}) {
    const worker = new FakeWorker();
    const files = [{ name: "a.glb", bytes: new Uint8Array([1, 2, 3]) }];
    const promise = runModelImport(
        files,
        { turn: 90 },
        {
            createWorker: () => worker as unknown as Worker,
            ...options,
        },
    );
    return { worker, files, promise };
}

describe("runModelImport", () => {
    it("sends copies of the bytes, keeping the caller's", async () => {
        const { worker, files, promise } = start();
        const [{ message, transfer }] = worker.sent;
        const sent = (message as { files: { bytes: Uint8Array }[] }).files[0];
        expect(sent.bytes).toEqual(files[0].bytes);
        expect(sent.bytes.buffer).not.toBe(files[0].bytes.buffer);
        expect(transfer).toEqual([sent.bytes.buffer]);
        expect(message).toMatchObject({
            type: "import",
            choices: { turn: 90 },
        });
        worker.answer({ type: "result", result: ok });
        await promise;
        expect(files[0].bytes).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("resolves with the result and ends the worker", async () => {
        const { worker, promise } = start();
        worker.answer({ type: "result", result: ok });
        await expect(promise).resolves.toEqual(ok);
        expect(worker.terminated).toBe(true);
    });

    it("ends the worker after the timeout, with a refusal", async () => {
        vi.useFakeTimers();
        try {
            const { worker, promise } = start({ timeoutMs: 120_000 });
            vi.advanceTimersByTime(120_000);
            const result = await promise;
            expect(result.ok).toBe(false);
            expect(result.report.cantImport).toEqual([
                { code: "timedOut", seconds: 120 },
            ]);
            expect(worker.terminated).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("ends the worker on cancel and rejects with AbortError", async () => {
        const controller = new AbortController();
        const { worker, promise } = start({ signal: controller.signal });
        controller.abort();
        await expect(promise).rejects.toMatchObject({ name: "AbortError" });
        expect(worker.terminated).toBe(true);
    });

    it("turns a worker crash into a refusal", async () => {
        const { worker, promise } = start();
        worker.onerror?.({
            message: "out of memory",
            preventDefault() {},
        } as ErrorEvent);
        const result = await promise;
        expect(result.report.cantImport).toEqual([
            { code: "failed", reason: "out of memory" },
        ]);
        expect(worker.terminated).toBe(true);
    });

    it("starts a fresh worker for each import", async () => {
        const workers: FakeWorker[] = [];
        const createWorker = () => {
            const w = new FakeWorker();
            workers.push(w);
            return w as unknown as Worker;
        };
        const files = [{ name: "a.glb", bytes: new Uint8Array([1]) }];
        const first = runModelImport(files, {}, { createWorker });
        workers[0].onerror?.({
            message: "",
            preventDefault() {},
        } as ErrorEvent);
        await first;
        const second = runModelImport(files, {}, { createWorker });
        workers[1].answer({ type: "result", result: ok });
        await expect(second).resolves.toEqual(ok);
        expect(workers).toHaveLength(2);
        expect(workers[0].terminated && workers[1].terminated).toBe(true);
    });
});
