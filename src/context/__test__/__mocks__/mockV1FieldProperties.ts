import { FieldProperties } from "@/global/Interfaces";

// The "origin" of a football field is on the 50 yard line on the front hash. This is the pixel position on the canvas.
const V1_ORIGIN = { x: 800, y: 520 };
/**
 * A list of properties for a college football field. Each property is in steps. For pixels, multiply by pixelsPerStep.
 */
export const mockV1FieldProperties: FieldProperties = {
    frontSideline: 32,
    frontHash: 0,
    backHash: -20,
    backSideline: -52,
    originX: V1_ORIGIN.x,
    originY: V1_ORIGIN.y,
    pixelsPerStep: 10,
    roundFactor: 20, // 1/x. 4 -> nearest .25, 2 -> nearest .5, 10 -> nearest .1, 100 -> nearest .01
    width: 1600,
    height: 840,
    stepsBetweenLines: 8
} as const;
