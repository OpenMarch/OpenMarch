import Beat, {
    createBeats,
    deleteBeats,
    fromDatabaseBeat,
} from "@/global/classes/Beat";
import Measure from "@/global/classes/Measure";
import Page, { updatePages } from "@/global/classes/Page";
import { GroupFunction } from "@/utilities/ApiFunctions";
import { conToastError } from "@/utilities/utils";
import {
    DatabaseBeat,
    ModifiedBeatArgs,
} from "electron/database/tables/BeatTable";
import { ModifiedMeasureArgs } from "electron/database/tables/MeasureTable";
import { ModifiedPageArgs } from "electron/database/tables/PageTable";

/**
 * Creates new temporary beats by subdividing the time between the last existing beat and the current time.
 *
 * @param currentTime The current timestamp where a new beat will be created
 * @param totalDuration The total duration of the audio
 * @param existingTemporaryBeats Array of existing temporary beats
 * @param numNewBeats Number of beats to create between the last beat and current time
 * @returns An object containing updated beats and a flag indicating whether the display should be updated
 */
export const createNewTemporaryBeat = (
    currentTime: number,
    totalDuration: number,
    existingTemporaryBeats: Beat[],
    numNewBeats: number,
): Beat[] => {
    // If no existing beats, we can't update anything
    if (existingTemporaryBeats.length === 0) {
        return [];
    }

    if (numNewBeats <= 0) {
        console.warn(
            "createNewTemporaryBeat: numNewBeats must be greater than 0",
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

    for (let i = 0; i < numNewBeats; i++) {
        // Update the previous beat's duration
        newBeats.push({
            ...lastBeat,
            duration: durationToUse,
            timestamp: lastBeat.timestamp + durationToUse * i,
        });
    }

    // Calculate remaining duration for the new beat
    const tempDuration = totalDuration - currentTime;

    // Create a new temporary beat at the current timestamp
    newBeats.push({
        id: -Date.now(), // Negative ID to indicate temporary
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
 * Creates new beat objects and updates associated pages and measures with the new beats.
 *
 * @param newBeats - The new beats to be created
 * @param oldBeats - The existing beats to be replaced
 * @param pages - Pages associated with the old beats
 * @param measures - Measures associated with the old beats
 * @param refreshFunction - Function to refresh the UI after updates
 * @returns An object indicating whether the beat creation and update was successful
 */
export const createNewBeatObjects = async ({
    newBeats,
    oldBeats,
    pages,
    measures,
    refreshFunction,
}: {
    newBeats: Beat[];
    oldBeats: Beat[];
    pages: Page[];
    measures: Measure[];
    refreshFunction: () => Promise<void>;
}): Promise<{ success: boolean }> => {
    const beatsToCreate = newBeats.map((beat) => ({
        duration: beat.duration,
        include_in_measure: 1 as 0 | 1,
    }));

    const createBeatsResponse = await GroupFunction({
        refreshFunction: () => {},
        functionsToExecute: [() => createBeats(beatsToCreate, async () => {})],
        useNextUndoGroup: true,
    });

    if (!createBeatsResponse.success) {
        conToastError("Error creating beats", createBeatsResponse);
        return {
            success: false,
        };
    }

    let timeStamp = 0;
    const createdBeats: Beat[] = (
        createBeatsResponse.responses[0] as {
            success: boolean;
            data: DatabaseBeat[];
        }
    ).data.map((dbBeat: DatabaseBeat, i: number) => {
        const newBeat = fromDatabaseBeat(dbBeat, i, timeStamp);
        timeStamp += dbBeat.duration;
        return newBeat;
    });
    try {
        // Update the pages to use the new beats
        const oldBeatsMap = new Map(oldBeats.map((beat) => [beat.id, beat]));
        const pagesToUpdate: ModifiedPageArgs[] = [];
        const usedCreatedBeatIdsForPages = new Set<number>();
        for (const page of pages) {
            if (page.beats.length === 0) continue;
            const oldBeat = oldBeatsMap.get(page.beats[0].id);
            if (oldBeat) {
                const closestNewBeat = findClosestUnusedBeatByTimestamp(
                    page.timestamp,
                    createdBeats,
                    usedCreatedBeatIdsForPages,
                );
                if (!closestNewBeat) {
                    throw new Error("No unused beat found");
                }
                pagesToUpdate.push({
                    id: page.id,
                    start_beat: closestNewBeat.id,
                });
                usedCreatedBeatIdsForPages.add(closestNewBeat.id);
            } else {
                throw new Error(
                    `Could not find beat with id ${page.beats[0].id} in created beats`,
                );
            }
        }
        const measuresToUpdate: ModifiedMeasureArgs[] = [];
        const usedCreatedBeatIdsForMeasures = new Set<number>();
        for (const measure of measures) {
            const oldBeat = oldBeatsMap.get(measure.beats[0].id);
            if (oldBeat) {
                const closestNewBeat = findClosestUnusedBeatByTimestamp(
                    measure.timestamp,
                    createdBeats,
                    usedCreatedBeatIdsForMeasures,
                );
                if (!closestNewBeat) {
                    throw new Error("No unused beat found");
                }
                measuresToUpdate.push({
                    id: measure.id,
                    start_beat: closestNewBeat.id,
                });
                usedCreatedBeatIdsForMeasures.add(closestNewBeat.id);
            } else {
                throw new Error(
                    `Could not find beat with id ${measure.beats[0].id} in created beats`,
                );
            }
        }

        const beatIdsToDelete = new Set(oldBeats.map((beat) => beat.id));

        const updateAndDeleteResponse = GroupFunction({
            functionsToExecute: [
                () => updatePages(pagesToUpdate, async () => {}),
                () => window.electron.updateMeasures(measuresToUpdate),
                () => deleteBeats(beatIdsToDelete, async () => {}),
            ],
            useNextUndoGroup: false,
            refreshFunction,
        });

        return updateAndDeleteResponse;
    } catch (error) {
        console.error("Error creating new beats", error);
        window.electron.undo();
        return { success: false };
    }
};
