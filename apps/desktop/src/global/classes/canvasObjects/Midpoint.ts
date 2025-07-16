import { fabric } from "fabric";
import { NoControls } from "@/components/canvas/CanvasConstants";

/**
 * A Midpoint is the object used on the canvas to represent the midpoint marker of a pathway.
 */
export default class Midpoint extends fabric.Circle {
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
        start: { x: number; y: number; [key: string]: any };
        end: { x: number; y: number; [key: string]: any };
        innerColor: string;
        outerColor: string;
        radius?: number;
    }) {
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        super({
            left: midX - radius,
            top: midY - radius,
            radius,
            fill: innerColor,
            stroke: outerColor,
            strokeWidth: 2,
            ...NoControls,
        });
        this.marcherId = marcherId;
    }
}
