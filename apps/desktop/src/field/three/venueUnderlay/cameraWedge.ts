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
