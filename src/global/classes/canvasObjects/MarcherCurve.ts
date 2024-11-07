import { fabric } from "fabric";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { CanvasColors } from "@/components/canvas/CanvasConstants";

export default class MarcherShape {
    /** The canvas this MarcherShape belongs to */
    canvas: OpenMarchCanvas;
    /** The control points of this shape */
    points: ShapePoint[];
    /** The fabric path that represents this MarcherShape */
    pathObject: fabric.Path;

    initialMoveOffset: { x: number; y: number };
    moveOffset: { x: number; y: number } = { x: 0, y: 0 };

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
        this.pathObject = new fabric.Path(
            `M (${startPoint.x}, ${startPoint.y}) Q (${controlPoint.x}, ${controlPoint.y}), (${endPoint.x}, ${endPoint.y})`,
            {
                fill: "",
                strokeWidth: 2,
                stroke: CanvasColors.SHAPE,
                objectCaching: false,
                borderColor: "#0d6efd",
                borderScaleFactor: 2,
                // hoverCursor: "default",
            },
        );
        if (!this.pathObject.left || !this.pathObject.top) {
            throw new Error("The path object does not have coordinates");
        }
        this.initialMoveOffset = {
            x: this.pathObject.left,
            y: this.pathObject.top,
        };

        const start = new ShapePoint({
            parentShape: this,
            pointIndex: 0,
            coordIndex: 1,
            canvas,
        });
        const control = new ShapePoint({
            parentShape: this,
            pointIndex: 1,
            coordIndex: 1,
            canvas,
            incomingPoint: start,
        });
        const end = new ShapePoint({
            parentShape: this,
            pointIndex: 1,
            coordIndex: 3,
            canvas,
            incomingPoint: control,
        });
        this.points = [start, end, control];
        this.points.forEach((p) => p.drawOutgoingLine());
        this.canvas = canvas;
        this.canvas.add(this.pathObject);
        this.canvas.add(...this.points);
        console.log(this);
    }
}

class ShapePoint extends fabric.Circle {
    /**
     * The path this control point is a part of
     */
    parentShape: MarcherShape;
    /**
     * The index of the point in the path.
     * I.e. `this.parentShape.path[this.pathIndex]` is the point this control point is associated with
     */
    pointIndex: number;
    /**
     * The index of the coordinates in the point.
     * I.e. `this.parentShape.path[this.pointIndex][this.coordIndex]` is the coordinate this control point is associated with
     */
    coordIndex: number;

    canvas: OpenMarchCanvas;

    /** The point directly before this one in the path */
    incomingPoint: ShapePoint | null;
    /** The point directly after this one in the path */
    outgoingPoint: ShapePoint | null;
    /** A fabric line that leads to the outgoing point to visual the relationship */
    outgoingLine: fabric.Line | null;

    initialPosition: { x: number; y: number };
    left: number;
    top: number;

    constructor({
        parentShape,
        pointIndex,
        coordIndex,
        canvas,
        incomingPoint = null,
        outgoingPoint = null,
    }: {
        parentShape: MarcherShape;
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
        if (!parentShape.pathObject.path)
            throw new Error("The parent path does not have a path");

        const pathPoint = parentShape.pathObject.path[
            pointIndex
        ] as unknown as number[];
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
        this.left = point.left;
        this.top = point.top;

        this.initialPosition = { x: this.left, y: this.top };
        this.on("moving", this.moveHandler);
        // this.on("selected", this.selectHandler);

        this.parentShape = parentShape;
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

    refreshParentShapeCoordinates() {
        if (!this.parentShape.pathObject.path) {
            console.error("The parent path does not have a path");
            return;
        }
        if (!this.left || !this.top) {
            console.error("The control point does not have coordinates");
            return;
        }
        (
            this.parentShape.pathObject.path[
                this.pointIndex
            ] as unknown as number[]
        )[this.coordIndex] = this.left;
        (
            this.parentShape.pathObject.path[
                this.pointIndex
            ] as unknown as number[]
        )[this.coordIndex + 1] = this.top;
        this.parentShape.pathObject.setCoords();
        this.parentShape.pathObject.dirty = true;
    }

    moveHandler(e: fabric.IEvent) {
        if (this.parentShape.pathObject.path && this.left && this.top) {
            this.refreshParentShapeCoordinates();
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
