/**
 * Where a video export's bytes go in the web build, while mediabunny
 * encodes it (see ./videoExport.ts).
 *
 * MP4 files are written out of order: mediabunny reserves room at the start
 * ("fast start") and fills it in at the end, so every write has a position.
 *
 * - `SyncHandleSink`: a file in the origin private file system (OPFS)
 *   through a sync access handle, in a worker (./videoFile.worker.ts). Only
 *   the chunk being written is in memory. Every current browser has it,
 *   Safari since 15.2.
 * - `MemorySink`: keeps the chunks in memory and joins them at the end.
 *   Only for browsers without OPFS (e.g. some private windows); the whole
 *   video is in memory, so long videos may not fit.
 */

/** The part of `FileSystemSyncAccessHandle` the sink uses. */
export interface SyncHandleLike {
    write(buffer: Uint8Array, options: { at: number }): number;
    truncate(size: number): void | Promise<void>;
    flush(): void | Promise<void>;
    close(): void | Promise<void>;
}

export class SyncHandleSink {
    private closed = false;
    constructor(private readonly handle: SyncHandleLike) {}

    /** Writes all of `data` at `position`; throws if the disk is full. */
    write(data: Uint8Array, position: number) {
        if (this.closed) throw new Error("The video file is already closed");
        let done = 0;
        while (done < data.byteLength) {
            const written = this.handle.write(data.subarray(done), {
                at: position + done,
            });
            // No progress: out of space (or quota)
            if (!(written > 0))
                throw new Error(
                    "There isn't enough space on this device for the video",
                );
            done += written;
        }
    }

    async close() {
        if (this.closed) return;
        this.closed = true;
        try {
            // Older Safari (15.2–16) returns promises from these
            await this.handle.flush();
        } finally {
            await this.handle.close();
        }
    }
}

export class MemorySink {
    private chunks: { data: Uint8Array; position: number }[] = [];
    private size = 0;

    /** Bytes held so far (for the "long videos may not fit" warning). */
    get byteLength() {
        return this.size;
    }

    write(data: Uint8Array, position: number) {
        // Copy: the caller may reuse its buffer
        this.chunks.push({ data: data.slice(), position });
        this.size = Math.max(this.size, position + data.byteLength);
    }

    /** The file, with later writes over earlier ones where they overlap. */
    finish(name: string, type: string): File {
        const bytes = new Uint8Array(this.size);
        for (const { data, position } of this.chunks) bytes.set(data, position);
        this.chunks = [];
        return new File([bytes], name, { type });
    }

    discard() {
        this.chunks = [];
        this.size = 0;
    }
}

/** "My Show-2026-10-24.mp4", without characters file systems reject. */
export function videoFileName(
    showName: string | null | undefined,
    extension: string,
    date: Date = new Date(),
): string {
    const cleaned = (showName ?? "")
        // eslint-disable-next-line no-control-regex
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
        .trim();
    const day = date.toISOString().split("T")[0];
    return `${cleaned || "OpenMarch show"}-${day}.${extension}`;
}

/** The MIME type for a video file's extension. */
export function videoMimeType(extension: string): string {
    return extension === "webm" ? "video/webm" : "video/mp4";
}

/** Messages to ./videoFile.worker.ts. */
export type VideoFileRequest =
    | { id: number; op: "open"; file: string }
    | { id: number; op: "write"; data: Uint8Array; position: number }
    | { id: number; op: "close" }
    | { id: number; op: "remove"; file: string }
    | { id: number; op: "sweep"; olderThanMs: number; keep: string[] };

export type VideoFileResponse =
    { id: number; ok: true } | { id: number; ok: false; error: string };

/** The OPFS folder that holds exports until they're saved. */
export const VIDEO_FOLDER = "openmarch-video-export";
