import MarcherPage from "../MarcherPage";
import { fabric } from "fabric";
import FieldProperties from "@/global/classes/FieldProperties";
import { NoControls } from "@/components/canvas/CanvasConstants";

/**
 * An Endpoint is fabric circle that cannot be edited by the user.
 * It is used to represent the coordinates on the previous and next pages.
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
        marcherPage,
        dotRadius = 3,
        color = "rgba(0, 0, 0, 1)",
    }: {
        marcherPage: MarcherPage;
        dotRadius?: number;
        color?: string;
    }) {
        super({
            left: marcherPage.x + Endpoint.gridOffset,
            top: marcherPage.y + Endpoint.gridOffset,
            originX: "center",
            originY: "center",
            fill: color,
            radius: dotRadius,
            ...NoControls,
        });
        this.marcherId = marcherPage.marcher_id;
    }
}
