
import { fabric } from "fabric";

export interface Dimension {
    width: number;
    height: number;
    name: string;
    actualHeight: number;
}

export interface CanvasMarcher {
    fabricObject: fabric.Object | null;
    x: number;
    y: number;
    drill_number: string;
    id_for_html: string;
    marcher_id: number;
}

// -------------------------- Field Functions --------------------------
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
    const numberProps = { fontSize: 40, fill: "#888888", selectable: false };

    // Grid lines
    for (let i = 10; i < width; i += 10)
        fieldArray.push(new fabric.Line([i, top, i, height], gridProps));
    for (let i = height - 10; i > top; i -= 10)
        fieldArray.push(new fabric.Line([0, i, width, i], gridProps));

    // --- Numbers ---
    // Bottom numbers
    for (let i = 1; i <= 19; i += 1) {
        const num = (i * 5 > 50) ? (100 - i * 5) : (i * 5);
        fieldArray.push(new fabric.Text(num.toString(), {
            left: 0 + (i * 80 - (num > 5 ? 20 : 10)),
            top: height - 142,
            ...numberProps
        }));
    }
    // Top numbers
    for (let i = 1; i <= 19; i += 1) {
        const num = (i * 5 > 50) ? (100 - i * 5) : (i * 5);
        fieldArray.push(new fabric.Text(num.toString(), {
            left: 0 + (i * 80 - (num > 5 ? 20 : 10)),
            top: height - (80 * 9) - 15,
            flipY: true,
            flipX: true,
            ...numberProps
        }));
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
        fieldArray.push(new fabric.Line([i - 10, height - 320, i + 10, height - 320], hashProps));
    for (let i = 0; i < width + 1; i += 80)
        fieldArray.push(new fabric.Line([i - 10, height - 520, i + 10, height - 520], hashProps));

    // Border
    fieldArray.push(new fabric.Line([0, 0, 0, height], borderProps));
    fieldArray.push(new fabric.Line([0, height - 840, width, height - 840], borderProps));
    fieldArray.push(new fabric.Line([0, height - 1, width, height - 1], borderProps));
    fieldArray.push(new fabric.Line([width - 1, 0, width - 1, height], borderProps));

    const field = new fabric.Group(fieldArray, {
        selectable: false,
        hoverCursor: "default",
    });
    return field;
};




export { };

