import { describe, expect, it, vi } from "vitest";
import { createShowBlobCache, renderPartHash } from "../showBlobCache";

const h = (c: string) => c.repeat(64);

const store = (blobs: Record<string, number>) => {
    const read = vi.fn(async (hash: string) =>
        hash in blobs ? new Uint8Array(blobs[hash]) : undefined,
    );
    return read;
};

describe("createShowBlobCache", () => {
    it("reads a blob once and serves it from memory after", async () => {
        const read = store({ [h("a")]: 10 });
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        expect((await cache.get(h("a")))?.byteLength).toBe(10);
        expect((await cache.get(h("a")))?.byteLength).toBe(10);
        expect(read).toHaveBeenCalledTimes(1);
    });

    it("shares one read between callers asking at once", async () => {
        const read = store({ [h("a")]: 10 });
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        await Promise.all([cache.get(h("a")), cache.get(h("a"))]);
        expect(read).toHaveBeenCalledTimes(1);
    });

    it("drops the least recently used blobs past its byte budget", async () => {
        const read = store({ [h("a")]: 40, [h("b")]: 40, [h("c")]: 40 });
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        await cache.get(h("a"));
        await cache.get(h("b"));
        await cache.get(h("a")); // a is now newer than b
        await cache.get(h("c"));
        expect(cache.cachedBytes()).toBe(80);
        read.mockClear();
        await cache.get(h("a"));
        expect(read).not.toHaveBeenCalled();
        await cache.get(h("b"));
        expect(read).toHaveBeenCalledTimes(1);
    });

    it("hands back a blob larger than the budget without keeping it", async () => {
        const read = store({ [h("a")]: 500 });
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        expect((await cache.get(h("a")))?.byteLength).toBe(500);
        expect(cache.cachedBytes()).toBe(0);
    });

    it("doesn't remember a missing blob or a failed read", async () => {
        const read = vi
            .fn<(hash: string) => Promise<Uint8Array | undefined>>()
            .mockRejectedValueOnce(new Error("busy"))
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(new Uint8Array(4));
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        await expect(cache.get(h("a"))).rejects.toThrow("busy");
        expect(await cache.get(h("a"))).toBeUndefined();
        expect((await cache.get(h("a")))?.byteLength).toBe(4);
    });

    it("forgets everything on clear", async () => {
        const read = store({ [h("a")]: 10 });
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        await cache.get(h("a"));
        cache.clear();
        expect(cache.cachedBytes()).toBe(0);
        await cache.get(h("a"));
        expect(read).toHaveBeenCalledTimes(2);
    });
});

describe("createShowBlobCache across a clear", () => {
    it("doesn't keep a read that finishes after a clear", async () => {
        let finish!: (data: Uint8Array) => void;
        const read = vi.fn(
            () =>
                new Promise<Uint8Array | undefined>((resolve) => {
                    finish = resolve;
                }),
        );
        const cache = createShowBlobCache({ read, maxBytes: 100 });
        const reading = cache.get(h("a"));
        cache.clear();
        finish(new Uint8Array(10));
        expect((await reading)?.byteLength).toBe(10);
        expect(cache.cachedBytes()).toBe(0);
    });
});

describe("renderPartHash", () => {
    const artwork = { parts: { original: h("a"), display: h("b") } };
    const model = { parts: { glb: h("c"), sidecar: h("d") } };

    it("names the blob of a part rendering may read", () => {
        expect(renderPartHash(artwork, "display")).toBe(h("b"));
        expect(renderPartHash(model, "glb")).toBe(h("c"));
    });

    it("never hands out an original", () => {
        expect(() => renderPartHash(artwork, "original" as never)).toThrow(
            /original/,
        );
    });

    it("reads a part the Version doesn't have as undefined", () => {
        expect(renderPartHash(model, "display")).toBeUndefined();
    });
});
