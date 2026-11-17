/**
 * The Held holds' styles as the compile reads them (ADR 0015 D-5; fork #775):
 * a hold's beats on the timeline to the count clock's counts.
 *
 * A Held hold covers spec beats `[start, end)`: the marcher arrives at
 * `start` and stands until `end`. Count k of the count clock runs from its
 * boundary to the next, and the planner reads the Feet settings of count k
 * for the step (or the rest) between them (`cueInputs.ts`). So the hold
 * covers the counts from the one that starts at beat `start` up to, not
 * including, the one that starts at beat `end`. Beats become counts through
 * show time, so the fixed zero-length beat 0 and a hold reaching past the
 * stored counts need no special case.
 *
 * Pure: no React, three.js or database.
 */
import type { CueHoldStyle, HoldTechnique } from "@openmarch/core";
import { countAt, type CountClock } from "./countClock";

/** A Held hold that carries a style, in spec beats. */
export interface StyledHold {
    readonly marcherId: number;
    readonly start: number;
    readonly end: number;
    readonly style: HoldTechnique;
}

/**
 * The compile's hold styles for `holds`, by marcher and count.
 *
 * @param secondsAtBeat show time at a spec beat (the count grid's `timeAtBeat`)
 * @param clock the 3D View's count clock
 */
export function holdStyleSpans(
    holds: readonly StyledHold[],
    secondsAtBeat: (beat: number) => number,
    clock: CountClock,
): CueHoldStyle[] {
    const countOf = (beat: number) =>
        Math.round(countAt(clock, secondsAtBeat(beat) * 1000));
    return holds
        .map((hold) => ({
            marcherId: hold.marcherId,
            from: countOf(hold.start),
            to: countOf(hold.end),
            style: hold.style,
        }))
        .filter((span) => span.to > span.from)
        .sort((a, b) => a.marcherId - b.marcherId || a.from - b.from);
}
