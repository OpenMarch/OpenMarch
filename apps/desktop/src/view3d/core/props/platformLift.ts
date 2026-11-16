/**
 * How high a performer stands (C4.5, props-spec section 5 "Platforms and obstacles"): at the top
 * of the tallest platform under their dot, stepping up or down over about half a count as the dot
 * crosses an edge, in step, with no cue. Exact foot placement on the edge is not in v1.
 *
 * The step is a ramp across the edge, `ramp` wide and centered on it: the distance a dot covers in
 * half a count at the show's step size. On the edge a performer is halfway up. Stacked platforms
 * make steps: each platform lifts from whatever is under it toward its own top.
 *
 * A podium is not a ramp: a performer whose dot is on it, or within {@link PODIUM_REACH} of it,
 * stands on its deck at the stand point, exactly (`writePodiumStands`).
 *
 * Plain TypeScript only, and the per-frame path allocates nothing.
 */
import type { PropSolid } from "./propLayout";
import { podiumHeading } from "../pit/pitModels";

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

/** A podium as the lift reads it: a platform with the point its performer stands on. */
export interface LiftPodium extends LiftPlatform {
    /** Where the performer stands, in world meters */
    readonly standX: number;
    readonly standZ: number;
    /** Its center, front to back */
    readonly centerZ: number;
}

/** How far outside a podium's footprint a dot still puts its performer on the podium (m): 1 ft. */
export const PODIUM_REACH = 0.3048;

/**
 * The Feet clip a performer holds while standing on a podium, by its base name (before the height
 * class suffix): om-pose's second position, feet about shoulder width apart and the toes turned out
 * a little, a conductor's stance. Where it isn't baked yet they stand at attention.
 */
export const PODIUM_CLIP = "second";

const isPodium = (s: PropSolid) => s.facesAcross === true;

const standsOnIt = (s: PropSolid) =>
    s.surface === "platform" && s.closed && s.height > 0;

/** The ramped platforms performers can stand on, lowest top first. Podiums aren't among them. */
export function liftPlatforms(solids: readonly PropSolid[]): LiftPlatform[] {
    return solids
        .filter((s) => standsOnIt(s) && !isPodium(s))
        .map(toPlatform)
        .sort((a, b) => a.top - b.top);
}

/** The podiums performers can stand on, as {@link writePodiumStands} reads them. */
export function liftPodiums(solids: readonly PropSolid[]): LiftPodium[] {
    return solids
        .filter((s) => standsOnIt(s) && isPodium(s))
        .map((s) => ({
            ...toPlatform(s),
            standX: s.standPoint?.x ?? s.center.x,
            standZ: s.standPoint?.z ?? s.center.z,
            centerZ: s.center.z,
        }));
}

function toPlatform(s: PropSolid): LiftPlatform {
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
    return { ring, top: s.base + s.height, minX, maxX, minZ, maxZ };
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

/**
 * Stands each placed performer whose dot is on a podium's footprint, or within
 * {@link PODIUM_REACH} outside it, on that podium (docs/3d/instruments.md §6): replaces their
 * position in `xz` with the podium's stand point, their lift in `lift` with its deck (its base
 * plus its standing height, exactly, with no ramp), and their heading in `headings` with one
 * facing the band across the field: the back sideline from a podium in front of the field, the
 * audience from one behind it. Of podiums in reach, the one whose stand point is nearest wins.
 * Everyone else keeps what they had.
 *
 * Render-only: `xz` is the frame's buffer, not the stored drill. Call it after the ramped lifts
 * and before anything is drawn at the feet, so the body, instrument, silks and plumes all follow.
 * The step onto the podium is instant as the dot comes into reach; there's no climb in v1.
 *
 * @param fieldCenterZ the field's front-to-back midpoint, in world meters
 */
export function writePodiumStands(
    podiums: readonly LiftPodium[],
    xz: Float32Array,
    placed: Uint8Array,
    fieldCenterZ: number,
    lift: Float32Array,
    headings: Float32Array,
): void {
    if (podiums.length === 0) return;
    for (let i = 0; i < lift.length; i++) {
        if (!placed[i]) continue;
        const on = podiumAt(podiums, xz[i * 2], xz[i * 2 + 1]);
        if (!on) continue;
        xz[i * 2] = on.standX;
        xz[i * 2 + 1] = on.standZ;
        lift[i] = on.top;
        headings[i] = podiumHeading(on.centerZ, fieldCenterZ);
    }
}

/**
 * The podium a dot at (x, z) puts its performer on: of those whose footprint it is on, or within
 * {@link PODIUM_REACH} outside, the one whose stand point is nearest. Null when none.
 */
function podiumAt(
    podiums: readonly LiftPodium[],
    x: number,
    z: number,
): LiftPodium | null {
    let on: LiftPodium | null = null;
    let nearest = Infinity;
    for (const p of podiums) {
        if (
            x < p.minX - PODIUM_REACH ||
            x > p.maxX + PODIUM_REACH ||
            z < p.minZ - PODIUM_REACH ||
            z > p.maxZ + PODIUM_REACH ||
            signedDistance(p.ring, x, z) < -PODIUM_REACH
        )
            continue;
        const d = Math.hypot(x - p.standX, z - p.standZ);
        if (d < nearest) {
            nearest = d;
            on = p;
        }
    }
    return on;
}

/**
 * Writes into `out`, per performer placed at `xz`, 1 if their dot puts them on a podium (as
 * {@link writePodiumStands} would stand them there) and 0 if not, so they can hold
 * {@link PODIUM_CLIP} while they're on it. Allocates nothing.
 */
export function writeOnPodiums(
    podiums: readonly LiftPodium[],
    xz: Float32Array,
    placed: Uint8Array,
    out: Uint8Array,
): void {
    for (let i = 0; i < out.length; i++)
        out[i] =
            placed[i] &&
            podiums.length > 0 &&
            podiumAt(podiums, xz[i * 2], xz[i * 2 + 1])
                ? 1
                : 0;
}
