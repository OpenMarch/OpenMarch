import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { VideoExportService } from "../video-export-service";

describe("VideoExportService", () => {
    let exportPath: string;
    let tempDir: string;
    let sessionId: string | null = null;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), "video-export-test-"));
        exportPath = join(tempDir, "export.mp4");
        process.env.PLAYWRIGHT_SESSION = "true";
        process.env.PLAYWRIGHT_VIDEO_EXPORT_PATH = exportPath;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        if (sessionId) {
            await VideoExportService.end(sessionId, true).catch(
                () => undefined,
            );
            sessionId = null;
        }
        delete process.env.PLAYWRIGHT_SESSION;
        delete process.env.PLAYWRIGHT_VIDEO_EXPORT_PATH;
        rmSync(tempDir, { recursive: true, force: true });
    });

    it("writes full chunk when fileHandle.write returns partial results", async () => {
        let writeCalls = 0;
        const originalOpen = fs.promises.open;

        vi.spyOn(fs.promises, "open").mockImplementation(
            async (path, flags) => {
                const handle = await originalOpen(path, flags);
                const realWrite = handle.write.bind(handle);

                handle.write = (async (
                    buffer: Buffer | Uint8Array | DataView,
                    offset?: number | null,
                    length?: number | null,
                    position?: number | null,
                ) => {
                    const bufOffset = offset ?? 0;
                    const len = length ?? buffer.byteLength - bufOffset;
                    const pos = position ?? 0;

                    writeCalls++;
                    const partialLen =
                        writeCalls === 1 ? Math.min(3, len) : len;

                    const result = await realWrite(
                        buffer,
                        bufOffset,
                        partialLen,
                        pos,
                    );
                    return { bytesWritten: partialLen, buffer: result.buffer };
                }) as typeof handle.write;

                return handle;
            },
        );

        const startResult = await VideoExportService.start("mp4");
        expect(startResult).not.toBeNull();
        sessionId = startResult!.sessionId;

        const data = new Uint8Array([1, 2, 3, 4, 5]);
        const position = 10;

        await VideoExportService.writeChunk(sessionId, data, position);

        expect(writeCalls).toBe(2);

        const handle = await fs.promises.open(exportPath, "r");
        const readBuf = Buffer.alloc(5);
        await handle.read(readBuf, 0, 5, position);
        await handle.close();

        expect([...readBuf]).toEqual([1, 2, 3, 4, 5]);
    });
});
