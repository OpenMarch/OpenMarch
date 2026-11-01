import { describe, expect, it, vi } from "vitest";
import {
    defaultVideoFrameRate,
    defaultVideoResolution,
    keepScreenAwake,
    videoResolutionsFor,
} from "../exportSettings";

describe("video export presets", () => {
    it("offers 720p and 1080p on the web, and 4K only in the desktop app", () => {
        expect(videoResolutionsFor(true).map((r) => r.label)).toEqual([
            "720p",
            "1080p",
        ]);
        expect(videoResolutionsFor(false).map((r) => r.label)).toEqual([
            "720p",
            "1080p",
            "4K",
        ]);
    });

    it("defaults to 720p on the web and tablets, 1080p otherwise", () => {
        expect(defaultVideoResolution(true, false)).toBe("720p");
        expect(defaultVideoResolution(false, true)).toBe("720p");
        expect(defaultVideoResolution(false, false)).toBe("1080p");
        expect(defaultVideoFrameRate(true)).toBe(30);
        expect(defaultVideoFrameRate(false)).toBe(60);
    });
});

describe("keepScreenAwake", () => {
    function fakeDocument() {
        const listeners = new Set<() => void>();
        return {
            visibilityState: "visible" as DocumentVisibilityState,
            addEventListener: (_: string, fn: () => void) => listeners.add(fn),
            removeEventListener: (_: string, fn: () => void) =>
                listeners.delete(fn),
            fire() {
                for (const fn of listeners) fn();
            },
            listeners,
        };
    }

    it("holds a screen lock, asks again when the page comes back, and releases it", async () => {
        const release = vi.fn(async () => {});
        const request = vi.fn(async () => ({ release }));
        const doc = fakeDocument();
        const lock = keepScreenAwake(
            { wakeLock: { request } },
            doc as unknown as Document,
        );
        expect(request).toHaveBeenCalledWith("screen");
        doc.fire();
        expect(request).toHaveBeenCalledTimes(2);
        await Promise.resolve();
        lock.release();
        expect(release).toHaveBeenCalled();
        expect(doc.listeners.size).toBe(0);
    });

    it("does nothing without the Wake Lock API, or when refused", async () => {
        expect(() => keepScreenAwake({}).release()).not.toThrow();
        const lock = keepScreenAwake(
            { wakeLock: { request: () => Promise.reject(new Error("no")) } },
            fakeDocument() as unknown as Document,
        );
        await Promise.resolve();
        expect(() => lock.release()).not.toThrow();
    });

    it("releases a lock granted after release was asked", async () => {
        const release = vi.fn(async () => {});
        let grant: (v: { release: typeof release }) => void = () => {};
        const lock = keepScreenAwake(
            {
                wakeLock: {
                    request: () => new Promise((resolve) => (grant = resolve)),
                },
            },
            fakeDocument() as unknown as Document,
        );
        lock.release();
        grant({ release });
        await Promise.resolve();
        await Promise.resolve();
        expect(release).toHaveBeenCalled();
    });
});
