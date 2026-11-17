import { FieldProperties, Checkpoint } from "@openmarch/core";
import MarcherPage from "./MarcherPage";
import tolgee from "@/global/singletons/Tolgee";

export enum X_DESCRIPTION {
    INSIDE = "inside",
    OUTSIDE = "outside",
    ON = "On",
}

export enum Y_DESCRIPTION {
    ON = "On",
    IN_FRONT_OF = "in front of",
    BEHIND = "behind",
}

/**
 * The checkpoint a position is described from: the closest reference checkpoint
 * (`useAsReference`), or of two equally close, the one nearer the center or front.
 *
 * An axis with no reference checkpoint (a custom field can turn them all off) falls back to the
 * closest of all its checkpoints, so the position still gets a description. An axis with no
 * checkpoints at all is described from 0 steps, named "center line" or "front edge".
 */
export function findClosestCheckpoint(
    stepsFromCenterFront: number,
    checkpoints: readonly Checkpoint[],
    axis: Checkpoint["axis"],
): Checkpoint {
    const references = checkpoints.filter((c) => c.useAsReference);
    const candidates = references.length > 0 ? references : checkpoints;
    const distance = (c: Checkpoint) =>
        Math.abs(c.stepsFromCenterFront - stepsFromCenterFront);
    let closest: Checkpoint | undefined;
    for (const current of candidates) {
        if (
            !closest ||
            distance(current) < distance(closest) ||
            // Equidistant from two: the one closer to the center/front
            (distance(current) === distance(closest) &&
                Math.abs(current.stepsFromCenterFront) <
                    Math.abs(closest.stepsFromCenterFront))
        )
            closest = current;
    }
    return (
        closest ?? {
            id: -1,
            // Named for where it is, so the readout doesn't end in a blank
            name:
                axis === "x"
                    ? tolgee.t("coordinates.noCheckpoint.centerLine")
                    : tolgee.t("coordinates.noCheckpoint.frontEdge"),
            terseName:
                axis === "x"
                    ? tolgee.t("coordinates.noCheckpoint.centerLineShort")
                    : tolgee.t("coordinates.noCheckpoint.frontEdgeShort"),
            axis,
            stepsFromCenterFront: 0,
            useAsReference: true,
            visible: false,
        }
    );
}

/**
 * A ReadableCoords object represents the coordinates of a marcher on the field in a human-readable format.
 * I.e. "5 steps outside the 40 yard line, 3 steps in front of the front hash."
 */
export class ReadableCoords {
    /**
     * The properties of the field the marcher is on. This must be defined to create ReadableCoords
     */
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
    /** The side of the field the marcher is on. Based on the values in the field properties. E.g. "Side 1" or "Side 2" */
    readonly sideDescription: string;
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
    constructor({
        x,
        y,
        roundingDenominator = 100,
    }: {
        x: number;
        y: number;
        roundingDenominator?: number;
    }) {
        this.originalX = x;
        this.originalY = y;
        this.roundingDenominator = roundingDenominator;
        const readableCoords = this.parseCanvasCoords(x, y);
        this.xCheckpoint = readableCoords.xCheckpoint;
        this.yCheckpoint = readableCoords.yCheckpoint;
        this.sideDescription = readableCoords.sideDescription;
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
    static fromMarcherPage(
        marcherPage: Pick<MarcherPage, "x" | "y">,
        roundingDenominator = 100,
    ) {
        return new ReadableCoords({
            x: marcherPage.x,
            y: marcherPage.y,
            roundingDenominator,
        });
    }

    /**
     * Sets the field properties for the ReadableCoords class. This is necessary to create ReadableCoords.
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
            throw new Error(
                "Field properties must be defined to create ReadableCoords",
            );
        if (!this.roundingDenominator)
            throw new Error(
                "roundingDenominator must be defined to create ReadableCoords",
            );
        if (this.roundingDenominator <= 0)
            throw new Error("roundingDenominator must be greater than 0");

        const props = ReadableCoords._fieldProperties;
        const output: { [key: string]: any } = {};

        const stepsFromCenterFront = {
            x:
                (x - props.centerFrontPoint.xPixels) /
                ReadableCoords._fieldProperties.pixelsPerStep, // X trends positive towards side 2 (right on the canvas)
            y:
                (y - props.centerFrontPoint.yPixels) /
                ReadableCoords._fieldProperties.pixelsPerStep, // Y trends positive towards the front of the field (bottom on the canvas)
        };
        // Round to nearest 1/n step
        stepsFromCenterFront.x =
            Math.round(stepsFromCenterFront.x * this.roundingDenominator) /
            this.roundingDenominator;
        stepsFromCenterFront.y =
            Math.round(stepsFromCenterFront.y * this.roundingDenominator) /
            this.roundingDenominator;

        /* ----------- Calculate X descriptions ----------- */
        // Determine which side of the field the marcher is on
        output.sideDescription = stepsFromCenterFront.x > 0 ? 2 : 1;

        const sideDescriptions =
            ReadableCoords._fieldProperties.sideDescriptions;
        output.sideDescription = "";
        if (stepsFromCenterFront.x !== 0) {
            output.sideDescription =
                stepsFromCenterFront.x < 0
                    ? sideDescriptions.terseLeft
                    : sideDescriptions.terseRight;
        }

        // create a const for shorthand
        const xStepsFromCenter = stepsFromCenterFront.x;

        // Determine which yard line the marcher is on
        const xCheckpoints = props.xCheckpoints;
        output.xCheckpoint = findClosestCheckpoint(
            xStepsFromCenter,
            xCheckpoints,
            "x",
        );

        // Determine how many steps inside or outside the xCheckpoint (yard line) the marcher is
        // Absolute value is used to maintain symmetry from the center
        const stepsFromXCheckpoint =
            Math.abs(output.xCheckpoint.stepsFromCenterFront) -
            Math.abs(xStepsFromCenter);
        // Define the marcher's relation to the xCheckpoint
        if (stepsFromXCheckpoint === 0) output.xDescription = X_DESCRIPTION.ON;
        else if (stepsFromXCheckpoint < 0)
            output.xDescription = X_DESCRIPTION.OUTSIDE;
        else output.xDescription = X_DESCRIPTION.INSIDE;

        // Define the xSteps of the output and round to 2 decimal places
        output.xSteps = Math.round(Math.abs(stepsFromXCheckpoint) * 100) / 100;

        /* ----------- Calculate Y descriptions ----------- */
        // create a const for shorthand
        const yStepsFromCenter = stepsFromCenterFront.y;

        // Determine which yCheckpoint (hash/sideline) the marcher is guiding to
        const yCheckpoints = props.yCheckpoints;
        output.yCheckpoint = findClosestCheckpoint(
            yStepsFromCenter,
            yCheckpoints,
            "y",
        );

        // Determine how many steps in front or behind of the yCheckpoint that the marcher is
        const stepsFromYCheckpoint =
            output.yCheckpoint.stepsFromCenterFront - yStepsFromCenter;

        // Define the marcher's relation to the yCheckpoint
        if (stepsFromYCheckpoint === 0) output.yDescription = Y_DESCRIPTION.ON;
        else if (stepsFromYCheckpoint < 0)
            output.yDescription = Y_DESCRIPTION.IN_FRONT_OF;
        else output.yDescription = Y_DESCRIPTION.BEHIND;

        // Define the ySteps of the output and round to 2 decimal places
        output.ySteps = Math.round(Math.abs(stepsFromYCheckpoint) * 100) / 100;

        return output as ReadableCoords;
    }

    /**
     * Steps rounded to at most two decimal places, for the readouts below.
     */
    private static roundSteps(steps: number) {
        return Math.round(steps * 100) / 100;
    }

    /** "S1: <position>", or the position alone at the center line, where there's no side. */
    private withSide(position: string) {
        return this.sideDescription.length === 0
            ? position
            : tolgee.t("coordinates.withSide", {
                  side: this.sideDescription,
                  position,
              });
    }

    /**
     * @returns A verbose string description of the ReadableCoords.
     */
    toString() {
        return tolgee.t("coordinates.full", {
            x: this.toVerboseStringX(),
            y: this.toVerboseStringY(),
        });
    }

    isFieldCenter() {
        return this.xCheckpoint.stepsFromCenterFront === 0 && this.xSteps === 0;
    }

    /**
     * Create a verbose description of a ReadableCoords' X properties.
     *
     * @param includeStepsString Whether or not to include the word "step(s)" in the string. False by default.
     * @returns A string description of the marcher's readable x coordinate.
     * (E.g. "S1: 3 steps inside 35 yard line", "S2: On 40 yard line")
     */
    toVerboseStringX({
        includeStepsString = false,
    }: {
        includeStepsString?: boolean;
    } = {}) {
        const params = {
            steps: ReadableCoords.roundSteps(this.xSteps),
            checkpoint: this.xCheckpoint.name,
        };
        switch (this.xDescription) {
            case X_DESCRIPTION.INSIDE:
                return this.withSide(
                    includeStepsString
                        ? tolgee.t("coordinates.verbose.insideSteps", params)
                        : tolgee.t("coordinates.verbose.inside", params),
                );
            case X_DESCRIPTION.OUTSIDE:
                return this.withSide(
                    includeStepsString
                        ? tolgee.t("coordinates.verbose.outsideSteps", params)
                        : tolgee.t("coordinates.verbose.outside", params),
                );
            case X_DESCRIPTION.ON:
                return this.withSide(
                    tolgee.t("coordinates.verbose.onX", params),
                );
        }
    }

    /**
     * Create a terse description of a ReadableCoords' X properties.
     *
     * @returns A string description of the marcher's readable x coordinate.
     * ("S1: 3 IN 35", "S2: 2 OUT 0", "S1: On 20")
     */
    toTerseStringX() {
        const params = {
            steps: ReadableCoords.roundSteps(this.xSteps),
            checkpoint: this.xCheckpoint.terseName,
        };
        switch (this.xDescription) {
            case X_DESCRIPTION.INSIDE:
                return this.withSide(
                    tolgee.t("coordinates.terse.inside", params),
                );
            case X_DESCRIPTION.OUTSIDE:
                return this.withSide(
                    tolgee.t("coordinates.terse.outside", params),
                );
            case X_DESCRIPTION.ON:
                return this.withSide(tolgee.t("coordinates.terse.onX", params));
        }
    }

    /**
     * Create a verbose description of a ReadableCoords' Y properties.
     *
     * @param includeStepsString Whether or not to include the word "step(s)" in the string. False by default.
     * @returns A string description of the marcher's readable y coordinate.
     * ("5 steps behind front hash", "On front sideline")
     */
    toVerboseStringY({
        includeStepsString = false,
    }: { includeStepsString?: boolean } = {}) {
        const params = {
            steps: ReadableCoords.roundSteps(this.ySteps),
            checkpoint: this.yCheckpoint.name,
        };
        switch (this.yDescription) {
            case Y_DESCRIPTION.IN_FRONT_OF:
                return includeStepsString
                    ? tolgee.t("coordinates.verbose.inFrontOfSteps", params)
                    : tolgee.t("coordinates.verbose.inFrontOf", params);
            case Y_DESCRIPTION.BEHIND:
                return includeStepsString
                    ? tolgee.t("coordinates.verbose.behindSteps", params)
                    : tolgee.t("coordinates.verbose.behind", params);
            case Y_DESCRIPTION.ON:
                return tolgee.t("coordinates.verbose.onY", params);
        }
    }

    /**
     * Create a terse description of a ReadableCoords' Y properties.
     *
     * @returns A string description of the marcher's readable  coordinate.
     * ("9 FR BH" -> 9 steps in front of the back hash , "12 BE FSL" -> 12 steps behind front sideline , "On FH")
     */
    toTerseStringY() {
        const params = {
            steps: ReadableCoords.roundSteps(this.ySteps),
            checkpoint: this.yCheckpoint.terseName,
        };
        switch (this.yDescription) {
            case Y_DESCRIPTION.IN_FRONT_OF:
                return tolgee.t("coordinates.terse.inFrontOf", params);
            case Y_DESCRIPTION.BEHIND:
                return tolgee.t("coordinates.terse.behind", params);
            case Y_DESCRIPTION.ON:
                return tolgee.t("coordinates.terse.onY", params);
        }
    }
}
