/**
 * The web build's end of video export: the channels Electron's
 * `VideoExportService` answers (`export:videoStart`, `export:videoChunk`,
 * `export:videoEnd`), answered in the page.
 *
 * The renderer encodes the video (src/components/exporting/video) and
 * streams it here chunk by chunk. The chunks go to a file in the origin
 * private file system through a worker (./videoFile.worker.ts), so the
 * video is never held in memory; without OPFS they are kept in memory
 * instead (./videoFileSink.ts).
 *
 * Saving the finished file needs a fresh tap (the share sheet refuses to
 * open long after the last one), so `export:videoEnd` only keeps it ready;
 * the dialog's "Save video" button then calls `open-export-directory`
 * with its name, which offers the share sheet on iPads ("Save Video" to
 * Photos, Files, AirDrop) and downloads it elsewhere. The temporary file is
 * removed once saved, and leftovers are swept on the next export.
 */
import { hasOpfs } from "../../src/utilities/device";
import {
    MemorySink,
    VIDEO_FOLDER,
    videoFileName,
    videoMimeType,
    type VideoFileRequest,
    type VideoFileResponse,
} from "./videoFileSink";

/** A started export's destination. */
export interface VideoWriter {
    write(data: Uint8Array, position: number): Promise<void>;
    /** Ends writing and returns the file (named `name`, of `type`). */
    finish(name: string, type: string): Promise<File>;
    /** Ends writing and throws the bytes away. */
    abort(): Promise<void>;
    /** Removes a finished file's temporary copy. */
    remove(): Promise<void>;
}

export interface VideoExportDeps {
    /** An OPFS-backed writer for `file`, or null when there is no OPFS. */
    openDiskWriter: (file: string) => Promise<VideoWriter | null>;
    /** Removes leftover temporary files not in `keep`. */
    sweep: (keep: string[]) => Promise<void>;
    showName: () => Promise<string | null | undefined>;
    /** Offers the share sheet (see ./filePicking.ts `shareFile`). */
    share: (
        file: File,
    ) => Promise<"shared" | "cancelled" | "expired" | "unavailable">;
    download: (file: File) => void;
    /** iPad/iPhone: share first. */
    appleTouch: boolean;
    newId: () => string;
    /** Waits before removing a downloaded file's temporary copy. */
    afterDownload: (removeCopy: () => void) => void;
}

export function memoryWriter(): VideoWriter {
    const sink = new MemorySink();
    return {
        write: async (data, position) => sink.write(data, position),
        finish: async (name, type) => sink.finish(name, type),
        abort: async () => sink.discard(),
        remove: async () => {},
    };
}

interface Ready {
    file: File;
    remove: () => Promise<void>;
}

// eslint-disable-next-line max-lines-per-function
export function createVideoExportHandlers(deps: VideoExportDeps) {
    const sessions = new Map<
        string,
        { writer: VideoWriter; name: string; type: string }
    >();
    const ready = new Map<string, Ready>();
    /** Whether the last export had to keep the video in memory. */
    let inMemory = false;

    async function discardReady(name: string) {
        const entry = ready.get(name);
        if (!entry) return;
        ready.delete(name);
        await entry.remove().catch(() => undefined);
    }

    return {
        get lastExportInMemory() {
            return inMemory;
        },

        async start(fileExtension: string) {
            // Only one export at a time, as in Electron: drop orphans
            for (const [id, session] of sessions) {
                sessions.delete(id);
                await session.writer.abort().catch(() => undefined);
            }
            for (const name of [...ready.keys()]) await discardReady(name);
            await deps.sweep([]).catch(() => undefined);

            const sessionId = deps.newId();
            const extension = fileExtension === "webm" ? "webm" : "mp4";
            let writer: VideoWriter | null = null;
            try {
                writer = await deps.openDiskWriter(`${sessionId}.${extension}`);
            } catch (error) {
                console.warn(
                    "Couldn't write the video to browser storage; keeping it in memory:",
                    error,
                );
            }
            inMemory = !writer;
            writer ??= memoryWriter();
            const name = videoFileName(await deps.showName(), extension);
            sessions.set(sessionId, {
                writer,
                name,
                type: videoMimeType(extension),
            });
            return { sessionId, filePath: name };
        },

        async chunk(sessionId: string, data: Uint8Array, position: number) {
            const session = sessions.get(sessionId);
            if (!session) throw new Error("This video export has ended");
            await session.writer.write(data, position);
        },

        /** Returns the file's name (its "path") once finished, else null. */
        async end(sessionId: string, success: boolean) {
            const session = sessions.get(sessionId);
            if (!session) return null;
            sessions.delete(sessionId);
            if (!success) {
                await session.writer.abort();
                return null;
            }
            const file = await session.writer.finish(
                session.name,
                session.type,
            );
            await discardReady(session.name);
            ready.set(session.name, {
                file,
                remove: () => session.writer.remove(),
            });
            return session.name;
        },

        /**
         * Saves a finished video, from a tap. Returns "saved", "cancelled"
         * (the share sheet was closed; it can be tried again) or "missing".
         */
        async deliver(
            name: string,
        ): Promise<"saved" | "cancelled" | "missing"> {
            const entry = ready.get(name);
            if (!entry) return "missing";
            if (deps.appleTouch) {
                const shared = await deps.share(entry.file);
                // Too long after the tap: tapping Save again works
                if (shared === "cancelled" || shared === "expired")
                    return "cancelled";
                if (shared === "shared") {
                    await discardReady(name);
                    return "saved";
                }
            }
            deps.download(entry.file);
            // The download reads the temporary file; remove it later
            deps.afterDownload(() => void discardReady(name));
            return "saved";
        },

        /**
         * Removes exports left in storage over an hour ago (see `sweep`),
         * as `start` does. Called when the app opens, before any export.
         */
        sweepLeftovers: () => deps.sweep([]).catch(() => undefined),

        /** Whether `name` is a finished video waiting to be saved. */
        isReady: (name: string) => ready.has(name),
    };
}

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

/** Talks to ./videoFile.worker.ts. */
function workerCaller() {
    const worker = new Worker(
        new URL("./videoFile.worker.ts", import.meta.url),
        {
            type: "module",
            name: "openmarch-video-file",
        },
    );
    let nextId = 1;
    const pending = new Map<number, (response: VideoFileResponse) => void>();
    // Set once the worker fails to load or crashes (iOS can stop it when
    // memory runs low): every call then fails rather than waiting forever
    let failure: string | null = null;
    const fail = (message: string) => {
        failure ??= message;
        for (const [id, settle] of pending)
            settle({ id, ok: false, error: failure });
        pending.clear();
    };
    worker.addEventListener(
        "message",
        (event: MessageEvent<VideoFileResponse>) => {
            pending.get(event.data.id)?.(event.data);
            pending.delete(event.data.id);
        },
    );
    worker.addEventListener("error", (event) => {
        event.preventDefault();
        fail(
            `The video file writer stopped: ${event.message || "unknown error"}`,
        );
    });
    worker.addEventListener("messageerror", () =>
        fail("The video file writer couldn't read a message"),
    );
    const call = (request: WithoutId<VideoFileRequest>) =>
        new Promise<void>((resolve, reject) => {
            if (failure !== null) {
                reject(new Error(failure));
                return;
            }
            const id = nextId++;
            pending.set(id, (response) =>
                response.ok ? resolve() : reject(new Error(response.error)),
            );
            worker.postMessage({ ...request, id });
        });
    return { call, terminate: () => worker.terminate() };
}

async function openDiskWriter(file: string): Promise<VideoWriter | null> {
    if (!hasOpfs()) return null;
    const worker = workerCaller();
    try {
        await worker.call({ op: "open", file });
    } catch (error) {
        worker.terminate();
        throw error;
    }
    const remove = async () => {
        await worker.call({ op: "remove", file }).catch(() => undefined);
        worker.terminate();
    };
    return {
        write: (data, position) => worker.call({ op: "write", data, position }),
        async finish(name, type) {
            await worker.call({ op: "close" });
            const folder = await (
                await navigator.storage.getDirectory()
            ).getDirectoryHandle(VIDEO_FOLDER);
            const stored = await (await folder.getFileHandle(file)).getFile();
            // A File over the stored one: no copy into memory
            return new File([stored], name, { type });
        },
        abort: remove,
        remove,
    };
}

async function sweep(keep: string[]) {
    if (!hasOpfs()) return;
    const worker = workerCaller();
    try {
        // Older than an hour: never another tab's export in progress
        await worker.call({ op: "sweep", olderThanMs: 60 * 60 * 1000, keep });
    } finally {
        worker.terminate();
    }
}

function download(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
}

export function browserVideoExportDeps(
    overrides: Pick<VideoExportDeps, "showName" | "share" | "appleTouch">,
): VideoExportDeps {
    return {
        openDiskWriter,
        sweep,
        download,
        newId: () => crypto.randomUUID(),
        afterDownload: (removeCopy) => setTimeout(removeCopy, 10 * 60_000),
        ...overrides,
    };
}
