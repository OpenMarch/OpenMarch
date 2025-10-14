/**
 * A Beat represents a specific point in time in the show.
 * It has a duration until the next beat and can be included in measures.
 *
 * Includes only specific properties needed for the metronome functionality.
 */
export interface Beat {
    /** The position of this beat in the show. Integer and unique */
    readonly position: number;
    /** Duration from this beat to the next in seconds */
    readonly duration: number;
    /** Whether this beat is included in a measure */
    readonly includeInMeasure: boolean;
    /** The index of this beat in the array of beats in the show */
    readonly index: number;
    /** The timestamp of this beat in seconds from the start of the show */
    readonly timestamp: number;
}

/**
 * Represents a musical measure in a musical composition.
 * Contains information about the structure and content of a specific measure.
 *
 * Includes only specific properties needed for the metronome functionality.
 */
export interface Measure {
    /** The beat this measure starts on */
    readonly startBeat: Beat;
    /** The duration of the measure in seconds */
    readonly duration: number;
    /** The number of counts (or beats) in this measure */
    readonly counts: number;
    /** The beats that belong to this measure */
    readonly beats: Beat[];
    /** The timestamp of the first beat in the measure */
    readonly timestamp: number;
}

/**
 * Creates a new Beat object.
 * @param position
 * @param duration
 * @param index
 * @param timestamp
 */
export function createBeat(
    position: number,
    duration: number,
    index: number,
    timestamp: number,
): Beat {
    return {
        position,
        duration,
        includeInMeasure: true,
        index,
        timestamp,
    };
}

/**
 * Creates a new Measure object.
 * @param number
 * @param startBeat
 * @param beats
 * @param rehearsalMark
 */
export function createMeasure(
    startBeat: Beat,
    beats: Beat[],
    rehearsalMark?: string,
): Measure {
    return {
        startBeat,
        duration: beats.reduce((acc, b) => acc + b.duration, 0),
        counts: beats.length,
        beats,
        timestamp: startBeat.timestamp,
        ...(rehearsalMark ? { rehearsalMark } : {}),
    };
}

/**
 * Gets the current time as a string in the format YYYYMMDD_HHMMSS.
 */
export function getCurrentTime(): string {
    const now = new Date();
    return (
        now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, "0") +
        String(now.getDate()).padStart(2, "0") +
        "_" +
        String(now.getHours()).padStart(2, "0") +
        String(now.getMinutes()).padStart(2, "0") +
        String(now.getSeconds()).padStart(2, "0")
    );
}

/**
 * Memoize a tone generation function.
 * Sounds are cached at the end of this file
 * @param fn Tone generation function to memoize
 */
export function memoize<T extends (...args: any[]) => Float32Array>(fn: T): T {
    const cache = new Map<string, Float32Array>();
    return ((...args: any[]) => {
        // Use JSON.stringify for cache key
        const key = JSON.stringify(args);
        if (!cache.has(key)) {
            cache.set(key, fn(...args));
        }
        return cache.get(key)!;
    }) as T;
}
