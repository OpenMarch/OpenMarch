import Beat from "@/global/classes/Beat";
import Page from "@/global/classes/Page";
import {
    ModifiedBeatArgs,
    NewBeatArgs,
} from "electron/database/tables/BeatTable";

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
 * Generates beat objects for creating and updating beats based on new and old beats and associated pages.
 *
 * When updating beats after changing them in the show, be sure to call updateBeats() then createBeats() in that order.
 *
 * @param newBeats - The new set of beats to process
 * @param oldBeats - The original set of beats
 * @param pages - All pages in the project
 * @returns An object containing the ModifiedBeatArgs and NewBeatArgs arrays
 */
export const getNewBeatObjects = ({
    newBeats,
    oldBeats,
    pages,
}: {
    newBeats: Beat[];
    oldBeats: Beat[];
    pages: Page[];
}): {
    beatsToCreate: NewBeatArgs[];
    beatsToUpdate: ModifiedBeatArgs[];
    beatIdsToDelete: Set<number>;
} => {
    // Update the beats attached to pages so pages always have a beat
    // Otherwise, we violate the FOREIGN KEY constraint
    const beatIdsWithPages = new Set(pages.map((page) => page.beats[0].id));
    const { beatsToUpdate, newBeatIdsUsed } = getUpdatedBeatObjects(
        oldBeats,
        newBeats,
        beatIdsWithPages,
    );
    const usedBeatIds = new Set<number>(beatsToUpdate.map((beat) => beat.id));
    // Delete all other beats that are not attached to any pages
    const beatIdsToDelete = new Set(
        oldBeats
            .filter(
                (beat) =>
                    !usedBeatIds.has(beat.id) && !beatIdsWithPages.has(beat.id),
            )
            .map((beat) => beat.id),
    );

    const newBeatsToCreate = newBeats.filter(
        (beat) => !newBeatIdsUsed.has(beat.id),
    );

    const beatsToCreate = newBeatsToCreate.map((beat) => ({
        duration: beat.duration,
        include_in_measure: 1 as 0 | 1,
    }));

    return { beatsToCreate, beatsToUpdate, beatIdsToDelete };
};
