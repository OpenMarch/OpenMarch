import { describe, expect, it } from "vitest";
import { fabric } from "fabric";
import {
    configureFabricMemory,
    FABRIC_MIN_CACHE_SIDE,
    type FabricLimits,
    releaseObjectCaches,
} from "../fabricMemory";
import Endpoint from "../Endpoint";
import Pathway from "../Pathway";
import Midpoint from "../Midpoint";

configureFabricMemory();

type Cached = fabric.Object & {
    _cacheCanvas?: HTMLCanvasElement | null;
    _createCacheCanvas(): void;
};

/** Gives an object a cache canvas as Fabric's renderCache would. */
function withCache(object: fabric.Object): HTMLCanvasElement {
    const cached = object as Cached;
    cached._createCacheCanvas();
    const canvas = cached._cacheCanvas!;
    canvas.width = 300;
    canvas.height = 200;
    return canvas;
}

describe("configureFabricMemory", () => {
    it("draws lines, dots, rectangles and paths without a cache canvas", () => {
        expect(new fabric.Line([0, 0, 10, 10]).shouldCache()).toBe(false);
        expect(new fabric.Circle({ radius: 3 }).shouldCache()).toBe(false);
        expect(new fabric.Rect({ width: 5, height: 5 }).shouldCache()).toBe(
            false,
        );
        expect(new fabric.Path("M 0 0 L 10 10").shouldCache()).toBe(false);
    });

    it("draws pathways, endpoints and midpoints without a cache canvas", () => {
        const start = { x: 0, y: 0 };
        const end = { x: 10, y: 10 };
        expect(
            new Pathway({ start, end, color: "black", marcherId: 1 })
                .objectCaching,
        ).toBe(false);
        expect(
            new Endpoint({ coordinate: start, marcherId: 1 }).objectCaching,
        ).toBe(false);
        expect(
            new Midpoint({
                start,
                end,
                marcherId: 1,
                innerColor: "white",
                outerColor: "black",
            }).objectCaching,
        ).toBe(false);
    });

    it("keeps caching text and groups, with small minimum caches", () => {
        expect(new fabric.Text("T1").objectCaching).toBe(true);
        expect(new fabric.Group([]).objectCaching).toBe(true);
        expect((fabric as unknown as FabricLimits).minCacheSideLimit).toBe(
            FABRIC_MIN_CACHE_SIDE,
        );
    });

    it("is idempotent", () => {
        const proto = fabric.Object.prototype as unknown as {
            _removeCacheCanvas: () => void;
        };
        const before = proto._removeCacheCanvas;
        configureFabricMemory();
        expect(proto._removeCacheCanvas).toBe(before);
    });
});

describe("releasing cache canvases", () => {
    it("shrinks a dropped cache canvas to nothing", () => {
        const text = new fabric.Text("T1");
        const canvas = withCache(text);
        (
            text as unknown as { _removeCacheCanvas(): void }
        )._removeCacheCanvas();
        expect([canvas.width, canvas.height]).toEqual([0, 0]);
        expect((text as Cached)._cacheCanvas).toBeNull();
    });

    it("frees a group's and its children's caches", () => {
        const label = new fabric.Text("T1");
        const group = new fabric.Group([label]);
        const groupCache = withCache(group);
        const labelCache = withCache(label);
        releaseObjectCaches(group);
        expect(groupCache.width).toBe(0);
        expect(labelCache.width).toBe(0);
    });

    it("frees an object's cache when it is removed from a canvas, and makes it again when drawn", () => {
        const canvas = new fabric.StaticCanvas(null);
        const text = new fabric.Text("T1");
        canvas.add(text);
        const cache = withCache(text);
        canvas.remove(text);
        expect(cache.width).toBe(0);
        expect((text as Cached)._cacheCanvas).toBeNull();

        canvas.add(text);
        (text as Cached)._createCacheCanvas();
        expect((text as Cached)._cacheCanvas).not.toBeNull();
    });
});
