/**
 * A class representing a time signature ensuring valid numerator and denominator.
 */
export class TimeSignature {
    readonly numerator: number;
    readonly denominator: number;

    constructor(timeSignature: TimeSignature) {
        const numer = timeSignature.numerator;
        if (numer <= 0 || !Number.isInteger(numer))
            throw new Error("Invalid time signature numerator. Must be a positive integer.");
        this.numerator = timeSignature.numerator;
        const denom = timeSignature.denominator;
        if (!Number.isInteger(denom) || denom <= 0 || (denom !== 1 && denom % 2 !== 0)) {
            throw new Error("Invalid time signature denominator. Must be an integer power of 2. E.g. 1, 2, 4, 8, 16, 32, etc.");
        }
        this.denominator = timeSignature.denominator;
    }

    /**
     * Creates a new TimeSignature from a string representation of a time signature.
     *
     * @param timeSignature A string representation of a time signature. E.g. "4/4"
     * @returns
     */
    static fromString(timeSignature: string): TimeSignature {
        const split = timeSignature.split("/");
        if (split.length !== 2)
            throw new Error("Invalid time signature string. Must be in the form of '4/4'");
        const numerator = parseInt(split[0]);
        const denominator = parseInt(split[1]);
        return new TimeSignature({ numerator, denominator });
    }

    static instanceOf(obj: any): obj is TimeSignature {
        return obj.numerator !== undefined && obj.denominator !== undefined;
    }

    /**
     * @returns a string representation of the time signature. E.g. "4/4"
     */
    toString(): string {
        return `${this.numerator}/${this.denominator}`;
    }
}
