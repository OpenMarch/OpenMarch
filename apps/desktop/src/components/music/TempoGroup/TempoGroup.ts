import Measure from "../../../global/classes/Measure";
import Beat, {
    durationToTempo,
    fromDatabaseBeat,
} from "../../../global/classes/Beat";
import type { NewMeasureArgs } from "@/global/classes/Measure";
import { toast } from "sonner";
import tolgee from "@/global/singletons/Tolgee";
import {
    createBeatsInTransaction,
    createMeasuresInTransaction,
    DatabaseBeat,
    DbTransaction,
    ModifiedBeatArgs,
    NewBeatArgs,
    transactionWithHistory,
    updateBeatsInTransaction,
    updateMeasuresInTransaction,
} from "@/db-functions";
import { db } from "@/global/database/db";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { measureKeys } from "@/hooks/queries/useMeasures";
import { beatKeys } from "@/hooks/queries";
import { conToastError } from "@/utilities/utils";
import { WorkspaceSettings } from "@/settings/workspaceSettings";

export type TempoGroup = {
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
    strongBeatIndexes?: number[];
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
    /**
     * The measures in this group.
     */
    measures?: Measure[];
};

const aboutEqual = (a: number, b: number, epsilon = 0.00001): boolean => {
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

/**
 * Checks if two measures have the same tempo.
 * Returns false if either measure has varying tempos within it or if either measure is empty.
 */
export const measureIsSameTempo = (measure1: Measure, measure2: Measure) => {
    if (!measure1.beats.length || !measure2.beats.length) return false;
    if (measureHasOneTempo(measure1) && measureHasOneTempo(measure2)) {
        const measure1Tempo = getTempoFromBeat(measure1.beats[0]);
        const measure2Tempo = getTempoFromBeat(measure2.beats[0]);
        return aboutEqual(measure1Tempo, measure2Tempo);
    } else if (measureIsMixedMeter(measure1) && measureIsMixedMeter(measure2)) {
        const {
            shortestDuration: measure1ShortestDuration,
            longestDuration: measure1LongestDuration,
        } = getShortestAndLongestDurations(measure1);
        const {
            shortestDuration: measure2ShortestDuration,
            longestDuration: measure2LongestDuration,
        } = getShortestAndLongestDurations(measure2);
        const measure1StrongBeatIndexes = getStrongBeatIndexes(measure1);
        const measure2StrongBeatIndexes = getStrongBeatIndexes(measure2);
        return (
            aboutEqual(measure1ShortestDuration, measure2ShortestDuration) &&
            aboutEqual(measure1LongestDuration, measure2LongestDuration) &&
            measure1StrongBeatIndexes.length ===
                measure2StrongBeatIndexes.length &&
            measure1StrongBeatIndexes.every(
                (index, i) => index === measure2StrongBeatIndexes[i],
            )
        );
    }
    return false;
};

const getShortestAndLongestDurations = (measure: Measure) => {
    const durations = new Set<number>(
        measure.beats.map((beat) => beat.duration),
    );
    return {
        shortestDuration: Math.min(...durations),
        longestDuration: Math.max(...durations),
    };
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
        const { shortestDuration, longestDuration } =
            getShortestAndLongestDurations(measure);
        const ratio = longestDuration / shortestDuration;
        output = aboutEqual(ratio, 1.5);
    }

    return output;
};

const measureRangeString = (startMeasure: Measure, endMeasure?: Measure) => {
    if (!endMeasure || startMeasure.number === endMeasure.number) {
        return `m ${startMeasure.number}`;
    }
    return `m ${startMeasure.number}-${endMeasure.number}`;
};

/**
 * Gets the indexes of long beats in a mixed meter measure.
 * Long beats are defined as beats that are 1.5 times the duration of short beats.
 * Returns an empty array if the measure is not a valid mixed meter.
 */
export const getStrongBeatIndexes = (measure: Measure): number[] => {
    const durations = new Set<number>(
        measure.beats.map((beat) => beat.duration),
    );
    if (durations.size !== 2) {
        console.error("Measure is not a mixed meter", measure);
        return [];
    }
    const strongBeatDuration = Math.max(...durations);

    const strongBeatIndexes: number[] = [];
    for (let i = 0; i < measure.beats.length; i++) {
        if (measure.beats[i].duration === strongBeatDuration)
            strongBeatIndexes.push(i);
    }
    return strongBeatIndexes;
};

const getMeasureTempo = (measure: Measure) => {
    let output: number;
    if (measure.beats.length === 0) {
        console.debug("Measure has no beats");
        return -1;
    }

    // When mixed meter always return the tempo of the shortest beat. Otherwise, return the tempo of the first beat.
    if (measureIsMixedMeter(measure)) {
        const { shortestDuration } = getShortestAndLongestDurations(measure);
        return durationToTempo(shortestDuration);
    } else {
        output = durationToTempo(measure.beats[0].duration);
    }
    return output;
};

export const TempoGroupsFromMeasures = (measures: Measure[]): TempoGroup[] => {
    if (!measures.length) return [];

    const groups: TempoGroup[] = [];
    let currentGroup: Measure[] = [measures[0]];

    const initialTempo = getMeasureTempo(measures[0]);
    let currentTempo = initialTempo;
    let currentBeatsPerMeasure = measures[0].beats.length;
    let currentNumberOfRepeats = 1;

    for (let i = 1; i < measures.length; i++) {
        const measure = measures[i];
        const measureBeats = measure.beats.length;
        const measureTempo = getMeasureTempo(measure);

        const isSameTempo = measureIsSameTempo(measure, measures[i - 1]);
        // Create a new group if:
        // 1. The measure has a rehearsal mark
        // 2. The number of beats changes (time signature change)
        // 3. The tempo changes or varies within the measure

        // Add the current group to groups
        if (
            measure.rehearsalMark ||
            measureBeats !== currentBeatsPerMeasure ||
            !isSameTempo
        ) {
            const name = currentGroup[0].rehearsalMark || "";
            const mString = measureRangeString(
                currentGroup[0],
                currentGroup[currentGroup.length - 1],
            );
            // new group because of tempo change
            groups.push({
                name,
                tempo: currentTempo,
                bigBeatsPerMeasure: currentBeatsPerMeasure,
                numOfRepeats: currentNumberOfRepeats, // Default to 1 repeat
                measureRangeString: mString,
                strongBeatIndexes: measureIsMixedMeter(currentGroup[0])
                    ? getStrongBeatIndexes(currentGroup[0])
                    : undefined,
                measures: currentGroup,
            });

            if (
                !measureHasOneTempo(measures[i - 1]) &&
                !measureIsMixedMeter(measures[i - 1])
            )
                groups[groups.length - 1].manualTempos =
                    measures[i - 1].beats.map(getTempoFromBeat);

            // Start a new group
            currentGroup = [measure];
            currentTempo = measureTempo;
            currentBeatsPerMeasure = measureBeats;
            currentNumberOfRepeats = 1;
        } else {
            currentGroup.push(measure);
            currentNumberOfRepeats++;
        }
    }

    // Add the last group
    if (currentGroup.length > 0) {
        groups.push({
            name: currentGroup[0].rehearsalMark || "",
            tempo: currentTempo,
            bigBeatsPerMeasure: currentBeatsPerMeasure,
            numOfRepeats: currentNumberOfRepeats,
            strongBeatIndexes: measureIsMixedMeter(currentGroup[0])
                ? getStrongBeatIndexes(currentGroup[0])
                : undefined,
            measureRangeString: measureRangeString(
                currentGroup[0],
                currentGroup[currentGroup.length - 1],
            ),
            measures: currentGroup,
        });

        if (
            !measureHasOneTempo(measures[measures.length - 1]) &&
            !measureIsMixedMeter(measures[measures.length - 1])
        )
            groups[groups.length - 1].manualTempos =
                measures[measures.length - 1].beats.map(getTempoFromBeat);
    }

    return groups;
};

export const splitPatternString = (pattern: string): number[] => {
    return pattern.split(",").map(Number);
};

export const getStrongBeatIndexesFromPattern = (pattern: string): number[] => {
    const patternList = splitPatternString(pattern);
    return patternList
        .map((val, index) => (val === 3 ? index : undefined))
        .filter((index): index is number => index !== undefined)
        .sort((a, b) => a - b);
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
    strongBeatIndexes,
    endTempo,
}: {
    tempo: number;
    numRepeats: number;
    bigBeatsPerMeasure: number;
    strongBeatIndexes?: number[];
    endTempo?: number;
}): NewBeatArgs[] => {
    const beats: NewBeatArgs[] = [];
    if (!endTempo || endTempo === tempo) {
        const duration = 60 / tempo;
        const strongBeatDuration = duration * 1.5;
        for (let i = 0; i < numRepeats; i++) {
            for (let j = 0; j < bigBeatsPerMeasure; j++) {
                const beatDuration = strongBeatIndexes?.includes(j)
                    ? strongBeatDuration
                    : duration;
                beats.push({
                    duration: beatDuration,
                    include_in_measure: true,
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
                    include_in_measure: true,
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
    rehearsalMark,
}: {
    createdBeats: Beat[];
    numOfRepeats: number;
    bigBeatsPerMeasure: number;
    rehearsalMark?: string;
}): NewMeasureArgs[] => {
    const newMeasures: NewMeasureArgs[] = [];
    if (rehearsalMark?.trim() === "") rehearsalMark = undefined;
    for (let i = 0; i < numOfRepeats; i++) {
        newMeasures.push({
            start_beat: createdBeats[i * bigBeatsPerMeasure].id,
            rehearsal_mark: i === 0 ? rehearsalMark : undefined,
        });
    }
    return newMeasures;
};

/**
 * Generic custom hook for tempo group mutations
 * Handles common success/error patterns and query invalidation
 */
const useTempoGroupMutation = <TArgs>(
    mutationFn: (args: TArgs) => Promise<void>,
    errorKey: string,
    successKey?: string,
    callback?: () => void,
) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: async () => {
            if (successKey) toast.success(tolgee.t(successKey));
        },
        onSettled: () => {
            // Invalidate all relevant queries
            // BEATS MUST BE INVALIDATED FIRST - if not, the measures will be incorrect
            void queryClient
                .invalidateQueries({
                    queryKey: beatKeys.all(),
                })
                .then(() => {
                    void queryClient.invalidateQueries({
                        queryKey: measureKeys.all(),
                    });
                });
            if (callback) callback();
        },
        onError: (error) => {
            conToastError(tolgee.t(errorKey), error);
        },
    });
};

export const useCreateFromTempoGroup = (callback?: () => void) => {
    return useTempoGroupMutation(
        _createFromTempoGroup,
        "tempoGroup.createNewBeatsError",
        "music.tempoGroupCreated",
        callback,
    );
};

/**
 * Creates new beats and measures in the database from a tempo group
 */
export const _createFromTempoGroup = async ({
    tempoGroup,
    endTempo,
    startingPosition,
}: {
    tempoGroup: TempoGroup;
    endTempo?: number;
    startingPosition?: number;
}) => {
    await transactionWithHistory(db, "createFromTempoGroup", async (tx) => {
        await _createFromTempoGroupInTransaction({
            tx,
            tempoGroup,
            endTempo,
            startingPosition,
        });
    });
};

export const _createFromTempoGroupInTransaction = async ({
    tx,
    tempoGroup,
    endTempo,
    startingPosition,
}: {
    tx: DbTransaction;
    tempoGroup: TempoGroup;
    endTempo?: number;
    startingPosition?: number;
}) => {
    const beatsToCreate = newBeatsFromTempoGroup({
        tempo: tempoGroup.tempo,
        numRepeats: tempoGroup.numOfRepeats,
        bigBeatsPerMeasure: tempoGroup.bigBeatsPerMeasure,
        endTempo,
        strongBeatIndexes: tempoGroup.strongBeatIndexes,
    });
    const createBeatsResponse = await createBeatsInTransaction({
        tx,
        newBeats: beatsToCreate,
        startingPosition,
    });

    const databaseBeats = createBeatsResponse;
    const createdBeats = convertDatabaseBeatsToBeats(databaseBeats).sort(
        (a, b) => a.position - b.position,
    );

    const newMeasures = getNewMeasuresFromCreatedBeats({
        createdBeats,
        numOfRepeats: tempoGroup.numOfRepeats,
        bigBeatsPerMeasure: tempoGroup.bigBeatsPerMeasure,
        rehearsalMark: tempoGroup.name,
    });

    const createdMeasures = await createMeasuresInTransaction({
        tx,
        newItems: newMeasures,
    });

    return { createdBeats, createdMeasures };
};

export const useUpdateTempoGroup = () => {
    return useTempoGroupMutation(
        _updateTempoGroup,
        "tempoGroup.errorUpdatingTempoGroup",
        "music.tempoGroupUpdated",
    );
};

export const _updateTempoGroup = async ({
    tempoGroup,
    newTempo,
    newName,
    newStrongBeatIndexes,
}: {
    tempoGroup: TempoGroup;
    newTempo: number;
    newName: string;
    newStrongBeatIndexes?: number[];
}) => {
    if (!tempoGroup.measures || !tempoGroup.measures.length) {
        throw new Error("Tempo group has no measures");
    }

    const oldBeats = tempoGroup.measures?.flatMap((measure) => measure.beats);

    const newBeats = newBeatsFromTempoGroup({
        tempo: newTempo,
        numRepeats: tempoGroup.numOfRepeats,
        bigBeatsPerMeasure: tempoGroup.bigBeatsPerMeasure,
        strongBeatIndexes: newStrongBeatIndexes,
    });

    if (oldBeats.length !== newBeats.length) {
        throw new Error(
            "Tempo group has different number of beats. This should not happen. Please reach out to us!",
        );
    }

    const updatedBeats: ModifiedBeatArgs[] = [];
    for (let i = 0; i < oldBeats.length; i++) {
        updatedBeats.push({
            id: oldBeats[i].id,
            duration: newBeats[i].duration,
        });
    }

    await transactionWithHistory(db, "updateTempoGroup", async (tx) => {
        await updateBeatsInTransaction({
            tx,
            modifiedBeats: updatedBeats,
        });

        if (
            tempoGroup.measures &&
            newName !== tempoGroup.measures[0].rehearsalMark
        ) {
            await updateMeasuresInTransaction({
                tx,
                modifiedItems: [
                    {
                        id: tempoGroup.measures![0].id,
                        rehearsal_mark: newName.trim() === "" ? null : newName,
                    },
                ],
            });
        }
    });
};

export const useUpdateManualTempos = () => {
    return useTempoGroupMutation(
        _updateManualTempos,
        "tempoGroup.differentBeatsError",
        "music.tempoGroupUpdated",
    );
};

export const _updateManualTempos = async ({
    tempoGroup,
    newManualTempos,
}: {
    tempoGroup: TempoGroup;
    newManualTempos: number[];
}) => {
    const oldBeats = tempoGroup.measures?.flatMap((measure) => measure.beats);
    if (!oldBeats || oldBeats.length !== newManualTempos.length) {
        throw new Error(
            "Tempo group has different number of beats. This should not happen.",
        );
    }

    const updatedBeats: ModifiedBeatArgs[] = [];
    for (let i = 0; i < oldBeats.length; i++) {
        updatedBeats.push({
            id: oldBeats[i].id,
            duration: 60 / newManualTempos[i],
        });
    }

    transactionWithHistory(db, "updateManualTempos", async (tx) => {
        await updateBeatsInTransaction({
            tx,
            modifiedBeats: updatedBeats,
        });
    });
};

/**
 * Gets the last beat of a tempo group.
 * @param tempoGroup - The tempo group to get the last beat of.
 * @returns The last beat of the tempo group.
 */
export const getLastBeatOfTempoGroup = (
    tempoGroup: TempoGroup,
): Beat | undefined => {
    if (!tempoGroup.measures || !tempoGroup.measures.length) {
        return undefined;
    }
    return tempoGroup.measures[tempoGroup.measures.length - 1].beats[
        tempoGroup.measures[tempoGroup.measures.length - 1].beats.length - 1
    ];
};

export const isMixedMeterTempoGroup = (tempoGroup: TempoGroup) => {
    return (
        tempoGroup.strongBeatIndexes && tempoGroup.strongBeatIndexes.length > 0
    );
};

/**
 * Gets the real big beats per measure of a tempo group.
 * This is the number of beats per measure that is used to calculate the beats per measure.
 *
 * For mixed meter tempo groups, this is the number of strong beats plus the number of big beats per measure times 2.
 * For non-mixed meter tempo groups, this is the number of big beats per measure.
 *
 * @param tempoGroup - The tempo group to get the real big beats per measure of.
 * @returns The real big beats per measure of the tempo group.
 */
export const getRealBigBeatsPerMeasure = (tempoGroup: TempoGroup) => {
    return isMixedMeterTempoGroup(tempoGroup)
        ? (tempoGroup.strongBeatIndexes?.length ?? 0) +
              tempoGroup.bigBeatsPerMeasure * 2
        : tempoGroup.bigBeatsPerMeasure;
};

export const patternStringToLongBeatIndexes = (pattern: string) => {
    const splitString = pattern.includes("+") ? "+" : ",";
    return pattern
        .split(splitString)
        .map((val, index) => (val === "3" ? index : undefined))
        .filter((index): index is number => index !== undefined)
        .sort((a, b) => a - b);
};

/**
 * Creates a new tempo group from the workspace settings.
 * @param workspaceSettings - The workspace settings to create the tempo group from.
 * @param name - The name of the tempo group.
 * @returns The new tempo group.
 */
export const tempoGroupFromWorkspaceSettings = (
    workspaceSettings: Pick<
        WorkspaceSettings,
        "defaultTempo" | "defaultBeatsPerMeasure" | "defaultNewPageCounts"
    >,
    name = "",
): TempoGroup => {
    return {
        name,
        tempo: workspaceSettings.defaultTempo,
        bigBeatsPerMeasure: workspaceSettings.defaultBeatsPerMeasure,
        numOfRepeats: Math.ceil(
            workspaceSettings.defaultNewPageCounts /
                workspaceSettings.defaultBeatsPerMeasure,
        ),
    };
};
