import { describe, expect, it } from "vitest";
import { cspFor, withCsp } from "../workerCsp";

const PAGE = "script-src 'self'";

describe("cspFor", () => {
    it("gives the import worker its own policy and everything else the page's", () => {
        expect(
            cspFor(
                "http://localhost:5173/src/showAssets/modelImport/modelImport.worker.ts?worker_file&type=module",
                PAGE,
            ),
        ).toBe("default-src 'none'; script-src 'self' 'wasm-unsafe-eval'");
        expect(cspFor("http://localhost:5173/src/main.tsx", PAGE)).toBe(PAGE);
    });
});

describe("withCsp", () => {
    it("replaces any policy already there, whatever its case", () => {
        expect(
            withCsp(
                {
                    "content-security-policy": ["default-src 'none'"],
                    "Content-Type": "text/javascript",
                },
                PAGE,
            ),
        ).toEqual({
            "Content-Type": ["text/javascript"],
            "Content-Security-Policy": [PAGE],
        });
    });

    it("adds one when there's none", () => {
        expect(withCsp(undefined, PAGE)).toEqual({
            "Content-Security-Policy": [PAGE],
        });
    });
});
