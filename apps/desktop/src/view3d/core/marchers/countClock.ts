/**
 * The show's count clock for the 3D View marchers: show time to counts
 * elapsed (fractional mid-beat), following the tempo map (ADR 0002 D-7).
 *
 * Count k is the k-th beat with a duration. Its boundary is that beat's
 * start; the last boundary is the end of the last beat. The marchers'
 * shader plays clips from this clock, so everyone who steps off on the same
 * count is in step at any tempo.
 *
 * Pure: no React or database.
 */

/** What the clock needs from a beat: its start and length, in seconds. */
export interface ClockBeat {
    timestamp: number;
    duration: number;
}

export interface CountClock {
    /** Boundary times in ms: counts + 1 entries. */
    boundariesMs: Float64Array;
    /** Tempo of each count (60 / duration). */
    bpm: Float64Array;
    /** Number of counts. */
    counts: number;
}

/** Builds the clock from the show's beats (any order). */
export function buildCountClock(beats: readonly ClockBeat[]): CountClock {
    const timed = beats
        .filter((b) => b.duration > 0)
        .sort((a, b) => a.timestamp - b.timestamp);
    const n = timed.length;
    const boundariesMs = new Float64Array(n + 1);
    const bpm = new Float64Array(n);
    for (let k = 0; k < n; k++) {
        boundariesMs[k] = timed[k].timestamp * 1000;
        bpm[k] = 60 / timed[k].duration;
    }
    if (n > 0)
        boundariesMs[n] =
            (timed[n - 1].timestamp + timed[n - 1].duration) * 1000;
    return { boundariesMs, bpm, counts: n };
}

/**
 * Counts elapsed at show time `ms`: k + the fraction through count k.
 * Clamped to [0, counts]. `hint` is the count last returned, for a fast
 * path during playback.
 */
export function countAt(clock: CountClock, ms: number, hint = 0): number {
    const b = clock.boundariesMs;
    const n = clock.counts;
    if (n === 0 || !(ms > b[0])) return 0;
    if (ms >= b[n]) return n;
    let k = Math.min(Math.max(Math.floor(hint), 0), n - 1);
    if (!(ms >= b[k] && ms < b[k + 1])) {
        let lo = 0;
        let hi = n - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (b[mid] <= ms) lo = mid;
            else hi = mid - 1;
        }
        k = lo;
    }
    return k + (ms - b[k]) / (b[k + 1] - b[k]);
}

/** Show time (ms) at count clock `c`: the inverse of `countAt`, clamped to the show. */
export function msAtCount(clock: CountClock, c: number): number {
    const b = clock.boundariesMs;
    const n = clock.counts;
    if (n === 0 || !(c > 0)) return n === 0 ? 0 : b[0];
    if (c >= n) return b[n];
    const k = Math.floor(c);
    return b[k] + (c - k) * (b[k + 1] - b[k]);
}
