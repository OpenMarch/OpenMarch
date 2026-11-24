import { worldToPixels, type FieldProperties } from "@openmarch/core";
import type { View3dCameraPose } from "@/view3d/sync/protocol";

/** A point on the 2D field, in field pixels. */
export interface FieldPoint {
    x: number;
    y: number;
}

/** The 3D View's camera on the 2D field: where it stands and what it sees. */
export interface CameraWedge {
    /** The camera's spot on the ground. */
    apex: FieldPoint;
    /** The far corners of the ground it sees, left then right of its view. */
    left: FieldPoint;
    right: FieldPoint;
}

/** Shortest and longest wedge, in meters, and its length above the horizon. */
const MIN_REACH = 15;
const MAX_REACH = 160;
const LEVEL_REACH = 60;
/** The wedge runs a little past the ground at the middle of the view. */
const PAST_CENTER = 1.35;

/**
 * The wedge for a camera pose: from the camera's spot on the ground, as wide
 * as its horizontal field of view, as long as the distance to where the middle
 * of its view meets the ground (clamped). Null when it looks straight down or
 * up, where it has no direction on the ground.
 */
export function cameraWedge(
    pose: View3dCameraPose,
    fieldProperties: FieldProperties,
): CameraWedge | null {
    const [px, py, pz] = pose.position;
    const [dx, dy, dz] = pose.direction;
    const horizontal = Math.hypot(dx, dz);
    if (horizontal < 1e-3) return null;
    const reach =
        dy < -1e-3
            ? Math.min(
                  MAX_REACH,
                  Math.max(
                      MIN_REACH,
                      (Math.max(py, 0) / -dy) * horizontal * PAST_CENTER,
                  ),
              )
            : LEVEL_REACH;
    const yaw = Math.atan2(dz, dx);
    const halfWidth = Math.atan(
        Math.tan(((pose.fov * Math.PI) / 180) * 0.5) * pose.aspect,
    );
    const at = (angle: number) =>
        worldToPixels(fieldProperties, {
            x: px + Math.cos(angle) * reach,
            z: pz + Math.sin(angle) * reach,
        });
    return {
        apex: worldToPixels(fieldProperties, { x: px, z: pz }),
        left: at(yaw - halfWidth),
        right: at(yaw + halfWidth),
    };
}

/** Closest the aim comes to the camera on the ground, in meters. */
const MIN_AIM = 3;
/** Farthest ground the aim follows; past it (or above the horizon) it sits ahead at eye level. */
const AIM_REACH = 400;

type Triple = [number, number, number];

/**
 * The point the camera looks at, in world meters: where the middle of its view
 * meets the ground (when that's in reach), or a point ahead at eye level
 * when it looks at or above the horizon. Straight down, the ground under it.
 */
export function cameraAim(pose: View3dCameraPose): Triple {
    const [px, py, pz] = pose.position;
    const [dx, dy, dz] = pose.direction;
    const horizontal = Math.hypot(dx, dz);
    if (horizontal <= 1e-3) return [px, 0, pz];
    if (dy < -1e-3) {
        const along = (Math.max(py, 0) / -dy) * horizontal;
        if (along <= AIM_REACH) {
            const t = Math.max(MIN_AIM, along) / horizontal;
            return [px + dx * t, Math.max(0, py + dy * t), pz + dz * t];
        }
    }
    const scale = LEVEL_REACH / horizontal;
    return [px + dx * scale, py, pz + dz * scale];
}

/** The pose looking from `position` at `target`, with the same lens. */
export function poseLooking(
    pose: View3dCameraPose,
    position: Triple,
    target: Triple,
): View3dCameraPose {
    const d = target.map((n, i) => n - position[i]) as Triple;
    const length = Math.hypot(...d) || 1;
    return {
        ...pose,
        position,
        direction: d.map((n) => n / length) as Triple,
    };
}

/**
 * The camera carried across the ground to `x, z` (meters) at its height,
 * looking exactly the same way: the target is along its own direction, as far
 * as its aim was.
 */
export function cameraMovedTo(
    pose: View3dCameraPose,
    x: number,
    z: number,
): { position: Triple; target: Triple } {
    const position: Triple = [x, pose.position[1], z];
    const aim = cameraAim(pose);
    const distance = Math.max(
        MIN_AIM,
        Math.hypot(...aim.map((n, i) => n - pose.position[i])),
    );
    return {
        position,
        target: position.map(
            (n, i) => n + pose.direction[i] * distance,
        ) as Triple,
    };
}

/** The camera, where it stands, turned to look at the ground at `x, z` (meters). */
export function cameraAimedAt(
    pose: View3dCameraPose,
    x: number,
    z: number,
): { position: Triple; target: Triple } {
    const [px, , pz] = pose.position;
    let ax = x - px;
    let az = z - pz;
    const distance = Math.hypot(ax, az);
    if (distance < MIN_AIM) {
        // Too close to tell a direction: keep the old one, at the least distance
        const [dx, , dz] = pose.direction;
        const h = Math.hypot(dx, dz) || 1;
        const k = distance > 1e-6 ? MIN_AIM / distance : 0;
        ax = k ? ax * k : (dx / h) * MIN_AIM;
        az = k ? az * k : (dz / h) * MIN_AIM;
    }
    return { position: [...pose.position], target: [px + ax, 0, pz + az] };
}
