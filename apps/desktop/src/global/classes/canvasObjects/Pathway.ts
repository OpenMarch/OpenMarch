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
     * @param start The coordinate pointing to the CanvasMarcher
     * @param end The coordinate pointing to the Endpoint
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

    // Makes the endpoint invisible
    hide(): void {
        this.set("visible", false);
    }

    // Makes the endpoint visible
    show(): void {
        this.set("visible", true);
    }

    // update coords of start of pathway
    updateStartCoords(coord: {
        x: number;
        y: number;
        [key: string]: any;
    }): void {
        this.set("x1", coord.x + FieldProperties.GRID_STROKE_WIDTH / 2);
        this.set("y1", coord.y + FieldProperties.GRID_STROKE_WIDTH / 2);
        this.setCoords();
    }

    // update coords of end of pathway
    updateEndCoords(coord: { x: number; y: number; [key: string]: any }): void {
        this.set("x2", coord.x + FieldProperties.GRID_STROKE_WIDTH / 2);
        this.set("y2", coord.y + FieldProperties.GRID_STROKE_WIDTH / 2);
        this.setCoords();
    }
}
