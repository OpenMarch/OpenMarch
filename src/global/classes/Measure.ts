import { DatabaseMeasure } from "electron/database/tables/MeasureTable";
import Beat, { compareBeats, beatsDuration } from "./Beat";

export default interface Measure {
    /** ID of the measure in the database */
    readonly id: number;
    /** The foreign key to the start beat of the measure */
    readonly startBeatId: number;
    /** The measure's number in the piece */
    readonly number: number;
    /** Optional rehearsal mark for the measure */
    readonly rehearsalMark: string | null;
    /** Human readable notes about the measure */
    readonly notes: string | null;
    /** The duration of the measure in seconds */
    readonly duration: number;
    /** The number of counts (or beats) in this measure */
    readonly counts: number;
    /** The beats that belong to this measure */
    readonly beats: Beat[];
}

/**
 * Converts an array of `DatabaseMeasure` and `Beat` objects into an array of `Measure` objects.
 *
 * This function takes in the complete set of measures and beats from the database, sorts the beats,
 * and then groups the beats into individual measures based on the start beat ID stored in the
 * `DatabaseMeasure` objects.
 *
 * @param args An object containing the arrays of `DatabaseMeasure` and `Beat` objects.
 * @returns An array of `Measure` objects representing the measures in the piece.
 */
export const fromDatabaseMeasures = (args: {
    allMeasures: DatabaseMeasure[];
    allBeats: Beat[];
}): Measure[] => {
    const createdMeasures: Measure[] = [];
    const sortedBeats = args.allBeats.sort(compareBeats);
    let currentMeasureNumber = 1;
    /** A map with starting beat ID as key and the database measure as value */
    const beatMeasureMap = new Map<number, DatabaseMeasure>(
        args.allMeasures.map((measure) => {
            return [measure.start_beat, measure];
        }),
    );

    let currentBeats: Beat[] = [];
    let currentMeasure: DatabaseMeasure | null = null;
    for (const beat of sortedBeats) {
        // Get the measure that starts with this beat, if it exists
        const measureWithThisStartingBeat = beatMeasureMap.get(beat.id);
        if (measureWithThisStartingBeat) {
            // If the beat is the start of a new measure, add the previous measure to the list and start a new one
            if (currentMeasure) {
                createdMeasures.push({
                    id: currentMeasure.id,
                    startBeatId: currentMeasure.start_beat,
                    number: currentMeasureNumber,
                    rehearsalMark: currentMeasure.rehearsal_mark,
                    notes: currentMeasure.notes,
                    duration: beatsDuration(currentBeats),
                    counts: currentBeats.length,
                    beats: currentBeats,
                });
            }
            currentMeasure = measureWithThisStartingBeat;
        }

        currentBeats.push(beat);
    }
    return createdMeasures;
};
