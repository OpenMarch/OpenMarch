/**
 * Edit music: where count 1 is in the music file, the way the "Count 1 in the music" box reads
 * and writes it. It is the audio offset turned around (positive offset: the music starts later).
 */

/** Where count 1 is in the music, for an audio offset (positive: the music starts later) */
export const countOneAt = (offset: number) => -offset;

/**
 * Seconds from what was typed: "3.25", "3,25", or a time the way the clock shows it, "00:03.250"
 * or "-00:01.5". Null when it isn't one.
 */
export function parseSeconds(text: string): number | null {
    const trimmed = text.trim().replace(",", ".");
    const match = /^(-)?(?:(\d+):)?(\d+(?:\.\d*)?|\.\d+)$/.exec(trimmed);
    if (!match) return null;
    const [, minus, minutes, seconds] = match;
    if (minutes !== undefined && Number(seconds) >= 60) return null;
    const value = Number(minutes ?? 0) * 60 + Number(seconds);
    return minus ? -value : value;
}
