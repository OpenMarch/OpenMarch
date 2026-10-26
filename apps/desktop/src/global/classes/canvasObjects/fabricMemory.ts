import { fabric } from "fabric";

/**
 * Keeps Fabric's per-object cache canvases few and small.
 *
 * By default Fabric gives every object its own offscreen "cache" canvas, at
 * least 256 × 256 pixels, sized to the object at the current zoom and pixel
 * ratio. The field has about a thousand objects (every grid line, every
 * pathway, endpoint and label), so a 76-marcher show held about 500 MB of
 * canvas memory at the fitted zoom and about 1 GB zoomed in. Every pan or
 * pinch also threw all the grid lines' caches away and made new ones (the
 * grid group caches itself while the view moves, which drops its lines'
 * caches). Safari on iPad limits canvas memory to a few hundred MB and frees
 * a dropped canvas only when it is garbage collected, so the page ran out of
 * memory and was killed ("A problem repeatedly occurred") after a short
 * while of dragging marchers.
 *
 * - Lines, circles, rectangles and paths draw directly: stroking a line or a
 *   dot costs no more than copying a cached image of it. Text, which is
 *   slow to draw, and groups stay cached.
 * - A cache is at least 32 px a side, not 256, so a marcher's label isn't
 *   a 256 × 256 canvas.
 * - A cache that is dropped, or belongs to an object removed from the
 *   canvas, is shrunk to 0 × 0 at once, so Safari frees its memory now
 *   rather than at the next garbage collection.
 */
export const FABRIC_MIN_CACHE_SIDE = 32;

/** The object classes that draw directly instead of through a cache. */
const UNCACHED_CLASSES = [
    fabric.Line,
    fabric.Circle,
    fabric.Ellipse,
    fabric.Rect,
    fabric.Polyline,
    fabric.Polygon,
    fabric.Path,
    fabric.Triangle,
];

type CachedObject = fabric.Object & {
    _cacheCanvas?: HTMLCanvasElement | null;
    _cacheContext?: CanvasRenderingContext2D | null;
    _removeCacheCanvas(): void;
    _objects?: fabric.Object[];
};

/** Shrinks a canvas to nothing so the browser frees its pixels now. */
export function releaseCanvasElement(
    canvas: HTMLCanvasElement | null | undefined,
) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
}

/** Frees an object's cache canvas, and its children's. It's made again if the object is drawn. */
export function releaseObjectCaches(object: fabric.Object) {
    const cached = object as CachedObject;
    if (cached._cacheCanvas) cached._removeCacheCanvas();
    for (const child of cached._objects ?? []) releaseObjectCaches(child);
}

/** Fabric's cache limits, which its types leave out. */
export type FabricLimits = { minCacheSideLimit: number };

let applied = false;

/** Applies the settings above to Fabric. Safe to call more than once. */
export function configureFabricMemory() {
    if (applied) return;
    applied = true;

    for (const objectClass of UNCACHED_CLASSES)
        if (objectClass) objectClass.prototype.objectCaching = false;
    (fabric as unknown as FabricLimits).minCacheSideLimit =
        FABRIC_MIN_CACHE_SIDE;

    const proto = fabric.Object.prototype as unknown as CachedObject;
    const removeCacheCanvas = proto._removeCacheCanvas;
    proto._removeCacheCanvas = function (this: CachedObject) {
        releaseCanvasElement(this._cacheCanvas);
        removeCacheCanvas.call(this);
    };

    const staticProto = fabric.StaticCanvas.prototype as unknown as {
        _onObjectRemoved(object: fabric.Object): void;
    };
    const onObjectRemoved = staticProto._onObjectRemoved;
    staticProto._onObjectRemoved = function (object: fabric.Object) {
        onObjectRemoved.call(this, object);
        releaseObjectCaches(object);
    };
}
