/**
 * Tempo mode: the plan for setting a time signature (pure; written by
 * `meterWrites.ts`).
 *
 * Time signatures are written as in a score (owner, 2026-11-02): on the measure where one starts,
 * carried on by the measures after until the next written one (`readMeters`). Setting one never
 * moves a written time signature after it, except "just this measure", which changes one bar's
 * length so everything after it moves, as in the score. Setting a measure back to the time
 * signature before it clears it again, so any change can be changed back exactly.
 */
import { type TempoEditResult } from "./tempoMath";
import { readMeters, sameMeter, type Meter } from "./meters";

/** A stored measure: its first count, and the time signature written there (null: none) */
export interface PlanMeasure {
    start: number;
    meter: Meter | null;
}

/** A measure after the edit; `from` is the start of the stored measure it was (null: new) */
export interface NewMeasure extends PlanMeasure {
    from: number | null;
}

export interface MeterPlan {
    /** Where the new time signature starts */
    from: number;
    /** Every stored measure after the edit, in order */
    measures: NewMeasure[];
    /** A measure left short before the next written time signature (marked *) */
    short: { start: number; counts: number } | null;
    /** Counts the measures after moved ("just this measure"; later when positive) */
    shift: number;
    /** The new count lengths */
    result: TempoEditResult;
}

/** `readMeters` for a list of measures, each running to the next (the last to the stored end) */
function readList(measures: readonly PlanMeasure[], beatCount: number) {
    const end = Math.max(beatCount, (measures.at(-1)?.start ?? 0) + 1);
    return readMeters(
        measures.map((m, i) => ({
            counts: (measures[i + 1]?.start ?? end) - m.start,
            meter: m.meter ? `${m.meter.top}/${m.meter.bottom}` : null,
            grouping: m.meter?.grouping.join("+") ?? null,
        })),
    );
}

/**
 * The end of the stored measures made regular: a last measure longer than its time signature is
 * split into measures of it (the last may be short), as the counts past the end carry it on
 */
function fillEnd(measures: NewMeasure[], beatCount: number): NewMeasure[] {
    const last = measures.at(-1);
    if (!last) return measures;
    const length = readList(measures, beatCount).at(-1)!.meter.grouping.length;
    const out = [...measures];
    for (let s = last.start + length; s < beatCount; s += length)
        out.push({ start: s, meter: null, from: null });
    return out;
}

/** Each count's eighths under a list of measures */
function unitsOf(
    measures: readonly PlanMeasure[],
    beatCount: number,
): number[] {
    const read = readList(measures, beatCount);
    const out: number[] = [];
    measures.forEach((m, i) =>
        read[i]!.units.forEach((u, j) => (out[m.start + j] = u)),
    );
    return out;
}

/**
 * Plan `meter` at the measure starting at spec beat `start`.
 *
 * - Until the next written time signature: the measures from here to there are regrouped into
 *   the new meter's counts. That one never moves, so when the counts don't divide evenly the last
 *   measure before it is short.
 * - `only` (just this measure): this measure gets the new meter's counts and the one after gets
 *   the old time signature back; every measure after moves to follow (written ones too), as when
 *   a bar changes length in a score.
 *
 * A time signature never changes the tempo: each count keeps its quarter-note tempo, and only a
 * count that now holds a different number of eighths changes length (the 3 of 7/8 2+2+3 is half
 * as long again). Holds keep theirs, and the counts after move with the edit (see `keepTempo`).
 *
 * @param measures the stored measures, in order, with the time signatures written on them
 *   (`readMeters` reads older shows' measure lengths as written ones; the plan writes them in)
 * @param beatCount stored counts
 */
export function planMeter({
    durations,
    holds,
    measures,
    beatCount,
    start,
    meter,
    only = false,
}: {
    durations: readonly number[];
    holds?: ReadonlySet<number>;
    measures: readonly {
        start: number;
        meter?: string | null;
        grouping?: string | null;
    }[];
    beatCount: number;
    start: number;
    meter: Meter;
    only?: boolean;
}): MeterPlan {
    const per = meter.grouping.length;
    const sorted = [...measures].sort((a, b) => a.start - b.start);
    const counts = sorted.map(
        (m, i) => (sorted[i + 1]?.start ?? beatCount) - m.start,
    );
    const read = readMeters(
        sorted.map((m, i) => ({ ...m, counts: counts[i]! })),
    );
    // as stored after the edit: older shows get their time signatures written in, and a long
    // last measure is split
    const before = fillEnd(
        sorted.map((m, i) => ({
            start: m.start,
            meter: read[i]!.written ? read[i]!.meter : null,
            from: m.start,
        })),
        beatCount,
    );
    const k = sorted.findIndex((m) => m.start === start);
    if (k < 0)
        throw new RangeError(
            `planMeter: count ${start} doesn't start a stored measure`,
        );
    const old = read[k]!.meter;
    // the same as the one before: no time signature written here (that's changing it back)
    const prior = k > 0 ? read[k - 1]!.meter : null;
    const written = sameMeter(prior, meter) ? null : meter;
    let after: NewMeasure[];
    let short: MeterPlan["short"] = null;
    let shift = 0;
    if (only) {
        const own = (before[k + 1]?.start ?? beatCount) - start;
        const head = before.slice(0, k);
        const here: NewMeasure = { start, meter: written, from: start };
        const next = before[k + 1];
        if (next) {
            shift = per - own;
            const moved = before
                .slice(k + 1)
                .map((m) => ({ ...m, start: m.start + shift }));
            // the old time signature again after it, unless that's what this bar has now
            const back = next.meter ?? old;
            moved[0] = {
                ...moved[0]!,
                meter: sameMeter(back, meter) ? null : back,
            };
            // moving later, a bar with no time signature pushed past the stored counts goes;
            // moving earlier, the counts freed at the end get measures again (fillEnd, below)
            after = [
                ...head,
                here,
                ...moved.filter(
                    (m, i) =>
                        i === 0 || m.meter !== null || m.start < beatCount,
                ),
            ];
        } else {
            // the last stored measure: what's left of it is the old time signature again
            const tail: NewMeasure[] =
                per < own
                    ? [
                          {
                              start: start + per,
                              meter: sameMeter(old, meter) ? null : old,
                              from: null,
                          },
                      ]
                    : [];
            after = [...head, here, ...tail];
        }
    } else {
        const j = before.findIndex((m, i) => i > k && m.meter !== null);
        const to = j < 0 ? beatCount : before[j]!.start;
        const run: NewMeasure[] = [];
        for (let s = start; s < to; s += per)
            run.push({
                start: s,
                meter: s === start ? written : null,
                from: before.some((m) => m.start === s) ? s : null,
            });
        const left = (to - start) % per;
        if (left && j >= 0) short = { start: to - left, counts: left };
        after = [
            ...before.slice(0, k),
            ...run,
            ...(j < 0 ? [] : before.slice(j)),
        ];
    }
    after = fillEnd(after, beatCount);
    const oldUnits = unitsOf(before, beatCount);
    const newUnits = unitsOf(after, beatCount);
    return {
        from: start,
        measures: after,
        short,
        shift,
        result: keepTempo(durations, start, oldUnits, newUnits, holds),
    };
}

/**
 * The counts from `from` on at their own tempo, each scaled by its new eighths over its old (holds
 * keep their length); the counts after move with them. Counts the meter doesn't change keep their
 * exact length, and nothing is clamped, so setting the old time signature back is exact.
 */
function keepTempo(
    durations: readonly number[],
    from: number,
    oldUnits: readonly (number | undefined)[],
    newUnits: readonly (number | undefined)[],
    holds: ReadonlySet<number> | undefined,
): TempoEditResult {
    const was = (b: number) => oldUnits[b] ?? 2;
    const now = (b: number) => newUnits[b] ?? 2;
    const next = [...durations];
    for (let b = from; b < durations.length; b++)
        if (!holds?.has(b) && was(b) !== now(b))
            next[b] = (durations[b]! * now(b)) / was(b);
    return { durations: next };
}
