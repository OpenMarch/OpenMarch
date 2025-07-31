import { fabric } from "fabric";
import { NoControls } from "@/components/canvas/CanvasConstants";
import { FieldProperties } from "@openmarch/core";
import { rgbaToString } from "@openmarch/core";
import { RgbaColor } from "@uiw/react-color";
import { CoordinateLike } from "@/utilities/CoordinateActions";

/**
 * A Midpoint is the object used on the canvas to represent the midpoint marker of a pathway.
 */
export default class Midpoint extends fabric.Circle {
    private static readonly gridOffset = FieldProperties.GRID_STROKE_WIDTH / 2; // used to center the grid line

    /** The marcher this midpoint is for */
    marcherId: number;

    /**
     * @param marcherId The ID of the marcher this midpoint is associated with
     * @param start The starting MarcherPage
     * @param end The ending MarcherPage
     * @param innerColor Inner color of the Midpoint
     * @param outerColor Outer color of the Midpoint
     * @param radius Radius of the Midpoint
     */
    constructor({
        marcherId,
        start,
        end,
        innerColor,
        outerColor,
        radius = 3,
    }: {
        marcherId: number;
        start: CoordinateLike;
        end: CoordinateLike;
        innerColor: string;
        outerColor: string;
        radius?: number;
    }) {
        const midX = (start.x + end.x) / 2 + Midpoint.gridOffset;
        const midY = (start.y + end.y) / 2 + Midpoint.gridOffset;
        super({
            left: midX,
            top: midY,
            radius,
            fill: innerColor,
            stroke: outerColor,
            strokeWidth: 2,
            originX: "center",
            originY: "center",
            objectCaching: true,
            ...NoControls,
        });
        this.marcherId = marcherId;
    }

    // Set colors of the midpoint
    setColor(outerColor: RgbaColor): void {
        this.set("fill", "white");
        this.set("stroke", rgbaToString(outerColor));
    }

    // Sets the coordinates of a midpoint
    updateCoords(coord: CoordinateLike): void {
        this.set("left", coord.x + Midpoint.gridOffset);
        this.set("top", coord.y + Midpoint.gridOffset);
        this.setCoords();
    }

    // Makes the midpoint invisible
    hide(): void {
        this.set("visible", false);
    }

    // Makes the midpoint visible
    show(): void {
        this.set("visible", true);
    }
}
