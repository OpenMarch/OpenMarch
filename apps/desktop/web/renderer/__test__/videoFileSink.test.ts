import { describe, expect, it, vi } from "vitest";
import {
    MemorySink,
    SyncHandleSink,
    videoFileName,
    videoMimeType,
    type SyncHandleLike,
} from "../videoFileSink";

/** A sync access handle over a growable byte array. */
function fakeHandle({ maxPerWrite = Infinity, capacity = Infinity } = {}) {
    let bytes = new Uint8Array(0);
    const calls: string[] = [];
    const handle: SyncHandleLike = {
        write(buffer, { at }) {
            const room = Math.max(0, capacity - at);
            const n = Math.min(buffer.byteLength, maxPerWrite, room);
            if (at + n > bytes.length) {
                const grown = new Uint8Array(at + n);
                grown.set(bytes);
                bytes = grown;
            }
            bytes.set(buffer.subarray(0, n), at);
            return n;
        },
        truncate: vi.fn(),
        flush: vi.fn(async () => {
            calls.push("flush");
        }),
        close: vi.fn(() => {
            calls.push("close");
        }),
    };
    return { handle, bytes: () => bytes, calls };
}

describe("SyncHandleSink", () => {
    it("writes chunks at their positions, including rewrites of earlier bytes", () => {
        const fake = fakeHandle();
        const sink = new SyncHandleSink(fake.handle);
        sink.write(new Uint8Array([0, 0, 0, 0]), 0);
        sink.write(new Uint8Array([5, 6]), 4);
        // Fast start: the header is filled in at the end
        sink.write(new Uint8Array([1, 2]), 1);
        expect([...fake.bytes()]).toEqual([0, 1, 2, 0, 5, 6]);
    });

    it("keeps writing when the handle writes only part of a chunk", () => {
        const fake = fakeHandle({ maxPerWrite: 2 });
        new SyncHandleSink(fake.handle).write(
            new Uint8Array([1, 2, 3, 4, 5]),
            3,
        );
        expect([...fake.bytes()]).toEqual([0, 0, 0, 1, 2, 3, 4, 5]);
    });

    it("says the device is full when a write makes no progress", () => {
        const fake = fakeHandle({ capacity: 3 });
        expect(() =>
            new SyncHandleSink(fake.handle).write(new Uint8Array(5), 0),
        ).toThrow("isn't enough space");
    });

    it("flushes then closes once, and refuses writes after", async () => {
        const fake = fakeHandle();
        const sink = new SyncHandleSink(fake.handle);
        await sink.close();
        await sink.close();
        expect(fake.calls).toEqual(["flush", "close"]);
        expect(() => sink.write(new Uint8Array(1), 0)).toThrow("closed");
    });
});

/** jsdom's File has no arrayBuffer() */
function readBytes(file: File): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
            resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

describe("MemorySink", () => {
    it("joins the chunks, later writes over earlier ones", async () => {
        const sink = new MemorySink();
        const reused = new Uint8Array([9, 9, 9]);
        sink.write(reused, 0);
        reused.fill(7); // the caller reuses its buffer
        sink.write(new Uint8Array([1]), 1);
        sink.write(new Uint8Array([4, 4]), 3);
        expect(sink.byteLength).toBe(5);
        const file = sink.finish("show.mp4", "video/mp4");
        expect(file.name).toBe("show.mp4");
        expect(file.type).toBe("video/mp4");
        expect([...(await readBytes(file))]).toEqual([9, 1, 9, 4, 4]);
    });
});

describe("videoFileName", () => {
    const day = new Date("2026-10-24T12:00:00Z");
    it("names the video after the show and the day", () => {
        expect(videoFileName("Fall Show", "mp4", day)).toBe(
            "Fall Show-2026-10-24.mp4",
        );
    });
    it("drops characters file systems reject, and names untitled shows", () => {
        expect(videoFileName('a/b:c*?"<>|', "webm", day)).toBe(
            "abc-2026-10-24.webm",
        );
        expect(videoFileName(undefined, "mp4", day)).toBe(
            "OpenMarch show-2026-10-24.mp4",
        );
    });
    it("knows the MIME types", () => {
        expect(videoMimeType("mp4")).toBe("video/mp4");
        expect(videoMimeType("webm")).toBe("video/webm");
    });
});
