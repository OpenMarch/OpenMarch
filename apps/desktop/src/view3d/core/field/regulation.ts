import {
    FieldProperties,
    fieldFootprint,
    type Checkpoint,
    type FieldFootprint,
} from "@openmarch/core";
import { fieldFamily } from "../venueSettings";
import type { FieldSurfaceStyle } from "./plan";

/**
 * A football field in the show's own yard lines: goal lines 10 yard-line
 * gaps from midfield and end lines 12, the gap being whatever the show's
 * grid uses (8 steps in the templates, 6 at 6 to 5). Working in steps (not
 * meters) keeps the added lines on the show's grid when only the step size
 * is changed, since that doesn't move the checkpoints.
 */
const TEMPLATE_FIVE_YARD_STEPS = 8;
const GOAL_GAPS = 10;
const END_GAPS = 12;
/** Checkpoints this close (in steps) to a line count as that line. */
const TOLERANCE = 0.5;

/** Five yards, in inches. */
const FIVE_YARDS_INCHES = 180;
/** How far (as a ratio) a grid's line spacing may stray from five yards. */
const MAX_STRAY = 1.5;

/** The most common gap between neighboring checkpoints, or undefined. */
function commonGap(xs: readonly Checkpoint[]): number | undefined {
    const at = [
        ...new Set(xs.map((c) => Math.round(c.stepsFromCenterFront * 4) / 4)),
    ].sort((a, b) => a - b);
    const counts = new Map<number, number>();
    for (let i = 1; i < at.length; i++) {
        const gap = at[i] - at[i - 1];
        counts.set(gap, (counts.get(gap) ?? 0) + 1);
    }
    let best: number | undefined;
    let most = 0;
    for (const [gap, n] of counts)
        if (n > most || (n === most && gap > (best ?? 0)))
            [best, most] = [gap, n];
    return best;
}

/**
 * Steps between the show's yard lines. The grid's own spacing wins, so a
 * grid that sets its yard lines 6 steps apart keeps them 6 apart whatever
 * the step size: the most common gap between its reference lines (so a
 * series every 2 steps doesn't count) or, when only some yard lines are
 * references (every 10 yards, say), between all its lines. Of those, the
 * one nearer five yards at the show's step size; neither within half again
 * of it, five yards it is.
 */
export function fiveYardSteps(
    xs: readonly Checkpoint[],
    stepSizeInches: number,
): number {
    const expected =
        stepSizeInches > 0
            ? FIVE_YARDS_INCHES / stepSizeInches
            : TEMPLATE_FIVE_YARD_STEPS;
    const stray = (gap: number) => Math.abs(Math.log(gap / expected));
    const candidates = [
        commonGap(xs.filter((c) => c.useAsReference !== false)),
        commonGap(xs),
    ].filter(
        (gap): gap is number =>
            gap !== undefined && stray(gap) <= Math.log(MAX_STRAY),
    );
    if (candidates.length === 0) return expected;
    return candidates.reduce((a, b) => (stray(b) < stray(a) ? b : a));
}

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
    const FIVE_YARD_STEPS = fiveYardSteps(xs, fp.stepSizeInches);
    const GOAL_STEPS = GOAL_GAPS * FIVE_YARD_STEPS;
    const END_STEPS = END_GAPS * FIVE_YARD_STEPS;
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
