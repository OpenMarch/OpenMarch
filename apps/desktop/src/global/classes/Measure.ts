import {
    DatabaseMeasure,
    ModifiedMeasureArgs,
    NewMeasureArgs,
} from "electron/database/tables/MeasureTable";
import Beat, { beatsDuration, compareBeats, deleteBeats } from "./Beat";
import { DatabaseResponse } from "electron/database/DatabaseActions";
import { GroupFunction } from "@/utilities/ApiFunctions";
import { deletePages } from "./Page";

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
            timestamp: startBeat.timestamp,
        } satisfies Measure;
        return output;
    });
    return createdMeasures;
};

/**
 * Creates multiple measures in the database and optionally refreshes the measures data.
 * @param measures - An array of new measure arguments to be created.
 * @param fetchMeasuresFunction - A function to fetch updated measures after successful creation. This should update the stores
 * @returns A promise resolving to the database response containing created measures.
 */
export const createMeasures = async (
    measures: NewMeasureArgs[],
    fetchMeasuresFunction: () => Promise<void>,
): Promise<DatabaseResponse<DatabaseMeasure[]>> => {
    const response = await window.electron.createMeasures(measures);
    if (response.success) fetchMeasuresFunction();
    else console.error("Failed to create measures", response.error);
    return response;
};

/**
 * Updates multiple measures in the database and optionally refreshes the measures data.
 * @param measures - An array of measure modifications to be applied.
 * @param fetchMeasuresFunction - A function to fetch updated measures after successful update. This should update the stores
 * @returns A promise resolving to the database response containing updated measures.
 */
export const updateMeasures = async (
    measures: ModifiedMeasureArgs[],
    fetchMeasuresFunction: () => Promise<void>,
): Promise<DatabaseResponse<DatabaseMeasure[]>> => {
    const response = await window.electron.updateMeasures(measures);
    if (response.success) fetchMeasuresFunction();
    else console.error("Failed to update measures", response.error);
    return response;
};

/**
 * Deletes measures from the database by their IDs and optionally refreshes the measures list
 * @param measureIds Set of measure IDs to be deleted
 * @param fetchMeasuresFunction Optional callback function to refresh measures after deletion
 * @returns A promise resolving to the database response with the deleted measures
 */
export const deleteMeasures = async (
    measureIds: Set<number>,
    fetchMeasuresFunction: () => Promise<void>,
): Promise<DatabaseResponse<DatabaseMeasure[]>> => {
    const response = await window.electron.deleteMeasures(measureIds);
    if (response.success) fetchMeasuresFunction();
    else console.error("Failed to delete measures", response.error);
    return response;
};

/** Deletes all measures, beats, and pages associated with the measures */
export const cascadeDeleteMeasures = async (
    measures: Measure[],
    fetchMeasuresFunction: () => Promise<void>,
) => {
    const beatIdsToDelete = new Set(
        measures.flatMap((m) => m.beats.map((b) => b.id)),
    );
    const pages = await window.electron.getPages();
    if (!pages.success) {
        throw new Error("Failed to get pages");
    }
    const pageIdsToDelete = new Set(
        pages.data
            .filter((p) => beatIdsToDelete.has(p.start_beat))
            .map((p) => p.id),
    );

    const fakeFetch = async () => {};
    return GroupFunction({
        functionsToExecute: [
            () => deleteMeasures(new Set(measures.map((m) => m.id)), fakeFetch),
            () => deletePages(pageIdsToDelete, fakeFetch),
            () => deleteBeats(beatIdsToDelete, fakeFetch),
        ],
        refreshFunction: fetchMeasuresFunction,
        useNextUndoGroup: true,
    });
};
