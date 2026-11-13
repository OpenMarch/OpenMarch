import { MIN_EYE_HEIGHT } from "./rigs";
import type { CameraPose, Vec3 } from "./types";

/** Easing, interpolation and frame-fitting math for camera poses. */

export const FOV_MIN_DEG = 8;
export const FOV_MAX_DEG = 65;
/** The vertical field of view of rigs that are placed from the subject. */
export const DEFAULT_FOV_DEG = 40;

const DEG = Math.PI / 180;

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

/** Width / height, or a square frame when the aspect is not usable. */
const safeAspect = (aspect: number) =>
    Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

/** Slow in, slow out. Clamps t to [0, 1]; NaN counts as 0. */
export function easeInOutCubic(t: number): number {
    if (!(t > 0)) return 0;
    if (t >= 1) return 1;
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}

export function vec3Distance(a: Vec3, b: Vec3): number {
    return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/** Linear on position, target and field of view. */
export function lerpPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
    return {
        position: lerpVec3(a.position, b.position, t),
        target: lerpVec3(a.target, b.target, t),
        fovDeg: a.fovDeg + (b.fovDeg - a.fovDeg) * t,
    };
}

/**
 * Distance from the subject so a circle of radius r fills the frame at fovDeg
 * (vertical) and aspect, using the smaller of the vertical and horizontal
 * half-angles. The circle is fitted as a sphere, so it stays in frame from
 * any elevation.
 */
export function fitDistance(
    radius: number,
    fovDeg: number,
    aspect: number,
): number {
    const r = Number.isFinite(radius) ? Math.max(0, radius) : 0;
    const fov = Number.isFinite(fovDeg)
        ? clamp(fovDeg, 1, 179)
        : DEFAULT_FOV_DEG;
    const vertical = (fov / 2) * DEG;
    const horizontal = Math.atan(Math.tan(vertical) * safeAspect(aspect));
    return r / Math.sin(Math.min(vertical, horizontal));
}

/**
 * Vertical FOV that fits radius r at distance d with the aspect, clamped to
 * [FOV_MIN_DEG, FOV_MAX_DEG]. The inverse of {@link fitDistance}.
 */
export function fitFov(
    radius: number,
    distance: number,
    aspect: number,
): number {
    const r = Number.isFinite(radius) ? Math.max(0, radius) : 0;
    if (!(distance > r)) return r > 0 ? FOV_MAX_DEG : FOV_MIN_DEG;
    // The half-angle of the frame's smaller side.
    const half = Math.asin(r / distance);
    const a = safeAspect(aspect);
    const vertical = a >= 1 ? half : Math.atan(Math.tan(half) / a);
    return clamp((2 * vertical) / DEG, FOV_MIN_DEG, FOV_MAX_DEG);
}

/** Keeps the camera at or above {@link MIN_EYE_HEIGHT}. */
export function clampEye(pose: CameraPose): CameraPose {
    if (pose.position[1] >= MIN_EYE_HEIGHT) return pose;
    return {
        ...pose,
        position: [pose.position[0], MIN_EYE_HEIGHT, pose.position[2]],
    };
}
