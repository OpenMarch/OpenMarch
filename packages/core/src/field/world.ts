import type { FieldProperties } from "./FieldProperties";

/**
 * Mapping between the 2D canvas and the 3D View's world (ADR 0002, design.md §2).
 *
 * World units are meters. The origin is the center of the front sideline
 * (`FieldProperties.centerFrontPoint`), +X points toward side 2, +Y is up and
 * +Z points toward the audience, so the field occupies `z <= 0`.
 */

/** A position on the ground plane in world meters. */
export interface WorldPoint {
    x: number;
    z: number;
}

/** The performance surface in world meters. Matches `FieldFootprint` in view3d. */
export interface FieldFootprint {
    minX: number;
    maxX: number;
    /** The back edge (most negative z). */
    minZ: number;
    /** The front edge; 0 for every built-in template. */
    maxZ: number;
}

const METERS_PER_INCH = 0.0254;

/** The length of one step in meters. */
export function stepMeters(fp: FieldProperties): number {
    return fp.stepSizeInches * METERS_PER_INCH;
}

/** Meters per canvas pixel. */
function metersPerPixel(fp: FieldProperties): number {
    return stepMeters(fp) / fp.pixelsPerStep;
}

/**
 * Converts canvas pixels (y grows toward the front sideline) to world meters.
 * The front sideline center maps to `{ x: 0, z: 0 }`.
 */
export function pixelsToWorld(
    fp: FieldProperties,
    { x, y }: { x: number; y: number },
): WorldPoint {
    const k = metersPerPixel(fp);
    return {
        x: (x - fp.centerFrontPoint.xPixels) * k,
        z: (y - fp.centerFrontPoint.yPixels) * k,
    };
}

/** The inverse of {@link pixelsToWorld}. */
export function worldToPixels(
    fp: FieldProperties,
    { x, z }: WorldPoint,
): { x: number; y: number } {
    const k = metersPerPixel(fp);
    return {
        x: x / k + fp.centerFrontPoint.xPixels,
        y: z / k + fp.centerFrontPoint.yPixels,
    };
}

/**
 * Converts steps from center front to world meters, using the checkpoint
 * convention: +x toward side 2, +y toward the audience (so behind the front
 * sideline is negative y and negative z).
 */
export function stepsToWorld(
    fp: FieldProperties,
    { xSteps, ySteps }: { xSteps: number; ySteps: number },
): WorldPoint {
    const m = stepMeters(fp);
    return { x: xSteps * m, z: ySteps * m };
}

/**
 * The bounding box of the field's checkpoints in world meters. The box always
 * includes the center-front origin, like `FieldProperties.width` and `height`.
 */
export function fieldFootprint(fp: FieldProperties): FieldFootprint {
    const m = stepMeters(fp);
    const range = (steps: number[]) => ({
        min: Math.min(0, ...steps),
        max: Math.max(0, ...steps),
    });
    const xr = range(fp.xCheckpoints.map((c) => c.stepsFromCenterFront));
    const yr = range(fp.yCheckpoints.map((c) => c.stepsFromCenterFront));
    return {
        minX: xr.min * m,
        maxX: xr.max * m,
        minZ: yr.min * m,
        maxZ: yr.max * m,
    };
}
