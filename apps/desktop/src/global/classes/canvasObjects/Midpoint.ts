import { fabric } from "fabric";
import { NoControls } from "../../../components/canvas/CanvasConstants";

/**
 * A Midpoint is the object used on the canvas to represent the midpoint marker of a pathway.
 */
export class Midpoint extends fabric.Circle {
    /** The marcher this midpoint is for */
    marcherId: number;

    /**
     * @param start The starting MarcherPage
     * @param end The ending MarcherPage
     * @param innerColor Inner color of the Midpoint
     * @param outerColor Outer color of the Midpoint
     * @param radius Radius of the Midpoint
     */
    constructor({
        start,
        end,
        innerColor,
        outerColor,
        radius = 3,
        marcherId,
    }: {
        start: { x: number; y: number };
        end: { x: number; y: number };
        innerColor: string;
        outerColor: string;
        radius?: number;
        marcherId: number;
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
