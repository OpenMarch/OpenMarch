/**
 * PROTOTYPE (tempo mode): the plan for setting a meter with a grouping (pure; written by
 * `meterWrites.ts`). See there for what it does.
 */
import { regroupMeasures, retime, type TempoEditResult } from "./tempoMath";
import { type Meter } from "./meters";

export interface MeterPlan {
    from: number;
    to: number;
    /** First count of each new measure in the stretch */
    starts: number[];
    /** Counts left over at the end (a short last measure) */
    leftover: number;
    /** The stretch's new count lengths, and the pins after */
    result: TempoEditResult;
}

/**
 * Plan `meter` from the measure starting at spec beat `start`. A time signature never changes the
 * tempo: each count keeps its own quarter-note tempo (a gradual change, an a tempo), and only a
 * count that now holds a different number of eighths changes length (the 3 of 7/8 2+2+3 is half
 * as long again). 4/4 to 2/4 changes no lengths. Holds keep theirs.
 *
 * @param measureStarts first spec beat of every stored measure
 * @param beatCount stored counts
 * @param units each count's eighths now (missing: 2, a quarter note)
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
}: {
    durations: readonly number[];
    locks: ReadonlySet<number>;
    measureStarts: readonly number[];
    beatCount: number;
    start: number;
    meter: Meter;
    units: readonly (number | undefined)[];
    holds?: ReadonlySet<number>;
}): MeterPlan {
    const per = meter.grouping.length;
    const r = regroupMeasures(measureStarts, beatCount, start, per);
    return {
        from: r.from,
        to: r.to,
        starts: r.starts,
        leftover: r.leftover,
        result: keepTempo(
            durations,
            locks,
            r.from,
            r.to,
            (b) => meter.grouping[(b - r.from) % per]!,
            units,
            holds,
        ),
    };
}

/**
 * Counts `from`..`to - 1` regrouped at their own tempo: each scaled by its new eighths over its
 * old. When nothing changes length, nothing is re-timed and every pin stays
 */
function keepTempo(
    durations: readonly number[],
    locks: ReadonlySet<number>,
    from: number,
    to: number,
    eighths: (b: number) => number,
    units: readonly (number | undefined)[],
    holds: ReadonlySet<number> | undefined,
): TempoEditResult {
    const lengths: number[] = [];
    let same = true;
    for (let b = from; b < to; b++) {
        const length = holds?.has(b)
            ? durations[b]!
            : (durations[b]! * eighths(b)) / (units[b] ?? 2);
        if (Math.abs(length - durations[b]!) > 1e-12) same = false;
        lengths.push(length);
    }
    if (same) return { durations: [...durations], locks: new Set(locks) };
    return retime(durations, locks, from, to, lengths, { fixed: holds });
}

/**
 * `meter` for the measure at `start` only (a 2/4 bar in a 4/4 piece): that measure in `meter`,
 * then `old` again from the next count to where the run of measures like the one at `start`
 * ended, so the downbeats after it move as they do in the score. Two regroups written as one edit
 * (`writeMeter`'s `then`). Null when the run is that one measure: then it's an ordinary change.
 */
export function planMeterOnly({
    durations,
    locks,
    measureStarts,
    beatCount,
    start,
    meter,
    old,
    units,
    holds,
}: {
    durations: readonly number[];
    locks: ReadonlySet<number>;
    measureStarts: readonly number[];
    beatCount: number;
    start: number;
    meter: Meter;
    /** The meter of the measure at `start` now: what comes back after it */
    old: Meter;
    units: readonly (number | undefined)[];
    holds?: ReadonlySet<number>;
}): { first: MeterPlan; then: MeterPlan } | null {
    const per = meter.grouping.length;
    const perOld = old.grouping.length;
    const run = regroupMeasures(measureStarts, beatCount, start, perOld);
    const next = start + per;
    if (next >= run.to) return null;
    const starts: number[] = [];
    for (let b = next; b < run.to; b += perOld) starts.push(b);
    const result = keepTempo(
        durations,
        locks,
        start,
        run.to,
        (b) =>
            b < next
                ? meter.grouping[b - start]!
                : old.grouping[(b - next) % perOld]!,
        units,
        holds,
    );
    return {
        first: { from: start, to: next, starts: [start], leftover: 0, result },
        then: {
            from: next,
            to: run.to,
            starts,
            leftover: (run.to - next) % perOld,
            result,
        },
    };
}
