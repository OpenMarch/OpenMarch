import Beat, {
    createBeats,
    deleteBeats,
    fromDatabaseBeat,
} from "@/global/classes/Beat";
import Measure, {
    createMeasures,
    deleteMeasures,
} from "@/global/classes/Measure";
import Page, { updatePages } from "@/global/classes/Page";
import { GroupFunction } from "@/utilities/ApiFunctions";
import { conToastError } from "@/utilities/utils";
import {
    DatabaseBeat,
    ModifiedBeatArgs,
    NewBeatArgs,
} from "electron/database/tables/BeatTable";
import type { NewMeasureArgs } from "electron/database/tables/MeasureTable";
import type { ModifiedPageArgs } from "electron/database/tables/PageTable";

/**
 * Creates new temporary beats by subdividing the time between the last existing beat and the current time.
 *
 * @param currentTime The current timestamp where a new beat will be created
 * @param totalDuration The total duration of the audio
 * @param existingTemporaryBeats Array of existing temporary beats
 * @param numNewBeats Number of beats to create between the last beat and current time
 * @returns An object containing updated beats and a flag indicating whether the display should be updated
 */
export const createNewTemporaryBeats = ({
    currentTime,
    totalDuration,
    existingTemporaryBeats,
    numNewBeats,
}: {
    currentTime: number;
    totalDuration: number;
    existingTemporaryBeats: Beat[];
    numNewBeats: number;
}): Beat[] => {
    // If no existing beats, we can't update anything
    if (existingTemporaryBeats.length === 0) {
        return [];
    }

    if (numNewBeats <= 0) {
        console.warn(
            "createNewTemporaryBeats: numNewBeats must be greater than 0",
        );
        return [];
    }

    // Create an array of new beats with the last beat as the first beat
    const lastBeat = existingTemporaryBeats[existingTemporaryBeats.length - 1];
    const newDuration = currentTime - lastBeat.timestamp;

    // If the new duration is less than or equal to 0.05 seconds, don't create any new beats
    // This is to prevent overload
    const durationToUse = newDuration / numNewBeats;
    if (durationToUse <= 0.05) {
        return [];
    }

    const newBeats: Beat[] = existingTemporaryBeats.slice(0, -1);

    let curId = lastBeat.id;
    for (let i = 0; i < numNewBeats; i++) {
        // Update the previous beat's duration
        newBeats.push({
            ...lastBeat,
            duration: durationToUse,
            // This is not always unique
            id: curId--,
            timestamp: lastBeat.timestamp + durationToUse * i,
        });
    }

    // Calculate remaining duration for the new beat
    const tempDuration = totalDuration - currentTime;

    // Create a new temporary beat at the current timestamp
    newBeats.push({
        id: curId--, // xwNegative ID to indicate temporary
        position: existingTemporaryBeats.length,
        duration: tempDuration,
        includeInMeasure: true,
        notes: null,
        index: existingTemporaryBeats.length,
        timestamp: currentTime,
    });

    return newBeats;
};

/**
 * Creates new temporary measures based on the current beats and measures.
 *
 * @param currentBeats - The existing beats in the timeline
 * @param currentMeasures - The existing measures in the timeline
 * @param newCounts - The number of counts for the new measure
 * @returns An array of measures with the new temporary measure appended
 */
export const createNewTemporaryMeasures = ({
    currentBeats,
    currentMeasures,
    newCounts,
    currentTime,
}: {
    currentBeats: Beat[];
    currentMeasures: Measure[];
    newCounts: number;
    currentTime: number;
}): Measure[] => {
    const lastMeasure = currentMeasures.length
        ? currentMeasures[currentMeasures.length - 1]
        : undefined;
    const newMeasure = {
        id: lastMeasure ? lastMeasure.id - 1 : -1,
        startBeat: currentBeats[currentBeats.length - newCounts],
        number: lastMeasure ? lastMeasure.number + 1 : 1,
        rehearsalMark: null,
        notes: null,
        duration: lastMeasure
            ? currentTime - lastMeasure.timestamp
            : currentTime, // We don't really need to know the duration
        counts: newCounts,
        beats: [], // Don't need to know the beats
        timestamp: currentTime, // Don't need to know the timestamp
    } satisfies Measure;

    return [...currentMeasures, newMeasure];
};

/**
 * Finds the closest unused beat to a given timestamp from a list of beats.
 *
 * @param timestamp - The reference timestamp to find the closest beat
 * @param beats - The array of beats to search through
 * @param usedBeatIds - A set of beat IDs that have already been used
 * @returns The closest unused beat, or null if no beats are available
 */
export const findClosestUnusedBeatByTimestamp = (
    timestamp: number,
    beats: Beat[],
    usedBeatIds: Set<number>,
): Beat | null => {
    if (beats.length === 0) return null;

    const availableBeats = beats.filter((beat) => !usedBeatIds.has(beat.id));
    if (availableBeats.length === 0) return null;

    return availableBeats.reduce((closest, current) => {
        const currentDiff = Math.abs(current.timestamp - timestamp);
        const closestDiff = Math.abs(closest.timestamp - timestamp);
        return currentDiff < closestDiff ? current : closest;
    });
};

/**
 * Generates updated beat objects by matching existing beats with the closest new beats.
 *
 * @param oldBeats - The original set of beats
 * @param newBeats - The new set of beats to match against
 * @param beatIdsWithPages - Set of beat IDs associated with pages
 * @returns An object containing an array of modified beat arguments and a set of new beat IDs used
 */
export const getUpdatedBeatObjects = (
    oldBeats: Beat[],
    newBeats: Beat[],
    beatIdsWithPages: Set<number>,
): { beatsToUpdate: ModifiedBeatArgs[]; newBeatIdsUsed: Set<number> } => {
    const usedBeatIds = new Set<number>();
    const oldBeatsMap = new Map(oldBeats.map((beat) => [beat.id, beat]));
    const output: ModifiedBeatArgs[] = [];
    const newBeatIdsUsed = new Set<number>();
    for (const oldBeatId of beatIdsWithPages) {
        const oldBeat = oldBeatsMap.get(oldBeatId);
        if (!oldBeat) {
            console.error(
                "getUpdatedBeatObjects: Old beat not found",
                oldBeatId,
            );
            return { beatsToUpdate: [], newBeatIdsUsed: new Set() };
        }
        const closestNewBeat = findClosestUnusedBeatByTimestamp(
            oldBeat.timestamp,
            newBeats,
            usedBeatIds,
        );
        // If we can't find a closest beat, we can't update anything
        // All pages must have a beat that can be assigned to them
        if (!closestNewBeat) {
            console.error(
                "getUpdatedBeatObjects: No closest beat found for beat",
                oldBeatId,
            );
            return { beatsToUpdate: [], newBeatIdsUsed: new Set() };
        }
        usedBeatIds.add(closestNewBeat.id);
        newBeatIdsUsed.add(closestNewBeat.id);
        output.push({ duration: closestNewBeat.duration, id: oldBeatId });
    }
    return { beatsToUpdate: output, newBeatIdsUsed };
};

/**
 * Prepares beat objects for database creation
 *
 * @param beats - The beats to prepare for creation
 * @returns An array of objects with the necessary properties for creating beats in the database
 */
export const prepareBeatsForCreation = (beats: Beat[]): NewBeatArgs[] => {
    const output: NewBeatArgs[] = [];
    for (const beat of beats) {
        if (beat.duration > 0)
            output.push({
                duration: beat.duration,
                include_in_measure: 1 as 0 | 1,
            });
    }
    return output;
};

/**
 * Converts database beats to Beat objects with calculated timestamps
 *
 * @param databaseBeats - The database beats to convert
 * @returns An array of Beat objects with calculated timestamps
 */
export const convertDatabaseBeatsToBeats = (
    databaseBeats: DatabaseBeat[],
): Beat[] => {
    let timeStamp = 0;
    return databaseBeats.map((dbBeat: DatabaseBeat, i: number) => {
        const newBeat = fromDatabaseBeat(dbBeat, i, timeStamp);
        timeStamp += dbBeat.duration;
        return newBeat;
    });
};

/**
 * Prepares page updates based on old beats and newly created beats
 *
 * @param pages - The pages to update
 * @param oldBeats - The existing beats being replaced
 * @param createdBeats - The newly created beats
 * @returns An object containing the pages to update and the set of used beat IDs
 */
export const preparePageUpdates = (
    pages: Page[],
    oldBeats: Beat[],
    createdBeats: Beat[],
): { pagesToUpdate: ModifiedPageArgs[]; usedBeatIds: Set<number> } => {
    const oldBeatsMap = new Map(oldBeats.map((beat) => [beat.id, beat]));
    const pagesToUpdate: ModifiedPageArgs[] = [];
    const usedBeatIds = new Set<number>();

    for (const page of pages) {
        if (page.beats.length === 0) continue;

        const oldBeat = oldBeatsMap.get(page.beats[0].id);
        if (!oldBeat) {
            throw new Error(
                `Could not find beat with id ${page.beats[0].id} in old beats`,
            );
        }

        const closestNewBeat = findClosestUnusedBeatByTimestamp(
            page.timestamp,
            createdBeats,
            usedBeatIds,
        );

        if (!closestNewBeat) {
            throw new Error("No unused beat found");
        }

        pagesToUpdate.push({
            id: page.id,
            start_beat: closestNewBeat.id,
        });

        usedBeatIds.add(closestNewBeat.id);
    }

    return { pagesToUpdate, usedBeatIds };
};

/**
 * Prepares measure updates based on old and new measures and beats
 *
 * @param newMeasures - The new measures to create
 * @param newBeats - The temporary beats used to create the measures
 * @param createdBeats - The newly created beats in the database
 * @returns An array of new measure arguments for database creation
 */
export const prepareMeasuresForCreation = (
    newMeasures: Measure[],
    newBeats: Beat[],
    createdBeats: Beat[],
): NewMeasureArgs[] => {
    const measuresToCreate: NewMeasureArgs[] = [];

    for (const measure of newMeasures) {
        // Get the index of the beat in the new beats array
        const beatIndex =
            newBeats.findIndex((b) => b.id === measure.startBeat.id) - 2; // Not sure why -2 is needed but it is

        if (beatIndex === -1) {
            throw new Error(
                `Could not find beat with id ${measure.startBeat.id} in new beats`,
            );
        }

        // Using the index of beat from the newBeats array, find the actual created beat in the createdBeats array
        measuresToCreate.push({
            start_beat: createdBeats[beatIndex].id,
        });
    }

    return measuresToCreate;
};

/**
 * Performs database operations to update pages, create measures, and delete old data
 *
 * @param pagesToUpdate - The pages to update
 * @param measuresToCreate - The measures to create
 * @param oldMeasures - The old measures to delete
 * @param oldBeats - The old beats to delete
 * @param refreshFunction - Function to refresh the UI after updates
 * @returns A promise resolving to the result of the database operations
 */
export const performDatabaseOperations = async (
    pagesToUpdate: ModifiedPageArgs[],
    measuresToCreate: NewMeasureArgs[],
    oldMeasures: Measure[],
    oldBeats: Beat[],
    refreshFunction: () => Promise<void>,
): Promise<{ success: boolean }> => {
    const measureIdsToDelete = new Set(
        oldMeasures.map((measure) => measure.id),
    );
    const beatIdsToDelete = new Set(oldBeats.map((beat) => beat.id));

    const result = await GroupFunction({
        functionsToExecute: [
            () => updatePages(pagesToUpdate, async () => {}),
            () => createMeasures(measuresToCreate, async () => {}),
            () => deleteMeasures(measureIdsToDelete, async () => {}),
            () => deleteBeats(beatIdsToDelete, async () => {}),
        ],
        useNextUndoGroup: false,
    });

    if (result.success) {
        refreshFunction();
    }

    return result;
};

/**
 * Creates new beats for a tempo change
 *
 * @param beats - The beats to update
 * @param timestamp - The timestamp to start the new beats
 * @param tempo - The tempo to set the new beats to
 * @param audioDuration - The duration of the audio
 * @returns An object containing the new beats and the beats to delete
 */
export const createNewBeatsForTempoChange = ({
    beats,
    timestamp = 0,
    tempo,
    audioDuration,
}: {
    beats: Beat[];
    measures: Measure[];
    pages: Page[];
    timestamp?: number;
    tempo: number;
    audioDuration: number;
}): { newBeats: Beat[]; beatsToDelete: Beat[] } => {
    const beatsToDelete = beats.filter((beat) => beat.timestamp > timestamp);

    const newBeats: Beat[] = [];
    const duration = 60 / tempo;
    let curTimestamp = timestamp;
    let curId = -1;

    while (curTimestamp < audioDuration) {
        newBeats.push({
            duration,
            includeInMeasure: true,
            notes: null,
            index: 0,
            timestamp: curTimestamp,
            id: curId--,
            position: 0,
        });
        curTimestamp += duration;
    }

    return { newBeats, beatsToDelete };
};

// export const createNewBeatObjects = async ({
//     newBeats,
//     beatsToDelete,
//     pages,
//     measures,
// }: {
//     newBeats: Beat[];
//     beatsToDelete: Beat[];
//     pages: Page[];
//     measures: Measure[];
// }): Promise<{ success: boolean }> => {
//     // Step 1: Prepare beats for creation
//     const beatsToCreate = prepareBeatsForCreation(newBeats);

//     // Step 2: Create beats in the database
//     const createBeatsResponse = await GroupFunction({
//         refreshFunction: () => {},
//         functionsToExecute: [() => createBeats(beatsToCreate, async () => {})],
//         useNextUndoGroup: true,
//     });

//     if (!createBeatsResponse.success) {
//         conToastError("Error creating beats", createBeatsResponse);
//         return { success: false };
//     }
//     try {
//         // Step 3: Convert database beats to Beat objects
//         const databaseBeats = (
//             createBeatsResponse.responses[0] as {
//                 success: boolean;
//                 data: DatabaseBeat[];
//             }
//         ).data;
//         const createdBeats = convertDatabaseBeatsToBeats(databaseBeats);

//         // Step 4: Prepare page updates
//         const { pagesToUpdate } = preparePageUpdates(
//             pages,
//             oldBeats,
//             createdBeats,
//         );
//     } catch (error) {
//         console.error("Error creating new beats", error);
//         window.electron.undo();
//         return { success: false };
//     }
// };

/**
 * Creates new beat objects and updates associated pages
 *
 * @param newBeats - The new beats to be created
 * @param oldBeats - The existing beats to be replaced
 * @param newMeasures - The new measures to be created
 * @param oldMeasures - The existing measures to be replaced
 * @param pages - Pages associated with the old beats
 * @param refreshFunction - Function to refresh the UI after updates
 * @returns An object indicating whether the beat creation and update was successful
 */
export const replaceAllBeatObjects = async ({
    newBeats,
    oldBeats,
    newMeasures,
    oldMeasures,
    pages,
    refreshFunction,
    t,
}: {
    newBeats: Beat[];
    oldBeats: Beat[];
    newMeasures: Measure[];
    oldMeasures: Measure[];
    pages: Page[];
    refreshFunction: () => Promise<void>;
    t: (key: string) => string; // Tolgee translation function
}): Promise<{ success: boolean }> => {
    // Step 1: Prepare beats for creation
    const beatsToCreate = prepareBeatsForCreation(newBeats);

    // Step 2: Create beats in the database
    const createBeatsResponse = await GroupFunction({
        functionsToExecute: [() => createBeats(beatsToCreate, async () => {})],
        useNextUndoGroup: true,
    });
    if (!createBeatsResponse.success) {
        conToastError(t("audio.beats.create.error"), createBeatsResponse);
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
        const createdBeats = convertDatabaseBeatsToBeats(databaseBeats);

        // Step 4: Prepare page updates
        const { pagesToUpdate } = preparePageUpdates(
            pages,
            oldBeats,
            createdBeats,
        );

        // Step 5: Prepare measure updates
        const measuresToCreate = prepareMeasuresForCreation(
            newMeasures,
            newBeats,
            createdBeats,
        );

        // Step 6: Perform database operations
        return await performDatabaseOperations(
            pagesToUpdate,
            measuresToCreate,
            oldMeasures,
            oldBeats,
            refreshFunction,
        );
    } catch (error) {
        console.error("Error creating new beats", error);
        window.electron.undo();
        return { success: false };
    }
};
