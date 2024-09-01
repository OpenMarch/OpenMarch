import Marcher from "../../global/classes/Marcher";
import MarcherPage from "../../global/classes/MarcherPage";
import { fabric } from "fabric";
import { FieldProperties } from "@/global/classes/FieldProperties";
import { NoControls } from "./OpenMarchCanvas";

/**
 * A StaticCanvasMarcher is fabric circle that cannot be edited by the user.
 * It is used to represent the coordinates on the previous and next pages.
 */
export default class StaticCanvasMarcher extends fabric.Group {
    private static readonly gridOffset = FieldProperties.GRID_STROKE_WIDTH / 2; // used to center the grid line

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
        marcher: Marcher;
        marcherPage: MarcherPage;
        dotRadius?: number;
        color?: string;
    }) {
        super(
            [
                new fabric.Circle({
                    left: marcherPage.x + StaticCanvasMarcher.gridOffset,
                    top: marcherPage.y + StaticCanvasMarcher.gridOffset,
                    originX: "center",
                    originY: "center",
                    fill: color,
                    radius: dotRadius,
                    ...NoControls,
                }),
            ],
            NoControls
        );
    }
}
