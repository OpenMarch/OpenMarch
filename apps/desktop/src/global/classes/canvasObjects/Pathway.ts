import FieldProperties from "@/global/classes/FieldProperties";
import { fabric } from "fabric";
import { NoControls } from "@/components/canvas/CanvasConstants";

/**
 * A Pathway is the object used on the canvas to represent a pathway between two marchers.
 */
export default class Pathway extends fabric.Line {
    /** The marcher this pathway is for */
    marcherId: number;

    /**
     * @param marcherId The ID of the marcher this pathway is associated with
     * @param start The starting MarcherPage
     * @param end The ending MarcherPage
     * @param color Color of the pathway
     * @param strokeWidth Width of the pathway
     * @param dashed Whether the pathway should be dashed
     */
    constructor({
        marcherId,
        start,
        end,
        color,
        strokeWidth = 2,
        dashed = false,
    }: {
        marcherId: number;
        start: { x: number; y: number; [key: string]: any };
        end: { x: number; y: number; [key: string]: any };
        color: string;
        strokeWidth?: number;
        dashed?: boolean;
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
            },
        );
        this.marcherId = marcherId;
    }
}
