import { Checkpoint, FieldProperties } from "./FieldProperties";
import { MarcherPage } from "./MarcherPage";

export enum X_DESCRIPTION {
    INSIDE = "inside",
    OUTSIDE = "outside",
    ON = "On"
}

export enum Y_DESCRIPTION {
    ON = "On",
    IN_FRONT_OF = "in front of",
    BEHIND = "behind"
}

/**
 * A ReadableCoords object represents the coordinates of a marcher on the field in a human-readable format.
 * I.e. "5 steps outside the 40 yard line, 3 steps in front of the front hash."
 */
export class ReadableCoords {
    /** The properties of the field the marcher is on. This must be defined to create ReadableCoords
     * This is not something that should be changed often. It should be set at the creation of a show and not changed.
     *  */
    private static _fieldProperties: FieldProperties;

    /* ----------- Constants ----------- */
    static readonly INSIDE = "inside";
    static readonly OUTSIDE = "outside";
    static readonly ON = "On";
    static readonly IN_FRONT_OF = "in front of";
    static readonly BEHIND = "behind";

    /* ----------- Attributes ----------- */

    /** The X coordinate of the marcher on the canvas */
    readonly originalX: number;
    /** The Y coordinate of the marcher on the canvas */
    readonly originalY: number;
    /** The amount of steps the marcher is from the X-Checkpoint (e.g. yard line)  */
    readonly xSteps: number;
    /** The amount of steps the marcher is from the nearest Y-Checkpoint (e.g front hash or back sideline) */
    readonly ySteps: number;
    /** The X-Checkpoint (e.g. yard line) the marcher is guiding to. (50, 45 ... 0) */
    readonly xCheckpoint: Checkpoint;
    /** The Y-Checkpoint (e.g front hash or back sideline) the marcher is guiding to. */
    readonly yCheckpoint: Checkpoint;
    /** The side of the field the marcher is on. (1 or 2) */
    readonly side: 1 | 2;
    /** The way the marcher relates to the yard line. (Inside or outside) */
    readonly xDescription: X_DESCRIPTION;
    /** The way the marcher relates to the hash or sideline. (in front of or behind) */
    readonly yDescription: Y_DESCRIPTION;
    /** Nearest 1/n step. 4 -> 1/4 = nearest quarter step. 10 -> 1/10 = nearest tenth step. */
    readonly roundingDenominator: number;

    /**
     * Note, you can use the static method `fromMarcherPage` to create a ReadableCoords object from a MarcherPage object.
     *
     * @param x X coordinate of the marcher on the canvas in pixels
     * @param y Y coordinate of the marcher on the canvas in pixels
     * @param roundingDenominator Nearest 1/n step. 4 -> 1/4 = nearest quarter step. 10 -> 1/10 = nearest tenth step.
     *  Optional, nearest 1/100 step by default.
     */
    constructor({ x, y, roundingDenominator = 100 }:
        { x: number; y: number; roundingDenominator?: number; }) {
        this.originalX = x;
        this.originalY = y;
        this.roundingDenominator = roundingDenominator;
        const readableCoords = this.parseCanvasCoords(x, y);
        this.xCheckpoint = readableCoords.xCheckpoint;
        this.yCheckpoint = readableCoords.yCheckpoint;
        this.side = readableCoords.side;
        this.xDescription = readableCoords.xDescription;
        this.yDescription = readableCoords.yDescription;
        this.xSteps = readableCoords.xSteps;
        this.ySteps = readableCoords.ySteps;
    }

    /**
     * A factory method to create a ReadableCoords object from a MarcherPage object.
     *
     * @param marcherPage The MarcherPage object to create a ReadableCoords object from.
     * @param roundingDenominator Nearest 1/n step. 4 -> 1/4 = nearest quarter step. 10 -> 1/10 = nearest tenth step.
     *  Optional, nearest 1/100 step by default.
     * @returns A new ReadableCoords object created from a MarcherPage object.
     */
    static fromMarcherPage(marcherPage: MarcherPage, roundingDenominator = 100) {
        return new ReadableCoords({ x: marcherPage.x, y: marcherPage.y, roundingDenominator });
    }

    /**
     * Sets the field properties for the ReadableCoords class. This is necessary to create ReadableCoords.
     * This is not something that should be changed often. It should be set at the creation of a show and not changed.
     *
     * @param _fieldProperties The properties of the field the marcher is on. This must be defined to create ReadableCoords
     */
    static setFieldProperties(_fieldProperties: FieldProperties) {
        ReadableCoords._fieldProperties = _fieldProperties;
    }

    /**
     * @returns The field properties for the ReadableCoords class.
     */
    static getFieldProperties(): FieldProperties {
        return ReadableCoords._fieldProperties;
    }

    /**
     * Translates raw canvas coordinates into a ReadableCoords object.
     * This is for a college football field.
     *
     * @param x X coordinate on the canvas (in pixels)
     * @param y Y coordinate on the canvas (in pixels)
     * @returns ReadableCoords object with all of the information needed to make a readable coordinate.
     */
    private parseCanvasCoords(x: number, y: number): ReadableCoords {
        if (!ReadableCoords._fieldProperties)
            throw new Error("Field properties must be defined to create ReadableCoords");
        if (!this.roundingDenominator)
            throw new Error("roundingDenominator must be defined to create ReadableCoords");
        if (this.roundingDenominator <= 0)
            throw new Error("roundingDenominator must be greater than 0");

        const props = ReadableCoords._fieldProperties;
        const output: { [key: string]: any } = {};

        const stepsFromCenterFront = {
            x: (x - props.centerFrontPoint.xPixels) / FieldProperties.PIXELS_PER_STEP, // X trends positive towards side 2 (right on the canvas)
            y: (y - props.centerFrontPoint.yPixels) / FieldProperties.PIXELS_PER_STEP // Y trends positive towards the front of the field (bottom on the canvas)
        };
        // Round to nearest 1/n step
        stepsFromCenterFront.x =
            (Math.round(stepsFromCenterFront.x * this.roundingDenominator) / this.roundingDenominator);
        stepsFromCenterFront.y =
            (Math.round(stepsFromCenterFront.y * this.roundingDenominator) / this.roundingDenominator);

        /* ----------- Calculate X descriptions ----------- */
        // Determine which side of the field the marcher is on
        output.side = stepsFromCenterFront.x > 0 ? 2 : 1;

        // create a const for shorthand
        const xStepsFromCenter = stepsFromCenterFront.x;

        // Determine which yard line the marcher is on
        const xCheckpoints = props.xCheckpoints;
        output.xCheckpoint = ReadableCoords.findClosestCheckpoint(xStepsFromCenter, xCheckpoints);

        // Determine how many steps inside or outside the xCheckpoint (yard line) the marcher is
        // Absolute value is used to maintain symmetry from the center
        const stepsFromXCheckpoint = Math.abs(output.xCheckpoint.stepsFromCenterFront) - Math.abs(xStepsFromCenter);
        // Define the marcher's relation to the xCheckpoint
        if (stepsFromXCheckpoint === 0) output.xDescription = X_DESCRIPTION.ON;
        else if (stepsFromXCheckpoint < 0) output.xDescription = X_DESCRIPTION.OUTSIDE;
        else output.xDescription = X_DESCRIPTION.INSIDE;

        // Define the xSteps of the output and round to 2 decimal places
        output.xSteps = Math.round(Math.abs(stepsFromXCheckpoint) * 100) / 100;

        /* ----------- Calculate Y descriptions ----------- */
        // create a const for shorthand
        const yStepsFromCenter = stepsFromCenterFront.y;

        // Determine which yCheckpoint (hash/sideline) the marcher is guiding to
        const yCheckpoints = props.yCheckpoints;
        output.yCheckpoint = ReadableCoords.findClosestCheckpoint(yStepsFromCenter, yCheckpoints);

        // Determine how many steps in front or behind of the yCheckpoint that the marcher is
        const stepsFromYCheckpoint = output.yCheckpoint.stepsFromCenterFront - yStepsFromCenter;

        // Define the marcher's relation to the yCheckpoint
        if (stepsFromYCheckpoint === 0) output.yDescription = Y_DESCRIPTION.ON;
        else if (stepsFromYCheckpoint < 0) output.yDescription = Y_DESCRIPTION.IN_FRONT_OF
        else output.yDescription = Y_DESCRIPTION.BEHIND;

        // Define the ySteps of the output and round to 2 decimal places
        output.ySteps = Math.round(Math.abs(stepsFromYCheckpoint) * 100) / 100;

        return output as ReadableCoords
    }

    private static findClosestCheckpoint(stepsFromCenterFront: number, checkpoints: Checkpoint[]) {
        // Find the closest checkpoint
        const output = checkpoints.reduce((closest, current) => {
            return (
                // Make sure it is a reference checkpoint
                current.useAsReference
                    &&
                    // If the current checkpoint is closer to the marcher than the closest checkpoint
                    (Math.abs(current.stepsFromCenterFront - stepsFromCenterFront) < Math.abs(closest.stepsFromCenterFront - stepsFromCenterFront)
                        // Handle the case where the marcher is equidistant from two checkpoints (default to the one closer to the center/front)
                        || (((Math.abs(current.stepsFromCenterFront - stepsFromCenterFront) === Math.abs(closest.stepsFromCenterFront - stepsFromCenterFront)))
                            && (Math.abs(current.stepsFromCenterFront) < Math.abs(closest.stepsFromCenterFront))
                        )
                    )
                    ? current : closest
            );
        });
        if (!output) throw new Error("No checkpoint found");
        return output;
    }

    /**
     * Formats an amount of steps into a string with at most two decimal places.
     *
     * @param steps number of steps
     * @param includeStepsString Whether or not to include the word "steps" in the string. False by default.
     * @param includeTrailingSpace Whether or not to include a trailing space at the end of the string. True by default.
     * @returns String of steps with at most two decimal places, plus the word "steps" if includeStepsString is true.
     * 0 steps returns an empty string.
     * (E.g. "3.14 steps ", "2 steps ", "1 step " - "3.14 ", "2 ", "1 ")
     */
    private static formatStepsString(steps: number, includeStepsString = false, includeTrailingSpace = true) {
        if (steps === 0) return "";
        const roundedSteps = Math.round(steps * 100) / 100;
        const stepString = includeStepsString ? (steps === 1 ? " step" : " steps") : "";
        const trailingSpace = includeTrailingSpace ? " " : "";
        return roundedSteps + stepString + trailingSpace;
    }

    static getTerseXDescription(xDescription: X_DESCRIPTION) {
        switch (xDescription) {
            case X_DESCRIPTION.INSIDE:
                return "IN";
            case X_DESCRIPTION.OUTSIDE:
                return "OUT";
            case X_DESCRIPTION.ON:
                return "On";
        }
    }

    static getTerseYDescription(yDescription: Y_DESCRIPTION) {
        switch (yDescription) {
            case Y_DESCRIPTION.IN_FRONT_OF:
                return "FR";
            case Y_DESCRIPTION.BEHIND:
                return "BE";
            case Y_DESCRIPTION.ON:
                return "On";
        }
    }

    /**
     * @returns A verbose string description of the ReadableCoords.
     */
    toString() {
        return `${this.toVerboseStringX()} - ${this.toVerboseStringY()}`;
    }

    /**
     * Create a verbose description of a ReadableCoords' X properties.
     *
     * @param includeStepsString Whether or not to include the word "step(s)" in the string. False by default.
     * @returns A string description of the marcher's readable x coordinate.
     * (E.g. "3 steps inside 35 yard line side 1", "On 40 yard line side 2")
     */
    toVerboseStringX({ includeStepsString = false }: { includeStepsString?: boolean; } = {}) {
        // Handle case where the marcher is on the center x checkpoint
        return (this.xCheckpoint.stepsFromCenterFront === 0 && this.xSteps === 0 ? "" : `S${this.side}: `) +
            ReadableCoords.formatStepsString(this.xSteps, includeStepsString)
            + this.xDescription + " "
            + this.xCheckpoint.name;
    }

    /**
     * Create a terse description of a ReadableCoords' X properties.
     *
     * @returns A string description of the marcher's readable x coordinate.
     * ("3 in 35 S1" ," 2 out 0 S2" , "On 20 S1")
     */
    toTerseStringX() {
        // Handle case where the marcher is on the center x checkpoint
        return (this.xCheckpoint.stepsFromCenterFront === 0 && this.xSteps === 0 ? "" : `S${this.side}: `) +
            ReadableCoords.formatStepsString(this.xSteps)
            + ReadableCoords.getTerseXDescription(this.xDescription) + " "
            + this.xCheckpoint.terseName;
    }
    /**
     * Create a verbose description of a ReadableCoords' X properties.
     *
     * @param includeStepsString Whether or not to include the word "step(s)" in the string. False by default.
     * @param includeFieldStandard Whether or not to include the field standard in the string. False by default. (e.g. (NCAA, NFL, Grid hash etc.))
     * @returns A string description of the marcher's readable x coordinate.
     * ("5 steps behind front hash", "On front sideline")
     */
    toVerboseStringY({ includeStepsString = false, includeFieldStandard = false }:
        { includeStepsString?: boolean; includeFieldStandard?: boolean; } = {}) {
        return ReadableCoords.formatStepsString(this.ySteps, includeStepsString)
            + this.yDescription + " "
            + this.yCheckpoint.name
            + (includeFieldStandard && this.yCheckpoint.fieldStandard ? ` (${this.yCheckpoint.fieldStandard})` : "");
    }

    /**
     * Create a terse description of a ReadableCoords' Y properties.
     *
     * @param includeFieldStandard Whether or not to include the field standard in the string. False by default. (e.g. (NCAA, NFL, Grid hash etc.))
     * @returns A string description of the marcher's readable  coordinate.
     * ("9 fr. BH" -> 9 steps in front of the back hash , "12 be. FSL" -> 12 steps behind front sideline , "On FH")
     */
    toTerseStringY({ includeFieldStandard = false }: { includeFieldStandard?: boolean; } = {}) {
        return ReadableCoords.formatStepsString(this.ySteps)
            + ReadableCoords.getTerseYDescription(this.yDescription) + " "
            + this.yCheckpoint.terseName
            + (includeFieldStandard && this.yCheckpoint.fieldStandard ? ` (${this.yCheckpoint.fieldStandard})` : "");
    }
}
