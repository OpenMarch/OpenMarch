import { describe, expect, it } from "vitest";
import { isModelImportWorkerUrl, MODEL_IMPORT_WORKER_CSP } from "../protocol";

describe("isModelImportWorkerUrl", () => {
    it.each([
        "http://localhost:5173/src/showAssets/modelImport/modelImport.worker.ts?worker_file&type=module",
        "file:///opt/OpenMarch/resources/app.asar/dist/assets/modelImport.worker-B8x_k2Qa.js",
        "https://editor.openmarch.com/assets/modelImport.worker-CzE0a9.js",
    ])("is the worker: %s", (url) => {
        expect(isModelImportWorkerUrl(url)).toBe(true);
    });

    it.each([
        "file:///opt/OpenMarch/resources/app.asar/dist/index.html",
        "file:///opt/OpenMarch/resources/app.asar/dist/assets/audioOffset.worker-B8x.js",
        "https://editor.openmarch.com/assets/modelImport.worker-CzE0a9.js.map",
        "https://example.com/?u=/assets/modelImport.worker-a.js",
        "not a url",
    ])("isn't: %s", (url) => {
        expect(isModelImportWorkerUrl(url)).toBe(false);
    });
});

it("allows its own script and WebAssembly, and nothing else", () => {
    expect(MODEL_IMPORT_WORKER_CSP).toBe(
        "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'",
    );
});
