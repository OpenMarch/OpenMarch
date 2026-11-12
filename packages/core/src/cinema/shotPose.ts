import { MIN_FRAMED_RADIUS, TIGHTNESS_SCALE, smoothedBounds } from "./framing";
import { applyMove } from "./moves";
import {
    DEFAULT_FOV_DEG,
    clampEye,
    fitDistance,
    fitFov,
    vec3Distance,
} from "./poseMath";
import { BUILTIN_RIGS, rigEye } from "./rigs";
import type { CameraPose, CinemaContext, CinemaShot, Vec3 } from "./types";

/** A shot's camera pose at a show time: its rig aimed at its subject, plus its move. */

/**
 * A close-up on marchers aims this far above the ground (m): the upper chest,
 * so the frame runs from the knees to the top of the headgear.
 */
export const CLOSE_UP_TARGET_HEIGHT = 1.3;
/**
 * How far toward the audience the overhead camera sits from straight above
 * the subject (m), so "up" stays defined and the back sideline is at the top
 * of the frame.
 */
export const OVERHEAD_OFFSET_M = 0.5;
/** The length a move runs over when its shot has no end. */
export const OPEN_SHOT_MOVE_MS = 16_000;

const DEG = Math.PI / 180;

/**
 * The shot's base pose at ms (no move, no transition).
 *
 * - Fixed and end zone rigs keep their eye and aim at the smoothed subject,
 *   zooming to fit it.
 * - The overhead rig sits above the subject at its height, or higher when the
 *   subject needs it, looking down.
 * - Free rigs place the eye at the fitting distance along their azimuth and
 *   elevation from the subject.
 * - Pose rigs return their pose.
 *
 * The result is never below the minimum eye height.
 */
export function basePose(
    shot: CinemaShot,
    ms: number,
    ctx: CinemaContext,
): CameraPose {
    if (shot.rig.kind === "pose") return clampEye(shot.rig.pose);

    const rig = BUILTIN_RIGS[shot.rig.id];
    const bounds = smoothedBounds(shot.subject, ms, ctx);
    const radius = Math.max(
        MIN_FRAMED_RADIUS,
        bounds.radius * TIGHTNESS_SCALE[shot.tightness],
    );
    // A close-up is about people, not the ground they stand on. Regions and
    // spots are places on the field, so they stay on the ground.
    const chest =
        shot.tightness === "closeUp" &&
        shot.subject.kind !== "region" &&
        shot.subject.kind !== "spot";
    const target: Vec3 = [
        bounds.cx,
        chest ? CLOSE_UP_TARGET_HEIGHT : 0,
        bounds.cz,
    ];

    if (rig.kind === "overhead") {
        const override = shot.rigSettings?.heightM;
        const height = Math.max(
            override !== undefined && Number.isFinite(override)
                ? override
                : rig.heightM,
            fitDistance(radius, DEFAULT_FOV_DEG, ctx.aspect),
        );
        return clampEye({
            position: [bounds.cx, height, bounds.cz + OVERHEAD_OFFSET_M],
            target,
            fovDeg: fitFov(radius, height, ctx.aspect),
        });
    }

    if (rig.kind === "free") {
        const range = fitDistance(radius, DEFAULT_FOV_DEG, ctx.aspect);
        const azimuth = rig.azimuthDeg * DEG;
        const elevation = rig.elevationDeg * DEG;
        const flat = range * Math.cos(elevation);
        return clampEye({
            position: [
                target[0] + flat * Math.sin(azimuth),
                target[1] + range * Math.sin(elevation),
                target[2] + flat * Math.cos(azimuth),
            ],
            target,
            fovDeg: DEFAULT_FOV_DEG,
        });
    }

    // Fixed and end zone rigs always have an eye.
    const eye = rigEye(rig, shot.rigSettings, ctx) ?? target;
    return clampEye({
        position: eye,
        target,
        fovDeg: fitFov(radius, vec3Distance(eye, target), ctx.aspect),
    });
}

/**
 * The shot's pose at ms given its end time (the next shot's start, or
 * Infinity: then moves run over {@link OPEN_SHOT_MOVE_MS}). Before the shot's
 * start the move sits at its beginning, and after its end at its finish, while
 * the camera keeps following the subject.
 */
export function shotPoseAt(
    shot: CinemaShot,
    ms: number,
    endMs: number,
    ctx: CinemaContext,
): CameraPose {
    const span = Number.isFinite(endMs)
        ? endMs - shot.startMs
        : OPEN_SHOT_MOVE_MS;
    const msInShot = Math.max(0, ms - shot.startMs);
    const p = span > 0 ? msInShot / span : 1;
    return applyMove(basePose(shot, ms, ctx), shot, p, msInShot);
}
