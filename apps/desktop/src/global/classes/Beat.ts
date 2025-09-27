import type { DatabaseBeat } from "@/db-functions";

/**
 * A Beat represents a specific point in time in the show.
 * It has a duration until the next beat and can be included in measures.
 */
interface Beat {
    /** Unique identifier for the beat */
    readonly id: number;
    /** The position of this beat in the show. Integer and unique */
    readonly position: number;
    /** Duration from this beat to the next in seconds */
    readonly duration: number;
    /** Whether this beat is included in a measure */
    readonly includeInMeasure: boolean;
    /** Human readable notes */
    readonly notes: string | null;
    /** The index of this beat in the array of beats in the show */
    readonly index: number;
    /** The timestamp of this beat in seconds from the start of the show */
    readonly timestamp: number;
}
export default Beat;

/**
 * Compares two Beat objects by their position property. Use this to sort the beats in a show in ascending order.
 * @param a - The first Beat object to compare.
 * @param b - The second Beat object to compare.
 * @returns A negative number if `a` comes before `b`, a positive number if `a` comes after `b`, and zero if they are equal.
 */
export const compareBeats = (a: Beat, b: Beat): number =>
    a.position - b.position;

/**
 * Calculates the total duration of the provided array of Beats.
 * @param beats - An array of Beat objects.
 * @returns The total duration in seconds of all the Beats in the array.
 */
export const beatsDuration = (beats: Beat[]): number =>
    beats.reduce((total, beat) => total + beat.duration, 0);

/**
 * Converts a DatabaseBeat object to a Beat object.
 * @param beat - The DatabaseBeat object to convert.
 * @param index - The index of the beat in the array of beats in the show.
 * @param timestamp - The timestamp of this beat in seconds from the start of the show.
 * @returns A new Beat object with the same properties as the input DatabaseBeat.
 */
export const fromDatabaseBeat = (
    beat: DatabaseBeat,
    index: number,
    timestamp: number = 0,
): Beat => {
    return {
        id: beat.id,
        position: beat.position,
        duration: beat.duration,
        includeInMeasure: beat.include_in_measure,
        notes: beat.notes,
        index,
        timestamp,
    };
};

/**
 * Retrieves the next Beat object from an array of beats based on the current beat's index.
 * @param currentBeat - The current Beat object.
 * @param beats - An array of Beat objects.
 * @returns The next Beat object in the array, or null if there is no next beat.
 */
export const getNextBeat = (currentBeat: Beat, beats: Beat[]): Beat | null => {
    return beats[currentBeat.index + 1] ?? null;
};

/**
 * Retrieves the previous Beat object from an array of beats based on the current beat's index.
 * @param currentBeat - The current Beat object.
 * @param beats - An array of Beat objects.
 * @returns The previous Beat object in the array, or null if there is no previous beat.
 */
export const getPreviousBeat = (
    currentBeat: Beat,
    beats: Beat[],
): Beat | null => {
    return beats[currentBeat.index - 1] ?? null;
};

/**
 * Converts a duration to a subset of beats starting from a given beat. This does not round to the nearest beat,
 * rather it includes all beats that cumulatively match or exceed the new duration.
 *
 * @param newDuration - The target duration to calculate beats for.
 * @param allBeats - The complete array of beats to select from.
 * @param startBeat - The beat from which to start selecting beats.
 * @returns An array of beats that cumulatively match or exceed the new duration.
 */
/**
 * Calculates the timestamp for each beat in an array based on their durations.
 * The first beat starts at timestamp 0, and each subsequent beat's timestamp is the sum of
 * all previous beats' durations.
 *
 * @param beats - An array of Beat objects to calculate timestamps for.
 * @returns A new array of Beat objects with updated timestamps.
 */
export const calculateTimestamps = (beats: Beat[]): Beat[] => {
    if (beats.length === 0) return [];

    let currentTimestamp = 0;
    return beats.map((beat, index) => {
        const newBeat = {
            ...beat,
            timestamp: currentTimestamp,
        };

        // For all beats except the last one, add its duration to the running timestamp
        if (index < beats.length - 1) {
            currentTimestamp += beat.duration;
        }

        return newBeat;
    });
};

export const durationToBeats = ({
    newDuration,
    allBeats,
    startBeat,
}: {
    newDuration: number;
    allBeats: Beat[];
    startBeat: Beat;
}): Beat[] => {
    if (newDuration <= 0) {
        console.warn("durationToBeats: newDuration must be greater than 0");
        return [];
    }

    let cumulativeDuration = 0;
    let beatIndex = startBeat.index;

    while (cumulativeDuration < newDuration && beatIndex < allBeats.length) {
        cumulativeDuration += allBeats[beatIndex].duration;
        beatIndex++;
    }

    return allBeats.slice(startBeat.index, beatIndex);
};

/**
 * Converts a duration to a tempo attempting to fix floating point errors.
 * @param duration - The duration to convert.
 * @returns The tempo in BPM.
 */
export const durationToTempo = (
    duration: number | { duration: number; bpm: number },
) => {
    const durationNumber =
        typeof duration === "number" ? duration : duration.duration;

    const tempo = 60 / durationNumber;
    return Math.round(tempo * 1000) / 1000;
};
