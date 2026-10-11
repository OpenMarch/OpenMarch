/**
 * Pure input math for the 3D View camera: telling a trackpad from a mouse,
 * where the pointer meets the ground, zooming toward a point, and
 * frame-rate-independent damping. No React and no scene access.
 */
import type { Vector3Tuple } from "three";

/** The wheel fields the classifier reads (a `WheelEvent` satisfies it). */
export interface WheelLike {
    deltaX: number;
    deltaY: number;
    deltaMode: number;
    ctrlKey: boolean;
    /** Chromium's legacy field: −3 × deltaY for trackpads, ±120 per notch for a mouse. */
    wheelDeltaY?: number;
}

export type WheelKind = "pinch" | "trackpad" | "mouse";

/**
 * What produced a wheel event. macOS reports a trackpad pinch as a wheel
 * with `ctrlKey`; a trackpad's two-finger scroll is pixel-mode with
 * fine-grained or horizontal deltas; a mouse wheel moves in notches.
 */
export function classifyWheel(e: WheelLike): WheelKind {
    if (e.ctrlKey) return "pinch";
    if (e.deltaMode !== 0) return "mouse";
    if (e.deltaX !== 0) return "trackpad";
    if (!Number.isInteger(e.deltaY)) return "trackpad";
    if (e.wheelDeltaY !== undefined && e.wheelDeltaY !== 0)
        return e.wheelDeltaY === -3 * e.deltaY ? "trackpad" : "mouse";
    return Math.abs(e.deltaY) < 50 ? "trackpad" : "mouse";
}

/** A wheel delta in pixels, whatever its mode. */
export function wheelPixels(delta: number, deltaMode: number): number {
    return deltaMode === 1 ? delta * 16 : deltaMode === 2 ? delta * 400 : delta;
}

/** Farther than this (meters) a ground hit is treated as a miss. */
export const MAX_GROUND_HIT = 2000;

/** Where a ray from `origin` along `dir` meets the ground plane y = `groundY`, or null. */
export function groundHit(
    origin: Vector3Tuple,
    dir: Vector3Tuple,
    groundY = 0,
): Vector3Tuple | null {
    if (!(dir[1] < -1e-6)) return null;
    const t = (groundY - origin[1]) / dir[1];
    if (!(t > 0)) return null;
    const hit: Vector3Tuple = [
        origin[0] + dir[0] * t,
        groundY,
        origin[2] + dir[2] * t,
    ];
    if (Math.hypot(hit[0] - origin[0], hit[2] - origin[2]) > MAX_GROUND_HIT)
        return null;
    return hit;
}

/** `value` after `dtMs` of exponential decay with the given half-life. */
export function damp(value: number, dtMs: number, halfLifeMs: number): number {
    return value * Math.pow(0.5, dtMs / halfLifeMs);
}

/** A marcher, for picking under the cursor: a standing cylinder this wide (radius, m) ... */
export const MARCHER_PICK_RADIUS = 0.3;
/** ... and this tall (m), to the top of the hat. */
export const MARCHER_PICK_HEIGHT = 2.0;

/**
 * The distance along a ray (`dir` a unit vector) to the nearest placed
 * marcher, each a standing cylinder at its spot in `xz`, or null.
 */
export function pickMarchers(
    origin: Vector3Tuple,
    dir: Vector3Tuple,
    xz: ArrayLike<number>,
    placed: ArrayLike<number>,
    count: number,
): number | null {
    const r = MARCHER_PICK_RADIUS;
    const h = MARCHER_PICK_HEIGHT;
    const [ox, oy, oz] = origin;
    const [dx, dy, dz] = dir;
    const a = dx * dx + dz * dz;
    let best: number | null = null;
    const consider = (t: number) => {
        if (t > 0 && (best === null || t < best)) best = t;
    };
    for (let i = 0; i < count; i++) {
        if (!placed[i]) continue;
        const cx = ox - xz[i * 2];
        const cz = oz - xz[i * 2 + 1];
        // the side: |(o + t d) − c| = r in the ground plane, between 0 and h
        if (a > 1e-12) {
            const b = cx * dx + cz * dz;
            const c = cx * cx + cz * cz - r * r;
            const disc = b * b - a * c;
            if (disc >= 0) {
                const t = (-b - Math.sqrt(disc)) / a;
                const y = oy + dy * t;
                if (y >= 0 && y <= h) consider(t);
            }
        }
        // the top: the plane y = h inside the circle
        if (Math.abs(dy) > 1e-12) {
            const t = (h - oy) / dy;
            const px = cx + dx * t;
            const pz = cz + dz * t;
            if (px * px + pz * pz <= r * r) consider(t);
        }
    }
    return best;
}

/**
 * The camera and orbit target scaled by `ratio` about `point`. The view's
 * direction is unchanged, so every point on the line from the camera
 * through `point` (the one under the cursor) stays where it is on screen.
 */
export function zoomAbout(
    position: Vector3Tuple,
    target: Vector3Tuple,
    point: Vector3Tuple,
    ratio: number,
): { position: Vector3Tuple; target: Vector3Tuple } {
    const scale = (v: Vector3Tuple): Vector3Tuple => [
        point[0] + (v[0] - point[0]) * ratio,
        point[1] + (v[1] - point[1]) * ratio,
        point[2] + (v[2] - point[2]) * ratio,
    ];
    return { position: scale(position), target: scale(target) };
}

export interface ZoomLimits {
    /** The camera stops this far (m) from the point it zooms toward. */
    minDistance: number;
    /** The eye stays at least this high (m) above the ground. */
    minEyeY: number;
    /** The camera stays within this distance (m) of its orbit target. */
    maxRadius: number;
}

/** The smallest and largest ratio `zoomAbout` may scale by within `limits`. */
export function zoomRatioLimits(
    position: Vector3Tuple,
    target: Vector3Tuple,
    point: Vector3Tuple,
    limits: ZoomLimits,
): [number, number] {
    const distance = Math.hypot(
        position[0] - point[0],
        position[1] - point[1],
        position[2] - point[2],
    );
    let lo = distance > 0 ? limits.minDistance / distance : 1;
    const above = position[1] - point[1];
    if (point[1] < limits.minEyeY && above > 0)
        lo = Math.max(lo, (limits.minEyeY - point[1]) / above);
    const radius = Math.hypot(
        position[0] - target[0],
        position[1] - target[1],
        position[2] - target[2],
    );
    const hi = radius > 0 ? limits.maxRadius / radius : Infinity;
    return [Math.min(lo, 1), Math.max(hi, 1)];
}
