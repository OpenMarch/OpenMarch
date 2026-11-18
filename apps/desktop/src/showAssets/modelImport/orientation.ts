/**
 * How the model import stands a model up (fork #1001 follow-up): any of the 24 ways a box can sit
 * on a side, in quarter turns, before the turn that faces its front to the audience
 * (`ModelImportChoices.turn`).
 *
 * The review's Rotate X and Rotate Z buttons tip the model as the picture shows it, from the
 * audience: X brings its top toward you, Z lays its top to your right (Rotate Y is the turn).
 * Whatever the turn, a button moves the model on screen the same way.
 *
 * Pure: plain numbers, so a tilt crosses `postMessage` and is stored as JSON.
 */
import type { Turn } from "./types";

/**
 * A rotation in quarter turns, as a 3×3 matrix of 0, 1 and -1 read row by row: the column for
 * an axis is where that axis of the file ends up (+X right, +Y up, +Z toward the audience).
 */
export type Tilt = readonly number[];

export const UPRIGHT: Tilt = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** A Z-up file stood up: a quarter turn about X, so the file's +Z becomes +Y */
export const Z_UP_TILT: Tilt = [1, 0, 0, 0, 0, 1, 0, -1, 0];

/** The axis a tip turns the model about, as the picture shows it: left-right or front-back */
export type TipAxis = "x" | "z";

const multiply = (a: Tilt, b: Tilt): Tilt =>
    [0, 1, 2].flatMap((row) =>
        [0, 1, 2].map(
            (col) =>
                a[row * 3] * b[col] +
                a[row * 3 + 1] * b[3 + col] +
                a[row * 3 + 2] * b[6 + col],
        ),
    );

/** A transposed rotation is its inverse */
const inverse = (a: Tilt): Tilt =>
    [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => a[col * 3 + row]));

/** The turn about +Y, counter-clockwise from above, as `normalize` applies it */
function turnTilt(turn: Turn): Tilt {
    const c = Math.round(Math.cos((turn * Math.PI) / 180));
    const s = Math.round(Math.sin((turn * Math.PI) / 180));
    return [c, 0, s, 0, 1, 0, -s, 0, c];
}

/** X: +Y toward +Z (a quarter turn about X). Z: +Y toward +X (about -Z). */
const TIPS: Record<TipAxis, Tilt> = {
    x: [1, 0, 0, 0, 0, -1, 0, 1, 0],
    z: [0, 1, 0, -1, 0, 0, 0, 0, 1],
};

/**
 * The tilt after one press of Rotate X or Rotate Z, keeping the turn: the model, turned, tips
 * toward the audience or to the right as seen from them.
 */
export function tipped(tilt: Tilt, turn: Turn, axis: TipAxis): Tilt {
    const yaw = turnTilt(turn);
    // turn · tilt' = tip · turn · tilt
    return clean(
        multiply(multiply(multiply(inverse(yaw), TIPS[axis]), yaw), tilt),
    );
}

/** No -0 in what's stored, so the same tilt is always the same JSON */
const clean = (tilt: Tilt): Tilt => tilt.map((v) => (v === 0 ? 0 : v));

export const sameTilt = (a: Tilt, b: Tilt): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i]);

/** Whether a value is a tilt: nine 0, 1 or -1, one non-zero per row and column, not mirrored */
export function isTilt(value: unknown): value is Tilt {
    if (!Array.isArray(value) || value.length !== 9) return false;
    if (!value.every((v) => v === 0 || v === 1 || v === -1)) return false;
    const t = value as number[];
    for (let i = 0; i < 3; i++) {
        let row = 0;
        let col = 0;
        for (let j = 0; j < 3; j++) {
            row += Math.abs(t[i * 3 + j]);
            col += Math.abs(t[j * 3 + i]);
        }
        if (row !== 1 || col !== 1) return false;
    }
    const det =
        t[0] * (t[4] * t[8] - t[5] * t[7]) -
        t[1] * (t[3] * t[8] - t[5] * t[6]) +
        t[2] * (t[3] * t[7] - t[4] * t[6]);
    return det === 1;
}

/** The tilt as a glTF rotation quaternion `[x, y, z, w]` */
export function tiltQuaternion(tilt: Tilt): [number, number, number, number] {
    const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = tilt;
    const trace = m00 + m11 + m22;
    let q: [number, number, number, number];
    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
    } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
    } else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
    } else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
    }
    return q.map((v) => (v === 0 ? 0 : v)) as [number, number, number, number];
}
