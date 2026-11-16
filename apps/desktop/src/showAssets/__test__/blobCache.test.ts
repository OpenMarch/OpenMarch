// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createShowBlobCache } from "../blobCache";

/** Blobs of `size` bytes filled with `fill`, keyed by their real sha256. */
function blobs(...specs: { fill: number; size: number }[]) {
    const byHash = new Map<string, Uint8Array>();
    const hashes = specs.map(({ fill, size }) => {
        const data = new Uint8Array(size).fill(fill);
        const hash = createHash("sha256").update(data).digest("hex");
        byHash.set(hash, data);
        return hash;
    });
    const read = vi.fn(async (hash: string) => byHash.get(hash));
    return { hashes, read };
}

describe("createShowBlobCache", () => {
    it("reads a blob once and serves it from memory after", async () => {
        const {
            hashes: [a],
            read,
        } = blobs({ fill: 1, size: 10 });
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        expect((await cache.get(a!))?.byteLength).toBe(10);
        expect((await cache.get(a!))?.byteLength).toBe(10);
        expect(read).toHaveBeenCalledTimes(1);
    });

    it("shares one read between callers asking at once", async () => {
        const {
            hashes: [a],
            read,
        } = blobs({ fill: 1, size: 10 });
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        await Promise.all([cache.get(a!), cache.get(a!)]);
        expect(read).toHaveBeenCalledTimes(1);
    });

    it("drops the least recently used blobs past its byte budget", async () => {
        const {
            hashes: [a, b, c],
            read,
        } = blobs(
            { fill: 1, size: 40 },
            { fill: 2, size: 40 },
            { fill: 3, size: 40 },
        );
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        await cache.get(a!);
        await cache.get(b!);
        await cache.get(a!); // a is now newer than b
        await cache.get(c!);
        expect(cache.cachedBytes()).toBe(80);
        read.mockClear();
        await cache.get(a!);
        expect(read).not.toHaveBeenCalled();
        await cache.get(b!);
        expect(read).toHaveBeenCalledTimes(1);
    });

    it("hands back a blob larger than the budget without keeping it", async () => {
        const {
            hashes: [a],
            read,
        } = blobs({ fill: 1, size: 500 });
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        expect((await cache.get(a!))?.byteLength).toBe(500);
        expect(cache.cachedBytes()).toBe(0);
    });

    it("doesn't remember a missing blob or a failed read", async () => {
        const data = new Uint8Array(4);
        const hash = createHash("sha256").update(data).digest("hex");
        const read = vi
            .fn<(hash: string) => Promise<Uint8Array | undefined>>()
            .mockRejectedValueOnce(new Error("busy"))
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(data);
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        await expect(cache.get(hash)).rejects.toThrow("busy");
        expect(await cache.get(hash)).toBeUndefined();
        expect((await cache.get(hash))?.byteLength).toBe(4);
    });

    it("treats bytes that don't match their hash as missing", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const read = vi.fn(async () => new Uint8Array([1, 2, 3]));
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        expect(await cache.get("0".repeat(64))).toBeUndefined();
        expect(cache.cachedBytes()).toBe(0);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it("forgets everything on clear", async () => {
        const {
            hashes: [a],
            read,
        } = blobs({ fill: 1, size: 10 });
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        await cache.get(a!);
        cache.clear();
        expect(cache.cachedBytes()).toBe(0);
        await cache.get(a!);
        expect(read).toHaveBeenCalledTimes(2);
    });

    it("doesn't keep a read that finishes after a clear", async () => {
        const data = new Uint8Array(10);
        const hash = createHash("sha256").update(data).digest("hex");
        let finish!: (data: Uint8Array) => void;
        const read = vi.fn(
            () =>
                new Promise<Uint8Array | undefined>((resolve) => {
                    finish = resolve;
                }),
        );
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        const reading = cache.get(hash);
        cache.clear();
        finish(data);
        expect((await reading)?.byteLength).toBe(10);
        expect(cache.cachedBytes()).toBe(0);
    });
});
