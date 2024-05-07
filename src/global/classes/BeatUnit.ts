/**
 * A beat unit is a fraction of a whole note that represents the duration of a note.
 * This is used for things like tempo and pulse.
 */
class BeatUnit {
    readonly value: number;
    readonly name: string;

    private constructor(value: number, name: string) {
        this.value = value;
        this.name = name;
    }

    // The following are the beat units that are available
    static WHOLE = new BeatUnit(1, "whole");
    static HALF = new BeatUnit(1 / 2, "half");
    static DOTTED_HALF = new BeatUnit(3 / 4, "dotted half");
    static QUARTER = new BeatUnit(1 / 4, "quarter");
    static DOTTED_QUARTER = new BeatUnit(3 / 8, "dotted quarter");
    static EIGHTH = new BeatUnit(1 / 8, "eighth");
    static DOTTED_EIGHTH = new BeatUnit(3 / 16, "dotted eighth");
    static SIXTEENTH = new BeatUnit(1 / 16, "16th");
    static DOTTED_SIXTEENTH = new BeatUnit(3 / 32, "dotted 16th");
    static THIRTY_SECOND = new BeatUnit(1 / 32, "32nd");
    static SIXTY_FOURTH = new BeatUnit(1 / 64, "64th");

    /**
     * Returns the string representation of the beat unit.
     */
    toString() {
        return this.name;
    }

    /**
     * Returns the beat unit from the string representation.
     * @param name The name of the beat unit.
     */
    static fromString(name: string): BeatUnit {
        switch (name) {
            case "whole": return BeatUnit.WHOLE;
            case "half": return BeatUnit.HALF;
            case "dotted half": return BeatUnit.DOTTED_HALF;
            case "quarter": return BeatUnit.QUARTER;
            case "dotted quarter": return BeatUnit.DOTTED_QUARTER;
            case "eighth": return BeatUnit.EIGHTH;
            case "dotted eighth": return BeatUnit.DOTTED_EIGHTH;
            case "16th": return BeatUnit.SIXTEENTH;
            case "dotted 16th": return BeatUnit.DOTTED_SIXTEENTH;
            case "32nd": return BeatUnit.THIRTY_SECOND;
            case "64th": return BeatUnit.SIXTY_FOURTH;
            default: throw new Error(`Invalid beat unit name: ${name}`);
        }
    }
}

export default BeatUnit;
