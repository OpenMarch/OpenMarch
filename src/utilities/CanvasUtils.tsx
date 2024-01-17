
import { fabric } from "fabric";
import { CanvasMarcher } from "../Interfaces";
import { Constants } from "../Constants";
import { FieldProperties } from "../Interfaces";

/* -------------------------- Canvas Functions -------------------------- */
/**
 * Refreshes the size of the canvas to fit the window.
 */
export function refreshCanavsSize(canvas: fabric.Canvas) {
    canvas.setWidth(window.innerWidth);
    canvas.setHeight(window.innerHeight);
}

/* -------------------------- Field Functions -------------------------- */
export const buildField = (fieldProperties: FieldProperties) => {
    const fieldArray: fabric.Object[] = [];
    const top = 0;
    const fieldWidth = fieldProperties.width;
    const fieldHeight = fieldProperties.height;

    // white background
    const background = new fabric.Rect({
        left: 0,
        top: top,
        width: fieldWidth,
        height: fieldHeight - top,
        fill: "white",
        selectable: false,
        hoverCursor: "default",
    });
    fieldArray.push(background);

    /* Properties for each field object */
    const borderProps = { stroke: "black", strokeWidth: 3, selectable: false };
    const yardLineProps = { stroke: "black", strokeWidth: 1, selectable: false };
    const halfLineProps = { stroke: "#AAAAAA", selectable: false };
    const gridProps = { stroke: "#DDDDDD", selectable: false };
    const hashProps = { stroke: "black", strokeWidth: 3, selectable: false };
    const numberProps = { fontSize: 45, fill: "#888888", selectable: false, charSpacing: 160 };

    // Grid lines
    for (let i = 10; i < fieldWidth; i += 10)
        fieldArray.push(new fabric.Line([i, top, i, fieldHeight], gridProps));
    for (let i = fieldHeight - 10; i > top; i -= 10)
        fieldArray.push(new fabric.Line([0, i, fieldWidth, i], gridProps));


    // Yard line numbers
    const backSideline = fieldProperties.originY + (fieldProperties.backSideline * fieldProperties.pixelsPerStep);
    const frontSideline = fieldProperties.originY + (fieldProperties.frontSideline * fieldProperties.pixelsPerStep);
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
        if (awayNumber.top && awayNumber.height)
            fieldArray[fieldArray.length - 1].top = awayNumber.top - awayNumber.height;
        else
            console.error("awayNumber does not have top or height properties - buildField: CanvasUtils.tsx");
    }

    // Half lines and endzones
    for (let i = 40; i < fieldWidth; i += 80)
        fieldArray.push(new fabric.Line([i, top, i, fieldHeight], halfLineProps));
    fieldArray.push(new fabric.Line([80, top, 80, fieldHeight], halfLineProps));
    fieldArray.push(new fabric.Line([fieldWidth - 80, top, fieldWidth - 80, fieldHeight],
        halfLineProps));

    // Verical lines
    for (let i = fieldHeight - 40; i > 0; i -= 40)
        fieldArray.push(new fabric.Line([0, i, fieldWidth, i], halfLineProps));

    // Yard lines
    for (let i = 0; i < fieldWidth; i += 80)
        fieldArray.push(new fabric.Line([i, top, i, fieldHeight], yardLineProps));

    // Hashes (college)
    for (let i = 0; i < fieldWidth + 1; i += 80)
        fieldArray.push(new fabric.Line(
            [i === 0 ? i : i - 10, fieldHeight - 320, i === fieldWidth ? i : i + 10, fieldHeight - 320], hashProps)
        );

    for (let i = 0; i < fieldWidth + 1; i += 80)
        fieldArray.push(new fabric.Line(
            [i === 0 ? i : i - 10, fieldHeight - 520, i === fieldWidth ? i : i + 10, fieldHeight - 520], hashProps)
        );

    // Border
    fieldArray.push(new fabric.Line([0, top, 0, fieldHeight], borderProps));
    fieldArray.push(new fabric.Line([0, fieldHeight - 840, fieldWidth, fieldHeight - 840], borderProps));
    fieldArray.push(new fabric.Line([0, fieldHeight - 1, fieldWidth, fieldHeight - 1], borderProps));
    fieldArray.push(new fabric.Line([fieldWidth - 1, top, fieldWidth - 1, fieldHeight], borderProps));

    return new fabric.Group(fieldArray, {
        selectable: false,
        hoverCursor: "default",
    });
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
}

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
            // Dot center - radius - offset - 1/2 fieldWidth or fieldHeight of the fabric group
            const newCoords = {
                x: x - Constants.dotRadius - dot.left - (fabricGroup.width / 2),
                y: y - Constants.dotRadius - dot.top - (fabricGroup.height / 2)
            };

            marcher.fabricObject.left = newCoords.x;
            marcher.fabricObject.top = newCoords.y;
            marcher.fabricObject.setCoords();
            // console.log("setCanvasMarcherCoordsFromDot - marcher.fabricObject", marcher.fabricObject);
        } else
            console.error("Marcher dot does not have left or top properties, or fabricGroup does not have fieldHeight/width - setCanvasMarcherCoordsFromDot: CanvasUtils.tsx");
    } else
        console.error("FabricObject does not exist for the marcher - setCanvasMarcherCoordsFromDot: CanvasUtils.tsx");

    return null;

}
