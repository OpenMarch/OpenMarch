import {
    FieldProperties,
    fieldFootprint,
    type Checkpoint,
    type FieldFootprint,
} from "@openmarch/core";
import { fieldFamily } from "../venueSettings";
import type { FieldSurfaceStyle } from "./plan";

/**
 * A football field in the templates' own units, 8 steps to 5 yards: yard
 * lines every 8 steps, goal lines 80 steps from midfield and end lines 96.
 * Working in steps (not meters) keeps the added lines on the show's grid
 * when the step size is changed, since that doesn't move the checkpoints.
 */
const FIVE_YARD_STEPS = 8;
const GOAL_STEPS = 80;
const END_STEPS = 96;
/** Checkpoints this close (in steps) to a line count as that line. */
const TOLERANCE = 0.5;

/**
 * The field a stadium paints: on a football field, the drill grid plus any
 * yard, goal and end lines it is missing, so the turf always shows both end
 * zones even when the show's grid stops at the goal lines (or short of
 * them). Other fields come back unchanged, so grids never grow end zones.
 *
 * Only the 3D venue uses this; performers keep the show's own grid.
 */
export function withFootballEndZones(fp: FieldProperties): FieldProperties {
    if (fieldFamily(fp) !== "football") return fp;
    const xs = fp.xCheckpoints.filter((c) => c.visible !== false);
    let id = Math.max(0, ...fp.xCheckpoints.map((c) => c.id)) + 1;
    const added: Checkpoint[] = [];
    const line = (name: string, terseName: string, steps: number) =>
        added.push({
            id: id++,
            name,
            terseName,
            axis: "x",
            stepsFromCenterFront: steps,
            useAsReference: false,
            visible: true,
        });
    for (const sx of [-1, 1]) {
        const reach = Math.max(
            0,
            ...xs.map((c) => sx * c.stepsFromCenterFront),
        );
        if (reach >= END_STEPS - TOLERANCE) continue;
        // Yard lines from just past the grid's edge out to the goal line.
        for (let s = GOAL_STEPS; s > reach + TOLERANCE; s -= FIVE_YARD_STEPS)
            line(
                s === GOAL_STEPS ? "goal line" : "yard line",
                s === GOAL_STEPS ? "G" : String(50 - (s / FIVE_YARD_STEPS) * 5),
                sx * s,
            );
        line("end line", "EL", sx * END_STEPS);
    }
    if (added.length === 0) return fp;
    return new FieldProperties({
        ...fp,
        xCheckpoints: [...fp.xCheckpoints, ...added],
    });
}

/**
 * The area a venue kit builds around: the field it paints, which for turf
 * includes the end zones `withFootballEndZones` adds.
 */
export function venueFootprint(
    fp: FieldProperties,
    style: FieldSurfaceStyle,
): FieldFootprint {
    return fieldFootprint(style === "turf" ? withFootballEndZones(fp) : fp);
}
