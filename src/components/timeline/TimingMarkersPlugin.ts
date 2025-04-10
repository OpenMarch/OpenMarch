import type Beat from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";

export class TimingMarkersPlugin {
    private wsRegions: any;
    private beats: Beat[];
    private measures: Measure[];
    private measureRegions: Map<number, any> = new Map();
    private beatRegions: Map<number, any> = new Map();

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
        let curTimestamp = 0;
        this.beats.forEach((beat) => {
            const newRegion = this.wsRegions.addRegion({
                id: `beat beat-${beat.id}`,
                start: curTimestamp,
                // color: "rgba(255, 0, 0, 1)",
                drag: false,
                resize: false,
            });
            this.beatRegions.set(beat.id, newRegion);
            curTimestamp += beat.duration;
        });
        curTimestamp = 0;
        this.measures.forEach((measure) => {
            const newRegion = this.wsRegions.addRegion({
                id: `${measure.rehearsalMark ? "rehearsalMark" : "measure"} measure-${measure.id}`,
                start: curTimestamp,
                // color: "rgba(100, 66, 255, 1)",
                content: measure.rehearsalMark ?? measure.number.toString(),
                drag: false,
                resize: false,
            });
            this.measureRegions.set(measure.id, newRegion);
            curTimestamp += measure.duration;
        });
    };

    /**
     * Removes all timing markers from the waveform
     */
    clearTimingMarkers = () => {
        this.beatRegions.values().forEach((region) => region.remove());
        this.measureRegions.values().forEach((region) => region.remove());
    };

    /**
     * Updates the timing markers with new beats and measures
     * Clears existing markers and creates new ones based on the provided data
     * @param beats Array of Beat objects to update markers for
     * @param measures Array of Measure objects to update markers for
     */
    updateTimingMarkers = (beats: Beat[], measures: Measure[]) => {
        this.beats = beats;
        this.measures = measures;

        this.clearTimingMarkers();
        this.createTimingMarkers();
    };
}
