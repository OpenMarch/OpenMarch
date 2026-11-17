import { describe, expect, it } from "vitest";
import { withAppCsp } from "../workerCsp";

const PAGE = "script-src 'self'";
const WORKER = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'";
const WORKER_URL =
    "http://localhost:5173/src/showAssets/modelImport/modelImport.worker.ts?worker_file&type=module";

describe("withAppCsp", () => {
    it("adds the page's policy to every other response, as before", () => {
        const headers = {
            "content-security-policy": ["default-src 'none'"],
            "Content-Type": ["text/javascript"],
        };
        expect(
            withAppCsp("http://localhost:5173/src/main.tsx", headers, PAGE),
        ).toEqual({ ...headers, "Content-Security-Policy": [PAGE] });
    });

    it("gives the import worker its own policy as its only CSP", () => {
        expect(
            withAppCsp(
                WORKER_URL,
                {
                    "content-security-policy": ["default-src 'none'"],
                    "Content-Type": ["text/javascript"],
                },
                PAGE,
            ),
        ).toEqual({
            "Content-Type": ["text/javascript"],
            "Content-Security-Policy": [WORKER],
        });
        expect(withAppCsp(WORKER_URL, undefined, PAGE)).toEqual({
            "Content-Security-Policy": [WORKER],
        });
    });
});
