import { describe, expect, it } from "vitest";
import { isDevBuildFor } from "../devBuild";

describe("isDevBuildFor", () => {
    it("is true on a Vite dev server, web or Electron", () => {
        expect(isDevBuildFor({ dev: true, webChannel: undefined })).toBe(true);
        expect(isDevBuildFor({ dev: true, webChannel: "stable" })).toBe(true);
    });

    it("is true for developer web channels", () => {
        for (const webChannel of ["dev", "examples", "nightly"])
            expect(isDevBuildFor({ dev: false, webChannel })).toBe(true);
    });

    it("is false for public builds", () => {
        expect(isDevBuildFor({ dev: false, webChannel: undefined })).toBe(
            false,
        );
        for (const webChannel of ["stable", "preview", "lab"])
            expect(isDevBuildFor({ dev: false, webChannel })).toBe(false);
    });
});
