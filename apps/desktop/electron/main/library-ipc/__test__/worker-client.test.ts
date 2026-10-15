// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readModelFile } from "../../model-import/container";
import type { ModelImportStage } from "../../model-import/types";
import { ImportWorkerClient, WorkerJobError } from "../worker-client";
import { FakeWorkerChild, fakeSpawner } from "./fakeWorker";

const FIXTURES = path.join(__dirname, "../../model-import/__test__/fixtures");

let client: ImportWorkerClient | null = null;
afterEach(() => {
    client?.dispose();
    client = null;
    vi.useRealTimers();
});

const never = () => new Promise<void>(() => {});

describe("ImportWorkerClient", () => {
    it("runs the model pipeline on the message contract and reports stages", async () => {
        const spawner = fakeSpawner();
        client = new ImportWorkerClient({ spawn: spawner.spawn });
        const file = await readModelFile(
            path.join(FIXTURES, "equipment-clean-kit.glb"),
        );
        const stages: ModelImportStage[] = [];
        const result = await client.run(
            "model-import",
            { file, choices: {} },
            { onStage: (s) => stages.push(s) },
        );
        expect(result.report.status).toBe("ready");
        expect(result.output?.glb).toBeInstanceOf(Uint8Array);
        expect(stages[0]).toBe("reading");
        expect(stages.at(-1)).toBe("writing");
        expect(spawner.children).toHaveLength(1);
        // The worker got bytes, never a path.
        expect(
            JSON.stringify(spawner.children[0].received[0].input),
        ).not.toContain(FIXTURES);
    });

    it("fails a job as worker-crashed when the process dies, then starts a new one", async () => {
        let first = true;
        const spawner = fakeSpawner(() => {
            if (!first) return new FakeWorkerChild();
            first = false;
            const child: FakeWorkerChild = new FakeWorkerChild(async () => {
                child.crash(134);
            });
            return child;
        });
        client = new ImportWorkerClient({ spawn: spawner.spawn });
        const bytes = new Uint8Array(
            await readFile(path.join(FIXTURES, "equipment-clean-kit.glb")),
        );
        const input = {
            file: { filename: "a.glb", bytes },
            choices: {},
        };
        await expect(client.run("model-import", input)).rejects.toMatchObject({
            code: "worker-crashed",
        });
        const retry = await client.run("model-import", input);
        expect(retry.report.status).toBe("ready");
        expect(spawner.children).toHaveLength(2);
    });

    it("fails every queued job when a new process can't start after a crash", async () => {
        let spawns = 0;
        const spawner = fakeSpawner(() => {
            spawns++;
            if (spawns > 1) throw new Error("no worker");
            const child: FakeWorkerChild = new FakeWorkerChild(async () => {
                child.crash(134);
            });
            return child;
        });
        client = new ImportWorkerClient({ spawn: spawner.spawn });
        const input = { surfaceId: "x", format: "svg" } as const;
        const running = client.run("template", input);
        const second = client.run("template", input);
        const third = client.run("template", input);
        await expect(running).rejects.toMatchObject({
            code: "worker-crashed",
        });
        await expect(second).rejects.toMatchObject({
            code: "worker-crashed",
        });
        await expect(third).rejects.toMatchObject({
            code: "worker-crashed",
        });
        expect(spawns).toBe(3);
    });

    it("cancels by tag: a queued job is dropped, the running one kills the process", async () => {
        const spawner = fakeSpawner(() => new FakeWorkerChild(never));
        client = new ImportWorkerClient({ spawn: spawner.spawn });
        const input = {
            file: { filename: "a.glb", bytes: new Uint8Array(4) },
            choices: {},
        };
        const running = client.run("model-import", input, { tag: "s1" });
        const queued = client.run("model-import", input, { tag: "s1" });
        const other = client.run("model-import", input, { tag: "s2" });
        await new Promise((r) => setImmediate(r));
        client.cancel("s1");
        await expect(running).rejects.toMatchObject({ code: "cancelled" });
        await expect(queued).rejects.toMatchObject({ code: "cancelled" });
        expect(spawner.children[0].killed).toBe(true);
        // The other session's job moves to a fresh process.
        await new Promise((r) => setImmediate(r));
        expect(spawner.children).toHaveLength(2);
        client.cancel("s2");
        await expect(other).rejects.toBeInstanceOf(WorkerJobError);
    });

    it("kills a job that runs past the timeout", async () => {
        const spawner = fakeSpawner(() => new FakeWorkerChild(never));
        client = new ImportWorkerClient({
            spawn: spawner.spawn,
            jobTimeoutMs: 20,
        });
        await expect(
            client.run("template", { surfaceId: "x", format: "svg" }),
        ).rejects.toMatchObject({ code: "timeout" });
        expect(spawner.children[0].killed).toBe(true);
    });

    it("stops the process after the idle time", async () => {
        const spawner = fakeSpawner();
        client = new ImportWorkerClient({ spawn: spawner.spawn, idleMs: 10 });
        await expect(
            client.run("template", { surfaceId: "no-such", format: "svg" }),
        ).rejects.toMatchObject({ code: "not-found" });
        expect(client.alive).toBe(true);
        await new Promise((r) => setTimeout(r, 40));
        expect(client.alive).toBe(false);
        expect(spawner.children[0].killed).toBe(true);
    });
});
