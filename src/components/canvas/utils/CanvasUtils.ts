
import { fabric } from "fabric";
import { FieldProperties, getYardNumberCoordinates } from "@/global/classes/FieldProperties";

/* -------------------------- Canvas Functions -------------------------- */
/**
 * Refreshes the size of the canvas to fit the window.
 */
export function refreshCanvasSize(canvas: fabric.Canvas) {
    canvas.setWidth(window.innerWidth);
    canvas.setHeight(window.innerHeight);
}

/**
 * Creates a fabric group of a field based on the given field properties.
 *
 * @param fieldProperties Field properties to build the field from
 * @param gridLines Whether or not to include grid lines (every step)
 * @param halfLines Whether or not to include half lines (every 4 steps)
 * @returns
 */
export const buildField = ({ fieldProperties, gridLines = true, halfLines = true }:
    { fieldProperties: FieldProperties; gridLines?: boolean, halfLines?: boolean }) => {

    const fieldArray: fabric.Object[] = [];
    const fieldWidth = fieldProperties.width;
    const fieldHeight = fieldProperties.height;
    const pixelsPerStep = FieldProperties.PIXELS_PER_STEP;
    const centerFrontPoint = fieldProperties.centerFrontPoint;

    // white background
    const background = new fabric.Rect({
        left: 0,
        top: 0,
        width: fieldWidth,
        height: fieldHeight,
        fill: "white",
        selectable: false,
        hoverCursor: "default",
    });
    fieldArray.push(background);

    // Grid lines
    if (gridLines) {
        const gridLineProps = { stroke: "#DDDDDD", strokeWidth: FieldProperties.GRID_STROKE_WIDTH, selectable: false };
        // X
        for (let i = centerFrontPoint.xPixels + pixelsPerStep; i < fieldWidth; i += pixelsPerStep)
            fieldArray.push(new fabric.Line([i, 0, i, fieldHeight], gridLineProps));
        for (let i = centerFrontPoint.xPixels - pixelsPerStep; i > 0; i -= pixelsPerStep)
            fieldArray.push(new fabric.Line([i, 0, i, fieldHeight], gridLineProps));

        // Y
        for (let i = centerFrontPoint.yPixels - pixelsPerStep; i > 0; i -= pixelsPerStep)
            fieldArray.push(new fabric.Line([0, i, fieldWidth, i], gridLineProps));
    }

    // Half lines
    if (halfLines) {
        const darkLineProps = { stroke: "#AAAAAA", strokeWidth: FieldProperties.GRID_STROKE_WIDTH, selectable: false };
        // X
        for (let i = centerFrontPoint.xPixels + pixelsPerStep * 4; i < fieldWidth; i += pixelsPerStep * 8)
            fieldArray.push(new fabric.Line([i, 0, i, fieldHeight], darkLineProps));
        for (let i = centerFrontPoint.xPixels - pixelsPerStep * 4; i > 0; i -= pixelsPerStep * 8)
            fieldArray.push(new fabric.Line([i, 0, i, fieldHeight], darkLineProps));

        // Y
        for (let i = centerFrontPoint.yPixels - pixelsPerStep * 4; i > 0; i -= pixelsPerStep * 4)
            fieldArray.push(new fabric.Line([0, i, fieldWidth, i], darkLineProps));
    }

    // Yard lines, field numbers, and hashes
    const xCheckpointProps = { stroke: "black", strokeWidth: FieldProperties.GRID_STROKE_WIDTH, selectable: false };
    const yCheckpointProps = { stroke: "black", strokeWidth: FieldProperties.GRID_STROKE_WIDTH * 3, selectable: false };
    const ySecondaryCheckpointProps = { stroke: "gray", strokeWidth: FieldProperties.GRID_STROKE_WIDTH * 2, selectable: false };
    const yardNumberCoordinates = getYardNumberCoordinates(fieldProperties.template);
    const numberHeight = (
        yardNumberCoordinates.homeStepsFromFrontToInside
        - yardNumberCoordinates.homeStepsFromFrontToOutside
    ) * pixelsPerStep;
    const numberProps = { fontSize: numberHeight, fill: "#888888", selectable: false, charSpacing: 160 };
    const yardNumberXOffset = 18;
    fieldProperties.xCheckpoints.forEach((xCheckpoint) => {
        // Yard line
        const x = centerFrontPoint.xPixels + (xCheckpoint.stepsFromCenterFront * pixelsPerStep);
        fieldArray.push(new fabric.Line([x, 0, x, fieldHeight], xCheckpointProps));

        // Yard line numbers
        if (xCheckpoint.fieldLabel) {
            // Home number
            fieldArray.push(new fabric.Text(xCheckpoint.fieldLabel, {
                left: x - yardNumberXOffset,
                top: centerFrontPoint.yPixels - (yardNumberCoordinates.homeStepsFromFrontToInside * pixelsPerStep),
                ...numberProps
            }));
            // Away number
            fieldArray.push(new fabric.Text(xCheckpoint.fieldLabel, {
                left: x - yardNumberXOffset,
                top: centerFrontPoint.yPixels - (yardNumberCoordinates.awayStepsFromFrontToOutside * pixelsPerStep),
                flipY: true,
                flipX: true,
                ...numberProps
            }));
        }

        // Hashes
        const hashWidth = 20;
        fieldProperties.yCheckpoints.forEach((yCheckpoint) => {
            if (yCheckpoint.visible !== false) {
                const y = centerFrontPoint.yPixels + (yCheckpoint.stepsFromCenterFront * pixelsPerStep) - 1;
                let x1 = x - hashWidth / 2;
                x1 = x1 < 0 ? 0 : x1;
                let x2 = x + hashWidth / 2;
                x2 = x2 > fieldWidth ? fieldWidth : x2;
                fieldArray.push(
                    new fabric.Line(
                        [x1, y, x2 + 1, y],
                        yCheckpoint.useAsReference ? yCheckpointProps : ySecondaryCheckpointProps
                    ))
                    ;
            }
        });
    });

    // Border
    const borderWidth = FieldProperties.GRID_STROKE_WIDTH * 3;
    const borderOffset = 1 - borderWidth; // Offset to prevent clipping. Border hangs off the edge of the canvas
    const borderProps = { stroke: "black", strokeWidth: borderWidth, selectable: false };
    // Back line
    fieldArray.push(new fabric.Line([borderOffset, borderOffset, fieldWidth - borderOffset, borderOffset], borderProps));
    // Front line
    fieldArray.push(new fabric.Line([borderOffset, fieldHeight, fieldWidth - borderOffset + 1, fieldHeight], borderProps));
    // Left line
    fieldArray.push(new fabric.Line([borderOffset, borderOffset, borderOffset, fieldHeight - borderOffset], borderProps));
    // Right line
    fieldArray.push(new fabric.Line([fieldWidth, borderOffset, fieldWidth, fieldHeight - borderOffset], borderProps));

    return new fabric.Group(fieldArray, {
        selectable: false,
        hoverCursor: "default",
    });
};
