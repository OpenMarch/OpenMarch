/**
 * FieldProperties define everything about the performance area the marchers are on.
 *
 * This includes the size of the field, the x/y checkpoints (i.e. yard lines and hashes),
 * the number of steps between lines, etc.
 *
 * All numbers (that aren't defined as pixels) are in 8 to 5 steps, which are 22.5 inches.
 */
export class FieldProperties {
    /*********** Constants ***********/
    static readonly PIXELS_PER_STEP: number = 10;
    static readonly GRID_STROKE_WIDTH = 1;


    /*********** Attributes ***********/
    /**
     *  In pixels. The canvas coordinates (in pixels) of the perceivable center front of the field.
     * All FieldProperties are based on this point.
     * E.g. On the 50 yard line, on the front sideline.
     */
    readonly centerFrontPoint: { xPixels: number, yPixels: number };
    /**
     * An array of objects with the name of the X checkpoint and the number of X steps from the center.
     * E.g. The 40 yard line side 2 line would be { "40": 16 }, side 1 would be { "40": -16 }
     */
    readonly xCheckpoints: Checkpoint[];
    /**
     * An array of objects with the name of the Y checkpoint and the number of Y steps from the center.
     * The front hash on a college field would be { "front hash": 80 } (assuming the orgin )
     * Note that Y trends positive towards the front of the field (bottom on the canvas).
     */
    readonly yCheckpoints: Checkpoint[];

    /** In pixels. The width of the field on the x axis. E.g end zone to end zone */
    readonly width: number;
    /** In pixels. The height of the field on the y axis. E.g side line to side line */
    readonly height: number;
    /** The template this FieldProperties object is based on */
    readonly template: FieldProperties.Template;

    constructor(template: FieldProperties.Template) {
        switch (template) {
            case FieldProperties.Template.NCAA:
                this.centerFrontPoint = { xPixels: 800, yPixels: 853.3 };
                this.xCheckpoints = FieldProperties.createFootballFieldXCheckpoints();
                this.yCheckpoints = FieldProperties.createNCAAFootballFieldYCheckpoints();
                this.template = template;
                break;
            default:
                throw new Error(`FieldProperties ${template} template not supported`);
        }

        const minX = this.xCheckpoints.reduce((min, cur) => (cur.stepsFromCenterFront < min) ? cur.stepsFromCenterFront : min, 0);
        const maxX = this.xCheckpoints.reduce((max, cur) => (cur.stepsFromCenterFront > max) ? cur.stepsFromCenterFront : max, 0);
        const minY = this.yCheckpoints.reduce((min, cur) => (cur.stepsFromCenterFront < min) ? cur.stepsFromCenterFront : min, 0);
        const maxY = this.yCheckpoints.reduce((max, cur) => (cur.stepsFromCenterFront > max) ? cur.stepsFromCenterFront : max, 0);
        this.width = (maxX - minX) * FieldProperties.PIXELS_PER_STEP;
        this.height = (maxY - minY) * FieldProperties.PIXELS_PER_STEP;
    }

    static getPixelsPerStep(): number {
        return FieldProperties.PIXELS_PER_STEP;
    }

    static getStepsPerPixel(): number {
        return 1 / FieldProperties.PIXELS_PER_STEP;
    }

    /**
     * @returns The x checkpoints for a football field (the yard lines).
     * 0 is the center of the field. To negative is side 1, to positive is side 2.
     */
    private static createFootballFieldXCheckpoints(): Checkpoint[] {
        const xCheckpoints: Checkpoint[] = [];

        for (let yards = 0; yards <= 100; yards = yards += 5) {
            const curYardLine = (yards < 50) ? yards : (100 - yards);
            const stepsFromCenterFront = ((yards - 50) / 5) * 8;
            // If the yard line is a multiple of 10 and not 0, label it
            const label = (curYardLine !== 0 && curYardLine % 10 === 0) ? curYardLine.toString() : undefined;

            xCheckpoints.push({
                name: `${curYardLine} yard line`,
                axis: "x",
                terseName: curYardLine.toString(),
                stepsFromCenterFront: stepsFromCenterFront,
                useAsReference: true,
                fieldLabel: label
            });
        }
        return xCheckpoints;
    }

    /**
     * @returns The y checkpoints for an NCAA football field.
     * 0 is the front sideline. To negative is the back sideline.
     */
    private static createNCAAFootballFieldYCheckpoints(): Checkpoint[] {
        const fieldStandard = "NCAA";
        const frontSideline: Checkpoint =
        {
            name: "front sideline", axis: "y", stepsFromCenterFront: 0,
            useAsReference: true, terseName: "FSL", visible: false
        };
        const frontHash: Checkpoint =
        {
            name: "front hash", axis: "y", stepsFromCenterFront: -32,
            useAsReference: true, terseName: "FH", fieldStandard: fieldStandard
        };
        const gridBackHash: Checkpoint =
        {
            name: "grid back hash", axis: "y", stepsFromCenterFront: -52,
            useAsReference: true, terseName: "grid:BH", fieldStandard: fieldStandard
        };
        const realBackHash: Checkpoint =
        {
            name: "real back hash", axis: "y", stepsFromCenterFront: -53.33,
            useAsReference: false, terseName: "real:BH", fieldStandard: fieldStandard
        };
        const gridBackSideline: Checkpoint =
        {
            name: "grid back sideline", axis: "y", stepsFromCenterFront: -85,
            useAsReference: true, terseName: "grid:BSL", fieldStandard: fieldStandard, visible: false
        };
        const realBackSideline: Checkpoint =
        {
            name: "real back sideline", axis: "y", stepsFromCenterFront: -85.33,
            useAsReference: false, terseName: "real:BSL", fieldStandard: fieldStandard, visible: false
        };
        return [
            frontSideline,
            frontHash,
            gridBackHash,
            realBackHash,
            gridBackSideline,
            realBackSideline
        ];
    }

    // TODO High school, NFL, checkpoints. With high school, you need to consider how the step sizes change
}

export default FieldProperties

export namespace FieldProperties {
    /**
     * The templates for the field properties. E.g. NCAA, NFL, High School
     * Only NCAA is supported right now.
     */
    export enum Template {
        NCAA = "NCAA"
    }
}

/** A reference point on the field. Yard line, hash, etc. */
export interface Checkpoint {
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
     * The standard this checkpoint relates to if applicable (NCAA, High school, etc.)
     */
    fieldStandard?: string;
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
    visible?: boolean;
}

interface YardNumberCoordinates {
    /**
     * Number of steps from the front sideline to the outside of the home number
     * (closer to the front sideline)
     */
    homeStepsFromFrontToOutside: number;
    /**
     * Number of steps from the front sideline to the inside of the home number
     * (closer to the center of the field)
     */
    homeStepsFromFrontToInside: number;
    /**
     * Number of steps from the front sideline to the inside of the away number
     * (closer to the center of the field)
     */
    awayStepsFromFrontToInside: number;
    /**
     * Number of steps from the front sideline to the outside of the away number
     * (closer to the back sideline)
     */
    awayStepsFromFrontToOutside: number;
}

export function getYardNumberCoordinates(template: FieldProperties.Template): YardNumberCoordinates {
    switch (template) {
        case FieldProperties.Template.NCAA: {
            let coordinates: YardNumberCoordinates = {
                homeStepsFromFrontToOutside: 11.2,
                homeStepsFromFrontToInside: 14.4,
                awayStepsFromFrontToInside: 70.9333,
                awayStepsFromFrontToOutside: 74.1333
            };
            return coordinates;
        }
        default:
            throw new Error(`FieldProperties ${template} template not supported`);
    }
}
