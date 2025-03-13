import { DatabaseBeat } from "electron/database/tables/BeatTable";

/**
 * A Beat represents a specific point in time in the show.
 * It has a duration until the next beat and can be included in measures.
 */
type Beat = Readonly<{
    /** Unique identifier for the beat */
    id: number;
    /** The position of this beat in the show. Integer and unique */
    position: number;
    /** Duration from this beat to the next in seconds */
    duration: number;
    /** Whether this beat is included in a measure */
    includeInMeasure: boolean;
    /** Human readable notes */
    notes: string | null;
}>;
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
 * @returns A new Beat object with the same properties as the input DatabaseBeat.
 */
export const fromDatabaseBeat = (beat: DatabaseBeat): Beat => {
    return {
        id: beat.id,
        position: beat.position,
        duration: beat.duration,
        includeInMeasure: beat.include_in_measure >= 1,
        notes: beat.notes,
    };
};
