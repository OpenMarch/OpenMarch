interface FieldPropertyArgs {
    name: string;
    xCheckpoints: Checkpoint[];
    yCheckpoints: Checkpoint[];
    yardNumberCoordinates?: YardNumberCoordinates;
    sideDescriptions?: SideDescriptions;
    halfLineXInterval?: number;
    halfLineYInterval?: number;
    stepSizeInches?: number;
    measurementSystem?: MeasurementSystem;
    topLabelsVisible?: boolean;
    bottomLabelsVisible?: boolean;
    leftLabelsVisible?: boolean;
    rightLabelsVisible?: boolean;
    useHashes?: boolean;
    isCustom?: boolean;
}

export type MeasurementSystem = "imperial" | "metric";
const defaultSideDescriptions: SideDescriptions = {
    verboseLeft: "Side 1",
    verboseRight: "Side 2",
    terseLeft: "S1",
    terseRight: "S2",
};

/**
 * FieldProperties define everything about the performance area the marchers are on.
 *
 * This includes the size of the field, the x/y checkpoints (i.e. yard lines and hashes),
 * the number of steps between lines, etc.
 *
 * All numbers (that aren't defined as pixels) are in 8 to 5 steps, which are 22.5 inches.
 */
export default class FieldProperties {
    /*********** Constants ***********/
    /** The width of the grid lines in the UI. I can't think of a reason to change this. */
    static readonly GRID_STROKE_WIDTH = 1;
    /** The number of canvas "pixels" per inch in the real world.
     * If this constant ever changes, it will mess up old files.
     */
    static readonly PIXELS_PER_INCH = 0.5;

    /*********** Attributes ***********/
    /**
     *  In pixels. The canvas coordinates (in pixels) of the perceivable center front of the field.
     * All FieldProperties are based on this point.
     * E.g. On the 50 yard line, on the front sideline.
     */
    readonly centerFrontPoint: { xPixels: number; yPixels: number };
    /**
     * An array of objects with the name of the X checkpoint and the number of X steps from the center.
     * The name of each checkpoint must be unique.
     * E.g. The 40 yard line side 2 line would be { "40": 16 } , side 1 would be { "40": -16 }
     * I.e. the audience's left side is the negative side, the right side is the positive side.
     */
    readonly xCheckpoints: Checkpoint[];
    /**
     * An array of objects with the name of the Y checkpoint and the number of Y steps from the center.
     * The front hash on a college field would be { "front hash": 80 } (assuming the origin )
     * The name of each checkpoint must be unique.
     *
     * Note that Y trends positive towards the front of the field (bottom on the canvas).
     */
    readonly yCheckpoints: Checkpoint[];
    /**
     * The size of this field's step in inches.
     */
    readonly stepSizeInches: number;

    /** The name of the FieldProperties. E.g. "High School Football Field" or "Custom Gym Floor" */
    readonly name: string;
    /** In pixels. The width of the field on the x axis. E.g end zone to end zone */
    readonly width: number;
    /** In pixels. The height of the field on the y axis. E.g side line to side line */
    readonly height: number;
    /** Optional. In steps, the location of the top and bottom of the yard line numbers on the field */
    readonly yardNumberCoordinates: YardNumberCoordinates;
    /** The description of the sides of the field. E.g. "Side 1" and "Side 2" */
    readonly sideDescriptions: SideDescriptions;
    /** The interval that half lines appear in the UI on the X axis from the center of the field. */
    readonly halfLineXInterval?: number;
    /** The interval that half lines appear in the UI on the Y axis from the front of the field. */
    readonly halfLineYInterval?: number;
    /**
     * The measurement system used for the field. Imperial or Metric.
     * This only affects some cosmetic things and stepSizeInches is still in inches.
     */
    readonly measurementSystem: MeasurementSystem;
    /** If the top labels should be visible. */
    readonly topLabelsVisible: boolean;
    /** If the bottom labels should be visible. */
    readonly bottomLabelsVisible: boolean;
    /** If the left labels should be visible */
    readonly leftLabelsVisible: boolean;
    /** If the right labels should be visible */
    readonly rightLabelsVisible: boolean;
    /** If the Y-checkpoints are hashes, like in a football field.
     * Otherwise Y-checkpoints will be printed as lines
     */
    readonly useHashes: boolean;
    /** If this field is a custom field. */
    readonly isCustom: boolean;

    constructor({
        name,
        xCheckpoints,
        yCheckpoints,
        yardNumberCoordinates = {},
        sideDescriptions = defaultSideDescriptions,
        halfLineXInterval = 0,
        halfLineYInterval = 0,
        stepSizeInches = 22.5,
        measurementSystem = "imperial",
        topLabelsVisible = true,
        bottomLabelsVisible = true,
        leftLabelsVisible = true,
        rightLabelsVisible = true,
        useHashes = false,
        isCustom = true,
    }: FieldPropertyArgs) {
        this.name = name;

        // Verify x checkpoints have unique ids
        const xIds = new Set();
        for (const checkpoint of xCheckpoints) {
            if (xIds.has(checkpoint.id)) {
                throw new Error(
                    `Duplicate x checkpoint ID found: ${checkpoint.id}`,
                );
            }
            xIds.add(checkpoint.id);
        }

        // Verify y checkpoints have unique ids
        const yIds = new Set();
        for (const checkpoint of yCheckpoints) {
            if (yIds.has(checkpoint.id)) {
                throw new Error(
                    `Duplicate y checkpoint id found: ${checkpoint.id}`,
                );
            }
            yIds.add(checkpoint.id);
        }

        this.xCheckpoints = xCheckpoints;
        this.yCheckpoints = yCheckpoints;
        this.yardNumberCoordinates = yardNumberCoordinates;
        this.sideDescriptions = sideDescriptions;
        this.halfLineXInterval = halfLineXInterval;
        this.halfLineYInterval = halfLineYInterval;
        this.stepSizeInches = stepSizeInches;
        this.measurementSystem = measurementSystem;

        this.topLabelsVisible = topLabelsVisible;
        this.bottomLabelsVisible = bottomLabelsVisible;
        this.leftLabelsVisible = leftLabelsVisible;
        this.rightLabelsVisible = rightLabelsVisible;
        this.useHashes = useHashes;
        this.isCustom = isCustom;

        const minX = this.xCheckpoints.reduce(
            (min, cur) =>
                cur.stepsFromCenterFront < min ? cur.stepsFromCenterFront : min,
            0,
        );
        const maxX = this.xCheckpoints.reduce(
            (max, cur) =>
                cur.stepsFromCenterFront > max ? cur.stepsFromCenterFront : max,
            0,
        );
        const minY = this.yCheckpoints.reduce(
            (min, cur) =>
                cur.stepsFromCenterFront < min ? cur.stepsFromCenterFront : min,
            0,
        );
        const maxY = this.yCheckpoints.reduce(
            (max, cur) =>
                cur.stepsFromCenterFront > max ? cur.stepsFromCenterFront : max,
            0,
        );
        this.width = (maxX - minX) * this.pixelsPerStep;
        this.height = (maxY - minY) * this.pixelsPerStep;

        this.centerFrontPoint = {
            xPixels: this.width / 2,
            yPixels: this.height,
        };
    }

    /**
     * The number of pixels per step.
     *
     * Uses the stepSizeInches along with PIXELS_PER_INCH to calculate the number of pixels per step.
     * This means that the pixels per step will be representative of real space.
     */
    get pixelsPerStep(): number {
        return this.stepSizeInches * FieldProperties.PIXELS_PER_INCH;
    }

    get stepSizeInUnits(): number {
        return this.measurementSystem === "imperial"
            ? this.stepSizeInches
            : 2.54 * this.stepSizeInches;
    }

    /**
     * Converts a value in centimeters to inches.
     * @param centimeters - The value in centimeters to be converted.
     * @returns The value in inches.
     */
    static centimetersToInches(centimeters: number): number {
        return centimeters / 2.54;
    }
}

/** A reference point on the field. Yard line, hash, etc. */
export interface Checkpoint {
    /**
     * An identifier for the checkpoint. The number is arbitrary, but must be unique.
     */
    id: number;
    /**
     * "50 yard line", "front hash", "real college back hash", "grid high school back hash"
     */
    name: string;
    /**
     * The axis this checkpoint tracks. Yard line would be "x" and hashes would be "y"
     */
    axis: "x" | "y";
    /**
     * A shorthand to put on abbreviated coordinates.
     * E.g. back sideline -> bsl; 35 yard line -> 35
     * */
    terseName: string;
    /**
     * How many steps from the center front the checkpoint is on its respective axis.
     * X axis - toward side 1 is negative, towards side 2 is positive
     * Y axis - behind the front is negative, in front is positive
     */
    stepsFromCenterFront: number;
    /**
     * True if you want ReadableCoords to reference this.
     * False if you just want this checkpoint to be visible on the canvas but not referenced.
     */
    useAsReference: boolean;
    /**
     * Number/label to put on the field for reference. E.g. 50 yard line, 20 yard line, etc.
     */
    fieldLabel?: string;
    /**
     * Whether or not this checkpoint should be visible on the canvas.
     * If false, it will not be drawn. Default is true if not defined.
     */
    visible: boolean;
}

/** The location of the top/bottom of the yard line numbers */
export interface YardNumberCoordinates {
    /**
     * Number of steps from the front sideline to the outside of the home number
     * (closer to the front sideline)
     */
    homeStepsFromFrontToOutside?: number;
    /**
     * Number of steps from the front sideline to the inside of the home number
     * (closer to the center of the field)
     */
    homeStepsFromFrontToInside?: number;
    /**
     * Number of steps from the front sideline to the inside of the away number
     * (closer to the center of the field)
     */
    awayStepsFromFrontToInside?: number;
    /**
     * Number of steps from the front sideline to the outside of the away number
     * (closer to the back sideline)
     */
    awayStepsFromFrontToOutside?: number;
}

/**
 * Strings to describe the left and right sides of the field.
 *
 * The left and right in the variable names are from the director's (audience's) perspective.
 */
export interface SideDescriptions {
    /** E.g. "Side 1"," Audience Left" or "Stage Right" */
    verboseLeft: string;
    /** E.g. "Side 2"," Audience Right" or "Stage Left" */
    verboseRight: string;
    /** E.g. "S1", "AL" or "SR" (short for "Side 1", "Audience Left" or "Stage Right") */
    terseLeft: string;
    /** E.g. "S2", "AR" or "SL" (short for "Side 2", "Audience Right" or "Stage Left") */
    terseRight: string;
}
