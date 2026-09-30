/**
 * The app's tempo map (spec §7, Q-9; ADR 0001 "Coordinates and beats").
 *
 * The resolver works on real-valued beat positions. Beat `n` is the start of the `n`th row of
 * `beats` ordered by `position`, counting from 0. Ranges are half-open: beat `b` covers show time
 * from `timestamp_b` up to the next beat's timestamp (the last beat uses its own duration), and a
 * fractional beat `b + f` (0 <= f < 1) is that fraction of the way across. Where two beats meet,
 * the later one owns the boundary.
 *
 * Every show starts with a fixed, zero-length beat at position 0 (migration 0000; its triggers
 * block changing it). Beat 1 therefore owns show time 0, beat positions in [0, 1) are never
 * reached during playback, and round trips through a zero-length beat don't hold.
 *
 * The input is the show's beats, ascending by `position`, with the cumulative `timestamp` the
 * `timing_objects` view (or `calculateTimestamps`) produces. Times are in seconds.
 */

/** The fields of a beat the tempo map reads. `Beat` from `@/global/classes/Beat` satisfies this. */
export interface BeatTiming {
    /** Seconds from the start of the show to the start of this beat. */
    readonly timestamp: number;
    /** Seconds from the start of this beat to the start of the next. */
    readonly duration: number;
}

/**
 * Show time is often computed along a different floating-point path than the summed beat
 * timestamps (for example `currentTimeMs / 1000`), so two values meant to be equal at a beat
 * boundary can differ by a few ULPs. A time this close below a boundary counts as the boundary.
 * Real beat durations are many orders of magnitude larger.
 */
export const BEAT_BOUNDARY_EPSILON_SECONDS = 1e-9;

/** The show time (seconds) at which the last beat ends. 0 when there are no beats. */
export function showEndTime(beats: readonly BeatTiming[]): number {
    const last = beats[beats.length - 1];
    return last ? last.timestamp + last.duration : 0;
}

/**
 * The length in seconds of beat `b`: up to the next beat's timestamp, or the last beat's own
 * duration. Measuring to the next timestamp (rather than `timestamp + duration`, which agrees up
 * to float error) keeps `beatAtTime` below `b + 1` inside beat `b` and makes `timeAtBeat(b + 1)`
 * exactly the next beat's timestamp.
 */
function beatSpan(beats: readonly BeatTiming[], b: number): number {
    const next = beats[b + 1];
    return next ? next.timestamp - beats[b].timestamp : beats[b].duration;
}

/**
 * Index of the last beat whose timestamp is `<= seconds` (within the boundary epsilon), or -1 if
 * none is. Binary search, O(log n). Ties go to the later beat, which owns a shared boundary.
 */
function lastBeatStartingAtOrBefore(
    beats: readonly BeatTiming[],
    seconds: number,
): number {
    let lo = 0;
    let hi = beats.length - 1;
    let found = -1;
    const target = seconds + BEAT_BOUNDARY_EPSILON_SECONDS;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (beats[mid].timestamp <= target) {
            found = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found;
}

/**
 * Converts show time to a real-valued beat position.
 *
 * - Inside the show, returns `b + (seconds - timestamp_b) / duration_b` for the beat `b` that
 *   covers `seconds`.
 * - Before the first beat, clamps to 0.
 * - At or past the end of the last beat, clamps to `beats.length` (the end of the show).
 * - With no beats, returns 0. `NaN` in gives `NaN` out.
 *
 * @param beats the show's beats, ascending by position, with cumulative timestamps
 * @param seconds show time in seconds
 */
export function beatAtTime(
    beats: readonly BeatTiming[],
    seconds: number,
): number {
    if (Number.isNaN(seconds)) return NaN;
    if (beats.length === 0) return 0;
    if (seconds + BEAT_BOUNDARY_EPSILON_SECONDS >= showEndTime(beats))
        return beats.length;

    const b = lastBeatStartingAtOrBefore(beats, seconds);
    if (b < 0) return 0;

    const span = beatSpan(beats, b);
    if (span <= 0) return b;
    // The epsilon can put `seconds` a hair before the beat's timestamp; that is the boundary.
    const fraction = Math.max(seconds - beats[b].timestamp, 0) / span;
    return b + fraction;
}

/**
 * Converts a real-valued beat position to show time in seconds. The inverse of `beatAtTime`
 * inside the show.
 *
 * - An integer beat `b` returns `timestamp_b` exactly.
 * - A fractional beat `b + f` returns `timestamp_b` plus `f` of the gap to the next beat's
 *   timestamp (the last beat uses its own duration). Inside a zero-length beat, such as the fixed
 *   beat 0, that is `timestamp_b`, which `beatAtTime` maps to the next beat.
 * - Below 0 clamps to the first beat's timestamp; at or past `beats.length` clamps to the end of
 *   the last beat.
 * - With no beats, returns 0. `NaN` in gives `NaN` out.
 *
 * @param beats the show's beats, ascending by position, with cumulative timestamps
 * @param beat a real-valued beat position
 */
export function timeAtBeat(beats: readonly BeatTiming[], beat: number): number {
    if (Number.isNaN(beat)) return NaN;
    if (beats.length === 0) return 0;
    if (beat <= 0) return beats[0].timestamp;
    if (beat >= beats.length) return showEndTime(beats);

    const b = Math.floor(beat);
    return beats[b].timestamp + (beat - b) * beatSpan(beats, b);
}

/**
 * The zero-based index of the beat that contains `seconds`, clamped to an existing beat
 * (`[0, beats.length - 1]`). Use this for a "current beat" display, such as the frame clock's
 * `currentBeatIndex`, so it agrees with `beatAtTime`. Returns -1 when there are no beats, and 0
 * for a `NaN` time (where `beatAtTime` returns `NaN`). Takes seconds; the frame clock's
 * `currentTime` is in milliseconds.
 */
export function beatIndexAtTime(
    beats: readonly BeatTiming[],
    seconds: number,
): number {
    if (beats.length === 0) return -1;
    const beat = beatAtTime(beats, seconds);
    if (Number.isNaN(beat)) return 0;
    return Math.min(Math.floor(beat), beats.length - 1);
}
