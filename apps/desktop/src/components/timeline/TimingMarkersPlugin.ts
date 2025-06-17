import type Beat from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";

export class TimingMarkersPlugin {
    protected wsRegions: any;
    protected beats: Beat[];
    protected measures: Measure[];
    protected measureRegions: Map<number, any> = new Map();
    protected beatRegions: Map<number, any> = new Map();

    constructor(wsRegions: any, beats: Beat[], measures: Measure[]) {
        this.wsRegions = wsRegions;
        this.beats = beats;
        this.measures = measures;
    }
    /**
     * Creates timing markers for beats and measures on the waveform
     * Adds non-measure beat markers in gray and measure start markers in purple
     * Markers are non-draggable and non-resizable point regions
     */
    createTimingMarkers = () => {
        const rootStyles = getComputedStyle(document.documentElement);

        // Counts
        this.beats.forEach((beat) => {
            const newRegion = this.wsRegions.addRegion({
                id: `beat beat-${beat.id}`,
                start: beat.timestamp,
                drag: false,
                resize: false,
            });
            this.beatRegions.set(beat.id, newRegion);
        });

        // Measures
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
