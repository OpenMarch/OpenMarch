/**
 * Tempo mode: tap tempo, the way a tap-tempo pedal works.
 * Taps are times in milliseconds; a pause longer than `TAP_RESET_MS` starts a new count. The tempo
 * is the average over every tap since then, so one early or late tap barely moves it.
 */

/** A pause this long (ms) before a tap starts over */
export const TAP_RESET_MS = 2000;
/** Taps kept: the last few seconds of tapping is what the tempo is now */
const MAX_TAPS = 32;

/** The taps after one more at `now`: a new count after a long pause */
export function addTap(taps: readonly number[], now: number): number[] {
    const last = taps[taps.length - 1];
    if (last === undefined || now - last > TAP_RESET_MS || now < last)
        return [now];
    return [...taps, now].slice(-MAX_TAPS);
}

/** The average tempo of `taps` in beats a minute, or null before the second tap */
export function tapBpm(taps: readonly number[]): number | null {
    if (taps.length < 2) return null;
    const span = taps[taps.length - 1]! - taps[0]!;
    return span > 0 ? (60000 * (taps.length - 1)) / span : null;
}
