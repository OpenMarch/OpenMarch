// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

vi.mock("../../../src/feedback/editorDiagnostics", () => ({
    editorDiagnosticsEntries: () => [],
}));

describe("blobMd5Base64", () => {
    it("matches Node's MD5, which Active Storage checks the upload against", async () => {
        const { blobMd5Base64 } = await import("../report");
        const bytes = Buffer.alloc(3 * 1024 * 1024 + 17);
        for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 256;
        expect(await blobMd5Base64(new Blob([bytes]))).toBe(
            createHash("md5").update(bytes).digest("base64"),
        );
    });
});
