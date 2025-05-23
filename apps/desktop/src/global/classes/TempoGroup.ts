import { DatabaseBeat, NewBeatArgs } from "electron/database/tables/BeatTable";
import Measure, { createMeasures } from "./Measure";
import Beat, { createBeats, fromDatabaseBeat } from "./Beat";
import { GroupFunction } from "@/utilities/ApiFunctions";
import { conToastError } from "@/utilities/utils";
import { NewMeasureArgs } from "electron/database/tables/MeasureTable";

export type TempoGroup = Readonly<{
    /**
     * Denotes the first measure's rehearsal mark, or a default name if there is no rehearsal mark.
     *
     * These names are not unique.
     */
    name: string;
    /**
     * The starting tempo of the group in BPM.
     * This is always defined as we can always determine the initial tempo.
     */
    tempo: number;
    /**
     * If defined, the tempo changes over the course of the group.
     * The array contains the tempo for each beat in the group.
     */
    manualTempos?: number[];
    bigBeatsPerMeasure: number;
    /**
     * Index of the long beats in mixed meter groups.
     * "Long beats" are defined as the beats that are 1.5 times the duration of the short beats.
     *
     * For example, in 7/8 (2+2+3), the long beat indexes would be [2]. 7/8 (3+2+2) would be [0].
     *
     * In 10/8 (3+2+3+2), the long beat indexes would be [0, 2].
     * In 8/8 (3+3+2), the long beat indexes would be [0, 1].
     *
     * If the group is not a mixed meter, this is undefined.
     */
    longBeatIndexes?: number[];
    /**
     * The number of times the group is repeated.
     */
    numOfRepeats: number;
    /**
     * A string that describes the range of measures that the group spans.
     * This is used to identify the group in the UI.
     *
     * E.g. "m 1-4"
     */
    measureRangeString?: string;
}>;

const aboutEqual = (a: number, b: number, epsilon = 0.000001): boolean => {
    return Math.abs(a - b) < epsilon;
};

/**
 * Checks if all beats in a measure have the same duration.
 */
export const measureHasOneTempo = (measure: Measure) => {
    return measure.beats.every(
        (beat) => beat.duration === measure.beats[0].duration,
    );
};

const getTempoFromBeat = (beat: { duration: number }) => {
    return Math.round((60 / beat.duration) * 100) / 100;
};

const getStartAndEndTempos = (
    measure: Measure,
): { startTempo: number; endTempo?: number } => {
    const startTempo = getTempoFromBeat(measure.beats[0]);
    if (measureHasOneTempo(measure)) {
        return { startTempo };
    }
    const endTempo = getTempoFromBeat(measure.beats[measure.beats.length - 1]);
    return { startTempo, endTempo };
};

/**
 * Checks if a measure has the expected tempo(s).
 * Returns false if the measure has varying tempos within it or if the measure is empty.
 * If expectedEndTempo is undefined, only checks against expectedTempo.
 */
export const measureIsSameTempo = (
    measure: Measure,
    expectedTempo: number,
    expectedEndTempo: number | undefined,
) => {
    if (!measure.beats.length || !measureHasOneTempo(measure)) return false;

    const measureTempo = getTempoFromBeat(measure.beats[0]);
    return (
        measureTempo === expectedTempo &&
        (expectedEndTempo === undefined || measureTempo === expectedEndTempo)
    );
};

/**
 * Checks if a measure is a mixed meter.
 * A measure is considered mixed meter if it has two different beat durations that are in the ratio of 3:2.
 * This is a very common time signature for brass and percussion sections.
 */
export const measureIsMixedMeter = (measure: Measure) => {
    const durations = new Set<number>(
        measure.beats.map((beat) => beat.duration),
    );

    let output = false;
    if (durations.size === 2) {
        const shorterDuration = Math.min(...durations);
        const longerDuration = Math.max(...durations);
        const ratio = longerDuration / shorterDuration;
        output = aboutEqual(ratio, 1.5);
    }

    return output;
};

/**
 * Gets the indexes of long beats in a mixed meter measure.
 * Long beats are defined as beats that are 1.5 times the duration of short beats.
 * Returns an empty array if the measure is not a valid mixed meter.
 */
export const getLongBeatIndexes = (measure: Measure): number[] => {
    const durations = new Set<number>(
        measure.beats.map((beat) => beat.duration),
    );
    if (durations.size !== 2) {
        console.error("Measure is not a mixed meter", measure);
        return [];
    }
    const longBeatDuration = Math.max(...durations);

    const longBeatIndexes: number[] = [];
    for (let i = 0; i < measure.beats.length; i++) {
        if (measure.beats[i].duration === longBeatDuration)
            longBeatIndexes.push(i);
    }
    return longBeatIndexes;
};

export const TempoGroupsFromMeasures = (measures: Measure[]): TempoGroup[] => {
    if (!measures.length) return [];

    const groups: TempoGroup[] = [];
    let currentGroup: Measure[] = [measures[0]];
    const { startTempo: initialTempo, endTempo: initialEndTempo } =
        getStartAndEndTempos(measures[0]);
    let currentTempo = initialTempo;
    let currentEndTempo = initialEndTempo;
    let currentBeatsPerMeasure = measures[0].beats.length;
    let currentNumberOfRepeats = 1;

    for (let i = 1; i < measures.length; i++) {
        const measure = measures[i];
        const measureBeats = measure.beats.length;
        const { startTempo: measureTempo, endTempo: measureEndTempo } =
            getStartAndEndTempos(measure);

        const isSameTempo = measureIsSameTempo(
            measure,
            currentTempo,
            currentEndTempo,
        );
        // Create a new group if:
        // 1. The measure has a rehearsal mark
        // 2. The number of beats changes (time signature change)
        // 3. The tempo changes or varies within the measure
        if (
            measure.rehearsalMark ||
            measureBeats !== currentBeatsPerMeasure ||
            !isSameTempo
        ) {
            if (isSameTempo) {
                // Add the current group to groups
                groups.push({
                    name:
                        currentGroup[0].rehearsalMark ||
                        `Group ${groups.length + 1}`,
                    tempo: currentTempo,
                    ...(currentEndTempo && currentEndTempo !== currentTempo
                        ? { endTempo: currentEndTempo }
                        : {}),
                    bigBeatsPerMeasure: currentBeatsPerMeasure,
                    numOfRepeats: currentNumberOfRepeats, // Default to 1 repeat
                });
            } else {
                groups.push({
                    name:
                        currentGroup[0].rehearsalMark ||
                        `Group ${groups.length + 1}`,
                    tempo: currentTempo,
                    manualTempos: measureHasOneTempo(measures[i - 1])
                        ? undefined
                        : measures[i - 1].beats.map(getTempoFromBeat),
                    bigBeatsPerMeasure: currentBeatsPerMeasure,
                    numOfRepeats: currentNumberOfRepeats,
                });
            }

            // Start a new group
            currentGroup = [measure];
            currentTempo = measureTempo;
            currentEndTempo = measureEndTempo;
            currentBeatsPerMeasure = measureBeats;
        } else {
            currentGroup.push(measure);
            // Update end tempo if this measure has a different end tempo
            if (measureEndTempo && measureEndTempo !== currentEndTempo) {
                currentEndTempo = measureEndTempo;
            }
            currentNumberOfRepeats++;
        }
    }

    // Add the last group
    if (currentGroup.length > 0) {
        groups.push({
            name: currentGroup[0].rehearsalMark || `Group ${groups.length + 1}`,
            tempo: currentTempo,
            ...(currentEndTempo && currentEndTempo !== currentTempo
                ? { endTempo: currentEndTempo }
                : {}),
            bigBeatsPerMeasure: currentBeatsPerMeasure,
            numOfRepeats: 1,
        });
    }

    return groups;
};

/**
 * Creates new beats with duration based on the tempo.
 *
 * If the end tempo is provided and is different from the start tempo,
 * the beats will have a duration that changes linearly from the start tempo to right before.
 *
 * This is to match how tempo changes in music occur.
 * E.e. 4 beats for 120 -> 80:
 * [120, 110, 100, 90]
 * This sets up the next beat to be 80. If you disagree with this, lmk
 */
export const newBeatsFromTempoGroup = ({
    tempo,
    numRepeats,
    bigBeatsPerMeasure,
    endTempo,
}: {
    tempo: number;
    numRepeats: number;
    bigBeatsPerMeasure: number;
    endTempo?: number;
}): NewBeatArgs[] => {
    const beats: NewBeatArgs[] = [];
    if (!endTempo || endTempo === tempo) {
        const duration = 60 / tempo;
        for (let i = 0; i < numRepeats; i++) {
            for (let j = 0; j < bigBeatsPerMeasure; j++) {
                beats.push({
                    duration,
                    include_in_measure: 1 as 1 | 0,
                });
            }
        }
    } else {
        let currentTempo = tempo;
        const tempoDelta =
            (endTempo - tempo) / (bigBeatsPerMeasure * numRepeats);
        for (let i = 0; i < numRepeats; i++) {
            for (let j = 0; j < bigBeatsPerMeasure; j++) {
                beats.push({
                    duration: 60 / currentTempo,
                    include_in_measure: 1 as 1 | 0,
                });
                currentTempo += tempoDelta;
            }
        }
    }
    return beats;
};
/**
 * Converts database beats to Beat objects with calculated timestamps
 *
 * @param databaseBeats - The database beats to convert
 * @returns An array of Beat objects with calculated timestamps
 */
const convertDatabaseBeatsToBeats = (databaseBeats: DatabaseBeat[]): Beat[] => {
    let timeStamp = 0;
    return databaseBeats.map((dbBeat: DatabaseBeat, i: number) => {
        const newBeat = fromDatabaseBeat(dbBeat, i, timeStamp);
        timeStamp += dbBeat.duration;
        return newBeat;
    });
};

export const getNewMeasuresFromCreatedBeats = ({
    createdBeats,
    numOfRepeats,
    bigBeatsPerMeasure,
}: {
    createdBeats: Beat[];
    numOfRepeats: number;
    bigBeatsPerMeasure: number;
}): NewMeasureArgs[] => {
    const newMeasures: NewMeasureArgs[] = [];
    for (let i = 0; i < numOfRepeats; i++) {
        newMeasures.push({
            start_beat: createdBeats[i * bigBeatsPerMeasure].id,
        });
    }
    return newMeasures;
};

/**
 * Creates new beats and measures in the database from a tempo group
 */
export const createFromTempoGroup = async (
    tempoGroup: TempoGroup,
    refreshFunction: () => Promise<void>,
    endTempo?: number,
): Promise<{ success: boolean }> => {
    const beatsToCreate = newBeatsFromTempoGroup({
        tempo: tempoGroup.tempo,
        numRepeats: tempoGroup.numOfRepeats,
        bigBeatsPerMeasure: tempoGroup.bigBeatsPerMeasure,
        endTempo,
    });

    const createBeatsResponse = await GroupFunction({
        refreshFunction: () => {},
        functionsToExecute: [() => createBeats(beatsToCreate, async () => {})],
        useNextUndoGroup: true,
    });
    if (!createBeatsResponse.success) {
        conToastError("Error creating beats", createBeatsResponse);
        return { success: false };
    }
    try {
        // Step 3: Convert database beats to Beat objects
        const databaseBeats = (
            createBeatsResponse.responses[0] as {
                success: boolean;
                data: DatabaseBeat[];
            }
        ).data;
        const createdBeats = convertDatabaseBeatsToBeats(databaseBeats).sort(
            (a, b) => a.position - b.position,
        );

        const newMeasures = getNewMeasuresFromCreatedBeats({
            createdBeats,
            numOfRepeats: tempoGroup.numOfRepeats,
            bigBeatsPerMeasure: tempoGroup.bigBeatsPerMeasure,
        });
        const createMeasuresResponse = await createMeasures(
            newMeasures,
            refreshFunction,
        );
        if (!createMeasuresResponse.success) {
            throw new Error("Error creating measures");
        }

        return { success: true };
    } catch (error) {
        conToastError("Error creating new beats", error);
        window.electron.undo();
        return { success: false };
    }
};
