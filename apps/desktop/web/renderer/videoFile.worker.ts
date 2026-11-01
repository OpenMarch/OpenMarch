/**
 * Writes one video export into the origin private file system, through a
 * sync access handle (only available in workers). See ./videoFileSink.ts.
 */
import {
    SyncHandleSink,
    VIDEO_FOLDER,
    type SyncHandleLike,
    type VideoFileRequest,
    type VideoFileResponse,
} from "./videoFileSink";

/** The parts of a dedicated worker's global scope used here. */
const scope = globalThis as unknown as {
    postMessage(message: VideoFileResponse): void;
    addEventListener(
        type: "message",
        listener: (event: MessageEvent<VideoFileRequest>) => void,
    ): void;
};

let sink: SyncHandleSink | null = null;

async function folder() {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(VIDEO_FOLDER, { create: true });
}

async function handle(request: VideoFileRequest) {
    switch (request.op) {
        case "open": {
            const file = await (
                await folder()
            ).getFileHandle(request.file, { create: true });
            const access = await (
                file as unknown as {
                    createSyncAccessHandle(): Promise<SyncHandleLike>;
                }
            ).createSyncAccessHandle();
            await access.truncate(0);
            sink = new SyncHandleSink(access);
            return;
        }
        case "write":
            if (!sink) throw new Error("No video file is open");
            sink.write(request.data, request.position);
            return;
        case "close":
            await sink?.close();
            sink = null;
            return;
        case "remove":
            await sink?.close().catch(() => {});
            sink = null;
            await (await folder())
                .removeEntry(request.file)
                .catch(() => undefined);
            return;
        case "sweep": {
            // Leftovers from exports that were never saved (closed tab,
            // crash): anything older than the cut-off that isn't in use.
            const dir = await folder();
            const cutoff = Date.now() - request.olderThanMs;
            const iterable = dir as unknown as {
                entries(): AsyncIterable<[string, FileSystemHandle]>;
            };
            for await (const [name, entry] of iterable.entries()) {
                if (entry.kind !== "file" || request.keep.includes(name))
                    continue;
                const file = await (entry as FileSystemFileHandle)
                    .getFile()
                    .catch(() => null);
                if (!file || file.lastModified < cutoff)
                    await dir.removeEntry(name).catch(() => undefined);
            }
            return;
        }
    }
}

/** One request at a time, in the order they came. */
let queue: Promise<unknown> = Promise.resolve();

scope.addEventListener("message", (event) => {
    const request = event.data;
    const run = queue.then(() => handle(request));
    queue = run.catch(() => undefined);
    void run.then(
        () => scope.postMessage({ id: request.id, ok: true }),
        (error: unknown) =>
            scope.postMessage({
                id: request.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            }),
    );
});
