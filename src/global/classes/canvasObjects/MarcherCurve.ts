import { fabric } from "fabric";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { CanvasColors } from "@/components/canvas/CanvasConstants";
import ShapePoint from "./ShapePoint";

export default class MarcherShape extends fabric.Path {
    canvas: OpenMarchCanvas;
    points: ShapePoint[];

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
        super(
            `M (${startPoint.x}, ${startPoint.y}) Q (${controlPoint.x}, ${controlPoint.y}), (${endPoint.x}, ${endPoint.y})`,
            {
                fill: "",
                strokeWidth: 2,
                stroke: CanvasColors.SHAPE,
                objectCaching: false,
                selectable: false,
                hoverCursor: "default",
            },
        );
        const start = new ShapePoint({
            parentPath: this,
            pointIndex: 0,
            coordIndex: 1,
            canvas,
        });
        const control = new ShapePoint({
            parentPath: this,
            pointIndex: 1,
            coordIndex: 1,
            canvas,
            incomingPoint: start,
        });
        const end = new ShapePoint({
            parentPath: this,
            pointIndex: 1,
            coordIndex: 3,
            canvas,
            incomingPoint: control,
        });
        this.points = [start, end, control];
        this.points.forEach((p) => p.drawOutgoingLine());
        this.canvas = canvas;
        this.canvas.add(this);
        this.canvas.add(...this.points);
        console.log(this);

        // this.setListeners();
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
