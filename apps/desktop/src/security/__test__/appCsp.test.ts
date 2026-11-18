// cspell:words Cggb
import { describe, expect, it } from "vitest";
import { MODEL_IMPORT_WORKER_CSP } from "@/showAssets/modelImport/protocol";
import { cspFor, workerPolicyFor } from "../appCsp";

const PAGE = "script-src 'self'";

describe("workerPolicyFor", () => {
    it.each([
        [
            "http://localhost:5173/src/showAssets/modelImport/modelImport.worker.ts?worker_file&type=module",
            "modelImport.worker",
        ],
        [
            "app://openmarch/assets/modelImport.worker-B8x_k2Qa.js",
            "modelImport.worker",
        ],
        [
            "https://editor.openmarch.com/assets/modelImport.worker-CzE0a9.js",
            "modelImport.worker",
        ],
        [
            "app://openmarch/assets/audioOffset.worker-B6r8zE3J.js",
            "audioOffset.worker",
        ],
        [
            "http://localhost:5173/src/workers/audioOffset.worker.ts?worker_file&type=module",
            "audioOffset.worker",
        ],
        [
            "https://editor.openmarch.com/assets/videoFile.worker-a1.js",
            "videoFile.worker",
        ],
        [
            "https://editor.openmarch.com/x/assets/backend.worker-Zq_9.js",
            "backend.worker",
        ],
    ])("%s is %s", (url, file) => {
        expect(workerPolicyFor(url)?.file).toBe(file);
    });

    it.each([
        "app://openmarch/index.html",
        "app://openmarch/assets/index-CggbGs2p.js",
        "app://openmarch/assets/timeStretch.worklet-DX2mVsYc.js",
        "https://editor.openmarch.com/assets/modelImport.worker-CzE0a9.js.map",
        "https://example.com/?u=/assets/modelImport.worker-a.js",
        "https://example.com/assets/xmodelImport.worker-a.js",
        "not a url",
    ])("%s is no listed worker", (url) => {
        expect(workerPolicyFor(url)).toBeNull();
    });
});

describe("cspFor", () => {
    it("gives a listed worker its own policy", () => {
        expect(
            cspFor("app://openmarch/assets/modelImport.worker-a.js", PAGE),
        ).toBe(MODEL_IMPORT_WORKER_CSP);
        expect(
            cspFor("app://openmarch/assets/audioOffset.worker-a.js", PAGE),
        ).toBe("default-src 'none'; script-src 'self'");
    });

    it("gives everything else the page's, so an unlisted worker isn't left with none", () => {
        expect(cspFor("app://openmarch/index.html", PAGE)).toBe(PAGE);
        expect(cspFor("app://openmarch/assets/other.worker-a.js", PAGE)).toBe(
            PAGE,
        );
    });
});
