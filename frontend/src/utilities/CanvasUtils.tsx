
import { fabric } from "fabric";
import { CanvasMarcher, Dimension } from "../Interfaces";
import { Constants } from "../Constants";
import { V1_COLLEGE_PROPERTIES, V1_ORIGIN } from "./CoordsUtils";

/* -------------------------- Field Functions -------------------------- */
export const buildField = (dimensions: Dimension) => {
    const fieldArray: fabric.Object[] = [];
    const width = dimensions.width;
    const height = dimensions.height;
    const actualHeight = dimensions.actualHeight;
    const top = height - actualHeight;

    // Build the grid lines. This is only for a football field right now.
    const borderProps = { stroke: "black", strokeWidth: 3, selectable: false };
    const yardLineProps = { stroke: "black", strokeWidth: 1.2, selectable: false };
    const halfLineProps = { stroke: "#AAAAAA", selectable: false };
    const gridProps = { stroke: "#DDDDDD", selectable: false };
    const hashProps = { stroke: "black", strokeWidth: 3, selectable: false };
    const numberProps = { fontSize: 45, fill: "#888888", selectable: false, charSpacing: 160 };

    // Grid lines
    for (let i = 10; i < width; i += 10)
        fieldArray.push(new fabric.Line([i, top, i, height], gridProps));
    for (let i = height - 10; i > top; i -= 10)
        fieldArray.push(new fabric.Line([0, i, width, i], gridProps));

    // Yard line numbers
    const backSideline = V1_ORIGIN.y + (V1_COLLEGE_PROPERTIES.backSideline * V1_COLLEGE_PROPERTIES.pixelsPerStep);
    const frontSideline = V1_ORIGIN.y + (V1_COLLEGE_PROPERTIES.frontSideline * V1_COLLEGE_PROPERTIES.pixelsPerStep);
    const numberY = 153;
    const xOffset = -6;
    for (let i = 1; i <= 9; i += 1) {
        const yardLineNumber = (i * 10 > 50) ? (100 - i * 10) : (i * 10);
        // Home numbers
        fieldArray.push(new fabric.Text(yardLineNumber.toString(), {
            left: xOffset + (i * 160 - (yardLineNumber > 5 ? 20 : 10)),
            top: frontSideline - numberY,
            ...numberProps
        }));
        // Away numbers
        fieldArray.push(new fabric.Text(yardLineNumber.toString(), {
            left: xOffset + (i * 160 - (yardLineNumber > 5 ? 20 : 10)),
            // top: height - (80 * 9) - 15,
            top: backSideline + numberY,
            flipY: true,
            flipX: true,
            ...numberProps
        }));
        const awayNumber = fieldArray[fieldArray.length - 1];
        fieldArray[fieldArray.length - 1].top = awayNumber!.top! - awayNumber!.height!;
    }

    // Half lines and endzones
    for (let i = 40; i < width; i += 80)
        fieldArray.push(new fabric.Line([i, top, i, height], halfLineProps));
    fieldArray.push(new fabric.Line([80, top, 80, height], halfLineProps));
    fieldArray.push(new fabric.Line([width - 80, top, width - 80, height],
        halfLineProps));

    // Verical lines
    for (let i = height - 40; i > 0; i -= 40)
        fieldArray.push(new fabric.Line([0, i, width, i], halfLineProps));

    // Yard lines
    for (let i = 0; i < width; i += 80)
        fieldArray.push(new fabric.Line([i, top, i, height], yardLineProps));

    // Hashes (college)
    for (let i = 0; i < width + 1; i += 80)
        fieldArray.push(new fabric.Line(
            [i === 0 ? i : i - 10, height - 320, i == width ? i : i + 10, height - 320], hashProps)
        );

    for (let i = 0; i < width + 1; i += 80)
        fieldArray.push(new fabric.Line(
            [i === 0 ? i : i - 10, height - 520, i == width ? i : i + 10, height - 520], hashProps)
        );

    // Border
    fieldArray.push(new fabric.Line([0, 14, 0, height], borderProps));
    fieldArray.push(new fabric.Line([0, height - 840, width, height - 840], borderProps));
    fieldArray.push(new fabric.Line([0, height - 1, width, height - 1], borderProps));
    fieldArray.push(new fabric.Line([width - 1, 14, width - 1, height], borderProps));

    const field = new fabric.Group(fieldArray, {
        selectable: false,
        hoverCursor: "default",
    });
    return field;
};

/* -------------------------- Marcher Functions -------------------------- */
/**
 * A function to get the coordinates of a CanvasMarcher's dot to offset the fabric group coordinate.
 * The dot's actual coordinate is down and to the right of the fabric group coordinate.
 *
 * @param marcher
 * @returns The coordinates of the CanvasMarcher dot. {x: number, y: number}
 */
export function canvasMarcherToDotCoords(fabricGroup: fabric.Group) {
    // console.log("marcher", marcher);
    const dot = fabricGroup?._objects[0] as fabric.Circle;
    if (fabricGroup.left && fabricGroup.top && dot.left && dot.top) {
        // console.log("canvasMarcherToDotCoords - fabricGroup", "x: " + fabricGroup.left,
        //     "y: " + fabricGroup.top);
        // console.log("canvasMarcherToDotCoords - dot", "x: " + (fabricGroup.left + dot.left),
        //     "y: " + (fabricGroup.top + dot.top));
        return {
            x: fabricGroup.getCenterPoint().x + dot.left + Constants.dotRadius,
            y: fabricGroup.getCenterPoint().y + dot.top + Constants.dotRadius
        };
    }
    console.error("Marcher dot or fabricGroup does not have left or top properties - canvasMarcherToDotCoords: CanvasUtils.tsx");

    return null;
};

/**
 * Updates the coordinates of a CanvasMarcher object.
 * This compensates for the fabric group offset and ensures the coordinate is where the dot itelf is located.
 * The fabric group to represent the dot is offset up and to the left a bit.
 *
 * @param marcher The CanvasMarcher object to update.
 * @param x the x location of the actual dot
 * @param y the y location of the actual dot.
 */
export function setCanvasMarcherCoordsFromDot(marcher: CanvasMarcher, x: number, y: number) {
    if (marcher?.fabricObject) {
        // The offset that the dot is from the fabric group coordinate.
        const fabricGroup = marcher.fabricObject;
        const dot = (marcher.fabricObject as fabric.Group)._objects[0] as fabric.Circle;
        if (dot.left && dot.top && fabricGroup.width && fabricGroup.height) {
            // Dot center - radius - offset - 1/2 width or height of the fabric group
            const newCoords = {
                x: x - Constants.dotRadius - dot.left - (fabricGroup.width / 2),
                y: y - Constants.dotRadius - dot.top - (fabricGroup.height / 2)
            };

            marcher.fabricObject.left = newCoords.x;
            marcher.fabricObject.top = newCoords.y;
            marcher.fabricObject.setCoords();
            // console.log("setCanvasMarcherCoordsFromDot - marcher.fabricObject", marcher.fabricObject);
        } else
            console.error("Marcher dot does not have left or top properties, or fabricGroup does not have height/width - setCanvasMarcherCoordsFromDot: CanvasUtils.tsx");
    } else
        console.error("FabricObject does not exist for the marcher - setCanvasMarcherCoordsFromDot: CanvasUtils.tsx");

    return null;

}

export { };
