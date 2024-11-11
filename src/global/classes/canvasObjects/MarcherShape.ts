import { fabric } from "fabric";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { CanvasColors } from "@/components/canvas/CanvasConstants";

/**
 * Represents a MarcherShape object, which is a canvas path with control points.
 * The MarcherShape class handles the creation, movement, and redrawing of the path and its control points.
 */
export default class MarcherShape {
    canvas?: OpenMarchCanvas;
    /** The control points of this shape */
    points: ShapePoint[];

    curveOffset: {
        initialPosition: { x: number; y: number };
        fromInitial: { x: number; y: number };
    } = {
        initialPosition: { x: 0, y: 0 },
        fromInitial: { x: 0, y: 0 },
    };

    pathObj: fabric.Path;

    constructor({
        canvas,
        startPoint,
        endPoint,
        controlPoint,
    }: {
        canvas: OpenMarchCanvas;
        startPoint: { x: number; y: number };
        endPoint: { x: number; y: number };
        controlPoint: { x: number; y: number };
    }) {
        this.pathObj = this.redrawPath([
            ["M", startPoint.x, startPoint.y],
            ["Q", controlPoint.x, controlPoint.y, endPoint.x, endPoint.y],
        ]);
        const start = new ShapePoint({
            marcherShape: this,
            pointIndex: 0,
            coordIndex: 1,
            canvas,
        });
        const control = new ShapePoint({
            marcherShape: this,
            pointIndex: 1,
            coordIndex: 1,
            canvas,
            incomingPoint: start,
        });
        const end = new ShapePoint({
            marcherShape: this,
            pointIndex: 1,
            coordIndex: 3,
            canvas,
            incomingPoint: control,
        });
        this.points = [start, end, control];
        this.points.forEach((p) => p.drawOutgoingLine());
        this.canvas = canvas;
        this.canvas.add(this.pathObj);
        this.canvas.add(...this.points);
    }

    /**
     * Handles the movement of the shape by updating the control points' coordinates
     *
     * @param e The event that triggered the move
     */
    moveHandler(e: fabric.IEvent) {
        if (!this.pathObj) {
            console.error("The pathObj is not defined");
            return;
        }
        if (this.pathObj.left === undefined || this.pathObj.top === undefined) {
            console.error("The shape does not have coordinates");
            return;
        }
        this.curveOffset.fromInitial = {
            x: this.pathObj.left - this.curveOffset.initialPosition.x,
            y: this.pathObj.top - this.curveOffset.initialPosition.y,
        };
        this.points.forEach((p) => {
            p.handleParentMove();
        });
    }

    /**
     * Redraws the path of the MarcherShape object on the canvas.
     * This method is responsible for updating the path object on the canvas
     * to reflect any changes made to the control points or the overall shape.
     * It adjusts the coordinates of the path based on the offset from the
     * initial position of the shape.
     *
     * If there is a current pathObj, it is deleted
     *
     * @param pathArg The new path data to be drawn, represented as an array of
     * path commands and coordinates.
     * @returns The updated fabric.Path object representing the redrawn shape.
     */
    redrawPath(pathArg: (string | number)[][]) {
        if (this.pathObj && this.canvas) {
            this.canvas.remove(this.pathObj);
        }

        let pathToDraw: (string | number)[][] = [];
        if (
            this.pathObj &&
            this.pathObj.path &&
            this.curveOffset.fromInitial.x !== 0 &&
            this.curveOffset.fromInitial.y !== 0
        ) {
            pathToDraw = [];
            pathArg.forEach((point, index) => {
                const command = (point as any)[0] as string;
                if (command === "M" || command === "Q") {
                    // For M and Q commands, adjust x,y coordinates by the offset
                    // Points are stored as [command, x, y] for M
                    // and [command, cx, cy, x, y] for Q
                    const coordinates = point as unknown as (string | number)[];

                    // Adjust x,y coordinates
                    if (command === "M") {
                        coordinates[1] =
                            (coordinates[1] as number) +
                            this.curveOffset.fromInitial.x;
                        coordinates[2] =
                            (coordinates[2] as number) +
                            this.curveOffset.fromInitial.y;
                    }

                    // For Q command, adjust both control point and end point
                    if (command === "Q") {
                        // Adjust control point (cx,cy)
                        coordinates[1] =
                            (coordinates[1] as number) +
                            this.curveOffset.fromInitial.x;
                        coordinates[2] =
                            (coordinates[2] as number) +
                            this.curveOffset.fromInitial.y;
                        // Adjust end point (x,y)
                        coordinates[3] =
                            (coordinates[3] as number) +
                            this.curveOffset.fromInitial.x;
                        coordinates[4] =
                            (coordinates[4] as number) +
                            this.curveOffset.fromInitial.y;
                    }

                    pathToDraw.push(coordinates);
                }
            });
        } else pathToDraw = pathArg;

        this.pathObj = new fabric.Path(
            pathToDraw as unknown as fabric.Point[],
            {
                fill: "",
                strokeWidth: 2,
                stroke: CanvasColors.SHAPE,
                objectCaching: true,
                hasControls: false,
                borderColor: "#0d6efd",
                borderScaleFactor: 2,
                // selectable: false,
                hoverCursor: "default",
            },
        );
        if (this.pathObj.left === undefined || this.pathObj.top === undefined) {
            throw new Error("The shape does not have coordinates");
        }

        this.curveOffset = {
            initialPosition: { x: this.pathObj.left, y: this.pathObj.top },
            fromInitial: { x: 0, y: 0 },
        };
        if (this.canvas) this.canvas.add(this.pathObj);

        this.pathObj.on("moving", this.moveHandler.bind(this));

        // Refresh the control point listeners
        if (this.points) {
            this.points.forEach((p) => {
                p.bringToFront();
            });
        }

        return this.pathObj;
    }
}

/**
 * Represents a control point for a MarcherShape object, which is part of a path in a canvas.
 * The control point is associated with a specific point and coordinate index in the path.
 * It handles the movement and modification of the control point, and updates the corresponding
 * coordinates in the path.
 */
class ShapePoint extends fabric.Circle {
    /**
     * The path this control point is a part of
     */
    marcherShape: MarcherShape;
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

    canvas: OpenMarchCanvas;

    /** The point directly before this one in the path */
    incomingPoint: ShapePoint | null;
    /** The point directly after this one in the path */
    outgoingPoint: ShapePoint | null;
    /** A fabric line that leads to the outgoing point to visual the relationship */
    outgoingLine: fabric.Line | null;

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
        marcherShape: MarcherShape;
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
        if (!marcherShape.pathObj.path) {
            throw new Error("The parent path does not have a path");
        }

        super({
            strokeWidth: 4,
            radius: 6,
            fill: "#fff",
            stroke: CanvasColors.SHAPE,
            hasBorders: false,
            originX: "center",
            originY: "center",
            hasControls: false,
        });

        this.marcherShape = marcherShape;
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

    /**
     * Refreshes the coordinates of the path point associated with this MarcherShape object.
     *
     * This method updates the coordinates of the corresponding path point in the parent path's path array. It calculates the new coordinates based on the current position of the control point and the curve offset, and then sets the updated coordinates in the path array. Finally, it marks the parent path as dirty to trigger a redraw.
     */
    refreshParentPathCoordinates() {
        if (!this.marcherShape.pathObj.path) {
            console.error("The parent path does not have a path");
            return;
        }
        if (!this.left || !this.top) {
            console.error("The control point does not have coordinates");
            return;
        }
        (
            this.marcherShape.pathObj.path[
                this.pointIndex
            ] as unknown as number[]
        )[this.coordIndex] =
            this.left - this.marcherShape.curveOffset.fromInitial.x;
        (
            this.marcherShape.pathObj.path[
                this.pointIndex
            ] as unknown as number[]
        )[this.coordIndex + 1] =
            this.top - this.marcherShape.curveOffset.fromInitial.y;
        this.marcherShape.pathObj.setCoords();
        this.marcherShape.pathObj.dirty = true;
    }

    /**
     * Gets the coordinates of the path point associated with this MarcherShape object.
     *
     * This method retrieves the coordinates of the path point that corresponds to this MarcherShape object. It extracts the left and top coordinates from the path array and returns them as an object.
     *
     * @returns {Object} An object containing the left and top coordinates of the path point, or `null` if the parent path does not have a path.
     * @property {number} left - The left coordinate of the path point.
     * @property {number} top - The top coordinate of the path point.
     */
    getPathCoordinates() {
        if (!this.marcherShape.pathObj.path) {
            console.error("The parent path does not have a path");
            return;
        }
        const pathPoint = this.marcherShape.pathObj.path[
            this.pointIndex
        ] as unknown as number[];
        const point = {
            left: pathPoint[this.coordIndex],
            top: pathPoint[this.coordIndex + 1],
        };
        return point;
    }

    /**
     * Handles the movement of the parent path by updating the control point's coordinates
     */
    handleParentMove() {
        const pathPoint = this.getPathCoordinates();
        if (!pathPoint) {
            throw new Error("The point does not have coordinates");
        }
        this.left =
            pathPoint.left + this.marcherShape.curveOffset.fromInitial.x;
        this.top = pathPoint.top + this.marcherShape.curveOffset.fromInitial.y;

        this.refreshLines();
    }

    /**
     * Handles the movement of the control point by updating the path coordinates and refreshing the connected lines.
     *
     * This method is called when the control point is moved. It updates the coordinates of the corresponding path point, and then refreshes the incoming and outgoing lines connected to the control point.
     *
     * @param e - The fabric.js event object containing information about the move event.
     */
    moveHandler(e: fabric.IEvent) {
        this.marcherShape.pathObj.objectCaching = false;
        if (this.marcherShape.pathObj.path && this.left && this.top) {
            this.refreshParentPathCoordinates();
        }
        this.refreshLines();
    }

    /**
     * Redraws the parent path of the MarcherShape object.
     *
     * This method is called when the MarcherShape object has been modified, and the parent path needs to be redrawn.
     *
     * @param path - The path of the parent object, as an array of (string | number)[][] elements.
     */
    modifiedHandler(e: fabric.IEvent) {
        if (!this.marcherShape.pathObj.path) {
            console.error("The parent path does not have a path");
            return;
        }

        this.marcherShape.redrawPath(
            this.marcherShape.pathObj.path as unknown as (string | number)[][],
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

/**
 *
1. Move Command
	•	M x y: Moves the “pen” to the given (x, y) coordinates without drawing anything. This sets the starting point of a path.
	•	m dx dy: Moves to a relative position (dx, dy) from the current point.

2. Line Commands
	•	L x y: Draws a straight line from the current point to the specified (x, y) coordinates.
	•	l dx dy: Draws a line to a relative position (dx, dy) from the current point.
	•	H x: Draws a horizontal line from the current point to the given x coordinate.
	•	h dx: Draws a horizontal line to a relative position dx.
	•	V y: Draws a vertical line from the current point to the given y coordinate.
	•	v dy: Draws a vertical line to a relative position dy.

3. Curve Commands
	•	Q cx cy x y: Draws a quadratic Bézier curve from the current point to (x, y), with (cx, cy) as the control point.
	•	q dcx dcy dx dy: Draws a quadratic Bézier curve to a relative position (dx, dy) with control point (dcx, dcy).
	•	T x y: Draws a “smooth” quadratic Bézier curve to (x, y), using the previous control point as a reference.
	•	t dx dy: Draws a smooth quadratic Bézier curve to a relative position (dx, dy).
	•	C cx1 cy1 cx2 cy2 x y: Draws a cubic Bézier curve from the current point to (x, y), using (cx1, cy1) and (cx2, cy2) as control points.
	•	c dcx1 dcy1 dcx2 dcy2 dx dy: Draws a cubic Bézier curve to a relative position (dx, dy) with control points (dcx1, dcy1) and (dcx2, dcy2).
	•	S cx2 cy2 x y: Draws a “smooth” cubic Bézier curve to (x, y), with (cx2, cy2) as a control point, using the previous control point as a reference.
	•	s dcx2 dcy2 dx dy: Draws a smooth cubic Bézier curve to a relative position (dx, dy).

4. Arc Command
	•	A rx ry x-axis-rotation large-arc-flag sweep-flag x y: Draws an elliptical arc to (x, y) from the current point.
	•	rx and ry: Radii of the ellipse.
	•	x-axis-rotation: Angle to rotate the ellipse’s x-axis.
	•	large-arc-flag: 1 for a large arc, 0 for a small arc.
	•	sweep-flag: 1 to sweep in a positive-angle direction, 0 in the negative direction.

5. Close Path Command
	•	Z or z: Closes the current path by drawing a straight line from the current point to the start point of the path.
 */
