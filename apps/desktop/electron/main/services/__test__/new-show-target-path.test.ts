import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { resolveFinalizeTargetPath } from "../new-show-target-path";

describe("resolveFinalizeTargetPath", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-finalize-"));
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("keeps a custom filename instead of targeting an existing <ShowName>.dots", () => {
        const existing = path.join(dir, "Foo.dots");
        fs.writeFileSync(existing, "existing show");
        const custom = path.join(dir, "Bar-part1.dots");

        const target = resolveFinalizeTargetPath("Foo", custom);

        // Finalize only replaces the resolved target, so Foo.dots is untouched.
        expect(target).toBe(custom);
        expect(path.resolve(target)).not.toBe(path.resolve(existing));
        expect(fs.readFileSync(existing, "utf8")).toBe("existing show");
    });

    it("keeps a custom filename that starts with the show name", () => {
        expect(
            resolveFinalizeTargetPath("My Show", "/shows/My Show-part1.dots"),
        ).toBe("/shows/My Show-part1.dots");
    });

    it("names the file after the show when no .dots file is given", () => {
        expect(resolveFinalizeTargetPath("My: Show", "/shows/folder")).toBe(
            "/shows/My_ Show.dots",
        );
    });

    it("falls back to Untitled for an empty show name", () => {
        expect(resolveFinalizeTargetPath("  ", "/shows/")).toBe(
            "/shows/Untitled.dots",
        );
    });
});
