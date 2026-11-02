/**
 * Tempo mode. The pure arithmetic behind tempo mode.
 *
 * The counts are `durations`: `durations[b]` is how long spec beat `b` lasts, in seconds, so beat
 * `b` starts at the sum of the ones before it (beat 0 is the fixed zero-length beat). A **lock**
 * is a beat whose start is tied to the music: editing the counts around it never moves it. Every
 * edit here changes the counts between two locks only:
 *
 * - the counts being edited get their new lengths;
 * - the counts after them, up to the next lock, stretch or squeeze (keeping their relative
 *   lengths) so the next lock stays where it is;
 * - with no lock after them, the rest of the show slides (keeps its tempo).
 *
 * Beat 1 always starts at 0, so it is an implicit lock.
 */
import tolgee from "@/global/singletons/Tolgee";

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

/** The nearest lock before `beat` (beat 1 when there is none) */
export function lockBefore(locks: ReadonlySet<number>, beat: number): number {
    let best = 1;
    for (const lock of locks) if (lock < beat && lock > best) best = lock;
    return Math.min(best, beat);
}

/** The nearest lock after `beat`, or null */
export function lockAfter(
    locks: ReadonlySet<number>,
    beat: number,
): number | null {
    let best: number | null = null;
    for (const lock of locks)
        if (lock > beat && (best === null || lock < best)) best = lock;
    return best;
}

export interface TempoEditResult {
    durations: number[];
    locks: Set<number>;
    /** Something the person should know */
    note?: string;
    /**
     * The pin after the edit that it had to work around (`retime`): with `held`, the edit was
     * scaled down to fit before it; otherwise the counts `from`..`at - 1` between stretched or
     * squeezed to keep it. `free` is the same edit with that pin released.
     */
    pin?: PinEffect;
}

export interface PinEffect {
    at: number;
    held: boolean;
    from: number;
    free: () => TempoEditResult;
}

const scaleRange = (
    durations: number[],
    from: number,
    to: number,
    factor: number,
) => {
    for (let b = from; b < to; b++) durations[b] = durations[b]! * factor;
};

/**
 * The music moved `seconds` earlier (the lead-in): pinned counts are tied to the music, so each
 * moves with it. Count 1 stays at the start, so the counts up to the first pin take up the
 * difference; the spacing from the first pin on doesn't change. Null when there are no pins, or
 * the counts before the first pin would get too short.
 */
export function movePinsWithMusic(
    durations: readonly number[],
    locks: ReadonlySet<number>,
    seconds: number,
): number[] | null {
    const first = lockAfter(locks, 1);
    if (first === null || seconds === 0) return null;
    const starts = startsOf(durations);
    const now = starts[first]! - starts[1]!;
    const wanted = now - seconds;
    if (wanted < (first - 1) * MIN_COUNT_SECONDS || now <= 0) return null;
    const next = [...durations];
    scaleRange(next, 1, first, wanted / now);
    return next;
}

/**
 * Give beats `from`..`to - 1` the lengths `lengths`, then keep the next lock in place by
 * stretching the counts after them up to it. Locks inside the range are dropped (the edit decides
 * those counts now). When the counts after can't absorb it (the next lock is right at `to`, or
 * they'd get faster than 400 or slower than 20 BPM), the new lengths are scaled to fit instead:
 * the edit keeps its shape and the lock wins.
 */
export function retime(
    durations: readonly number[],
    locks: ReadonlySet<number>,
    from: number,
    to: number,
    lengths: readonly number[],
    {
        hold = false,
        fixed,
    }: {
        /** A hold (fermata) may be any length: no 20 BPM floor */
        hold?: boolean;
        /**
         * Counts that keep their length (holds): inside the range they ignore `lengths`, and
         * neither the counts stretched to keep the next lock nor a fit to it change them
         */
        fixed?: ReadonlySet<number>;
    } = {},
): TempoEditResult {
    const next = [...durations];
    const nextLocks = new Set([...locks].filter((l) => l <= from || l >= to));
    const isFixed = (b: number) => fixed?.has(b) ?? false;
    for (let i = 0; i < lengths.length; i++) {
        if (isFixed(from + i)) continue;
        next[from + i] = hold
            ? Math.max(MIN_COUNT_SECONDS, lengths[i]!)
            : clampCount(lengths[i]!);
    }
    const lock = lockAfter(nextLocks, to - 1);
    if (lock === null) return { durations: next, locks: nextLocks };
    const starts = startsOf(durations);
    const target = starts[lock]!; // where the lock is now
    const editedEnd = startsOf(next)[to]!;
    // The counts between the edit and the lock that may stretch (the fixed ones keep theirs)
    let tailNow = 0;
    let tailFixed = 0;
    let tailCounts = 0;
    for (let b = to; b < lock; b++) {
        if (isFixed(b)) tailFixed += durations[b]!;
        else {
            tailNow += durations[b]!;
            tailCounts++;
        }
    }
    const tailWanted = target - editedEnd - tailFixed;
    const fits =
        tailCounts > 0 &&
        tailWanted >= tailCounts * MIN_COUNT_SECONDS &&
        tailWanted <= tailCounts * MAX_COUNT_SECONDS;
    const pin = (held: boolean): PinEffect => ({
        at: lock,
        held,
        from: to,
        free: () =>
            retime(
                durations,
                new Set([...locks].filter((l) => l !== lock)),
                from,
                to,
                lengths,
                { hold, fixed },
            ),
    });
    if (fits) {
        for (let b = to; b < lock; b++)
            if (!isFixed(b)) next[b] = next[b]! * (tailWanted / tailNow);
        return {
            durations: next,
            locks: nextLocks,
            ...(Math.abs(tailWanted - tailNow) > 1e-9
                ? { pin: pin(false) }
                : {}),
        };
    }
    // The lock wins: the edited counts plus the tail keep their total
    let edited = 0;
    let editedFixed = 0;
    for (let b = from; b < to; b++)
        if (isFixed(b)) editedFixed += next[b]!;
        else edited += next[b]!;
    const room =
        target - startsOf(next)[from]! - tailNow - tailFixed - editedFixed;
    for (let b = from; b < to; b++)
        if (!isFixed(b)) next[b] = next[b]! * (room / edited);
    return {
        durations: next,
        locks: nextLocks,
        pin: pin(true),
    };
}

/**
 * Move the start of `beat` to `seconds` (dragging a count onto the music, or a tap) and lock it.
 * The counts between the lock before and `beat` stretch to reach it; the counts after it, up to
 * the next lock, stretch to keep that lock; with no lock after, the rest slides. Returns null when
 * the move would squeeze a count past 400 BPM or stretch it past 20 BPM.
 */
export function moveBeatTo(
    durations: readonly number[],
    locks: ReadonlySet<number>,
    beat: number,
    seconds: number,
): TempoEditResult | null {
    if (beat <= 1) return null;
    const starts = startsOf(durations);
    const prev = lockBefore(locks, beat);
    const nextLock = lockAfter(locks, beat);
    const leftNow = starts[beat]! - starts[prev]!;
    const leftWanted = seconds - starts[prev]!;
    const leftCounts = beat - prev;
    if (
        leftWanted < leftCounts * MIN_COUNT_SECONDS ||
        leftWanted > leftCounts * MAX_COUNT_SECONDS
    )
        return null;
    const next = [...durations];
    scaleRange(next, prev, beat, leftWanted / leftNow);
    if (nextLock !== null && nextLock <= durations.length) {
        const rightNow = starts[nextLock]! - starts[beat]!;
        const rightWanted = starts[nextLock]! - seconds;
        const rightCounts = nextLock - beat;
        if (
            rightWanted < rightCounts * MIN_COUNT_SECONDS ||
            rightWanted > rightCounts * MAX_COUNT_SECONDS
        )
            return null;
        scaleRange(next, beat, nextLock, rightWanted / rightNow);
    }
    const nextLocks = new Set(locks);
    nextLocks.add(beat);
    return { durations: next, locks: nextLocks };
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
 * Where the start of `beat` may go (Logic's "scale left, move right"): far enough from the lock
 * before for its counts to stay under 400 BPM and over 20, and the same against the lock after.
 * `reason` names what stops it at each end.
 */
export function moveLimits(
    durations: readonly number[],
    locks: ReadonlySet<number>,
    beat: number,
    /** Held counts: the count after a hold moves only the hold, which may be any length */
    holds?: ReadonlySet<number>,
): { min: number; max: number; minReason: string; maxReason: string } {
    const starts = startsOf(durations);
    const prev = lockBefore(locks, beat);
    const next = lockAfter(locks, beat);
    const left = beat - prev;
    const afterHold = holds?.has(beat - 1) ?? false;
    let min = afterHold
        ? starts[beat - 1]! + MIN_COUNT_SECONDS
        : starts[prev]! + left * MIN_COUNT_SECONDS;
    let max = afterHold ? Infinity : starts[prev]! + left * MAX_COUNT_SECONDS;
    const pinned = prev > 1 ? { count: String(prev) } : null;
    let minReason = afterHold
        ? tolgee.t("tempoMode.errors.holdTooShort")
        : pinned
          ? tolgee.t("tempoMode.errors.tooFastAfterPin", pinned)
          : tolgee.t("tempoMode.errors.tooFastFromStart");
    let maxReason = pinned
        ? tolgee.t("tempoMode.errors.tooSlowAfterPin", pinned)
        : tolgee.t("tempoMode.errors.tooSlowFromStart");
    if (next !== null && next < starts.length) {
        const right = next - beat;
        const nMax = starts[next]! - right * MIN_COUNT_SECONDS;
        const nMin = starts[next]! - right * MAX_COUNT_SECONDS;
        if (nMax < max) {
            max = nMax;
            maxReason = tolgee.t("tempoMode.errors.countPinned", {
                count: String(next),
            });
        }
        if (nMin > min) {
            min = nMin;
            minReason = tolgee.t("tempoMode.errors.countPinned", {
                count: String(next),
            });
        }
    }
    return { min, max, minReason, maxReason };
}

/**
 * Move one count line only (Logic's "Move" handle, Shift-drag): the count before it and the count
 * starting there change length; every other count stays where it is. Locks it.
 */
export function moveOneCount(
    durations: readonly number[],
    locks: ReadonlySet<number>,
    beat: number,
    seconds: number,
): TempoEditResult | null {
    if (beat <= 1 || beat >= durations.length) return null;
    const starts = startsOf(durations);
    const before = seconds - starts[beat - 1]!;
    const after = starts[beat + 1]! - seconds;
    if (
        before < MIN_COUNT_SECONDS ||
        after < MIN_COUNT_SECONDS ||
        before > MAX_COUNT_SECONDS ||
        after > MAX_COUNT_SECONDS
    )
        return null;
    const next = [...durations];
    next[beat - 1] = before;
    next[beat] = after;
    const nextLocks = new Set(locks);
    nextLocks.add(beat);
    return { durations: next, locks: nextLocks };
}

/**
 * Count lengths for `counts` counts that fill `total` seconds, keeping the relative lengths of
 * `lengths` (stretched or squeezed), padding with their average when there are more counts than
 * lengths: what "keep everything else in place" writes after a count is added or removed.
 */
export function respace(
    lengths: readonly number[],
    counts: number,
    total: number,
): number[] {
    const avg =
        lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length) || 0.5;
    const base = Array.from({ length: counts }, (_, i) => lengths[i] ?? avg);
    const sum = base.reduce((a, b) => a + b, 0);
    return base.map((l) => (l * total) / sum);
}
