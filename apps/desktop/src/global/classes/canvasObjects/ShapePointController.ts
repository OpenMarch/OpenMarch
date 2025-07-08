import { fabric } from "fabric";
import { rgbaToString } from "../FieldTheme";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { StaticMarcherShape, VanillaPoint } from "./StaticMarcherShape";
import { roundCoordinatesHandler } from "./handlers/RoundCoordinates";

/**
 * Represents a control point for a StaticMarcherShape object, which is part of a path in a canvas.
 * The control point is associated with a specific point and coordinate index in the path.
 * It handles the movement and modification of the control point, and updates the corresponding
 * coordinates in the path.
 */
export class ShapePointController extends fabric.Circle {
    /**
     * The path this control point is a part of
     */
    marcherShape: StaticMarcherShape;
    /**
     * The index of the point in the path.
     * I.e. `this.marcherShape.path.path[this.pathIndex]` is the point this control point is associated with
     */
    pointIndex: number;
    /**
     * The index of the coordinates in the point.
     * I.e. `this.marcherShape.path.path[this.pointIndex][this.coordIndex]` is the coordinate this control point is associated with
     */
    coordIndex: number;

    /** The point directly before this one in the path */
    incomingPoint: ShapePointController | null;
    /** The point directly after this one in the path */
    outgoingPoint: ShapePointController | null;
    /** A fabric line that leads to the outgoing point to visual the relationship */
    outgoingLine: fabric.Line | null;

    canvas?: OpenMarchCanvas;
    left: number;
    top: number;

    constructor({
        marcherShape,
        pointIndex,
        coordIndex,
        canvas,
        incomingPoint = null,
        outgoingPoint = null,
    }: {
        marcherShape: StaticMarcherShape;
        pointIndex: number;
        coordIndex: number;
        canvas: OpenMarchCanvas;
        incomingPoint?: ShapePointController | null;
        outgoingPoint?: ShapePointController | null;
    }) {
        if (coordIndex === 0)
            console.warn(
                "The coordinate index in the SVG point likely should not be 0, as this is the SVG command",
            );
        if (!marcherShape.shapePath.path) {
            throw new Error("The parent path does not have a path");
        }

        super({
            strokeWidth: 4,
            radius: 6,
            fill: "#fff",
            stroke: rgbaToString(canvas.fieldProperties.theme.shape),
            hasBorders: false,
            originX: "center",
            originY: "center",
            hasControls: false,
            hoverCursor: "point",
        });

        this.marcherShape = marcherShape;
        this.pointIndex = pointIndex;
        this.coordIndex = coordIndex;

        this.incomingPoint = incomingPoint;
        // If the incoming point does not have this as an outgoing point, set it to this
        if (this.incomingPoint && !(this.incomingPoint.outgoingPoint === this))
            this.incomingPoint.outgoingPoint = this;

        this.outgoingPoint = outgoingPoint;

        this.outgoingLine = null;
        this.canvas = canvas;

        const point = this.getPathCoordinates();
        if (!point) {
            throw new Error("The point does not have coordinates");
        }
        this.left = point.left;
        this.top = point.top;

        // Create the new listeners
        this.on("moving", this.moveHandler.bind(this));
        this.on("modified", this.modifiedHandler.bind(this));
    }

    destroy() {
        if (this.canvas) {
            if (this.outgoingLine) this.canvas.remove(this.outgoingLine);
            this.canvas.remove(this);
        }
    }

    /**
     * Refreshes the coordinates of the path point associated with this StaticMarcherShape object.
     *
     * This method updates the coordinates of the corresponding path point in the parent path's path array. It calculates the new coordinates based on the current position of the control point and the curve offset, and then sets the updated coordinates in the path array. Finally, it marks the parent path as dirty to trigger a redraw.
     */
    refreshParentPathCoordinates() {
        if (!this.marcherShape.shapePath.path) {
            console.error("The parent path does not have a path");
            return;
        }
        if (!this.left || !this.top) {
            console.error("The control point does not have coordinates");
            return;
        }
        (
            this.marcherShape.shapePath.path[
                this.pointIndex
            ] as unknown as number[]
        )[this.coordIndex] =
            this.left - this.marcherShape.moveOffset.fromInitial.x;
        (
            this.marcherShape.shapePath.path[
                this.pointIndex
            ] as unknown as number[]
        )[this.coordIndex + 1] =
            this.top - this.marcherShape.moveOffset.fromInitial.y;
        this.marcherShape.shapePath.setCoords();
        this.marcherShape.shapePath.dirty = true;
    }

    /**
     * Gets the coordinates of the path point associated with this StaticMarcherShape object.
     *
     * This method retrieves the coordinates of the path point that corresponds to this StaticMarcherShape object. It extracts the left and top coordinates from the path array and returns them as an object.
     *
     * @returns {Object} An object containing the left and top coordinates of the path point, or `null` if the parent path does not have a path.
     * @property {number} left - The left coordinate of the path point.
     * @property {number} top - The top coordinate of the path point.
     */
    getPathCoordinates() {
        if (!this.marcherShape.shapePath.path) {
            console.error("The parent path does not have a path");
            return;
        }
        const vanillaPoint = this.marcherShape.shapePath.path[
            this.pointIndex
        ] as unknown as number[];
        const point = {
            left: vanillaPoint[this.coordIndex],
            top: vanillaPoint[this.coordIndex + 1],
        };
        return point;
    }

    /**
     * Handles the movement of the parent path by updating the control point's coordinates
     */
    handleParentMove() {
        const vanillaPoint = this.getPathCoordinates();
        if (!vanillaPoint) {
            throw new Error("The point does not have coordinates");
        }
        this.left =
            vanillaPoint.left + this.marcherShape.moveOffset.fromInitial.x;
        this.top =
            vanillaPoint.top + this.marcherShape.moveOffset.fromInitial.y;

        this.refreshLines();
    }

    /**
     * Handles the movement of the control point by updating the path coordinates and refreshing the connected lines.
     *
     * This method is called when the control point is moved. It updates the coordinates of the corresponding path point, and then refreshes the incoming and outgoing lines connected to the control point.
     *
     * @param e - The fabric.js event object containing information about the move event.
     */
    moveHandler(event: fabric.IEvent<MouseEvent>) {
        roundCoordinatesHandler(this, event);
        this.marcherShape.shapePath.objectCaching = false;
        if (this.marcherShape.shapePath.path && this.left && this.top) {
            this.refreshParentPathCoordinates();
            this.marcherShape.distributeMarchers();
            this.marcherShape.bringControlPointsToFront();
        }
        this.marcherShape.dirty = true;
        this.refreshLines();
    }

    /**
     * Redraws the parent path of the StaticMarcherShape object.
     *
     * This method is called when the StaticMarcherShape object has been modified, and the parent path needs to be redrawn.
     *
     * @param path - The path of the parent object, as an array of (string | number)[][] elements.
     */
    modifiedHandler(e: fabric.IEvent) {
        if (!this.marcherShape.shapePath.path) {
            console.error("The parent path does not have a path");
            return;
        }

        this.marcherShape.recreatePath(
            this.marcherShape.shapePath.path as unknown as VanillaPoint[],
        );
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
                stroke: rgbaToString(
                    this.canvas?.fieldProperties.theme.shape ?? {
                        r: 126,
                        g: 34,
                        b: 206,
                        a: 1,
                    },
                ),
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
