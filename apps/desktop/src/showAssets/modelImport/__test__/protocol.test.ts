import { expect, it } from "vitest";
import { MODEL_IMPORT_WORKER_CSP } from "../protocol";

it("allows its own script and WebAssembly, and nothing else", () => {
    expect(MODEL_IMPORT_WORKER_CSP).toBe(
        "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'",
    );
});
