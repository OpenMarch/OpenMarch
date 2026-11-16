/**
 * The beret sousaphone players wear in place of the shako and plume
 * (owner, 2026-11-10): a soft, full crown on a narrow band, pulled down
 * toward the performer's right. Built in the body's frame at bind (the
 * head's top at 1.797 m, its sides ±0.094, class 1.00) to ride the head
 * bone, so it turns with the head. Pure: no three.js.
 */
import type { Detail } from "./model";
import { PART_BLACK, smoothLathe, transformPiece, type Piece } from "./mesh";

/** Where the band sits: just above the brow, centered over the skull. */
const BAND = { y: 1.722, z: -0.004 };
/** How far it is pulled down toward the right, degrees. */
const DRAPE_DEG = 12;

export function beret(detail: Detail): Piece[] {
    const segments = detail === "high" ? 28 : 12;
    // (radius, height above the band): the band, the full crown, the top
    const profile: [number, number][] = [
        [0.098, -0.004],
        [0.1, 0.012],
        [0.122, 0.03],
        [0.136, 0.045],
        [0.135, 0.058],
        [0.118, 0.07],
        [0.08, 0.079],
        [0.035, 0.083],
        [0.0001, 0.084],
    ];
    const cap = smoothLathe(profile, segments, PART_BLACK);
    // the stalk on top
    const stalk = smoothLathe(
        [
            [0.004, 0.08],
            [0.004, 0.092],
            [0.0001, 0.093],
        ],
        6,
        PART_BLACK,
    );
    // tilt about the forward axis so the right side (−X) drops, then place
    const a = (DRAPE_DEG * Math.PI) / 180;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const m = [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, -0.006, BAND.y, BAND.z, 1];
    return [cap, stalk].map((p) => ({
        ...transformPiece(p, m),
        bone: "head" as const,
    }));
}
