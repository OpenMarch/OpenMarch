import { describe, expect, it, vi } from "vitest";
import {
    createVideoExportHandlers,
    type VideoExportDeps,
    type VideoWriter,
} from "../videoExport";

function diskWriter() {
    const writes: [number[], number][] = [];
    const writer: VideoWriter & { writes: typeof writes } = {
        writes,
        write: vi.fn(async (data: Uint8Array, position: number) => {
            writes.push([[...data], position]);
        }),
        finish: vi.fn(
            async (name: string, type: string) =>
                new File([new Uint8Array([1, 2, 3])], name, { type }),
        ),
        abort: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
    };
    return writer;
}

function setup(overrides: Partial<VideoExportDeps> = {}) {
    const writers: ReturnType<typeof diskWriter>[] = [];
    let removeLater: (() => void) | null = null;
    let id = 0;
    const deps: VideoExportDeps = {
        openDiskWriter: vi.fn(async () => {
            const writer = diskWriter();
            writers.push(writer);
            return writer;
        }),
        sweep: vi.fn(async () => {}),
        showName: async () => "Fall Show",
        share: vi.fn(async () => "shared" as const),
        download: vi.fn(),
        appleTouch: false,
        newId: () => `s${++id}`,
        afterDownload: (fn) => {
            removeLater = fn;
        },
        ...overrides,
    };
    return {
        deps,
        writers,
        handlers: createVideoExportHandlers(deps),
        removeLater: () => removeLater?.(),
    };
}

async function exportOne(handlers: ReturnType<typeof setup>["handlers"]) {
    const { sessionId, filePath } = await handlers.start("mp4");
    await handlers.chunk(sessionId, new Uint8Array([1, 2]), 0);
    const path = await handlers.end(sessionId, true);
    return { sessionId, filePath, path };
}

describe("web video export handlers", () => {
    it("streams chunks to a disk file named by session, and returns the show's file name", async () => {
        const { handlers, deps, writers } = setup();
        const { filePath, path } = await exportOne(handlers);
        expect(deps.openDiskWriter).toHaveBeenCalledWith("s1.mp4");
        expect(writers[0].writes).toEqual([[[1, 2], 0]]);
        expect(filePath).toMatch(/^Fall Show-\d{4}-\d\d-\d\d\.mp4$/);
        expect(path).toBe(filePath);
        expect(writers[0].finish).toHaveBeenCalledWith(filePath, "video/mp4");
        expect(handlers.isReady(path!)).toBe(true);
        expect(handlers.lastExportInMemory).toBe(false);
    });

    it("keeps the video in memory without OPFS, or when it fails to open", async () => {
        for (const openDiskWriter of [
            vi.fn(async () => null),
            vi.fn(async () => {
                throw new Error("NotAllowedError");
            }),
        ]) {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const { handlers } = setup({ openDiskWriter });
            const { sessionId } = await handlers.start("webm");
            expect(handlers.lastExportInMemory).toBe(true);
            await handlers.chunk(sessionId, new Uint8Array([7, 8]), 0);
            await handlers.chunk(sessionId, new Uint8Array([9]), 0);
            const path = await handlers.end(sessionId, true);
            expect(path).toMatch(/\.webm$/);
            warn.mockRestore();
        }
    });

    it("throws the bytes away when cancelled", async () => {
        const { handlers, writers } = setup();
        const { sessionId } = await handlers.start("mp4");
        expect(await handlers.end(sessionId, false)).toBeNull();
        expect(writers[0].abort).toHaveBeenCalled();
        await expect(
            handlers.chunk(sessionId, new Uint8Array(1), 0),
        ).rejects.toThrow("ended");
    });

    it("a new export drops an unfinished one and an unsaved video, and sweeps leftovers", async () => {
        const { handlers, writers, deps } = setup();
        const first = await exportOne(handlers);
        const { sessionId } = await handlers.start("mp4");
        await handlers.start("mp4");
        expect(writers[0].remove).toHaveBeenCalled();
        expect(handlers.isReady(first.path!)).toBe(false);
        expect(writers[1].abort).toHaveBeenCalled();
        await expect(
            handlers.chunk(sessionId, new Uint8Array(1), 0),
        ).rejects.toThrow();
        expect(deps.sweep).toHaveBeenCalledTimes(3);
    });

    it("on iPad, saving opens the share sheet and removes the copy once shared", async () => {
        const { handlers, writers, deps } = setup({ appleTouch: true });
        const { path } = await exportOne(handlers);
        expect(await handlers.deliver(path!)).toBe("saved");
        const shared = vi.mocked(deps.share).mock.calls[0][0];
        expect(shared.type).toBe("video/mp4");
        expect(shared.name).toBe(path);
        expect(deps.download).not.toHaveBeenCalled();
        expect(writers[0].remove).toHaveBeenCalled();
        expect(await handlers.deliver(path!)).toBe("missing");
    });

    it("on iPad, closing the share sheet keeps the video to try again", async () => {
        const share = vi.fn(async () => "cancelled" as const);
        const { handlers, writers } = setup({ appleTouch: true, share });
        const { path } = await exportOne(handlers);
        expect(await handlers.deliver(path!)).toBe("cancelled");
        expect(writers[0].remove).not.toHaveBeenCalled();
        expect(handlers.isReady(path!)).toBe(true);
    });

    it("downloads where sharing is unavailable, and removes the copy later", async () => {
        const share = vi.fn(async () => "unavailable" as const);
        const { handlers, writers, deps, removeLater } = setup({
            appleTouch: true,
            share,
        });
        const { path } = await exportOne(handlers);
        expect(await handlers.deliver(path!)).toBe("saved");
        expect(deps.download).toHaveBeenCalledOnce();
        expect(writers[0].remove).not.toHaveBeenCalled();
        removeLater();
        await vi.waitFor(() => expect(writers[0].remove).toHaveBeenCalled());
    });

    it("downloads straight away on other devices", async () => {
        const { handlers, deps } = setup();
        const { path } = await exportOne(handlers);
        await handlers.deliver(path!);
        expect(deps.share).not.toHaveBeenCalled();
        expect(deps.download).toHaveBeenCalledOnce();
    });
});
