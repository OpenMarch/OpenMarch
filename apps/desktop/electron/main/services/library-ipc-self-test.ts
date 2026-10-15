/* eslint-disable no-console */
/**
 * Packaging and dev check for the import IPC (package C1.9), in the pattern
 * of `sharp-self-test.ts`. It runs the real `library:*` handlers with the
 * real import worker (`utilityProcess`), the real pdf.js renderer and a
 * temporary Library, so a dev or packaged build can prove that the worker
 * loads (with Draco's WASM and `sharp`) and pdf.js loads from the asar.
 *
 * Run with `OPENMARCH_LIBRARY_IPC_SELF_TEST=<path to a .json file>` and
 * `OPENMARCH_LIBRARY_IPC_SELF_TEST_FILES=<model.glb>,<image.png>,<doc.pdf>`
 * (a two-page PDF). The app writes the result there and exits instead of
 * opening a window: exit code 0 when every step passed, 1 otherwise.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BrowserWindow, utilityProcess } from "electron";
import {
    LIBRARY_INVOKE_CHANNELS as C,
    type ImportInspection,
    type ImportSession,
    type Result,
} from "../../../src/view3d/library/protocol";
import { TEMPLATE_SURFACES } from "../../../src/view3d/core/artworkTemplates";
import {
    closeAllPdfRenderers,
    createElectronPdfRenderer,
    livePdfRendererCount,
} from "../artwork-import";
import { openLibraryStore } from "../library/store";
import {
    createLibraryIpcService,
    type IpcSender,
} from "../library-ipc/service";
import {
    ImportWorkerClient,
    type WorkerChild,
} from "../library-ipc/worker-client";

export const LIBRARY_IPC_SELF_TEST_ENV = "OPENMARCH_LIBRARY_IPC_SELF_TEST";
export const LIBRARY_IPC_SELF_TEST_FILES_ENV =
    "OPENMARCH_LIBRARY_IPC_SELF_TEST_FILES";

interface Step {
    name: string;
    ok: boolean;
    ms: number;
    detail?: unknown;
    error?: string;
}

// eslint-disable-next-line max-lines-per-function
export async function runLibraryIpcSelfTest(
    workerPath: string,
    inputs: string[],
): Promise<{ ok: boolean; steps: Step[]; workerPath: string }> {
    const steps: Step[] = [];
    const step = async (name: string, fn: () => Promise<unknown>) => {
        const start = performance.now();
        try {
            const detail = await fn();
            steps.push({
                name,
                ok: true,
                ms: Math.round(performance.now() - start),
                detail,
            });
        } catch (error) {
            steps.push({
                name,
                ok: false,
                ms: Math.round(performance.now() - start),
                error:
                    error instanceof Error
                        ? (error.stack ?? error.message)
                        : String(error),
            });
        }
    };

    // Stands in for the editor window: PDF renderer windows close themselves
    // whenever only hidden windows remain.
    const editorStandIn = new BrowserWindow({
        show: false,
        width: 100,
        height: 100,
    });
    const dir = await mkdtemp(path.join(tmpdir(), "om-library-ipc-self-test-"));
    const store = await openLibraryStore({ root: path.join(dir, "library") });
    const worker = new ImportWorkerClient({
        spawn: () =>
            utilityProcess.fork(workerPath, [], {
                serviceName: "OpenMarch import (self-test)",
            }) as unknown as WorkerChild,
    });
    const picks: string[][] = [];
    let saveTarget: string | null = null;
    const changed: unknown[] = [];
    const progress: unknown[] = [];
    const service = createLibraryIpcService({
        getStore: async () => store,
        worker,
        showOpenDialog: async () => picks.shift() ?? null,
        showSaveDialog: async () => saveTarget,
        getLastFolder: () => null,
        setLastFolder: () => {},
        pdfRenderer: (() => {
            const renderer = createElectronPdfRenderer();
            return () => renderer;
        })(),
        sendChanged: (c) => changed.push(c),
    });
    let onStage: ((stage: string) => void) | null = null;
    const sender: IpcSender = {
        id: 1,
        send: (_c, p) => {
            progress.push(p);
            onStage?.((p as { stage: string }).stage);
        },
    };
    const call = async <T>(channel: string, payload?: unknown): Promise<T> => {
        const result = (await service.handlers[
            channel as keyof typeof service.handlers
        ](sender, payload)) as Result<T>;
        if (!result.ok) {
            throw new Error(
                `${channel}: ${result.error.code}: ${result.error.message}`,
            );
        }
        return result.value;
    };

    const [model, png, pdf] = inputs;
    try {
        await step("model: pick, inspect, preview, commit", async () => {
            picks.push([model]);
            const session = (await call<ImportSession>(C.importPick, {
                purpose: "model",
            }))!;
            const fileId = session.files[0].fileId;
            const base = {
                sessionId: session.sessionId,
                fileId,
                type: "model",
            };
            const inspected = await call<ImportInspection>(C.importInspect, {
                ...base,
                choices: {},
            });
            if (inspected.type !== "model") throw new Error("not a model");
            const kind = inspected.report.kind ?? "prop";
            const preview = await call<{ bytes: Uint8Array }>(
                C.importPreview,
                base,
            );
            const committed = await call<{
                saved: { versionHash: string } | null;
            }>(C.importCommit, {
                ...base,
                kind,
                choices: {},
                meta: { name: "Self-test model" },
            });
            if (!committed.saved)
                throw new Error(`not saved: ${inspected.report.status}`);
            service.close(sender, { sessionId: session.sessionId });
            return {
                status: inspected.report.status,
                fixed: inspected.report.fixedForYou.map((f) => f.code),
                previewBytes: preview.bytes.byteLength,
                versionHash: committed.saved.versionHash,
            };
        });

        await step(
            "artwork: PNG and 2-page PDF, previews and commit",
            async () => {
                picks.push([png, pdf]);
                const session = (await call<ImportSession>(C.importPick, {
                    purpose: "artwork",
                }))!;
                const inspected = await call<ImportInspection>(
                    C.importInspect,
                    {
                        sessionId: session.sessionId,
                        type: "artwork",
                    },
                );
                if (inspected.type !== "artwork")
                    throw new Error("not artwork");
                const pdfId = session.files[1].fileId;
                const previews = [];
                for (const page of [0, 1]) {
                    const p = await call<{ bytes: Uint8Array }>(
                        C.importPreview,
                        {
                            sessionId: session.sessionId,
                            fileId: pdfId,
                            type: "artwork",
                            page,
                            maxPx: 256,
                        },
                    );
                    previews.push(p.bytes.byteLength);
                }
                const result = await call<{
                    reports: { imported: unknown[]; notImported: unknown[] }[];
                }>(C.importCommit, {
                    sessionId: session.sessionId,
                    type: "artwork",
                    files: inspected.files.map((f) => ({
                        fileId: f.fileId,
                        surface: "propSlot",
                        size: "file",
                        meta: { name: f.inspection.filename },
                    })),
                });
                const imported = result.reports.map((r) => r.imported.length);
                // A PNG without pHYs has no file size; give it one.
                if (imported[0] === 0) {
                    const aspect = inspected.files[0].inspection.ok
                        ? inspected.files[0].inspection.pages[0].aspect
                        : 1;
                    const again = await call<{
                        reports: { imported: unknown[] }[];
                    }>(C.importCommit, {
                        sessionId: session.sessionId,
                        type: "artwork",
                        files: [
                            {
                                fileId: session.files[0].fileId,
                                surface: "propSlot",
                                size: {
                                    width: { m: aspect },
                                    height: { m: 1 },
                                    source: "user",
                                },
                                meta: { name: "png" },
                            },
                        ],
                    });
                    imported[0] = again.reports[0].imported.length;
                }
                if (imported[0] !== 1 || imported[1] !== 2) {
                    throw new Error(`imported ${JSON.stringify(imported)}`);
                }
                service.close(sender, { sessionId: session.sessionId });
                return {
                    formats: inspected.files.map(
                        (f) => f.inspection.ok && f.inspection.format,
                    ),
                    aspectGroups: inspected.aspectGroups.length,
                    previews,
                    imported,
                    liveRenderersAfter: livePdfRendererCount(),
                };
            },
        );

        await step("library: list and thumbnails", async () => {
            const items = await call<{ id: string; versions: string[] }[]>(
                C.list,
                {},
            );
            const thumbs = await call<unknown[]>(C.thumbnails, {
                items: items.map((i) => ({
                    itemId: i.id,
                    versionHash: i.versions[0],
                })),
                maxPx: 128,
            });
            return {
                items: items.length,
                thumbnails: thumbs.filter(Boolean).length,
            };
        });

        await step("template: PNG of a floor in the worker", async () => {
            const floor = TEMPLATE_SURFACES.find((s) => s.process === "floor")!;
            saveTarget = path.join(dir, "floor.png");
            await call(C.templateSave, { surfaceId: floor.id, format: "png" });
            return {
                surface: floor.id,
                bytes: (await readFile(saveTarget)).byteLength,
            };
        });

        await step("cancel: before the job reaches the worker", async () => {
            picks.push([model]);
            const session = (await call<ImportSession>(C.importPick, {
                purpose: "model",
            }))!;
            const pending = service.handlers[C.importInspect](sender, {
                sessionId: session.sessionId,
                fileId: session.files[0].fileId,
                type: "model",
                choices: { simplify: true },
            });
            // Before the job reaches the worker: it must still stop.
            void service.handlers[C.importCancel](sender, {
                sessionId: session.sessionId,
            });
            const result = await pending;
            if (result.ok || result.error.code !== "cancelled") {
                throw new Error(
                    `expected cancelled, got ${JSON.stringify(result)}`,
                );
            }
            return result.error.code;
        });

        await step("cancel: a job in the worker is killed", async () => {
            picks.push([model]);
            const session = (await call<ImportSession>(C.importPick, {
                purpose: "model",
            }))!;
            onStage = (stage) => {
                if (stage !== "decoding") return;
                onStage = null;
                void service.handlers[C.importCancel](sender, {
                    sessionId: session.sessionId,
                });
            };
            const result = await service.handlers[C.importInspect](sender, {
                sessionId: session.sessionId,
                fileId: session.files[0].fileId,
                type: "model",
                choices: {},
            });
            if (result.ok || result.error.code !== "cancelled") {
                throw new Error(
                    `expected cancelled, got ${JSON.stringify(result).slice(0, 200)}`,
                );
            }
            // The next job starts a fresh worker.
            const retry = await call<ImportInspection>(C.importInspect, {
                sessionId: session.sessionId,
                fileId: session.files[0].fileId,
                type: "model",
                choices: {},
            });
            return {
                cancelled: result.error.code,
                retry: retry.type === "model" && retry.report.status,
            };
        });

        await step(
            "hidden PDF windows close when only they remain",
            async () => {
                const renderer = createElectronPdfRenderer();
                const doc = await renderer.open(
                    new Uint8Array(await readFile(pdf)),
                );
                const before = livePdfRendererCount();
                editorStandIn.destroy();
                await new Promise((r) => setTimeout(r, 200));
                const after = livePdfRendererCount();
                await Promise.resolve(doc.close?.()).catch(() => {});
                const reopened = await renderer.open(
                    new Uint8Array(await readFile(pdf)),
                );
                const closedNow = closeAllPdfRenderers();
                void reopened;
                if (before < 1 || after !== 0 || closedNow !== 1) {
                    throw new Error(
                        JSON.stringify({ before, after, closedNow }),
                    );
                }
                return { before, after, closedNow };
            },
        );
    } finally {
        service.dispose();
        if (!editorStandIn.isDestroyed()) editorStandIn.destroy();
        await rm(dir, { recursive: true, force: true });
    }
    return { ok: steps.every((s) => s.ok), steps, workerPath };
}

/** Runs the check, writes the result as JSON, and returns the exit code. */
export async function writeLibraryIpcSelfTest(
    outPath: string,
    workerPath: string,
    files: string,
): Promise<number> {
    const result = await runLibraryIpcSelfTest(workerPath, files.split(","));
    await writeFile(outPath, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
}
