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
    const lengths: number[] = [];
    for (let b = r.from; b < r.to; b++) {
        const now = units[b] ?? 2;
        const next = meter.grouping[(b - r.from) % per]!;
        lengths.push((durations[b]! * next) / now);
    }
    return {
        from: r.from,
        to: r.to,
        starts: r.starts,
        leftover: r.leftover,
        result: retime(durations, locks, r.from, r.to, lengths, {
            fixed: holds,
        }),
    };
}
