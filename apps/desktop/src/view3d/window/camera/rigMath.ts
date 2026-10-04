/**
 * Pure camera-rig math for the 3D View window (P3.2, ui.md UI-3). No React
 * and no scene access, so it can be unit-tested. Ported from the reference
 * demo's rig (`ref/venue-demo.html`), converted from feet to meters.
 *
 * The rig orbits a target point. Its pose is spherical: `radius` from the
 * target, `phi` from straight up (0 looks straight down) and `theta` around
 * +Y, measured from +Z toward +X. With `theta = 0` the camera sits on the
 * audience side of the target, so screen up is -Z (the back of the field)
 * and screen right is +X (side 2): the 2D canvas orientation.
 */
// cspell:ignore lerp
import { Vector3, type Vector3Tuple } from "three";
import type { CameraSeat } from "@/view3d/core/types";

/** Fly-to duration (ui.md UI-3). */
export const FLY_MS = 1100;
/** The arc's peak lift is this share of the move's length... */
export const ARC_LIFT_SHARE = 0.25;
/** ...up to this many meters (the demo's 120 ft). */
export const ARC_LIFT_MAX = 36.6;
/** Closest and farthest zoom, in meters from the target (8 ft and 2200 ft). */
export const MIN_RADIUS = 2.4;
export const MAX_RADIUS = 670;
/** Orbit limits for `phi`: just off straight down, to just below level. */
export const MIN_PHI = 0.02;
export const MAX_PHI = 1.53;
/** The camera never goes lower than this above the ground (y = 0). */
export const MIN_EYE_Y = 0.5;
/** Pan keeps the target within this many meters of the kit's focus. */
export const MAX_PAN = 500;
/** Radians of orbit per pixel dragged. */
export const ORBIT_PER_PX = 0.005;
/** Pan distance per pixel, as a share of the radius. */
export const PAN_PER_PX = 0.0016;
/** Zoom factor exponent per wheel delta unit. */
export const ZOOM_PER_WHEEL = 0.0012;
/** Seated eye height above the tread for pick-a-seat (ui.md UI-3). */
export const SEATED_EYE = 1.2;
/** Vertical field of view for seats that don't set one; matches `Scene.tsx`. */
export const SEAT_FOV_DEG = 45;
/**
 * Press-box views aim higher than the kit's target, so the front sideline
 * sits this far down the frame (normalized device y). In the big stands the
 * nearest crowd filled the bottom third of the frame; lifting the view
 * pushes the near rows out of frame and keeps the whole field in view.
 */
export const PRESS_BOX_FRONT_NDC_Y = -0.75;
/** The press-box lift never exceeds this many degrees. */
export const PRESS_BOX_MAX_LIFT_DEG = 10;
/** Where the opening fly-in starts, relative to the default seat (the demo's (-200, 140, 220) ft). */
export const FLY_IN_OFFSET: Vector3Tuple = [-61, 43, 67];

export interface Spherical {
    radius: number;
    phi: number;
    theta: number;
}

/** Cubic ease-in-out, 0..1 to 0..1. */
export function easeInOutCubic(u: number): number {
    const t = Math.min(1, Math.max(0, u));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export interface Tween {
    fromPosition: Vector3Tuple;
    fromTarget: Vector3Tuple;
    toPosition: Vector3Tuple;
    toTarget: Vector3Tuple;
    /** 0 jumps (reduced motion). */
    durationMs: number;
}

export interface TweenPose {
    position: Vector3Tuple;
    target: Vector3Tuple;
    /** True once the tween has reached its end. */
    done: boolean;
}

/** Peak upward lift for a move of `distance` meters. */
export function arcLift(distance: number): number {
    return Math.min(ARC_LIFT_MAX, distance * ARC_LIFT_SHARE);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vector3Tuple, b: Vector3Tuple, t: number): Vector3Tuple => [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
];
const dist3 = (a: Vector3Tuple, b: Vector3Tuple) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * The camera pose `elapsedMs` into a fly-to: eased position and look-at,
 * plus an upward arc (`sin(pi * e)` times `arcLift`) so long moves don't cut
 * through stands. Ends exactly on the destination.
 */
export function tweenPose(tween: Tween, elapsedMs: number): TweenPose {
    const u =
        tween.durationMs > 0 ? Math.min(1, elapsedMs / tween.durationMs) : 1;
    if (u >= 1)
        return {
            position: [...tween.toPosition],
            target: [...tween.toTarget],
            done: true,
        };
    const e = easeInOutCubic(u);
    const position = lerp3(tween.fromPosition, tween.toPosition, e);
    position[1] +=
        Math.sin(Math.PI * e) *
        arcLift(dist3(tween.fromPosition, tween.toPosition));
    return {
        position,
        target: lerp3(tween.fromTarget, tween.toTarget, e),
        done: false,
    };
}

/** Spherical coordinates of `position` around `target`. */
export function sphericalFromPose(
    position: Vector3Tuple,
    target: Vector3Tuple,
): Spherical {
    const dx = position[0] - target[0];
    const dy = position[1] - target[1];
    const dz = position[2] - target[2];
    const radius = Math.max(1e-6, Math.hypot(dx, dy, dz));
    return {
        radius,
        phi: Math.acos(Math.min(1, Math.max(-1, dy / radius))),
        // atan2(0, 0) is 0: straight down defaults to the 2D orientation.
        theta: Math.atan2(dx, dz),
    };
}

/** Smallest `phi` used when placing the camera, so `lookAt` keeps a heading. */
const PHI_EPSILON = 1e-4;

/** The camera position for a spherical pose around `target`. */
export function positionFromSpherical(
    s: Spherical,
    target: Vector3Tuple,
): Vector3Tuple {
    const phi = Math.max(PHI_EPSILON, s.phi);
    const sp = Math.sin(phi);
    return [
        target[0] + s.radius * sp * Math.sin(s.theta),
        target[1] + s.radius * Math.cos(phi),
        target[2] + s.radius * sp * Math.cos(s.theta),
    ];
}

/**
 * Largest `phi` that keeps the eye at least `MIN_EYE_Y` above the ground for
 * this radius and target height, capped at `MAX_PHI`.
 */
export function maxPhiAboveGround(radius: number, targetY: number): number {
    const c = (MIN_EYE_Y - targetY) / radius;
    if (c <= -1) return MAX_PHI;
    if (c >= 1) return MIN_PHI;
    return Math.max(MIN_PHI, Math.min(MAX_PHI, Math.acos(c)));
}

/**
 * Applies an orbit step to `phi` within `[MIN_PHI, maxPhi]`. A pose that is
 * already outside the limits (a kit seat looking slightly up) can move back
 * toward them, but never further out.
 */
export function orbitPhi(phi: number, delta: number, maxPhi: number): number {
    const next = phi + delta;
    const lo = Math.min(MIN_PHI, phi);
    const hi = Math.max(maxPhi, phi);
    return Math.min(hi, Math.max(lo, next));
}

/** New radius after a wheel step (`deltaY` in pixels, positive zooms out). */
export function zoomRadius(radius: number, deltaY: number): number {
    return clampRadius(radius * Math.exp(deltaY * ZOOM_PER_WHEEL));
}

export function clampRadius(radius: number): number {
    return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius));
}

/**
 * Moves the orbit target in the ground plane for a drag of (`dx`, `dy`)
 * pixels: the scene follows the pointer. Keeps it within `MAX_PAN` of
 * `focus`.
 */
export function panTarget(
    target: Vector3Tuple,
    s: Spherical,
    dx: number,
    dy: number,
    focus: Vector3Tuple,
): Vector3Tuple {
    const k = s.radius * PAN_PER_PX;
    const rightX = Math.cos(s.theta);
    const rightZ = -Math.sin(s.theta);
    const fwdX = -Math.sin(s.theta);
    const fwdZ = -Math.cos(s.theta);
    let x = target[0] - rightX * dx * k + fwdX * dy * k;
    let z = target[2] - rightZ * dx * k + fwdZ * dy * k;
    const ox = x - focus[0];
    const oz = z - focus[2];
    const d = Math.hypot(ox, oz);
    if (d > MAX_PAN) {
        x = focus[0] + (ox / d) * MAX_PAN;
        z = focus[2] + (oz / d) * MAX_PAN;
    }
    return [x, target[1], z];
}

/**
 * Turns the look direction from `position` to `target` upward by `deg`,
 * keeping the target's distance. Used to lift press-box views.
 */
export function tiltTargetUp(
    position: Vector3Tuple,
    target: Vector3Tuple,
    deg: number,
): Vector3Tuple {
    const dir = new Vector3(
        target[0] - position[0],
        target[1] - position[1],
        target[2] - position[2],
    );
    const length = dir.length();
    const horizontal = Math.hypot(dir.x, dir.z);
    if (length === 0 || horizontal < 1e-6) return [...target];
    const pitch = Math.atan2(dir.y, horizontal) + (deg * Math.PI) / 180;
    const clamped = Math.min(Math.PI / 2 - 0.01, pitch);
    const h = Math.cos(clamped) * length;
    return [
        position[0] + (dir.x / horizontal) * h,
        position[1] + Math.sin(clamped) * length,
        position[2] + (dir.z / horizontal) * h,
    ];
}

const DEG = Math.PI / 180;

/**
 * Degrees to lift a press-box view so the front sideline (world z = 0, the
 * origin is center front) lands at `PRESS_BOX_FRONT_NDC_Y`. Never lowers the
 * kit's aim and never lifts more than `PRESS_BOX_MAX_LIFT_DEG`. Zero when the
 * eye isn't in front of the field.
 */
export function pressBoxLiftDeg(
    position: Vector3Tuple,
    target: Vector3Tuple,
    fovDeg: number,
): number {
    if (position[2] <= 0) return 0;
    const horizontal = (p: Vector3Tuple) =>
        Math.hypot(p[0] - position[0], p[2] - position[2]);
    const pitch = (p: Vector3Tuple) =>
        Math.atan2(p[1] - position[1], horizontal(p));
    const front: Vector3Tuple = [target[0], 0, 0];
    // The front point sits `offset` below the view axis at the wanted NDC y.
    const offset = Math.atan(
        PRESS_BOX_FRONT_NDC_Y * Math.tan((fovDeg * DEG) / 2),
    );
    const wanted = pitch(front) - offset;
    const lift = (wanted - pitch(target)) / DEG;
    return Math.min(PRESS_BOX_MAX_LIFT_DEG, Math.max(0, lift));
}

/** Where the rig points for a kit seat: the kit's target, lifted for press boxes. */
export function seatAim(seat: CameraSeat): {
    position: Vector3Tuple;
    target: Vector3Tuple;
} {
    const target: Vector3Tuple =
        seat.kind === "seat" && seat.id === "pressBox"
            ? tiltTargetUp(
                  seat.position,
                  seat.target,
                  pressBoxLiftDeg(
                      seat.position,
                      seat.target,
                      seat.fovDeg ?? SEAT_FOV_DEG,
                  ),
              )
            : [...seat.target];
    return { position: [...seat.position], target };
}

/** The camera a venue opens on (ui.md UI-1): press box, the gym's GE judge, else the first. */
export function defaultCameraId(cameras: CameraSeat[]): string | null {
    for (const id of ["pressBox", "geJudge"])
        if (cameras.some((c) => c.id === id)) return id;
    return cameras[0]?.id ?? null;
}

/** Horizontal distance from the eye to the focus, like the demo's "to the 50". */
export function horizontalDistance(a: Vector3Tuple, b: Vector3Tuple): number {
    return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** The camera index for a 1–9 key in bar order, or null. */
export function cameraIndexForKey(key: string): number | null {
    return /^[1-9]$/.test(key) ? Number(key) - 1 : null;
}
