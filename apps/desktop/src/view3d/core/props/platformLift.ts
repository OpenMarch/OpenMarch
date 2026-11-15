/**
 * How high a performer stands (C4.5, props-spec section 5 "Platforms and obstacles"): at the top
 * of the tallest platform under their dot, stepping up or down over about half a count as the dot
 * crosses an edge, in step, with no cue. Exact foot placement on the edge is not in v1.
 *
 * The step is a ramp across the edge, `ramp` wide and centered on it: the distance a dot covers in
 * half a count at the show's step size. On the edge a performer is halfway up. Stacked platforms
 * make steps: each platform lifts from whatever is under it toward its own top.
 *
 * Plain TypeScript only, and the per-frame path allocates nothing.
 */
import type { PropSolid } from "./propLayout";

/** A platform as the lift reads it: its Outline as flat x, z pairs, its top and its bounds. */
export interface LiftPlatform {
    /** x0, z0, x1, z1, … */
    readonly ring: Float64Array;
    readonly top: number;
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

/** The platforms performers can stand on, lowest top first. */
export function liftPlatforms(solids: readonly PropSolid[]): LiftPlatform[] {
    const out: LiftPlatform[] = [];
    for (const s of solids) {
        if (s.surface !== "platform" || !s.closed || s.height <= 0) continue;
        const ring = new Float64Array(s.outline.length * 2);
        let minX = Infinity,
            maxX = -Infinity,
            minZ = Infinity,
            maxZ = -Infinity;
        s.outline.forEach((p, i) => {
            ring[i * 2] = p.x;
            ring[i * 2 + 1] = p.z;
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z);
            maxZ = Math.max(maxZ, p.z);
        });
        out.push({ ring, top: s.base + s.height, minX, maxX, minZ, maxZ });
    }
    return out.sort((a, b) => a.top - b.top);
}

/** How far (x, z) is inside the ring: positive inside, negative outside, 0 on an edge. */
function signedDistance(ring: Float64Array, x: number, z: number): number {
    let inside = false;
    let nearest = Infinity;
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const ax = ring[i * 2],
            az = ring[i * 2 + 1],
            bx = ring[j * 2],
            bz = ring[j * 2 + 1];
        // The edge crosses the point's row, to the point's right (even-odd rule)
        const aAbove = az > z;
        const bAbove = bz > z;
        if (aAbove !== bAbove && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
            inside = !inside;
        const dx = bx - ax,
            dz = bz - az;
        const length2 = dx * dx + dz * dz;
        const t =
            length2 > 0
                ? Math.min(
                      1,
                      Math.max(0, ((x - ax) * dx + (z - az) * dz) / length2),
                  )
                : 0;
        nearest = Math.min(
            nearest,
            Math.hypot(x - (ax + t * dx), z - (az + t * dz)),
        );
    }
    return inside ? nearest : -nearest;
}

/** The height a performer whose dot is at (x, z) stands at. */
export function liftAt(
    platforms: readonly LiftPlatform[],
    x: number,
    z: number,
    ramp: number,
): number {
    const half = ramp / 2;
    let height = 0;
    for (const p of platforms) {
        if (
            p.top <= height ||
            x < p.minX - half ||
            x > p.maxX + half ||
            z < p.minZ - half ||
            z > p.maxZ + half
        )
            continue;
        const along = Math.min(
            1,
            Math.max(0, 0.5 + signedDistance(p.ring, x, z) / ramp),
        );
        height += (p.top - height) * along;
    }
    return height;
}

/** Writes each performer's lift into `out`: 0 for one that isn't placed. */
export function writeLifts(
    platforms: readonly LiftPlatform[],
    xz: Float32Array,
    placed: Uint8Array,
    ramp: number,
    out: Float32Array,
): void {
    for (let i = 0; i < out.length; i++)
        out[i] =
            placed[i] && platforms.length > 0
                ? liftAt(platforms, xz[i * 2], xz[i * 2 + 1], ramp)
                : 0;
}
