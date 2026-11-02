/**
 * PROTOTYPE (tempo mode): the plan for setting a meter with a grouping (pure; written by
 * `meterWrites.ts`). See there for what it does.
 */
import { regroupMeasures, retime, type TempoEditResult } from "./tempoMath";
import { type Meter } from "./meters";

/** Measures `from`..`to - 1` regrouped to start at `starts`, each in `meter` */
export interface MeterStep {
    from: number;
    to: number;
    starts: number[];
    meter: Meter;
}

export interface MeterPlan {
    /** Where the new meter starts */
    from: number;
    steps: MeterStep[];
    /**
     * The stored measures from count `from` on move `by` counts (later when positive), each
     * keeping its own meter: a 2/4 bar in 4/4 brings every downbeat after it 2 counts earlier, as
     * in the score. Null when nothing after moves
     */
    shift: { from: number; by: number } | null;
    /** The new count lengths, and the pins after */
    result: TempoEditResult;
}

/**
 * Plan `meter` from the measure starting at spec beat `start`: until the next change (the run of
 * measures as long as the one at `start`), or with `only`, for that measure alone.
 *
 * A time signature never leaves a short measure behind it. When the counts up to the next change
 * don't fill whole measures, the ones left over go to the next measure, which starts that much
 * earlier (a lone measure too short for the meter takes what it needs from after it instead); with
 * `only`, the measure gets the new meter's counts. Either way the measures after move to follow,
 * keeping their own meters, so 2/4 to the next change then 4/4 from the measure after is the same
 * as one 2/4 bar. Only the show's last stored measure may end short (the counts past it carry on
 * its meter).
 *
 * A time signature never changes the tempo: each count keeps its own quarter-note tempo (a
 * gradual change, an a tempo), and only a count that now holds a different number of eighths
 * changes length (the 3 of 7/8 2+2+3 is half as long again). 4/4 to 2/4 changes no lengths. Holds
 * keep theirs.
 *
 * @param measureStarts first spec beat of every stored measure
 * @param beatCount stored counts
 * @param units each count's eighths now (missing: 2, a quarter note)
 * @param only the measure at `start` only; `old` is its meter now, which the counts left over
 * get back when it's the last stored measure
 */
export function planMeter({
    durations,
    locks,
    measureStarts,
    beatCount,
    start,
    meter,
    units,
    holds,
    only,
}: {
    durations: readonly number[];
    locks: ReadonlySet<number>;
    measureStarts: readonly number[];
    beatCount: number;
    start: number;
    meter: Meter;
    units: readonly (number | undefined)[];
    holds?: ReadonlySet<number>;
    only?: { old: Meter };
}): MeterPlan {
    const per = meter.grouping.length;
    const sorted = [...measureStarts].sort((a, b) => a - b);
    const i = sorted.indexOf(start);
    const steps: MeterStep[] = [];
    let oldTo: number;
    let by = 0;
    if (only) {
        oldTo = sorted[i + 1] ?? beatCount;
        steps.push({ from: start, to: oldTo, starts: [start], meter });
        const grow = per - (oldTo - start);
        if (i + 1 < sorted.length) by = grow;
        else if (grow < 0)
            // the last stored measure: what's left of it is the old meter again
            steps.push({
                from: start + per,
                to: oldTo,
                starts: [start + per],
                meter: only.old,
            });
    } else {
        const r = regroupMeasures(sorted, beatCount, start, per);
        oldTo = r.to;
        let starts = r.starts;
        // stored measures after the run (the last one runs to the stored end)
        if (r.leftover && r.to < beatCount) {
            if (r.to - start > per) {
                // the counts left over start the next measure: it comes that much earlier
                by = -r.leftover;
                starts = starts.slice(0, -1);
            }
            // a lone measure too short for the meter takes what it needs from after it
            else by = per - r.leftover;
        }
        steps.push({ from: start, to: r.to, starts, meter });
    }
    // where the regrouped measures end now; past it, each count keeps the eighths it had
    const end = oldTo + by;
    const eighths = (b: number): number => {
        if (b >= end) return units[b - by] ?? 2;
        let step = steps[0]!;
        for (const s of steps) if (b >= s.from) step = s;
        let first = step.starts[0]!;
        for (const s of step.starts) if (s <= b) first = s;
        const g = step.meter.grouping;
        return g[(b - first) % g.length]!;
    };
    return {
        from: start,
        steps,
        shift: by ? { from: oldTo, by } : null,
        result: keepTempo(durations, locks, start, eighths, units, holds),
    };
}

/**
 * The counts from `from` on regrouped at their own tempo: each scaled by its new eighths over its
 * old. Only the counts up to the last one that changes length are re-timed (up to the next pin);
 * when none changes, every pin stays
 */
function keepTempo(
    durations: readonly number[],
    locks: ReadonlySet<number>,
    from: number,
    eighths: (b: number) => number,
    units: readonly (number | undefined)[],
    holds: ReadonlySet<number> | undefined,
): TempoEditResult {
    const lengths: number[] = [];
    let to = from;
    for (let b = from; b < durations.length; b++) {
        const length = holds?.has(b)
            ? durations[b]!
            : (durations[b]! * eighths(b)) / (units[b] ?? 2);
        if (Math.abs(length - durations[b]!) > 1e-12) to = b + 1;
        lengths.push(length);
    }
    if (to === from)
        return { durations: [...durations], locks: new Set(locks) };
    return retime(durations, locks, from, to, lengths.slice(0, to - from), {
        fixed: holds,
    });
}
