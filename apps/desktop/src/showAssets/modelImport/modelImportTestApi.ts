/**
 * `window.modelImportTest`: the model import worker for end-to-end tests (fork #998), until the
 * import screen (#999) uses it. Installed only in a Playwright session (`main.tsx`). Bytes cross
 * `page.evaluate` as base64.
 */
import { createModelImportWorker } from "./createModelImportWorker";
import type { ModelImportProbe, ModelImportResponse } from "./protocol";
import { runModelImport } from "./runModelImport";
import type { ModelImportChoices, ModelImportResult } from "./types";

/** A result with each part's bytes as base64 */
export type ModelImportTestResult =
    | Extract<ModelImportResult, { ok: false }>
    | (Omit<Extract<ModelImportResult, { ok: true }>, "model"> & {
          model: Omit<
              Extract<ModelImportResult, { ok: true }>["model"],
              "parts"
          > & { parts: Record<string, string> };
          ms: number;
      });

export interface ModelImportTestApi {
    /** What the worker's CSP allows there */
    probe(): Promise<ModelImportProbe>;
    run(
        files: { name: string; base64: string }[],
        choices?: ModelImportChoices,
        timeoutMs?: number,
    ): Promise<ModelImportTestResult>;
}

declare global {
    interface Window {
        modelImportTest?: ModelImportTestApi;
    }
}

const fromBase64 = (text: string) =>
    Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function toBase64(bytes: Uint8Array): string {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
        text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
}

export function installModelImportTestApi(): void {
    window.modelImportTest = {
        probe() {
            const worker = createModelImportWorker();
            return new Promise<ModelImportProbe>((resolve, reject) => {
                worker.onmessage = (
                    event: MessageEvent<ModelImportResponse>,
                ) => {
                    if (event.data.type === "probe") resolve(event.data);
                    worker.terminate();
                };
                worker.onerror = (event) => {
                    worker.terminate();
                    reject(
                        new Error(event.message || "the worker didn't start"),
                    );
                };
                worker.postMessage({ type: "probe" });
            });
        },
        async run(files, choices = {}, timeoutMs) {
            const started = performance.now();
            const result = await runModelImport(
                files.map((f) => ({
                    name: f.name,
                    bytes: fromBase64(f.base64),
                })),
                choices,
                { createWorker: createModelImportWorker, timeoutMs },
            );
            if (!result.ok) return result;
            return {
                ...result,
                ms: Math.round(performance.now() - started),
                model: {
                    ...result.model,
                    parts: Object.fromEntries(
                        Object.entries(result.model.parts).map(
                            ([role, bytes]) => [role, toBase64(bytes)],
                        ),
                    ),
                },
            };
        },
    };
}
