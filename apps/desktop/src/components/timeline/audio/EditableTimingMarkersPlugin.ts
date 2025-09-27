import type Beat from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";
import { TimingMarkersPlugin } from "./TimingMarkersPlugin";
import { ModifiedBeatArgs, updateBeats } from "@/db-functions";
import { db } from "@/global/database/db";

/**
 * Calculates the modified beats when a beat's duration is changed. The duration is calculated from the region's width.
 * Adjusts the duration of the current beat and the previous beat to maintain timing consistency.
 *
 * This is not in the class for ease of testing.
 *
 * @param {Object} params - Parameters for beat modification
 * @param {Beat[]} params.allBeats - Array of all beats
 * @param {Beat} params.beat - The beat being modified
 * @param {Map<number, any>} params.beatRegions - Map of beat regions
 * @returns {ModifiedBeatArgs[] | undefined} Array of beat modifications or undefined if no changes
 */
export const getModifiedBeats = ({
    allBeats,
    beat,
    beatRegions,
}: {
    allBeats: Beat[];
    beat: Beat;
    beatRegions: Map<number, any>;
}): ModifiedBeatArgs[] | undefined => {
    try {
        const region = beatRegions.get(beat.id);
        if (!region) {
            console.log("Region not found for beat:", beat);
            throw new Error();
        }
        // Prepare the beat update
        const modifiedBeats: ModifiedBeatArgs[] = [];

        if (beat.index < allBeats.length - 1) {
            const nextBeat = allBeats[beat.index + 1];
            const nextRegion = beatRegions.get(nextBeat.id);
            if (!nextRegion) {
                console.warn(
                    "Next region not found for beat. This should not happen",
                    nextBeat,
                );
                throw new Error();
            }
            if (nextRegion.start <= region.start) {
                console.log(
                    "Beat cannot overlap with next beat",
                    nextBeat,
                    beat,
                );
                throw new Error();
            }

            const newDuration = nextRegion.start - region.start;

            if (newDuration === beat.duration) {
                console.log("Duration hasn't changed", beat, newDuration);
                throw new Error();
            }
            modifiedBeats.push({
                id: beat.id,
                duration: newDuration,
            });
        }
        // Modify the duration of the previous beat if there is one
        if (beat.index > 1) {
            const previousBeat = allBeats[beat.index - 1];
            const previousBeatRegion = beatRegions.get(previousBeat.id);
            if (!previousBeatRegion) {
                console.warn(
                    "Previous beat region not found for beat. This should not happen",
                    previousBeat,
                );
                throw new Error();
            }

            if (previousBeatRegion.start >= region.start) {
                console.log(
                    "Beat cannot overlap with previous beat",
                    previousBeat,
                    beat,
                );
                throw new Error();
            }
            // Calculate the new duration based on the region's width
            const newPrevDuration = region.start - previousBeatRegion.start;
            // Don't update if the duration hasn't changed
            if (newPrevDuration === previousBeat.duration) {
                console.log("Duration hasn't changed", beat, newPrevDuration);
                throw new Error();
            }
            if (newPrevDuration <= 0) {
                console.log("Duration cannot be <= 0", beat, newPrevDuration);
                throw new Error();
            }

            if (newPrevDuration <= 0) {
                console.log("Duration cannot be <= 0", beat, newPrevDuration);
                throw new Error();
            }

            modifiedBeats.push({
                id: previousBeat.id,
                duration: newPrevDuration,
            });
        }

        if (modifiedBeats.length === 0) {
            console.log("No beats modified", beat);
            throw new Error();
        }
        return modifiedBeats;
    } catch (error) {
        return;
    }
};

/**
 * Extension of TimingMarkersPlugin that makes beats editable.
 * Allows beats to be resized (which updates their duration) and updates the database.
 */
export class EditableTimingMarkersPlugin extends TimingMarkersPlugin {
    private fetchTimingObjects: () => void;

    constructor(
        wsRegions: any,
        beats: Beat[],
        measures: Measure[],
        fetchTimingObjects: () => void,
    ) {
        super(wsRegions, beats, measures);
        this.fetchTimingObjects = fetchTimingObjects;
    }

    /**
     * Creates timing markers for beats and measures on the waveform
     * Makes beat markers resizable but not draggable
     * Measure markers remain non-draggable and non-resizable
     */
    createTimingMarkers = () => {
        let curTimestamp = this.beats[0].duration;
        this.beats.forEach((beat, index) => {
            // Don't create markers for the first two beats
            // Beat 0 has no duration
            if (index === 0) return;
            // Calculate the end time for this beat (which is the start of the next beat)
            const end = curTimestamp + beat.duration;

            const newRegion = this.wsRegions.addRegion({
                id: `editable-beat beat-${beat.id}`,
                start: curTimestamp,
                drag: index > 1, // Beats greater than the second should be draggable (moved)
                resize: index > 1,
            });

            // Store the beat's original duration for reference
            newRegion.data = {
                beatId: beat.id,
                originalDuration: beat.duration,
                index: index,
            };

            // Add event listener for when resizing ends
            newRegion.on("update-end", () => this.handleBeatResized(newRegion));

            this.beatRegions.set(beat.id, newRegion);
            curTimestamp = end;
        });

        // Create measure markers (unchanged from parent class)
        curTimestamp = 0;
        this.measures.forEach((measure) => {
            const newRegion = this.wsRegions.addRegion({
                id: `${measure.rehearsalMark ? "editable-rehearsalMark" : "editable-measure"} measure-${measure.id}`,
                start: curTimestamp,
                content: measure.rehearsalMark ?? measure.number.toString(),
                drag: false,
                resize: false,
            });
            this.measureRegions.set(measure.id, newRegion);
            curTimestamp += measure.duration;
        });
    };

    /**
     * Handles when a beat region is resized
     * Updates the beat's duration in the database
     * @param region The region that was resized
     */
    private handleBeatResized = async (region: any) => {
        const beat = this.beats.find((b) => b.id === region.data.beatId);
        if (!beat) {
            console.error("Beat not found for region:", region);
            return;
        }
        try {
            const modifiedBeats = getModifiedBeats({
                allBeats: this.beats,
                beat,
                beatRegions: this.beatRegions,
            });
            if (!modifiedBeats) {
                throw new Error();
            }

            try {
                // Update the beat in the database
                await updateBeats({
                    db,
                    modifiedBeats,
                });

                // Refresh the timing objects to reflect the changes
                this.fetchTimingObjects();
            } catch (error) {
                console.error("Error updating beat:", error);
                throw new Error();
            }
        } catch (error) {
            // Reset the region to its original size on error
            region.setOptions({
                start: region.start,
                end: region.start + beat.duration,
            });
            this.fetchTimingObjects();
        }
    };
}
