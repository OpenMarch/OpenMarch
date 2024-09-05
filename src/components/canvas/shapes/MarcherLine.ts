import { fabric } from "fabric";
import * as CanvasConstants from "../CanvasConstants";
import MarcherPage from "@/global/classes/MarcherPage";
import OpenMarchCanvas from "../OpenMarchCanvas";

/**
 * A MarcherLine is drawn by a user and marchers are evenly spaced along it.
 */
export default class MarcherLine extends fabric.Line {
    canvas?: OpenMarchCanvas;

    constructor({
        x1,
        y1,
        x2,
        y2,
    }: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }) {
        super([x1, y1, x2, y2], {
            ...CanvasConstants.NoControls,
            strokeWidth: 2,
            fill: "red",
            stroke: "red",
            originX: "center",
            originY: "center",
            hoverCursor: "default",
        });
    }

    /**
     * Evenly distributes marcherPages along the line from start to finish. Distributes in the order of the marcherPages array.
     *
     * @param marcherPages The marcherPages to distribute
     * @returns The marcherPages distributed along the line from start to finish
     */
    distributeMarchers = (marcherPages: MarcherPage[]): MarcherPage[] => {
        if (!this.x1 || !this.x2 || !this.y1 || !this.y2) {
            console.error(
                "Line coordinates not set. Cannot distribute marchers"
            );
            return marcherPages;
        }
        const xDistance = (this.x2 - this.x1) / (marcherPages.length + 1);
        const yDistance = (this.y2 - this.y1) / (marcherPages.length + 1);

        const x1 = this.x1;
        const y1 = this.y1;

        const distributedMarcherPages = marcherPages.map(
            (marcherPage, index) => {
                return new MarcherPage({
                    ...marcherPage,
                    x: x1 + xDistance * index,
                    y: y1 + yDistance * index,
                });
            }
        );

        return distributedMarcherPages;
    };

    /**
     *
     * @param pointOne The first point in the line {x1, y1}. If not provided, it will not be modified/rounded
     * @param pointTwo The second point in the line {x2, y2}. If not provided, it will not be modified/rounded
     * @param denominator nearest 1/x step. 1 for nearest whole, 2 for nearest half etc. By default, 1. 0 to not round at all
     */
    setToNearestStep = ({
        pointOne,
        pointTwo,
        denominator = 1,
    }: {
        pointOne?: { x: number; y: number };
        pointTwo?: { x: number; y: number };
        denominator?: number;
    }) => {
        if (!this.canvas) {
            console.error(
                "Canvas object not defined in Line object. Cannot round coordinates"
            );
            return;
        }

        let newCoords: { x1?: number; y1?: number; x2?: number; y2?: number } =
            {};

        const roundPoint = (point: {
            x: number;
            y: number;
        }): { x: number; y: number } => {
            if (denominator > 0 && this.canvas) {
                const roundedPoint = this.canvas.getRoundedCoordinate({
                    x: point.x,
                    y: point.y,
                    denominator,
                });
                return { x: roundedPoint.x, y: roundedPoint.y };
            } else {
                return { x: point.x, y: point.y };
            }
        };

        if (pointOne) {
            const roundedPoint = roundPoint(pointOne);
            newCoords.x1 = roundedPoint.x;
            newCoords.y1 = roundedPoint.y;
        }
        if (pointTwo) {
            const roundedPoint = roundPoint(pointTwo);
            newCoords.x2 = roundedPoint.x;
            newCoords.y2 = roundedPoint.y;
        }
        this.set(newCoords as Partial<this>);
    };
}
