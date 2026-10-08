import type { fabric } from "fabric";

/**
 * One canvas holding copies of many objects' Fabric cache canvases, for playback frames.
 *
 * Drawing 360 small caches, each its own canvas, costs Chrome a texture per source. On the heavy
 * perf fixture (180 marchers, host GPU), drawing them from copies here cut the GPU process's CPU
 * time during playback by about 40% and the renderer's script time by about 10%.
 * `renderObjectsFromCaches` draws each cache from its copy with the same context calls and size,
 * so the pixels are the same.
 *
 * A copy is refreshed when Fabric redraws the cache: the object's `drawObject` is wrapped to count
 * draws into its own cache context, and a slot remembers the count it copied. A cache that changes
 * size (a zoom) gets a new slot. Slots are packed in rows; when the atlas is full it is cleared and
 * refilled, twice as large if nothing in it was stale, up to `MAX_SIZE` a side. An object that still
 * doesn't fit is drawn from its own cache.
 */

const START_SIZE = 1024;
const MAX_SIZE = 2048;
/** Transparent pixels between slots */
const PAD = 2;

export interface AtlasSlot {
    generation: number;
    source: HTMLCanvasElement;
    version: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

type AtlasObject = fabric.Object & {
    _cacheContext?: CanvasRenderingContext2D | null;
    __atlasSlot?: AtlasSlot;
    __cacheVersion?: number;
    __cacheVersionHooked?: boolean;
};

/** Counts the times Fabric draws `obj` into its own cache canvas */
const hookCacheVersion = (obj: AtlasObject) => {
    if (obj.__cacheVersionHooked) return;
    obj.__cacheVersionHooked = true;
    obj.__cacheVersion = 0;
    const drawObject = obj.drawObject as (
        this: AtlasObject,
        ...args: unknown[]
    ) => void;
    obj.drawObject = function (
        this: AtlasObject,
        ctx: CanvasRenderingContext2D,
        ...rest: unknown[]
    ) {
        if (ctx === this._cacheContext)
            this.__cacheVersion = (this.__cacheVersion ?? 0) + 1;
        drawObject.call(this, ctx, ...rest);
    } as typeof obj.drawObject;
};

export class CacheAtlas {
    canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private size = 0;
    private generation = 0;
    private rowX = PAD;
    private rowY = PAD;
    private rowHeight = 0;
    /** Slots left behind by a cache that changed size; a full atlas with some is refilled */
    private stale = 0;
    /** Times the atlas was cleared and refilled, for tests and profiling */
    resets = 0;

    /** The slot holding `cache`, the current cache canvas of `obj`, or null if it doesn't fit */
    slotFor(object: fabric.Object, cache: HTMLCanvasElement): AtlasSlot | null {
        const obj = object as AtlasObject;
        hookCacheVersion(obj);
        const version = obj.__cacheVersion!;
        const w = cache.width;
        const h = cache.height;
        const slot = obj.__atlasSlot;
        if (
            slot &&
            slot.generation === this.generation &&
            slot.source === cache &&
            slot.w === w &&
            slot.h === h
        ) {
            if (slot.version !== version) {
                this.copy(slot, cache);
                slot.version = version;
            }
            return slot;
        }
        if (slot && slot.generation === this.generation) this.stale++;
        const next = this.allocate(w, h);
        if (!next) {
            obj.__atlasSlot = undefined;
            return null;
        }
        const created: AtlasSlot = {
            generation: this.generation,
            source: cache,
            version,
            x: next.x,
            y: next.y,
            w,
            h,
        };
        this.copy(created, cache);
        obj.__atlasSlot = created;
        return created;
    }

    /** Frees the atlas canvas; the next slot starts a new one */
    release(): void {
        this.canvas = null;
        this.ctx = null;
        this.size = 0;
        this.generation++;
        this.stale = 0;
    }

    private copy(slot: AtlasSlot, cache: HTMLCanvasElement) {
        const ctx = this.ctx!;
        ctx.clearRect(slot.x, slot.y, slot.w, slot.h);
        ctx.drawImage(cache, slot.x, slot.y);
    }

    /** Starts an empty atlas `size` pixels a side; every existing slot is dropped */
    private reset(size: number): boolean {
        if (!this.canvas || this.size !== size) {
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                this.release();
                return false;
            }
            this.canvas = canvas;
            this.ctx = ctx;
            this.size = size;
        } else {
            this.ctx!.clearRect(0, 0, size, size);
        }
        this.ctx!.imageSmoothingEnabled = false;
        this.generation++;
        this.rowX = PAD;
        this.rowY = PAD;
        this.rowHeight = 0;
        this.stale = 0;
        this.resets++;
        return true;
    }

    private place(w: number, h: number): { x: number; y: number } | null {
        if (this.rowX + w + PAD > this.size) {
            this.rowX = PAD;
            this.rowY += this.rowHeight + PAD;
            this.rowHeight = 0;
        }
        if (this.rowX + w + PAD > this.size || this.rowY + h + PAD > this.size)
            return null;
        const at = { x: this.rowX, y: this.rowY };
        this.rowX += w + PAD;
        this.rowHeight = Math.max(this.rowHeight, h);
        return at;
    }

    private allocate(w: number, h: number): { x: number; y: number } | null {
        if (w + 2 * PAD > MAX_SIZE || h + 2 * PAD > MAX_SIZE) return null;
        if (!this.canvas && !this.reset(START_SIZE)) return null;
        const at = this.place(w, h);
        if (at) return at;
        // Full: refill from scratch, larger unless stale slots were taking the room
        if (this.stale > 0) {
            if (!this.reset(this.size)) return null;
        } else if (this.size < MAX_SIZE) {
            if (!this.reset(this.size * 2)) return null;
        } else return null;
        return this.place(w, h);
    }
}
