/**
 * Props in the 3D View as plain blocks (convergence P4, inventory row 6a):
 * each prop's Outline footprint extruded to its height, at its timeline
 * position and turn. Pure: no three.js. The window's `PropBlocks.tsx` owns
 * the meshes and calls these from its frame hook.
 *
 * - A prop's Outline at a moment is `itemGeometryAt` at the beat the 2D field
 *   draws (`ShowPositions.beatAt`), and its center is the resolver's position
 *   for its marchers row, so the block is where the 2D Outline is.
 * - Footprints are unit-sized (`outlineShape` at 1 × 1): every prop with the
 *   same shape shares one geometry, and its size, height and turn go in the
 *   instance matrix.
 * - World axes as `positions.ts`: field x is +X, field y (down the screen,
 *   toward the audience) is +Z, so the 2D turn (clockwise on screen) turns
 *   +X toward +Z.
 */
import { itemGeometryAt, type GeometryChange } from "@openmarch/core";
import type { ItemGeometry, WorldPoint } from "@openmarch/core";
import { outlineShape, type Pt } from "@/items/itemOutlines";
import type { ItemOutlineChanges } from "@/items/itemOutlineTimeline";

/**
 * The thinnest block, in meters: a Floor prop (a tarp, a mat) has no height,
 * and is drawn as a slab just thick enough to show above the field.
 */
export const MIN_PROP_HEIGHT = 0.03;
/** Neutral grey (sRGB), since props have no fill color of their own. */
export const PROP_BLOCK_COLOR = 0x9a9a9a;

/** One prop's Outline changes, sorted by beat, for its marchers row. */
export interface PropTrack {
    marcherId: number;
    changes: readonly GeometryChange[];
}

/**
 * Every prop with Outline changes, by marcher id, from the changes the 2D
 * field reads (`itemOutlineChanges`). A prop with no changes on a loaded beat
 * is left out: it is never on field.
 */
export function propTracks(changes: ItemOutlineChanges): PropTrack[] {
    return [...changes]
        .map(([marcherId, list]) => ({
            marcherId,
            changes: [...list].sort((a, b) => a.beat - b.beat),
        }))
        .sort((a, b) => a.marcherId - b.marcherId);
}

/**
 * The key of an Outline's footprint: Outlines with the same key share one
 * geometry. A rectangle or circle is the same shape whatever its size; a
 * custom outline is its own shape.
 */
export function propShapeKey(
    outlineType: string,
    customOutline: unknown,
): string {
    if (outlineType === "rectangle" || outlineType === "circle")
        return outlineType;
    const unit = unitFootprint(outlineType, customOutline);
    // An unusable custom outline falls back to a rectangle (`outlineShape`)
    if (unit.length === 4 && isUnitRectangle(unit)) return "rectangle";
    return `${outlineType}:${JSON.stringify(unit.map((p) => [p.x, p.y]))}`;
}

const isUnitRectangle = (points: readonly Pt[]) =>
    points.every((p) => Math.abs(p.x) === 0.5 && Math.abs(p.y) === 0.5);

/**
 * The Outline's footprint at 1 m × 1 m, centered and unturned, in field
 * axes (x, y): a closed polygon. An open freehand Outline is closed, as the
 * 2D field fills it.
 */
export function unitFootprint(
    outlineType: string,
    customOutline: unknown,
): Pt[] {
    return outlineShape(outlineType, customOutline, 1, 1).points;
}

/** A footprint the show's props use: its key and its unit polygon. */
export interface PropShape {
    key: string;
    footprint: Pt[];
}

/** Every footprint the show's props use at any moment, in key order. */
export function propShapes(tracks: readonly PropTrack[]): PropShape[] {
    const shapes = new Map<string, Pt[]>();
    for (const track of tracks)
        for (const change of track.changes) {
            const key = propShapeKey(change.outlineType, change.customOutline);
            if (!shapes.has(key))
                shapes.set(
                    key,
                    unitFootprint(change.outlineType, change.customOutline),
                );
        }
    return [...shapes]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, footprint]) => ({ key, footprint }));
}

/**
 * Writes the instance matrix (column-major, as three stores it) for a unit
 * footprint block standing on the ground (base at y = 0, top at y = 1):
 * scaled to the Outline's width, height and depth, turned, and moved to
 * `center`.
 */
export function writePropMatrix(
    out: Float32Array,
    index: number,
    geometry: Pick<ItemGeometry, "width" | "depth" | "height" | "rotation">,
    center: WorldPoint,
    baseY = 0,
): void {
    const radians = (geometry.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const height = Math.max(geometry.height, MIN_PROP_HEIGHT);
    const o = index * 16;
    // Unit x goes to (cos, 0, sin) × width
    out[o] = geometry.width * cos;
    out[o + 1] = 0;
    out[o + 2] = geometry.width * sin;
    out[o + 3] = 0;
    out[o + 4] = 0;
    out[o + 5] = height;
    out[o + 6] = 0;
    out[o + 7] = 0;
    // Unit z (field y) goes to (-sin, 0, cos) × depth
    out[o + 8] = -geometry.depth * sin;
    out[o + 9] = 0;
    out[o + 10] = geometry.depth * cos;
    out[o + 11] = 0;
    out[o + 12] = center.x;
    out[o + 13] = baseY;
    out[o + 14] = center.z;
    out[o + 15] = 1;
}

/** Where each footprint's instances go, filled by {@link placePropBlocks}. */
export interface PropBlockFrame {
    /** The footprint keys, as {@link propShapes} */
    keys: readonly string[];
    /** Per key: 16 floats per instance, room for every prop */
    matrices: Float32Array[];
    /** Per key: how many instances were written */
    counts: Int32Array;
}

export function createPropBlockFrame(
    keys: readonly string[],
    propCount: number,
): PropBlockFrame {
    return {
        keys,
        matrices: keys.map(() => new Float32Array(propCount * 16)),
        counts: new Int32Array(keys.length),
    };
}

/**
 * Places every prop at `beat`: for each one on field with a position, writes
 * its matrix under its footprint's key. Packed from index 0 per key.
 *
 * @param positionInto - the prop's center in world meters at this moment
 *   into `out`, or false when it has none
 * @param keyOf - caches {@link propShapeKey}; pass a Map kept per show
 */
export function placePropBlocks(
    tracks: readonly PropTrack[],
    beat: number,
    positionInto: (marcherId: number, out: WorldPoint) => boolean,
    frame: PropBlockFrame,
    keyOf: (geometry: ItemGeometry) => string,
    baseY = 0,
): void {
    frame.counts.fill(0);
    for (const track of tracks) {
        const geometry = itemGeometryAt(track.changes, beat);
        if (!geometry || !positionInto(track.marcherId, scratch)) continue;
        const k = frame.keys.indexOf(keyOf(geometry));
        if (k < 0) continue;
        writePropMatrix(
            frame.matrices[k],
            frame.counts[k]++,
            geometry,
            scratch,
            baseY,
        );
    }
}

const scratch: WorldPoint = { x: 0, z: 0 };

/** A {@link placePropBlocks} `keyOf` that computes each Outline's key once. */
export function cachedShapeKey(): (geometry: ItemGeometry) => string {
    const byType = new Map<string, Map<unknown, string>>();
    return (geometry) => {
        let byOutline = byType.get(geometry.outlineType);
        if (!byOutline)
            byType.set(geometry.outlineType, (byOutline = new Map()));
        let key = byOutline.get(geometry.customOutline);
        if (key === undefined) {
            key = propShapeKey(geometry.outlineType, geometry.customOutline);
            byOutline.set(geometry.customOutline, key);
        }
        return key;
    };
}
