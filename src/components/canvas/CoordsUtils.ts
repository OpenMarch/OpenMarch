/** A collection of utility functions to translate raw coordinates into readable coordinates */

import { ReadableCoords, FieldProperties } from "../../global/Interfaces";

const roundFactor = 100; // 1/x. 4 -> nearest .25, 2 -> nearest .5, 10 -> nearest .1, 100 -> nearest .01

/**
 * Formats a string of a number to have at most two decimal places.
 *
 * @param input string of a number to be formatted
 * @returns String of a number with at most two decimal places
 */
function formatNumberString(input: number, includeStepsString = false) {
    const stepString = input === 1 ? "step" : "steps";
    return `${Math.round(input * 100) / 100} ` + (includeStepsString ? `${stepString} ` : "");
}

/**
 * Translates raw canvas coordinates into readable coordinates.
 * This is for a college football field.
 *
 * @param x Canvas x coordinate
 * @param y Canvas y coordinate
 * @returns An object with all of the information needed to make a readable coordinate. (See ReadableCoords interface)
 */
export function canvasCoordsToCollegeRCords(x: number, y: number, props: FieldProperties) {
    const output: ReadableCoords = {} as ReadableCoords;
    const newCoords = {
        x: (x - props.originX) / props.pixelsPerStep,
        y: (y - props.originY) / props.pixelsPerStep
    };


    // Round
    let tempXSteps = (Math.round(newCoords.x * roundFactor) / roundFactor);
    const tempYSteps = (Math.round(newCoords.y * roundFactor) / roundFactor);


    /* ----------- Calculate X descriptions ----------- */
    // Determine which side of the field the marcher is on
    output.side = tempXSteps > 0 ? 2 : 1;

    // Change steps to absolute value for following calculations
    tempXSteps = Math.abs(tempXSteps);

    // Determine which yard line the marcher is on
    output.yardLine = 50 - ((Math.round(tempXSteps / 8)) * 5);

    // Determine how many steps inside or outside the yard line the marcher is
    if (output.yardLine < 0) {
        // Fix for negative yard lines. Coordinates can be an infinite amount outside of the 0 Yard Line.
        output.yardLine = 0;
        output.xSteps = tempXSteps - 72;
        output.xDescription = "outside";
    }
    else if (tempXSteps % 8 === 0) {
        output.xSteps = 0;
        output.xDescription = "On";
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
        output.yDescription = "On";
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
        // ensure ySteps is positive and limit to 2 decimal places
        output.ySteps = +Math.abs(output.ySteps).toFixed(2);
        output.xSteps = +output.xSteps.toFixed(2);
    }
    return output;
}

/* ----------- String Getters ----------- */
/**
 * A utility toString function to create a verbose description of a marcher's X position.
 *
 * @param rCoords A ReadableCoords object to create a verbose string out of.
 * @param includeStepsWord Whether or not to include the word "steps" in the string.
 * @returns A string description of the marcher's readable x coordinate.
 * ("3 steps inside 35 yard line side 1", "on the 40 yard line side 2")
 */
export function getVerboseStringX(rCoords: ReadableCoords, includeStepsWord = true) {
    if (!rCoords) return "Error getting coordinate details";
    return `S${rCoords.side}: ` +
        (rCoords.xSteps === 0 ? "" : formatNumberString(rCoords.xSteps, includeStepsWord))
        + rCoords.xDescription + " "
        + rCoords.yardLine + " yard line";
}

/**
 * A utility toString function to create a terse description of a marcher's X position.
 *
 * @param rCoords A ReadableCoords object to create a verbose string out of.
 * @returns An abbreviated string description of the marcher's readable x coordinate.
 * ("3 in 35 S1" ," 2 out 0 S2" , "on 20 S1")
 */
export function getTerseStringX(rCoords: ReadableCoords) {
    if (!rCoords) return "Error getting coordinate details";
    const newDescription = rCoords.xSteps === 0 ? "On" : (rCoords.xDescription === "inside" ? "in" : "out");
    return `S${rCoords.side}: ` +
        (rCoords.xSteps === 0 ? "" : (formatNumberString(rCoords.xSteps) + " "))
        + newDescription + " " + rCoords.yardLine;
}

/**
 * A utility toString function to create a verbose description of a marcher's Y position.
 *
 * @param rCoords A ReadableCoords object to create a verbose string out of.
 * @param includeStepsWord Whether or not to include the word "steps" in the string.
 * @returns A string description of the marcher's readable y coordinate.
 * ("5 steps behind front hash", "on the front sideline")
 */
export function getVerboseStringY(rCoords: ReadableCoords, includeStepsWord = true) {
    if (!rCoords) return "Error getting coordinate details";
    return (rCoords.xSteps === 0 ? "" : formatNumberString(rCoords.ySteps, includeStepsWord))
        + rCoords.yDescription + " " + rCoords.hash;
}

/**
 * A utility toString function to create a terse description of a marcher's Y position.
 *
 * @param rCoords A ReadableCoords object to create a verbose string out of.
 * @returns An abbreviated string description of the marcher's readable y coordinate.
 * ("9 FBH" -> 9 steps in front of the back hash , "12 BFSL" -> 12 steps behind front sideline , "on FH")
 */
export function getTerseStringY(rCoords: ReadableCoords) {
    if (!rCoords) return "Error getting coordinate details";
    const newDescription = rCoords.ySteps === 0 ? "On " : (rCoords.yDescription === "behind" ? "B" : "F");
    const newHash = rCoords.hash === "front sideline" ? "FSL"
        : (rCoords.hash === "front hash" ? "FH"
            : (rCoords.hash === "back hash" ? "BH"
                : "BSL"));
    return (rCoords.ySteps === 0 ? "" : (formatNumberString(rCoords.ySteps) + " ")) + " " + newDescription + newHash;
}

/**
 *  Returns a terse version of the given string.
 *
 * @param str "front sideline", "front hash", "back hash", "back sideline", "inside", "outside", "in front of", "behind"
 * @returns A string that is the terse version of the given string.
 */
export function getTerseString(str: string) {
    switch (str) {
        case "front sideline":
            return "FSL";
        case "front hash":
            return "FH";
        case "back hash":
            return "BH";
        case "back sideline":
            return "BSL";
        case "inside":
            return "in";
        case "outside":
            return "out";
        case "in front of":
            return "F";
        case "behind":
            return "B";
        default:
            return "Error";
    }
}

function findHalfway(a: number, b: number) {
    return (a + b) / 2;
}

