import { clampEye, easeInOutCubic } from "./poseMath";
import type { CameraPose, CinemaShot, MoveId, Vec3 } from "./types";

/**
 * What the camera does during a shot. Each move has one or two numbers, never
 * a curve: the move runs from the shot's base pose to its end over the shot's
 * length with an ease.
 */

/** Each move's settings and their defaults. */
export const MOVE_DEFAULTS: Record<MoveId, Record<string, number>> = {
    hold: {},
    /** `amount`: fraction of the eye-to-target distance moved toward the target. */
    pushIn: { amount: 0.35 },
    /** `amount`: fraction of the eye-to-target distance moved away. */
    pullOut: { amount: 0.35 },
    boomUp: { meters: 8 },
    boomDown: { meters: 8 },
    /** Along x. `direction` +1 goes toward side 2, -1 toward side 1. */
    track: { meters: 20, direction: 1 },
    /** Around the target's vertical axis. `direction` +1 goes toward side 2 from the audience side. */
    orbit: { degrees: 30, direction: 1 },
    /** Raises the eye along the arc around the target to this elevation, keeping its distance. */
    craneOver: { endElevationDeg: 80 },
    drift: { intensity: 1 },
};

/** The furthest a push in goes, as a fraction of the distance to the target. */
const MAX_PUSH_IN = 0.95;
/** The reach of a drift at intensity 1, in meters on x and on y. */
const DRIFT_METERS = 0.4;
const DRIFT_HZ_A = 0.13;
const DRIFT_HZ_B = 0.21;

const DEG = Math.PI / 180;

/** The shot's value for a move setting, or the default when it is missing or not a number. */
function setting(shot: CinemaShot, name: string): number {
    const value = shot.moveSettings?.[name];
    if (value !== undefined && Number.isFinite(value)) return value;
    return MOVE_DEFAULTS[shot.move][name] ?? 0;
}

const sign = (direction: number) => (direction < 0 ? -1 : 1);

/**
 * The eye turned around the target by `turn` radians about the vertical axis
 * and raised by `lift` radians of elevation. A turn keeps the eye's height and
 * a lift keeps its distance to the target.
 */
function aroundTarget(pose: CameraPose, turn: number, lift: number): Vec3 {
    const [x, y, z] = pose.position;
    const [tx, ty, tz] = pose.target;
    const reach = Math.hypot(x - tx, z - tz);
    const azimuth = Math.atan2(x - tx, z - tz) + turn;
    if (lift === 0)
        return [
            tx + reach * Math.sin(azimuth),
            y,
            tz + reach * Math.cos(azimuth),
        ];
    const range = Math.hypot(reach, y - ty);
    const elevation = Math.atan2(y - ty, reach) + lift;
    const flat = range * Math.cos(elevation);
    return [
        tx + flat * Math.sin(azimuth),
        ty + range * Math.sin(elevation),
        tz + flat * Math.cos(azimuth),
    ];
}

/**
 * Applies the shot's move at progress p in [0, 1], eased with
 * {@link easeInOutCubic}. Drift ignores p and runs on `msInShot`, so it is
 * continuous for as long as the shot lasts. The target never moves.
 */
export function applyMove(
    pose: CameraPose,
    shot: CinemaShot,
    p: number,
    msInShot: number,
): CameraPose {
    const [x, y, z] = pose.position;
    const [tx, ty, tz] = pose.target;
    const e = easeInOutCubic(p);
    let position: Vec3;
    switch (shot.move) {
        case "pushIn":
        case "pullOut": {
            const amount = setting(shot, "amount");
            const k =
                shot.move === "pushIn"
                    ? Math.min(MAX_PUSH_IN, amount) * e
                    : -amount * e;
            position = [x + (tx - x) * k, y + (ty - y) * k, z + (tz - z) * k];
            break;
        }
        case "boomUp":
            position = [x, y + setting(shot, "meters") * e, z];
            break;
        case "boomDown":
            position = [x, y - setting(shot, "meters") * e, z];
            break;
        case "track":
            position = [
                x +
                    sign(setting(shot, "direction")) *
                        setting(shot, "meters") *
                        e,
                y,
                z,
            ];
            break;
        case "orbit":
            position = aroundTarget(
                pose,
                sign(setting(shot, "direction")) *
                    setting(shot, "degrees") *
                    DEG *
                    e,
                0,
            );
            break;
        case "craneOver": {
            const from = Math.atan2(y - ty, Math.hypot(x - tx, z - tz));
            position = aroundTarget(
                pose,
                0,
                (setting(shot, "endElevationDeg") * DEG - from) * e,
            );
            break;
        }
        case "drift": {
            const seconds = Number.isFinite(msInShot) ? msInShot / 1000 : 0;
            const a = Math.sin(2 * Math.PI * DRIFT_HZ_A * seconds);
            const b = Math.sin(2 * Math.PI * DRIFT_HZ_B * seconds);
            const reach = DRIFT_METERS * setting(shot, "intensity");
            position = [
                x + (reach * (a + b)) / 2,
                y + (reach * (b - a)) / 2,
                z,
            ];
            break;
        }
        default:
            return clampEye(pose);
    }
    return clampEye({ position, target: pose.target, fovDeg: pose.fovDeg });
}
