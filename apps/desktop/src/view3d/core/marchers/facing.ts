/**
 * Which way a 3D View marcher faces, and which way its legs travel.
 *
 * The upper body always faces the front sideline (the audience). That is
 * `rotation_degrees` 0 and the only facing the app has today: nothing in the
 * editor sets or draws `marcher_pages.rotation_degrees`, so it is ignored here
 * until a facing tool defines it. The legs turn toward the travel direction
 * (om-pose's `pickDirection`), so a marcher crossing the field slides and one
 * moving upfield marches backward.
 *
 * Slides face the 50. Within SLIDE_BAND of sideways, `pickDirection`'s
 * ahead-or-behind split gives way to the 50 yard line: a slide toward it is a
 * forward gait, a slide away from it a backward gait, so the legs point at the
 * 50 either way (the planner says which, per run of slide counts). Past the
 * band the feet flip as usual: a 100 degree slide is a backward march, legs
 * turned 80 degrees.
 *
 * Axes are ADR 0002 D-2: +X toward side 2 (audience right), +Z toward the
 * audience. The renderer's heading is radians about +Y with 0 facing +Z
 * (`writeMatrix`), so facing front is heading 0, and the performer's left is +X.
 */
import {
    pickDirection,
    type Direction,
} from "../../vendor/om-pose/step-blend.js";

/** Slides this close to sideways face the 50 (radians): about 10 degrees. */
export const SLIDE_BAND = (10 * Math.PI) / 180;

/**
 * Which way a slide goes relative to the 50 yard line, or null when the 50
 * gives no answer (on it, along it, or ending as far from it as it started).
 */
export type SlideSense = "toward" | "away" | null;

/** True when the travel is within SLIDE_BAND of sideways. */
export function isSlide(dir: Direction): boolean {
    return (
        dir.family !== "none" &&
        Math.abs(Math.abs(dir.phi) - Math.PI / 2) <= SLIDE_BAND
    );
}

/** Heading of a marcher facing the front sideline: radians about +Y, 0 = +Z. */
export const FRONT_HEADING = 0;

/** The heading every marcher's upper body faces. */
export function marcherHeading(): number {
    return FRONT_HEADING;
}

/**
 * The move family and leg turn for travel (dx, dz) in world meters, for a
 * marcher facing `heading`. Family "none" when it doesn't travel. `sense`
 * applies the 50 rule to a slide; null leaves `pickDirection`'s split.
 */
export function travelDirection(
    dx: number,
    dz: number,
    heading: number = FRONT_HEADING,
    sense: SlideSense = null,
): Direction {
    const dir = pickDirection(heading, dx, dz);
    if (!sense || !isSlide(dir)) return dir;
    const { phi } = dir;
    if (sense === "toward") {
        if (dir.family !== "backward") return dir;
        return { family: "forward", legYaw: phi, phi };
    }
    if (dir.family === "backward") return dir;
    return { family: "backward", legYaw: phi - Math.sign(phi) * Math.PI, phi };
}
