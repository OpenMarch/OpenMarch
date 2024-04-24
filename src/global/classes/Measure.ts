import { BeatUnit, TimeSignature } from "./TimeSignature";

// const BeatUnitNames: { [key in BeatUnit]: string } = {
//     [BeatUnit.WHOLE]: "whole",
//     [BeatUnit.HALF]: "half",
//     [BeatUnit.QUARTER]: "quarter",
//     [BeatUnit.EIGHTH]: "eighth",
//     [BeatUnit.SIXTEENTH]: "16th",
//     [BeatUnit.THIRTY_SECOND]: "32nd",
//     [BeatUnit.SIXTY_FOURTH]: "64th"
// }

/**
 * A Measure represents a measure in the music is used in conjunction with Page objects to define a show's length.
 */
export class Measure {
    /** INTEGER - The number of the measure in the piece */
    readonly number: number;
    /** Beats per minute of the measure */
    readonly bpm: number;
    /**
     * The type of note that the bpm defines in this measure
     * This is separate from the time signature because the tempo and time signature can be separate beat units.
     * E.g. 6/8 has dotted quarter = 120, or 4/4 has half note = 80
     */
    readonly tempoBeatUnit: BeatUnit;
    /** INTEGER - The number of dots the beat unit has. E.g. dotted quarter would have one dot. */
    readonly tempoBeatUnitDots: number;
    /** Time signature of the measure */
    readonly timeSignature: TimeSignature;
    /** The duration, in seconds, that the measure is */
    readonly duration: number;

    constructor(number: number, bpm: number, beatUnit: BeatUnit, beatUnitDots: number, timeSignature: TimeSignature) {
        if (!Number.isInteger(number))
            throw new Error("Measure number must be an integer.")
        if (!Number.isInteger(beatUnitDots))
            throw new Error("Measure beatUnitDots must be an integer.")

        this.number = number;
        this.bpm = bpm;
        this.tempoBeatUnit = beatUnit;
        this.tempoBeatUnitDots = beatUnitDots;
        this.timeSignature = timeSignature;
        this.duration = this.calculateDuration();
    }

    /**
     * Calculates the duration of the measure (in seconds) based on the time signature,
     * beat unit, beat unit dots, and beats per minute.
     *
     * The time signature (numerator specifically) will determine how many beats are in the measure.
     *
     * The beat unit determines what note gets the pulse. E.g. quarter = 144 == half = 72
     *
     * A beat unit dot adds half of the beat unit value to the beat unit. E.g. dotted qn would have one dot.
     *
     * The beats per minute (bpm) defines how many time the beat unit (and dot) occur in one minute.
     */
    private calculateDuration() {
        // The fraction of the pulse's beat unit
        let pulseBeatUnitValue = 1 / this.tempoBeatUnit;
        for (let i = 1; i <= this.tempoBeatUnitDots; i++) {
            // Add half of the beat unit value to the pulse for each dot.
            // E.g. dotted quarter = 1/4 + 1/8 = 3/8
            // Double dotted quarter = 1/4 + 1/8 + 1/16 = 7/16
            pulseBeatUnitValue += (1 / this.tempoBeatUnit) / (Math.pow(2, i));
        }

        const beatsPerMeasure = this.timeSignature.numerator;
        // The ratio of the measure's beat unit to the pulse's beat unit
        const tempoRatio = (1 / this.timeSignature.denominator) / pulseBeatUnitValue;
        const tempoBeatDuration = 60 / this.bpm;
        return tempoRatio * beatsPerMeasure * tempoBeatDuration;
    }
}
