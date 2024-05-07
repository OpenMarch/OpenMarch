import BeatUnit from "./BeatUnit";
import TimeSignature from "./TimeSignature";

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
class Measure {
    /** INTEGER - The number of the measure in the piece */
    readonly number: number;
    /** The rehearsal mark of the measure. E.g. "A" or "12" (for measure 12) */
    readonly rehearsalMark: string | null;
    /** Beats per minute of the measure */
    readonly tempo: number;
    /**
     * The type of note that the bpm defines in this measure.
     * E.g. 6/8 has dotted quarter = 120, or 4/4 has half note = 80
     */
    readonly beatUnit: BeatUnit;
    /** Time signature of the measure */
    readonly timeSignature: TimeSignature;
    /** The duration, in seconds, that the measure is */
    readonly duration: number;

    constructor({ number, rehearsalMark = null, timeSignature, tempo, beatUnit }:
        {
            number: number; rehearsalMark?: string | null; timeSignature: TimeSignature;
            beatUnit: BeatUnit, tempo: number;
        }) {
        if (!Number.isInteger(number))
            throw new Error("Measure number must be an integer.")
        if (tempo <= 0)
            throw new Error("Tempo must be > 0")

        this.number = number;
        this.rehearsalMark = rehearsalMark;
        this.timeSignature = timeSignature;
        this.tempo = tempo;
        this.beatUnit = beatUnit;
        this.duration = this.calculateDuration();
    }

    /**
     * Calculates the duration of the measure (in seconds) based on the time signature, tempo, and beat unit.
     *
     * The time signature (numerator specifically) will determine how many beats are in the measure.
     *
     * The tempo (beats per minute) defines how many time the beat unit occurs in one minute.
     *
     * The beat unit determines what note gets the pulse. E.g. quarter = 144 == half = 72
     */
    private calculateDuration() {
        const beatsPerMeasure = this.timeSignature.numerator;
        // The ratio of the measure's beat unit to the pulse's beat unit
        const tempoRatio = (1 / this.timeSignature.denominator) / this.beatUnit;
        // The duration of one beat in seconds
        const tempoBeatDuration = 60 / this.tempo;
        return tempoRatio * beatsPerMeasure * tempoBeatDuration;
    }

    /**
     * Calculate the value of the beat unit with the beat unit dots.
     *
     * E.g. a quarter note = 1/4. A dotted quarter note = 1/4 + 1/8 = 3/8.
     * A double dotted quarter note = 1/4 + 1/8 + 1/16 = 7/16
     *
     * @param beatUnit
     * @param beatUnitDots INTEGER - The number of dots the beat unit has. E.g. dotted quarter would have one dot.
     * @returns The value of the beat unit with the beat unit dots.
     */
    private static calculateBeatValue(beatUnit: BeatUnit, beatUnitDots: number): number {
        // The fraction of the pulse's beat unit
        let beatUnitValue = 1 / beatUnit;
        for (let i = 1; i <= beatUnitDots; i++) {
            // Add half of the beat unit value to the pulse for each dot.
            // E.g. dotted quarter = 1/4 + 1/8 = 3/8
            // Double dotted quarter = 1/4 + 1/8 + 1/16 = 7/16
            beatUnitValue += (1 / beatUnit) / (Math.pow(2, i));
        }
        return beatUnitValue;
    }
}

export default Measure;
