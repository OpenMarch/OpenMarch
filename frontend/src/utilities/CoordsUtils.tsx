/* A collection of utility functions to translate raw coordinates into readable coordinates */

import { ReadableCoords, fieldProperties } from "../Interfaces";



// The "origin" of a football field is on the 50 yard line on the front hash. This is the pixel position on the canvas.
export const V1_ORIGIN = { x: 800, y: 534 };
/**
 * A lsit of properties for a college football field. Each property is in steps. For pixels, multiply by pixelsPerStep.
 */
export const V1_COLLEGE_PROPERTIES: fieldProperties = {
    frontSideline: 32,
    frontHash: 0,
    backHash: -20,
    backSideline: -52,
    origin: V1_ORIGIN,
    pixelsPerStep: 10,
    roundFactor: 4,
    width: 1600,
    height: 840
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
                    output.ySteps = tempYSteps - props.frontSideline;
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
                    output.ySteps = tempYSteps - props.backHash;
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
    return output;
}

/**
 * A utility toString function to create a verbose description of a marcher's X position.
 *
 * @param rCoords A ReadableCoords object to create a verbose string out of.
 * @param steps Whether or not to include the amount of steps the marcher is from the nearest yard line. (default true)
 * @returns A string description of the marcher's readable x coordinate.
 * ("3 steps inside the 35 yard line side 1", "on the 40 yard line side 2")
 */
export function xToVerboseString(rCoords: ReadableCoords, steps: boolean = true) {
    if (!rCoords) return "Error getting coordinate details";
    return (rCoords.xSteps === 0 || !steps ? "" : (rCoords.xSteps + " steps "))
        + rCoords.xDescription + " the "
        + rCoords.yardLine + " yard line side " + rCoords.side;
}

/**
 * A utility toString function to create a terse description of a marcher's X position.
 *
 * @param rCoords A ReadableCoords object to create a verbose string out of.
 * @param steps Whether or not to include the amount of steps the marcher is from the nearest yard line. (default true)
 * @returns An abbreviated string description of the marcher's readable x coordinate.
 * ("3 in 35 S1" ," 2 out 0 S2" , "on 20 S1")
 */
export function xToTerseString(rCoords: ReadableCoords, steps: boolean = true) {
    if (!rCoords) return "Error getting coordinate details";
    const newDescription = rCoords.xSteps === 0 ? "on" : (rCoords.xDescription === "inside" ? "in" : "out");
    return (rCoords.xSteps === 0 || !steps ? "" : (rCoords.xSteps + " "))
        + newDescription + " " + rCoords.yardLine + " S" + rCoords.side;
}

/**
 * A utility toString function to create a verbose description of a marcher's Y position.
 *
 * @param rCoords A ReadableCoords object to create a verbose string out of.
 * @param steps Whether or not to include the amount of steps the marcher is from the nearest yard line. (default true)
 * @returns A string description of the marcher's readable y coordinate.
 * ("5 steps behind the front hash", "on the front sideline")
 */
export function yToVerboseString(rCoords: ReadableCoords, steps: boolean = true) {
    if (!rCoords) return "Error getting coordinate details";
    return (rCoords.xSteps === 0 || !steps ? "" : (rCoords.ySteps + " steps "))
        + rCoords.yDescription + " the " + rCoords.hash;
}

/**
 * A utility toString function to create a terse description of a marcher's Y position.
 *
 * @param rCoords A ReadableCoords object to create a verbose string out of.
 * @param steps Whether or not to include the amount of steps the marcher is from the nearest yard line. (default true)
 * @returns An abbreviated string description of the marcher's readable y coordinate.
 * ("9 FBH" -> 9 steps in front of the back hash , "12 BFSL" -> 12 steps behind front sideline , "on FH")
 */
export function yToTerseString(rCoords: ReadableCoords, steps: boolean = true) {
    if (!rCoords) return "Error getting coordinate details";
    const newDescription = rCoords.ySteps === 0 ? "on " : (rCoords.yDescription === "behind" ? "B" : "F");
    const newHash = rCoords.hash === "front sideline" ? "FSL"
        : (rCoords.hash === "front hash" ? "FH"
            : (rCoords.hash === "back hash" ? "BH"
                : "BSL"));
    return (rCoords.ySteps === 0 || !steps ? "" : (rCoords.ySteps + " ")) + " " + newDescription + newHash;
}

// const newHash = rCoords.hash === "front sideline" ? "FSL" : (rCoords.hash === "front hash" ? "FH" : (rCoords.hash === "back hash" ? "BH" : "BSL"));

function findHalfway(a: number, b: number) {
    return (a + b) / 2;
}
