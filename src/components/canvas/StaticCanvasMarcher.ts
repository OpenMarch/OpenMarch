import { GRID_STROKE_WIDTH } from "@/global/Constants";
import { Marcher } from "../../global/classes/Marcher";
import { MarcherPage } from "../../global/classes/MarcherPage";
import { fabric } from "fabric";

/**
 * A StaticCanvasMarcher is fabric circle that cannot be edited by the user.
 * It is used to represent the coordinates on the previous and next pages.
 */
export class StaticCanvasMarcher extends fabric.Circle {
    private static readonly gridOffset = GRID_STROKE_WIDTH / 2; // used to center the grid line

    /**
     *
     * @param marcher The marcher object to create the canvas object from
     * @param marcherPage The MarcherPage object to set the initial coordinates from
     * @param dotRadius The radius of the dot
     * @param color The color of the dot
     * @param alpha The transparency alpha of the dot
     */
    constructor({ marcher, marcherPage, dotRadius = 3, color = "black", alpha = 0.5 }:
        { marcher: Marcher; marcherPage: MarcherPage; dotRadius?: number; color?: string; alpha?: number }) {

        // super({ marcher, marcherPage, dotRadius, color });
        super({
            left: marcherPage.x + StaticCanvasMarcher.gridOffset,
            top: marcherPage.y + StaticCanvasMarcher.gridOffset,
            originX: "center",
            originY: "center",
            fill: color,
            radius: dotRadius,
            opacity: alpha,
            hasControls: false,
            hasBorders: false,
            lockMovementX: true,
            lockMovementY: true,
            lockRotation: true,
            selectable: false,
            hoverCursor: "default",
        });

        this.hasControls = false;
        this.hasBorders = false;
        this.lockMovementX = true;
    }

}
