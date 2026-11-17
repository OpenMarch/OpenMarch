/**
 * The crab step: how percussion travels (docs/3d/technique.md, "The crab
 * step"). Hips and shoulders stay square to the facing at every travel
 * angle, so a drum stays flat and square, and the legs carry the direction:
 * unlike the winds' legs, they never turn, so each angle has its own clips
 * and the planner picks the nearest. Straight forward or back is the plain
 * march.
 *
 * Pure: no three.js, React or database.
 */
import { FAMILIES, SECTIONS } from "../../../global/classes/Sections";
import {
    pickDirection,
    type CrabFamily,
    type Direction,
    type StraightFamily,
} from "../../render/step-blend.js";

/** The angles off straight forward with their own clips (degrees). 0 and 180 are the plain march. */
export const CRAB_ANGLES: readonly number[] = [
    0, 10, 20, 30, 45, 60, 75, 90, 105, 120, 135, 150, 160, 170, 180,
];

const PERCUSSION = new Set(
    Object.values(SECTIONS)
        .filter(
            (s) => s.family === FAMILIES.Battery || s.family === FAMILIES.Pit,
        )
        .map((s) => s.name.trim().toLowerCase()),
);

/** Whether a section is percussion, which travels in a crab step. */
export function isPercussionSection(section: string): boolean {
    return PERCUSSION.has(section.trim().toLowerCase());
}

function nearestAngle(deg: number): number {
    let best = CRAB_ANGLES[0];
    for (const a of CRAB_ANGLES)
        if (Math.abs(a - deg) < Math.abs(best - deg)) best = a;
    return best;
}

/**
 * The crab family for travel (dx, dz) by a performer facing `heading`. The
 * legs never turn (`legYaw` 0): that would turn the hips with them.
 */
export function crabDirection(
    dx: number,
    dz: number,
    heading: number,
): Direction {
    const { family, phi } = pickDirection(heading, dx, dz);
    if (family === "none") return { family, legYaw: 0, phi };
    const angle = nearestAngle((Math.abs(phi) * 180) / Math.PI);
    const straight: StraightFamily | null =
        angle === 0 ? "forward" : angle === 180 ? "backward" : null;
    if (straight) return { family: straight, legYaw: 0, phi };
    const side = phi > 0 ? "L" : "R";
    const name: CrabFamily = `crab${side}${String(angle).padStart(3, "0")}`;
    return { family: name, legYaw: 0, phi };
}
