import {
    clampEye,
    easeInOutCubic,
    lerpPose,
    lerpVec3,
    vec3Distance,
} from "./poseMath";
import { shotPoseAt } from "./shotPose";
import type {
    CameraPose,
    CinemaContext,
    CinemaShot,
    TransitionId,
} from "./types";

/**
 * The camera for a show time: which shot is on, and the blend into it.
 *
 * Everything here is a pure function of its arguments, so a time gives the
 * same frame whether the show plays, is scrubbed or is exported.
 */

/** How long each transition takes when the shot does not say. */
export const DEFAULT_TRANSITION_MS: Record<TransitionId, number> = {
    cut: 0,
    smooth: 1200,
    whip: 350,
    craneThrough: 2000,
};

/** How fast a whip swings its aim: the exponent of its ease. */
const WHIP_EXPONENT = 0.35;
/** A crane-through rises at least this much at its midpoint (m). */
const CRANE_MIN_RISE_M = 10;
/** A crane-through rises by this share of the distance it travels. */
const CRANE_RISE_PER_METER = 0.3;

export interface CameraFrame {
    pose: CameraPose;
    /** The shot that is on, or null when the track is empty. */
    shotId: string | null;
    /** True while the camera is still arriving from the previous shot. */
    inTransition: boolean;
}

/** What plays when there are no shots: the band from the press box, wide. */
const FALLBACK_SHOT: CinemaShot = {
    id: "",
    startMs: 0,
    rig: { kind: "builtin", id: "pressBox" },
    subject: { kind: "band" },
    tightness: "wide",
    move: "hold",
    transition: "cut",
};

const startOf = (shot: CinemaShot) =>
    Number.isFinite(shot.startMs) ? shot.startMs : 0;

/** The pose `t` of the way (0 to 1) through a transition from one pose to another. */
function blend(
    transition: TransitionId,
    from: CameraPose,
    to: CameraPose,
    t: number,
): CameraPose {
    const e = easeInOutCubic(t);
    if (transition === "whip") {
        // The aim and the zoom snap across early while the camera body eases.
        const fast = Math.pow(Math.min(1, Math.max(0, t)), WHIP_EXPONENT);
        return {
            position: lerpVec3(from.position, to.position, e),
            target: lerpVec3(from.target, to.target, fast),
            fovDeg: from.fovDeg + (to.fovDeg - from.fovDeg) * fast,
        };
    }
    const pose = lerpPose(from, to, e);
    if (transition !== "craneThrough") return pose;
    const rise = Math.max(
        CRANE_MIN_RISE_M,
        CRANE_RISE_PER_METER * vec3Distance(from.position, to.position),
    );
    const [x, y, z] = pose.position;
    return { ...pose, position: [x, y + rise * Math.sin(Math.PI * e), z] };
}

/**
 * The camera at show time ms.
 *
 * - Shots are ordered by `startMs`; of two shots on one start time, the later
 *   one in the array wins. The input is not changed.
 * - Before the first shot, the first shot's pose. After the last shot starts,
 *   it keeps going. A time that is negative or not a number counts as 0.
 * - No shots: a wide press box frame of the band, with `shotId` null.
 * - A shot's transition runs over `[startMs, startMs + transitionMs)` and
 *   blends from the previous shot's pose to its own, both at the same ms:
 *   smooth eases between them, whip swings the aim ahead of the camera,
 *   craneThrough eases with an upward arc, cut jumps. The first shot has
 *   nothing to arrive from, and a transition never outlasts its shot.
 */
export function cameraAt(
    ms: number,
    shots: readonly CinemaShot[],
    ctx: CinemaContext,
): CameraFrame {
    const at = Number.isFinite(ms) && ms > 0 ? ms : 0;
    if (shots.length === 0)
        return {
            pose: shotPoseAt(FALLBACK_SHOT, at, Infinity, ctx),
            shotId: null,
            inTransition: false,
        };

    // Array.prototype.sort is stable, so ties keep their array order.
    const sorted = [...shots].sort((a, b) => startOf(a) - startOf(b));
    let index = 0;
    for (let i = 1; i < sorted.length; i++)
        if (startOf(sorted[i]!) <= at) index = i;

    const shot = sorted[index]!;
    const previous = index > 0 ? sorted[index - 1] : undefined;
    const next = sorted[index + 1];
    const start = startOf(shot);
    const end = next ? startOf(next) : Infinity;
    const pose = shotPoseAt(shot, at, end, ctx);

    if (previous && shot.transition !== "cut") {
        const asked = shot.transitionMs;
        const length = Math.min(
            asked !== undefined && Number.isFinite(asked)
                ? asked
                : DEFAULT_TRANSITION_MS[shot.transition],
            end - start,
        );
        if (length > 0 && at < start + length) {
            const from = shotPoseAt(previous, at, start, ctx);
            return {
                pose: clampEye(
                    blend(shot.transition, from, pose, (at - start) / length),
                ),
                shotId: shot.id,
                inTransition: true,
            };
        }
    }
    return { pose, shotId: shot.id, inTransition: false };
}

/** A shot whose start and transition length are in counts. */
export type CinemaShotInCounts = Omit<
    CinemaShot,
    "startMs" | "transitionMs"
> & {
    startCount: number;
    transitionCounts?: number;
};

/**
 * Shots given in counts: converts `startCount` and `transitionCounts` with
 * `countToMs`. A transition is measured from its shot's start, so it keeps its
 * length in counts through a tempo change.
 */
export function shotsFromCounts(
    shots: readonly CinemaShotInCounts[],
    countToMs: (count: number) => number,
): CinemaShot[] {
    return shots.map(({ startCount, transitionCounts, ...shot }) => {
        const startMs = countToMs(startCount);
        return transitionCounts === undefined
            ? { ...shot, startMs }
            : {
                  ...shot,
                  startMs,
                  transitionMs:
                      countToMs(startCount + transitionCounts) - startMs,
              };
    });
}
