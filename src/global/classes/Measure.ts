import { DatabaseMeasure } from "electron/database/tables/MeasureTable";
import Beat, { beatsDuration, compareBeats } from "./Beat";

interface Measure {
    /** ID of the measure in the database */
    readonly id: number;
    /** The beat this measure starts on */
    readonly startBeat: Beat;
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
    /** The timestamp of the first beat in the measure */
    readonly timestamp: number;
}

export default Measure;

/** A type that stores a beat with the index that it occurs in a list with all beats */
type BeatWithIndex = Beat & { index: number };

/**
 * Converts an array of `DatabaseMeasure` and `Beat` objects into an array of `Measure` objects.
 *
 * This function takes in the complete set of measures and beats from the database, sorts the beats,
 * and then groups the beats into individual measures based on the start beat ID stored in the
 * `DatabaseMeasure` objects.
 *
 * @param args An object containing the arrays of `DatabaseMeasure` and `Beat` objects.
 * @returns A sorted array of `Measure` objects representing the measures in the piece.
 */
export const fromDatabaseMeasures = (args: {
    databaseMeasures: DatabaseMeasure[];
    allBeats: Beat[];
}): Measure[] => {
    const sortedBeats = args.allBeats.sort(compareBeats);
    let currentMeasureNumber = 1;
    const beatMap = new Map<number, BeatWithIndex>(
        sortedBeats.map((beat, i) => [beat.id, { ...beat, index: i }]),
    );
    const sortedDbMeasures = args.databaseMeasures.sort((a, b) => {
        const aBeat = beatMap.get(a.start_beat);
        const bBeat = beatMap.get(b.start_beat);
        if (!aBeat || !bBeat) {
            console.log("aBeat", a.start_beat, aBeat);
            console.log("bBeat", b.start_beat, bBeat);
            throw new Error(
                `Beat not found: ${a.start_beat} ${aBeat} - ${b.start_beat} ${bBeat}`,
            );
        }
        return aBeat.position - bBeat.position;
    });
    let timestamp = 0;
    const createdMeasures = sortedDbMeasures.map((measure, i) => {
        const startBeat = beatMap.get(measure.start_beat);
        if (!startBeat) {
            throw new Error(`Beat not found: ${measure.start_beat}`);
        }
        const nextMeasure = sortedDbMeasures[i + 1] || null;
        const nextBeat = nextMeasure
            ? beatMap.get(nextMeasure.start_beat)
            : null;
        if (!nextBeat && nextMeasure) {
            throw new Error(`Beat not found: ${nextMeasure.start_beat}`);
        }
        const beats = nextBeat
            ? sortedBeats.slice(startBeat.index, nextBeat.index)
            : sortedBeats.slice(startBeat.index);
        const output = {
            ...measure,
            startBeat: startBeat,
            beats,
            number: currentMeasureNumber++,
            rehearsalMark: measure.rehearsal_mark,
            duration: beatsDuration(beats),
            counts: beats.length,
            timestamp,
        } satisfies Measure;
        timestamp += output.duration;
        return output;
    });
    return createdMeasures;
};
