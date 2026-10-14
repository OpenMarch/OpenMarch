import { FieldProperties } from "@openmarch/core";

const INCHES_PER_YARD = 36;

export interface MinMaxStepSizes {
    min: StepSize | undefined;
    max: StepSize | undefined;
}

export class StepSize {
    /* ----------- Attributes ----------- */

    /** Steps needed to cover five yards, for example 8 for 8 to 5 */
    readonly stepsPerFiveYards: number;
    /** Id of the marcher for this step size */
    readonly marcher_id: number;

    constructor({
        marcher_id,
        startingX,
        startingY,
        endingX,
        endingY,
        counts,
        fieldProperties,
    }: {
        marcher_id: number;
        startingX: number;
        startingY: number;
        endingX: number;
        endingY: number;
        counts: number;
        fieldProperties: FieldProperties;
    }) {
        this.marcher_id = marcher_id;
        this.stepsPerFiveYards = StepSize.calculateStepSize({
            startingX,
            startingY,
            endingX,
            endingY,
            counts,
            pixelsPerStep: fieldProperties.pixelsPerStep,
            stepSizeInches: fieldProperties.stepSizeInches,
        });
    }

    private static calculateStepSize({
        startingX,
        startingY,
        endingX,
        endingY,
        counts,
        pixelsPerStep,
        stepSizeInches,
    }: {
        startingX: number;
        startingY: number;
        endingX: number;
        endingY: number;
        counts: number;
        pixelsPerStep: number;
        stepSizeInches: number;
    }) {
        if (!counts) {
            return NaN; // don't divide by 0, indicate there is no actual number here
        }

        // find the horizontal distance across the canvas
        const xDistance = Math.abs(endingX - startingX);
        // find the vertical distance across the canvas
        const yDistance = Math.abs(endingY - startingY);
        // pythagorean theorem to get the total distance
        const distanceInPixels = Math.sqrt(xDistance ** 2 + yDistance ** 2);

        if (!distanceInPixels) {
            return Infinity; // don't divide by 0, indicates a hold
        }

        // convert to distance in steps relative to the FieldProperties step size
        const distanceInSteps = distanceInPixels / pixelsPerStep;
        // convert to distance in inches
        const distanceCoveredInInches = distanceInSteps * stepSizeInches;
        // determine the distance in inches per step
        const distanceInInchesPerStep = distanceCoveredInInches / counts;

        // determine how many steps it would take to traverse 5 yards and round the result
        return (INCHES_PER_YARD * 5) / distanceInInchesPerStep;
    }

    /**
     * Creates a display string for the step size, e.g. "8 to 5" or "6.7 to 5"
     * @returns display string
     */
    displayString() {
        if (Number.isNaN(this.stepsPerFiveYards)) {
            return "Undefined"; // when there are 0 counts in the page.
        }

        if (this.stepsPerFiveYards === Infinity) {
            return "Hold"; // when the performer hasn't moved at all from the previous page.
        }

        const roundedSteps = Math.round(this.stepsPerFiveYards * 10) / 10;
        if (roundedSteps > 64) {
            return "Tiny"; // show 'Tiny' instead of something crazy like 73,249.7 to 5
        }

        return `${roundedSteps.toLocaleString()} to 5`;
    }

    // Real distance covered per step in inches, 0 for a hold and NaN for an undefined step
    get inchesPerStep(): number {
        return (INCHES_PER_YARD * 5) / this.stepsPerFiveYards;
    }

    // True when this move's per-step distance exceeds the threshold in inches
    // A threshold of 0 or less turns step size warnings off entirely
    // 0.5 inch tolerance absorbs floating-point noise near the threshold
    exceedsThreshold(thresholdInches: number): boolean {
        if (thresholdInches <= 0) return false;
        return this.inchesPerStep > thresholdInches + 0.5;
    }

    /**
     * A step size from a distance already measured (for example along a curved path in timeline
     * mode), with the same arithmetic as a straight move of that length.
     *
     * @param distance the distance covered, in field units (pixels)
     */
    static fromDistance({
        marcher_id,
        distance,
        counts,
        fieldProperties,
    }: {
        marcher_id: number;
        distance: number;
        counts: number;
        fieldProperties: FieldProperties;
    }): StepSize {
        return new StepSize({
            marcher_id,
            startingX: 0,
            startingY: 0,
            endingX: distance,
            endingY: 0,
            counts,
            fieldProperties,
        });
    }

    /**
     * Compares two step sizes by their steps per five yards. Considers step size to be larger if it is less steps per five yards.
     * @param a first step size
     * @param b second step size
     * @returns > 1 if first is larger, < 1 if second is larger, 0 if equal
     */
    static compare(a: StepSize, b: StepSize) {
        // Smaller number means larger step size
        return b.stepsPerFiveYards - a.stepsPerFiveYards;
    }
}
