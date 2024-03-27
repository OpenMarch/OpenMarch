import { MarcherPage } from "@/global/classes/MarcherPage";
import { GRID_STROKE_WIDTH, NoControls } from "@/global/Constants";
import { fabric } from "fabric";

/**
 * A Pathway is the object used on the canvas to represent a pathway between two marchers.
 */
export class Pathway extends fabric.Line {
    /**
     * @param start The starting MarcherPage
     * @param end The ending MarcherPage
     * @param color Color of the pathway
     * @param strokeWidth Width of the pathway
     */
    constructor({ start, end, color, strokeWidth = 2 }:
        { start: MarcherPage; end: MarcherPage; color: string, strokeWidth?: number }) {
        const gridOffset = (GRID_STROKE_WIDTH - strokeWidth) / 2;
        super([
            start.x + gridOffset,
            start.y + gridOffset,
            end.x + gridOffset,
            end.y + gridOffset,
        ], {
            stroke: color,
            strokeWidth,
            ...NoControls
        });
    }
}
