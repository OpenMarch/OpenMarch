import { CanvasColors } from "@/components/canvas/CanvasConstants";
import { fabric } from "fabric";
import { ISelectable, SelectableClasses } from "./interfaces/Selectable";
import OpenMarchCanvas from "./OpenMarchCanvas";

export default class ShapePoint extends fabric.Circle implements ISelectable {
    readonly classString = SelectableClasses.CURVE_POINT;
    readonly objectToGloballySelect = { id: -1 };
    readonly id = -1;
    /**
     * The path this control point is a part of
     */
    parentPath: fabric.Path;
    /**
     * The index of the point in the path.
     * I.e. `this.parentPath.path[this.pathIndex]` is the point this control point is associated with
     */
    pointIndex: number;
    /**
     * The index of the coordinates in the point.
     * I.e. `this.parentPath.path[this.pointIndex][this.coordIndex]` is the coordinate this control point is associated with
     */
    coordIndex: number;

    canvas: OpenMarchCanvas;

    /** The point directly before this one in the path */
    incomingPoint: ShapePoint | null;
    /** The point directly after this one in the path */
    outgoingPoint: ShapePoint | null;
    /** A fabric line that leads to the outgoing point to visual the relationship */
    outgoingLine: fabric.Line | null;

    constructor({
        parentPath,
        pointIndex,
        coordIndex,
        canvas,
        incomingPoint = null,
        outgoingPoint = null,
    }: {
        parentPath: fabric.Path;
        pointIndex: number;
        coordIndex: number;
        canvas: OpenMarchCanvas;
        incomingPoint?: ShapePoint | null;
        outgoingPoint?: ShapePoint | null;
    }) {
        if (coordIndex === 0)
            console.warn(
                "The coordinate index in the SVG point likely should not be 0, as this is the SVG command",
            );
        if (!parentPath.path) {
            throw new Error("The parent path does not have a path");
        }
        const pathPoint = parentPath.path[pointIndex] as unknown as number[];
        const point = {
            left: pathPoint[coordIndex],
            top: pathPoint[coordIndex + 1],
        };

        super({
            ...point,
            strokeWidth: 4,
            radius: 6,
            fill: "#fff",
            stroke: CanvasColors.SHAPE,
            hasBorders: false,
            originX: "center",
            originY: "center",
            hasControls: false,
        });
        this.on("moving", this.moveHandler);
        // this.on("selected", this.selectHandler);

        this.parentPath = parentPath;
        this.pointIndex = pointIndex;
        this.coordIndex = coordIndex;

        this.incomingPoint = incomingPoint;
        // If the incoming point does not have this as an outgoing point, set it to this
        if (this.incomingPoint && !(this.incomingPoint.outgoingPoint === this))
            this.incomingPoint.outgoingPoint = this;

        this.outgoingPoint = outgoingPoint;
        // If the outgoing point does not have this as an incoming point, set it to this
        if (this.outgoingPoint && !(this.outgoingPoint.incomingPoint === this))
            this.outgoingPoint.incomingPoint = this;

        this.outgoingLine = null;
        this.canvas = canvas;
    }

    refreshPathCoordinates() {
        if (!this.parentPath.path) {
            console.error("The parent path does not have a path");
            return;
        }
        if (!this.left || !this.top) {
            console.error("The control point does not have coordinates");
            return;
        }
        (this.parentPath.path[this.pointIndex] as unknown as number[])[
            this.coordIndex
        ] = this.left;
        (this.parentPath.path[this.pointIndex] as unknown as number[])[
            this.coordIndex + 1
        ] = this.top;
        this.parentPath.setCoords();
        this.parentPath.dirty = true;
    }

    moveHandler(e: fabric.IEvent) {
        if (this.parentPath.path && this.left && this.top) {
            this.refreshPathCoordinates();
        }
        this.refreshLines();
    }

    /**
     * Refreshes both the first point of the outgoing line and the second point of the incoming line.
     *
     * Each line is only updated if they exist.
     */
    refreshLines() {
        if (this.incomingPoint) {
            const incomingLine = this.incomingPoint.outgoingLine;
            if (incomingLine) {
                incomingLine.set({
                    x2: this.left,
                    y2: this.top,
                });
            }
        }
        if (this.outgoingLine) {
            this.outgoingLine.set({
                x1: this.left,
                y1: this.top,
            });
        }
    }

    /**
     * Draws a dashed line from this control point to the outgoing point
     *
     * @returns The line that was drawn
     */
    drawOutgoingLine(): fabric.Line | null {
        if (!this.left || !this.top) {
            console.error("The control point has no coordinates");
            return null;
        }
        if (!this.outgoingPoint) {
            // There is no outgoing point, return null
            return null;
        }
        if (!this.outgoingPoint.left || !this.outgoingPoint.top) {
            console.error("The outgoing point has no coordinates");
            return null;
        }
        const outgoingLine = new fabric.Line(
            [
                this.left,
                this.top,
                this.outgoingPoint.left,
                this.outgoingPoint.top,
            ],
            {
                stroke: CanvasColors.SHAPE,
                strokeWidth: 1,
                strokeDashArray: [5, 5],
                selectable: false,
                evented: false,
            },
        );
        this.outgoingLine = outgoingLine;
        if (!this.canvas) {
            console.error(
                "The canvas is not defined. The outgoing lines will not be drawn",
            );
        } else this.canvas?.add(outgoingLine);

        return outgoingLine;
    }
}

// /** The end point of a curve */

// export class ControlPoint extends CurvePoint {
//     incomingPoint: CurvePoint;
//     outgoingPoint: CurvePoint;
//     lines: fabric.Line[] = [];

//     constructor({
//         parentPath,
//         pointIndex,
//         coordIndex,
//         incomingPoint,
//         outgoingPoint,
//     }: {
//         parentPath: fabric.Path;
//         pointIndex: number;
//         coordIndex: number;
//         incomingPoint: CurvePoint;
//         outgoingPoint: CurvePoint;
//     }) {
//         super({ parentPath, pointIndex, coordIndex });
//         this.incomingPoint = incomingPoint;
//         this.outgoingPoint = outgoingPoint;
//         this.on("selected", this.selectHandler);
//         this.on("deselected", this.deselect);
//     }

//     /**
//      * Draws a dashed line from this control point to the incoming and outgoing points
//      *
//      * @param e The event that triggered the selection
//      */
//     selectHandler(e: fabric.IEvent): void {
//         if (
//             !this.left ||
//             !this.top ||
//             !this.incomingPoint.left ||
//             !this.incomingPoint.top ||
//             !this.outgoingPoint.left ||
//             !this.outgoingPoint.top
//         ) {
//             console.error("The control point does not have coordinates");
//             return;
//         }
//         const line1 = new fabric.Line(
//             [
//                 this.left,
//                 this.top,
//                 this.incomingPoint.left,
//                 this.incomingPoint.top,
//             ],
//             {
//                 stroke: CanvasColors.SHAPE,
//                 strokeWidth: 1,
//                 strokeDashArray: [5, 5],
//                 selectable: false,
//                 evented: false,
//             },
//         );
//         this.canvas?.add(line1);
//         const line2 = new fabric.Line(
//             [
//                 this.left,
//                 this.top,
//                 this.outgoingPoint.left,
//                 this.outgoingPoint.top,
//             ],
//             {
//                 stroke: CanvasColors.SHAPE,
//                 strokeWidth: 1,
//                 strokeDashArray: [5, 5],
//                 selectable: false,
//                 evented: false,
//             },
//         );
//         this.canvas?.add(line2);

//         this.lines = [line1, line2];
//     }

//     /**
//      * Removes the dashed lines from the control point
//      */
//     deselect() {
//         this.lines.forEach((line) => this.canvas?.remove(line));
//     }

//     /**
//      * Moves the lines when the control point is moved
//      * @param e The event that triggered the movement
//      */
//     moveHandler(e: fabric.IEvent) {
//         super.moveHandler(e);
//         this.lines.forEach((line) => {
//             line.set({
//                 x1: this.left,
//                 y1: this.top,
//             });
//         });
//         this.canvas?.requestRenderAll();
//     }
// }
