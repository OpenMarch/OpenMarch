import { fabric } from "fabric";
import FieldProperties from "@/global/classes/FieldProperties";
import { NoControls } from "@/components/canvas/CanvasConstants";
import { rgbaToString } from "@/global/classes/FieldTheme";
import { RgbaColor } from "@uiw/react-color";

/**
 * A Midpoint is the object used on the canvas to represent the endpoint marker of a pathway.
 */
export default class Endpoint extends fabric.Circle {
    private static readonly gridOffset = FieldProperties.GRID_STROKE_WIDTH / 2; // used to center the grid line

    /** The id of the marcher associated with this static marcher */
    marcherId?: number;

    /**
     * @param marcherPage The MarcherPage object to set the initial coordinates from
     * @param dotRadius The radius of the dot
     * @param color The color of the dot (use rgba for transparency)
     */
    constructor({
        coordinate,
        dotRadius = 3,
        color = "rgba(0, 0, 0, 1)",
    }: {
        coordinate: { x: number; y: number; [key: string]: any };
        dotRadius?: number;
        color?: string;
    }) {
        super({
            left: coordinate.x + Endpoint.gridOffset,
            top: coordinate.y + Endpoint.gridOffset,
            originX: "center",
            originY: "center",
            fill: color,
            radius: dotRadius,
            ...NoControls,
        });
        this.marcherId = coordinate.marcher_id;
    }

    // Sets the color of the endpoint
    setColor(color: RgbaColor): void {
        this.set("fill", rgbaToString(color));
    }

    // Sets the coordinates of an endpoint
    updateCoords(coord: { x: number; y: number; [key: string]: any }): void {
        this.set("left", coord.x + Endpoint.gridOffset);
        this.set("top", coord.y + Endpoint.gridOffset);
        this.setCoords();
    }

    // Makes the endpoint invisible
    hide(): void {
        this.set("visible", false);
    }

    // Makes the endpoint visible
    show(): void {
        this.set("visible", true);
    }
}
