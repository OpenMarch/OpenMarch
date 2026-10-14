// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runSharpSelfTest, writeSharpSelfTest } from "../sharp-self-test";

describe("sharp self-test", () => {
    let tempDir: string | undefined;

    afterEach(() => {
        if (tempDir) rmSync(tempDir, { recursive: true, force: true });
        tempDir = undefined;
    });

    it("resizes a 2048² image to a 512² PNG", async () => {
        const result = await runSharpSelfTest();

        expect(result.error).toBeUndefined();
        expect(result.ok).toBe(true);
        expect(result.output).toEqual({
            width: 512,
            height: 512,
            format: "png",
        });
        expect(result.sharpVersion).toBe("0.35.5");
        expect(result.libvipsVersion).toMatch(/^\d+\.\d+\.\d+/);
        expect(result.sharpPath).toContain("sharp");
    });

    it("writes the result as JSON and returns exit code 0", async () => {
        tempDir = mkdtempSync(join(tmpdir(), "sharp-self-test-"));
        const outPath = join(tempDir, "result.json");

        const exitCode = await writeSharpSelfTest(outPath);

        expect(exitCode).toBe(0);
        const written = JSON.parse(readFileSync(outPath, "utf8"));
        expect(written.ok).toBe(true);
        expect(written.platform).toBe(process.platform);
    });
});
