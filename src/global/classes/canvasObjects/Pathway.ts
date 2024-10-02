import FieldProperties from "@/global/classes/FieldProperties";
import { fabric } from "fabric";
import { NoControls } from "../../../components/canvas/CanvasConstants";

/**
 * A Pathway is the object used on the canvas to represent a pathway between two marchers.
 */
export class Pathway extends fabric.Line {
    /** The marcher this pathway is for */
    marcherId: number;
    /**
     * @param start The starting MarcherPage
     * @param end The ending MarcherPage
     * @param color Color of the pathway
     * @param strokeWidth Width of the pathway
     */
    constructor({
        start,
        end,
        color,
        strokeWidth = 2,
        dashed = false,
        marcherId,
    }: {
        start: { x: number; y: number };
        end: { x: number; y: number };
        color: string;
        strokeWidth?: number;
        dashed?: boolean;
        marcherId: number;
    }) {
        const gridOffset = FieldProperties.GRID_STROKE_WIDTH / 2;
        super(
            [
                start.x - gridOffset,
                start.y - gridOffset,
                end.x - gridOffset,
                end.y - gridOffset,
            ],
            {
                stroke: color,
                strokeWidth,
                strokeDashArray: dashed ? [5, 3] : [],
                ...NoControls,
            }
        );
        this.marcherId = marcherId;
    }
}
