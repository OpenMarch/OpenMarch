import { fabric } from "fabric";
import { NoControls } from "@/components/canvas/CanvasConstants";
import { rgbaToString } from "@openmarch/core";
import { RgbaColor } from "@uiw/react-color";
import { CoordinateLike } from "@/utilities/CoordinateActions";

// Default stroke width for a normal pathway
export const DEFAULT_PATHWAY_STROKE_WIDTH = 2;

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
        strokeWidth = DEFAULT_PATHWAY_STROKE_WIDTH,
        dashed = false,
    }: {
        marcherId: number;
        start: CoordinateLike;
        end: CoordinateLike;
        color: string;
        strokeWidth?: number;
        dashed?: boolean;
    }) {
        super([start.x, start.y, end.x, end.y], {
            stroke: color,
            strokeWidth: strokeWidth,
            strokeDashArray: dashed ? [5, 3] : [],
            objectCaching: true,
            ...NoControls,
        });
        this.marcherId = marcherId;
    }

    // Set color of the pathway
    setColor(color: RgbaColor): void {
        this.set("stroke", rgbaToString(color));
    }

    // Makes the endpoint invisible
    hide(): void {
        // compare to the exact target since fabric renders an unset visible as visible
        if (this.visible !== false) this.set("visible", false);
    }

    // Makes the endpoint visible
    show(): void {
        if (this.visible !== true) this.set("visible", true);
    }

    // Update coords of start of pathway
    updateStartCoords(coord: CoordinateLike): void {
        this.set("x1", coord.x);
        this.set("y1", coord.y);
        this.setCoords();
    }

    // Update coords of end of pathway
    updateEndCoords(coord: CoordinateLike): void {
        this.set("x2", coord.x);
        this.set("y2", coord.y);
        this.setCoords();
    }
}
