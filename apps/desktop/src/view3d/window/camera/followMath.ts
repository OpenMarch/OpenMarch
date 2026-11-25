/**
 * Pure math for following a performer in the 3D View (`followStore.ts`):
 * which performer a click means, where the third-person camera sits behind
 * them, and where their own eyes are for the point of view. No React and no
 * scene access.
 *
 * Headings are radians about +Y with 0 facing +Z (the audience), as
 * `core/marchers/facing.ts` has them.
 */
import type { Vector3Tuple } from "three";
import type { FollowFraming } from "./followStore";

/** Where a performer stands and faces right now, as the scene draws them. */
export interface PerformerPose {
    x: number;
    /** The ground under their feet: 0, or a platform's deck. */
    y: number;
    z: number;
    /** Radians about +Y, 0 = facing +Z. */
    heading: number;
    /** Top of the head above `y` (m). */
    height: number;
    /**
     * Where their eyes are as drawn, in world meters, when `hasEye`: the
     * animated head, which leans and bobs away from the axis above `x`, `z`.
     * Without it the eyes are guessed from `height`.
     */
    eye: [number, number, number];
    hasEye: boolean;
}

/** A click picks the performer nearest the ray, up to this angle off it (radians). */
export const PERFORMER_PICK_ANGLE = (2 * Math.PI) / 180;
/** ... or this close to the ray (m), whichever is wider, for performers right by the camera. */
export const PERFORMER_PICK_MIN = 0.5;
/** How tall a performer counts as for picking (m). */
const PICK_HEIGHT = 2.0;

/**
 * The index of the placed performer a click along the ray (`dir` a unit
 * vector) means, or null. Each performer is a vertical segment from their
 * feet (`lift`) to `PICK_HEIGHT` above; the one that comes nearest the ray,
 * measured as an angle from the eye, wins, so a click a little off a distant
 * marcher still finds them.
 */
export function pickPerformerIndex(
    origin: Vector3Tuple,
    dir: Vector3Tuple,
    xz: ArrayLike<number>,
    placed: ArrayLike<number>,
    lift: ArrayLike<number> | null,
    count: number,
): number | null {
    const [ox, oy, oz] = origin;
    const [dx, dy, dz] = dir;
    let best: number | null = null;
    let bestAngle = Infinity;
    for (let i = 0; i < count; i++) {
        if (!placed[i]) continue;
        const px = xz[i * 2];
        const pz = xz[i * 2 + 1];
        const base = lift ? lift[i] : 0;
        // the nearest point on the ray to the performer's vertical axis
        const cx = px - ox;
        const cz = pz - oz;
        const a = dx * dx + dz * dz;
        let t = a > 1e-12 ? (cx * dx + cz * dz) / a : 0;
        if (t <= 0) continue;
        // the axis point at the ray's height there, kept on the body
        const y = Math.min(base + PICK_HEIGHT, Math.max(base, oy + dy * t));
        // the ray point nearest that axis point
        t = (cx * dx + (y - oy) * dy + cz * dz) / (dx * dx + dy * dy + dz * dz);
        if (t <= 0) continue;
        const miss = Math.hypot(
            ox + dx * t - px,
            oy + dy * t - y,
            oz + dz * t - pz,
        );
        const reach = Math.max(
            PERFORMER_PICK_MIN,
            t * Math.tan(PERFORMER_PICK_ANGLE),
        );
        if (miss > reach) continue;
        const angle = Math.atan2(miss, t);
        if (angle < bestAngle) {
            bestAngle = angle;
            best = i;
        }
    }
    return best;
}

/** The third-person camera looks at this share of the performer's height. */
export const THIRD_PERSON_AIM = 0.6;
/** ... from this far behind them (m) ... */
export const THIRD_PERSON_DISTANCE = 9;
/** ... and this far above the point it looks at (m). */
export const THIRD_PERSON_RISE = 4;

/** Where the camera looks while following: the performer's chest. */
export function followTarget(pose: PerformerPose): Vector3Tuple {
    return [pose.x, pose.y + pose.height * THIRD_PERSON_AIM, pose.z];
}

const DEG = Math.PI / 180;

/** The third-person camera stays at least this high above the performer's feet (m). */
export const FOLLOW_MIN_HEIGHT = 0.3;

/** How high the third-person camera looks down from by default (degrees). */
export const THIRD_PERSON_TILT_DEG =
    Math.asin(THIRD_PERSON_RISE / THIRD_PERSON_DISTANCE) / DEG;
/** How far the point of view looks down by default (degrees). */
export const POV_DEFAULT_TILT_DEG = -8;

/**
 * The third-person view, looking at the performer's chest: by default
 * behind them and above. `framing` moves it round them (`angleDeg`: 0
 * behind, 90 their right, 180 in front), up or down (`tiltDeg`) and in or
 * out (`distanceM`).
 */
export function thirdPersonPose(
    pose: PerformerPose,
    framing: FollowFraming = {},
): {
    position: Vector3Tuple;
    target: Vector3Tuple;
} {
    const target = followTarget(pose);
    const distance = framing.distanceM ?? THIRD_PERSON_DISTANCE;
    const tilt = (framing.tiltDeg ?? THIRD_PERSON_TILT_DEG) * DEG;
    // Facing +Z, a performer's right is −X: the bearing turns the other way.
    const bearing = pose.heading + Math.PI + (framing.angleDeg ?? 0) * DEG;
    const flat = Math.cos(tilt) * distance;
    return {
        position: [
            target[0] + Math.sin(bearing) * flat,
            // Looking up at them from low down stops at the ground.
            Math.max(
                target[1] + Math.sin(tilt) * distance,
                pose.y + FOLLOW_MIN_HEIGHT,
            ),
            target[2] + Math.cos(bearing) * flat,
        ],
        target,
    };
}

/** The framing that puts a third-person camera at `position` (the inverse of `thirdPersonPose`). */
export function thirdPersonFraming(
    pose: PerformerPose,
    position: Vector3Tuple,
): Required<FollowFraming> {
    const target = followTarget(pose);
    const dx = position[0] - target[0];
    const dy = position[1] - target[1];
    const dz = position[2] - target[2];
    const distance = Math.hypot(dx, dy, dz);
    const bearing = Math.atan2(dx, dz);
    return {
        angleDeg: angleDelta(pose.heading + Math.PI, bearing) / DEG,
        tiltDeg: distance > 1e-9 ? Math.asin(dy / distance) / DEG : 0,
        distanceM: distance,
    };
}

/** The point-of-view look for a framing: `angleDeg` to their right, `tiltDeg` up. */
export function povLookOf(framing: FollowFraming = {}): PovLook {
    return {
        yaw: -(framing.angleDeg ?? 0) * DEG,
        pitch: clampPitch((framing.tiltDeg ?? POV_DEFAULT_TILT_DEG) * DEG),
    };
}

/** The framing of a point-of-view look (the inverse of `povLookOf`). */
export function povFraming(look: PovLook): FollowFraming {
    return {
        angleDeg: angleDelta(0, -look.yaw) / DEG,
        tiltDeg: look.pitch / DEG,
    };
}

/** Eyes sit this share of the way up to the top of the head. */
export const EYE_SHARE = 0.93;
/**
 * With the performer's body left out, the point of view sits this far in
 * front of their axis (m), clear of where the face and hat brim would be.
 */
export const EYE_FORWARD = 0.15;
/**
 * With the body drawn but no animated eye known, it sits this far forward
 * (m): about at the eyes, inside the head, whose faces point outward and so
 * aren't drawn from inside. The arms and instrument are in front.
 */
export const EYE_IN_HEAD = 0.06;
/** With the animated eye known and the body left out, the view sits this far in front of it (m). */
export const EYE_CLEAR = 0.06;
/** Vertical field of view for the point of view (degrees): about what a person takes in. */
export const POV_FOV_DEG = 60;
/** How far the point of view can zoom in and out (degrees of field of view). */
export const POV_FOV_MIN = 25;
export const POV_FOV_MAX = 90;
/** Looking up or down stops this short of straight up or down (radians). */
export const POV_MAX_PITCH = (80 * Math.PI) / 180;
/** The point of view looks a little down, at the field ahead (radians). */
export const POV_DEFAULT_PITCH = (-8 * Math.PI) / 180;
/**
 * The look-at point sits this far ahead of the eye (m). Short, so the rig's
 * near plane (a share of the distance to the look-at point) comes in close
 * enough to draw the performer's own instrument.
 */
export const LOOK_DISTANCE = 0.2;

/** The point-of-view look direction's offset from the performer's heading. */
export interface PovLook {
    /** Radians, added to the heading (positive turns toward +X from +Z). */
    yaw: number;
    /** Radians, up positive. */
    pitch: number;
}

/** The pitch kept between straight down and straight up. */
export function clampPitch(pitch: number): number {
    return Math.max(-POV_MAX_PITCH, Math.min(POV_MAX_PITCH, pitch));
}

/**
 * Looking out of the performer's eyes, `look` off where they face. With
 * `inHead` (their body drawn) the view sits in the eyes, inside the head;
 * without, a little in front, clear of the face and hat brim. At the
 * animated eye when the pose has one, else guessed from the axis and height.
 */
export function povPose(
    pose: PerformerPose,
    look: PovLook,
    inHead = false,
): { position: Vector3Tuple; target: Vector3Tuple } {
    const facing = pose.heading + look.yaw;
    const fx = Math.sin(pose.heading);
    const fz = Math.cos(pose.heading);
    const forward = pose.hasEye
        ? inHead
            ? 0
            : EYE_CLEAR
        : inHead
          ? EYE_IN_HEAD
          : EYE_FORWARD;
    const position: Vector3Tuple = pose.hasEye
        ? [pose.eye[0] + fx * forward, pose.eye[1], pose.eye[2] + fz * forward]
        : [
              pose.x + fx * forward,
              pose.y + pose.height * EYE_SHARE,
              pose.z + fz * forward,
          ];
    const pitch = clampPitch(look.pitch);
    const flat = Math.cos(pitch) * LOOK_DISTANCE;
    return {
        position,
        target: [
            position[0] + Math.sin(facing) * flat,
            position[1] + Math.sin(pitch) * LOOK_DISTANCE,
            position[2] + Math.cos(facing) * flat,
        ],
    };
}

/** The shortest signed turn from angle `from` to `to` (radians, in [-π, π]). */
export function angleDelta(from: number, to: number): number {
    const d = (to - from) % (2 * Math.PI);
    if (d > Math.PI) return d - 2 * Math.PI;
    if (d < -Math.PI) return d + 2 * Math.PI;
    return d;
}

/**
 * `current` turned toward `target` the short way round, after `dtMs` of
 * exponential easing with the given half-life: the point of view turns
 * with the performer without snapping when the drill turns them at once.
 */
export function easeAngle(
    current: number,
    target: number,
    dtMs: number,
    halfLifeMs: number,
): number {
    if (!Number.isFinite(current)) return target;
    const left = angleDelta(current, target) * Math.pow(0.5, dtMs / halfLifeMs);
    return target - left;
}
