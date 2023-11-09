/* A collection of utility functions to translate raw coordinates into readable coordinates */

export interface ReadableCoords {
    yardLine: number;
    side: number;
    hash: string;
    xDescription: string;
    yDescription: string;
    xSteps: number;
    ySteps: number;
}
interface fieldProperties {
    frontSideline: number;
    frontHash: number;
    backHash: number;
    backSideline: number;
    origin: { x: number, y: number };
    pixelsPerStep: number;
    roundFactor: number; // 4 -> nearest .25, 2 -> nearest .5, 10 -> nearest .1
}

// The "origin" of a football field is on the 50 yard line on the front hash.
const V1_ORIGIN = { x: 782, y: 505 };
const CURRENT_ORIGIN = V1_ORIGIN;
export const V1_COLLEGE_PROPERTIES: fieldProperties = {
    frontSideline: 32,
    frontHash: 0,
    backHash: -20,
    backSideline: -52,
    origin: V1_ORIGIN,
    pixelsPerStep: 10,
    roundFactor: 4,
};
/**
 * Translates raw coordinates into readable coordinates. Currently only supports .25 step accuracy.
 *
 * @param x Canvas x coordinate
 * @param y Canvas y coordinate
 * @returns An object with all of the information needed to make a readable coordinate. (See ReadableCoords interface)
 */
export function coordsToCollege(x: number, y: number, props: fieldProperties = V1_COLLEGE_PROPERTIES) {
    const output: ReadableCoords = {} as ReadableCoords;
    const newCoords = {
        x: (x - props.origin.x) / props.pixelsPerStep,
        y: (y - props.origin.y) / props.pixelsPerStep
    };

    // Round to nearest .25
    let tempXSteps = (Math.round(newCoords.x * props.roundFactor) / props.roundFactor);
    let tempYSteps = (Math.round(newCoords.y * props.roundFactor) / props.roundFactor);

    /* ----------- Calculate X descriptions ----------- */
    // Determine which side of the field the marcher is on
    output.side = tempXSteps > 0 ? 2 : 1;

    // Change steps to absolute value for following calculations
    tempXSteps = Math.abs(tempXSteps);

    // Determine which yard line the marcher is on
    output.yardLine = 50 - ((Math.round(tempXSteps / 8)) * 5);

    // Determine how many steps inside or outside the yard line the marcher is
    // Fix for negative yard lines. Coordinates can be an infinite amount outside of the 0 Yard Line.
    if (output.yardLine < 0) {
        output.yardLine = 0;
        output.xSteps = tempXSteps - 72;
        output.xDescription = "outside";
    }
    else if (tempXSteps % 8 === 0) {
        output.xSteps = 0;
        output.xDescription = "on";
    }
    else if (tempXSteps % 8 < 4) {
        output.xSteps = tempXSteps % 8;
        output.xDescription = "outside";
    }
    else {
        output.xSteps = 8 - (tempXSteps % 8);
        output.xDescription = "inside";
    }

    /* ----------- Calculate Y descriptions ----------- */
    // Calculate halfway points between hashes
    const half_FSL_to_FH = findHalfway(props.frontSideline, props.frontHash);
    const half_FH_to_BH = findHalfway(props.frontHash, props.backHash);
    const half_BH_to_BSL = findHalfway(props.backHash, props.backSideline);

    // Determine which hash the marcher is guiding to
    if (tempYSteps > half_FSL_to_FH) output.hash = "front sideline";
    else if (tempYSteps <= half_FSL_to_FH && tempYSteps >= half_FH_to_BH) output.hash = "front hash";
    else if (tempYSteps < half_FH_to_BH && tempYSteps >= half_BH_to_BSL) output.hash = "back hash";
    else output.hash = "back sideline";

    // Determine the description of the y coordinate and how many steps inside or outside the hash the marcher is
    const behind = "behind"; const inFront = "in front of";
    if (tempYSteps === props.frontSideline || tempYSteps === props.frontHash
        || tempYSteps === props.backHash || tempYSteps === props.backSideline) {
        output.ySteps = 0;
        output.yDescription = "on";
    } else {
        switch (output.hash) {
            case "front sideline":
                if (tempYSteps < props.frontSideline) {
                    output.ySteps = tempYSteps - half_FSL_to_FH;
                    output.yDescription = behind;
                } else {
                    output.ySteps = tempYSteps - props.frontSideline;
                    output.yDescription = inFront;
                }
                break;
            case "front hash":
                if (tempYSteps < props.frontHash) {
                    output.ySteps = tempYSteps;
                    output.yDescription = behind;
                } else {
                    output.ySteps = tempYSteps;
                    output.yDescription = inFront;
                }
                break;
            case "back hash":
                if (tempYSteps < props.backHash) {
                    output.ySteps = props.backHash - tempYSteps;
                    output.yDescription = behind;
                } else {
                    output.ySteps = tempYSteps + props.backHash;
                    output.yDescription = inFront;
                }
                break;
            case "back sideline":
                if (tempYSteps < props.backSideline) {
                    output.ySteps = tempYSteps - props.backSideline;
                    output.yDescription = behind;
                } else {
                    output.ySteps = props.backSideline - tempYSteps;
                    output.yDescription = inFront;
                }
                break;
        }
        // ensure ySteps is positive
        output.ySteps = Math.abs(output.ySteps);
    }
    // else if (tempYSteps % 4 < 2) {
    //     output.ySteps = tempYSteps % 4;
    //     output.yDescription = "outside";
    // }
    // else {
    //     output.ySteps = 4 - (tempYSteps % 4);
    //     output.yDescription = "inside";
    // }

    // Determine how many steps inside or outside the hash the marcher is
    switch (output.hash) {
        case "front sideline":
    }

    return output;
}

function findHalfway(a: number, b: number) {
    return (a + b) / 2;
}
