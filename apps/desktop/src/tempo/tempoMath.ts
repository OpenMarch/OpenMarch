/**
 * Tempo mode. The pure arithmetic behind tempo mode.
 *
 * The counts are `durations`: `durations[b]` is how long spec beat `b` lasts, in seconds, so beat
 * `b` starts at the sum of the ones before it (beat 0 is the fixed zero-length beat). An edit
 * gives the counts being edited their new lengths, and every count after them moves with them
 * (keeps its tempo). Beat 1 always starts at 0.
 */

/** The shortest a count may get: 400 BPM */
export const MIN_COUNT_SECONDS = 60 / 400;
/** The longest a count may get: 20 BPM */
export const MAX_COUNT_SECONDS = 60 / 20;

export const bpmOf = (seconds: number) => 60 / seconds;
export const secondsOf = (bpm: number) => 60 / bpm;

/** Start time of every beat, plus the end of the last: `starts[b]` for b in 0..durations.length */
export function startsOf(durations: readonly number[]): number[] {
    const starts = [0];
    for (const d of durations) starts.push(starts[starts.length - 1]! + d);
    return starts;
}

const clampCount = (seconds: number) =>
    Math.min(MAX_COUNT_SECONDS, Math.max(MIN_COUNT_SECONDS, seconds));

export interface TempoEditResult {
    durations: number[];
}

/**
 * Give beats `from`..`to - 1` the lengths `lengths` (kept between 400 and 20 BPM). The counts
 * after them keep their lengths, so they move with the edit.
 */
export function retime(
    durations: readonly number[],
    from: number,
    to: number,
    lengths: readonly number[],
    {
        hold = false,
        fixed,
    }: {
        /** A hold (fermata) may be any length: no 20 BPM floor */
        hold?: boolean;
        /** Counts that keep their length (holds): inside the range they ignore `lengths` */
        fixed?: ReadonlySet<number>;
    } = {},
): TempoEditResult {
    const next = [...durations];
    for (let i = 0; i < lengths.length; i++) {
        if (fixed?.has(from + i)) continue;
        next[from + i] = hold
            ? Math.max(MIN_COUNT_SECONDS, lengths[i]!)
            : clampCount(lengths[i]!);
    }
    return { durations: next };
}

/** Beats `from`..`to - 1` at a steady tempo, or gradually from one tempo to another (linear in BPM) */
export function rampLengths(
    counts: number,
    bpmFrom: number,
    bpmTo: number = bpmFrom,
): number[] {
    return Array.from({ length: counts }, (_, i) => {
        const t = counts <= 1 ? 0 : i / (counts - 1);
        return secondsOf(bpmFrom + (bpmTo - bpmFrom) * t);
    });
}

/** A run of counts at (about) one tempo: what the tempo lane draws as one flat step */
export interface TempoSegment {
    /** First beat */
    from: number;
    /** One past the last beat */
    to: number;
    /** Tempo at the first and last count; equal for a steady segment */
    bpmFrom: number;
    bpmTo: number;
    /** Whether the counts change tempo gradually (a ramp) rather than staying steady */
    ramp: boolean;
    /** Whether the counts wander (tapped or fitted to the music) */
    uneven: boolean;
    /** A ramp's curve (0 straight; see tempoShape.ts `curveAt`) */
    curve?: number;
}

/**
 * Split the counts into segments for the tempo lane: steady runs (within `tolerance` BPM), ramps
 * (steadily changing tempo) and uneven stretches (tapped or fitted). Beat 0 is skipped.
 */
export function tempoSegments(
    durations: readonly number[],
    tolerance = 0.6,
): TempoSegment[] {
    const bpms = durations.map((d) => (d > 0 ? bpmOf(d) : 0));
    const segments: TempoSegment[] = [];
    let b = 1;
    while (b < bpms.length) {
        let end = b + 1;
        while (
            end < bpms.length &&
            Math.abs(bpms[end]! - bpms[b]!) <= tolerance
        )
            end++;
        if (end - b >= 2 || end >= bpms.length) {
            const avg = average(bpms, b, end);
            segments.push({
                from: b,
                to: end,
                bpmFrom: avg,
                bpmTo: avg,
                ramp: false,
                uneven: false,
            });
            b = end;
            continue;
        }
        // A single count off on its own: grow a ramp (steady step) or an uneven stretch
        const step = bpms[b + 1]! - bpms[b]!;
        end = b + 1;
        while (
            end < bpms.length &&
            Math.abs(bpms[end]! - bpms[end - 1]! - step) <= tolerance &&
            Math.abs(step) > tolerance * 0.2
        )
            end++;
        if (end - b >= 3) {
            segments.push({
                from: b,
                to: end,
                bpmFrom: bpms[b]!,
                bpmTo: bpms[end - 1]!,
                ramp: true,
                uneven: false,
            });
            b = end;
            continue;
        }
        // Uneven: until a steady pair of counts starts again
        end = b + 1;
        while (
            end + 1 < bpms.length &&
            Math.abs(bpms[end + 1]! - bpms[end]!) > tolerance
        )
            end++;
        const last = segments[segments.length - 1];
        if (last?.uneven && last.to === b) {
            last.to = end;
            last.bpmTo = bpms[end - 1]!;
        } else
            segments.push({
                from: b,
                to: end,
                bpmFrom: bpms[b]!,
                bpmTo: bpms[end - 1]!,
                ramp: false,
                uneven: true,
            });
        b = end;
    }
    return segments;
}

const average = (values: readonly number[], from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += values[i]!;
    return sum / Math.max(1, to - from);
};

/**
 * Regroup the measures from the one starting at `start` (a beat ordinal) into measures of
 * `counts` counts, up to the next time signature change: the end of the run of measures as long
 * as the one at `start`. Returns the new measure starts for that stretch, and how many counts were
 * left over at its end (a short last measure).
 */
export function regroupMeasures(
    measureStarts: readonly number[],
    beatCount: number,
    start: number,
    counts: number,
): { from: number; to: number; starts: number[]; leftover: number } {
    if (!(counts >= 1))
        throw new RangeError(`regroupMeasures: ${counts} counts a measure`);
    const sorted = [...measureStarts].sort((a, b) => a - b);
    const i = sorted.indexOf(start);
    const lengthAt = (j: number) => (sorted[j + 1] ?? beatCount) - sorted[j]!;
    const length = lengthAt(i);
    let j = i;
    while (j + 1 < sorted.length && lengthAt(j + 1) === length) j++;
    const to = sorted[j + 1] ?? beatCount;
    const starts: number[] = [];
    for (let b = start; b < to; b += counts) starts.push(b);
    return { from: start, to, starts, leftover: (to - start) % counts };
}

/**
 * How long a count added before spec beat `at` is: the count before it, unless that is a hold
 * (a fermata is not the tempo), then the nearest count that isn't one, before it or else after.
 */
export function newCountLength(
    durations: readonly number[],
    holds: ReadonlySet<number>,
    at: number,
): number {
    const from = Math.min(Math.max(1, at - 1), durations.length - 1);
    for (let b = from; b >= 1; b--)
        if (!holds.has(b) && durations[b]) return durations[b]!;
    for (let b = from + 1; b < durations.length; b++)
        if (!holds.has(b) && durations[b]) return durations[b]!;
    return durations[from] || 0.5;
}

/**
 * "Keep everything else in place": the lengths to write over the measure `span` ([a, e) spec
 * beats) after counts are added at `at` (each `len` long) or removed (`from`..`to - 1`), so the
 * measure takes as long as it did and the music after it stays where it was. Holds keep their
 * seconds; the other counts stretch or squeeze to fill the rest.
 */
export function keepInPlaceLengths(
    durations: readonly number[],
    holds: ReadonlySet<number>,
    span: { a: number; e: number },
    edit:
        | { kind: "insert"; at: number; count: number; len: number }
        | { kind: "delete"; from: number; to: number },
): { from: number; lengths: number[] } {
    let total = 0;
    for (let b = span.a; b < span.e; b++) total += durations[b] ?? 0;
    const counts: { len: number; hold: boolean }[] = [];
    for (let b = span.a; b < span.e; b++) {
        if (edit.kind === "insert" && b === edit.at)
            for (let i = 0; i < edit.count; i++)
                counts.push({ len: edit.len, hold: false });
        if (edit.kind === "delete" && b >= edit.from && b < edit.to) continue;
        counts.push({
            len: durations[b] ?? 0.5,
            hold: holds.has(b),
        });
    }
    if (edit.kind === "insert" && edit.at >= span.e)
        for (let i = 0; i < edit.count; i++)
            counts.push({ len: edit.len, hold: false });
    const held = counts.filter((c) => c.hold).reduce((a, c) => a + c.len, 0);
    const free = counts.filter((c) => !c.hold).reduce((a, c) => a + c.len, 0);
    // holds keep their seconds when the rest can make up the time; otherwise all scale together
    const keepHolds = free > 0 && total - held > 0;
    const scale = keepHolds ? (total - held) / free : total / (held + free);
    return {
        from: span.a,
        lengths: counts.map((c) =>
            keepHolds && c.hold ? c.len : c.len * scale,
        ),
    };
}
