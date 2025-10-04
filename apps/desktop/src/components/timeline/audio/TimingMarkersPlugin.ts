import type Beat from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";
import { assert } from "@/utilities/utils";

const FAKE_BEAT_NUM = 500;

export class TimingMarkersPlugin {
    protected wsRegions: any;
    protected beats: Beat[];
    protected measures: Measure[];
    protected measureRegions: Map<number, any> = new Map();
    protected beatRegions: Map<number, any> = new Map();
    protected defaultDuration?: number;

    constructor(
        wsRegions: any,
        beats: Beat[],
        measures: Measure[],
        defaultDuration?: number,
    ) {
        this.wsRegions = wsRegions;
        this.beats = beats;
        this.measures = measures;
        this.defaultDuration = defaultDuration;

        if (defaultDuration)
            assert(
                defaultDuration > 0,
                "Default duration must be greater than 0",
            );
    }
    /**
     * Creates timing markers for beats and measures on the waveform
     * Adds non-measure beat markers in gray and measure start markers in purple
     * Markers are non-draggable and non-resizable point regions
     */
    createTimingMarkers = () => {
        this.clearTimingMarkers();

        let lastBeatTimestamp = 0;
        // Counts
        this.beats.forEach((beat) => {
            const newRegion = this.wsRegions.addRegion({
                id: `beat beat-${beat.id}`,
                start: beat.timestamp,
                drag: false,
                resize: false,
            });
            this.beatRegions.set(beat.id, newRegion);
            if (beat.timestamp > lastBeatTimestamp)
                lastBeatTimestamp = beat.timestamp;
        });

        if (this.defaultDuration) {
            // Pad the end of the timeline with fake to give the illusion of a full timeline
            let curFillerTimestamp = lastBeatTimestamp + this.defaultDuration;
            for (let i = -1; i > FAKE_BEAT_NUM * -1 - 1; i--) {
                const newRegion = this.wsRegions.addRegion({
                    id: `beat beat_${i}`,
                    start: curFillerTimestamp,
                    drag: false,
                    resize: false,
                });
                this.beatRegions.set(i * -1, newRegion);
                curFillerTimestamp += this.defaultDuration;
            }
        }

        // Measure lines, measure numbers & rehearsal Marks
        this.measures.forEach((measure) => {
            const hasRehearsalMark =
                !!measure.rehearsalMark && measure.rehearsalMark.trim() !== "";
            const newRegion = this.wsRegions.addRegion({
                id: `${hasRehearsalMark ? "rehearsalMark" : "measure"} measure-${measure.id}`,
                start: measure.timestamp,
                content: measure.rehearsalMark ?? measure.number.toString(),
                drag: false,
                resize: false,
            });
            this.measureRegions.set(measure.id, newRegion);
        });
    };

    /**
     * Removes all timing markers from the waveform
     */
    clearTimingMarkers = () => {
        try {
            // Remove beat regions and clear the map
            Array.from(this.beatRegions.values()).forEach((region) => {
                try {
                    if (region?.remove) {
                        region.remove();
                    }
                } catch (e) {
                    console.warn("Failed to remove beat region:", e);
                }
            });
            this.beatRegions.clear();

            // Remove measure regions and clear the map
            Array.from(this.measureRegions.values()).forEach((region) => {
                try {
                    if (region?.remove) {
                        region.remove();
                    }
                } catch (e) {
                    console.warn("Failed to remove measure region:", e);
                }
            });
            this.measureRegions.clear();
        } catch (e) {
            console.warn("Error clearing timing markers:", e);
        }
    };

    /**
     * Updates the timing markers with new beats and measures
     * Clears existing markers and creates new ones based on the provided data
     * @param beats Array of Beat objects to update markers for
     * @param measures Array of Measure objects to update markers for
     */
    updateTimingMarkers = (beats: Beat[], measures: Measure[]) => {
        this.clearTimingMarkers();

        this.beats = beats;
        this.measures = measures;
        this.createTimingMarkers();
    };
}
