import { fabric } from "fabric";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { CanvasColors } from "@/components/canvas/CanvasConstants";

/**
 * An SVG point in the MarcherShape path.
 */
type PathPoint = [string, ...number[]];

/**
 * Represents a MarcherShape object, which is a canvas path with control points.
 * The MarcherShape class handles the creation, movement, and redrawing of the path and its control points.
 */
export default class MarcherShape {
    canvas?: OpenMarchCanvas;
    /** The control points of this shape */
    controlPoints: ShapePointController[];

    curveOffset: {
        initialPosition: { x: number; y: number };
        fromInitial: { x: number; y: number };
    } = {
        initialPosition: { x: 0, y: 0 },
        fromInitial: { x: 0, y: 0 },
    };

    shapePath: ShapePath;

    constructor({
        canvas,
        points,
    }: {
        canvas: OpenMarchCanvas;
        points: ShapePoint[];
    }) {
        this.canvas = canvas;
        this.shapePath = this.recreatePath(ShapePoint.pointsToArray(points));

        const controlPoints: ShapePointController[] = [];
        for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
            const point = points[pointIndex];
            for (
                let coordinateIndex = 0;
                coordinateIndex < point.coordinates.length;
                coordinateIndex++
            ) {
                //
                const controlPoint = new ShapePointController({
                    marcherShape: this,
                    pointIndex,
                    coordIndex: 1 + coordinateIndex * 2,
                    canvas,
                    incomingPoint:
                        // If the point is the first point in the path or a line, there is no incoming point
                        pointIndex > 0 && point.command !== "L"
                            ? controlPoints[controlPoints.length - 1]
                            : null,
                });
                controlPoints.push(controlPoint);
            }
        }
        this.controlPoints = controlPoints;
        this.controlPoints.forEach((p) => p.drawOutgoingLine());
        this.canvas.add(...this.controlPoints);
    }

    /**
     * Handles the movement of the shape by updating the control points' coordinates
     *
     * @param e The event that triggered the move
     */
    moveHandler(e: fabric.IEvent) {
        if (!this.shapePath) {
            console.error("The shapePath is not defined");
            return;
        }
        if (
            this.shapePath.left === undefined ||
            this.shapePath.top === undefined
        ) {
            console.error("The shape does not have coordinates");
            return;
        }
        this.curveOffset.fromInitial = {
            x: this.shapePath.left - this.curveOffset.initialPosition.x,
            y: this.shapePath.top - this.curveOffset.initialPosition.y,
        };
        this.controlPoints.forEach((p) => {
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
     * If there is a current shapePath, it is deleted
     *
     * @param pathArg The new path data to be drawn, represented as an array of
     * path commands and coordinates.
     * @returns The updated fabric.Path object representing the redrawn shape.
     */
    recreatePath(pathArg: PathPoint[]) {
        if (this.shapePath && this.canvas) {
            this.canvas.remove(this.shapePath);
        }

        const points = ShapePoint.fromArray(pathArg);
        points.forEach((p) => p.applyOffset(this.curveOffset.fromInitial));

        this.shapePath = new ShapePath(points);
        if (
            this.shapePath.left === undefined ||
            this.shapePath.top === undefined
        )
            throw new Error("The shape does not have coordinates");

        this.curveOffset = {
            initialPosition: { x: this.shapePath.left, y: this.shapePath.top },
            fromInitial: { x: 0, y: 0 },
        };
        if (!this.canvas) throw new Error("The canvas is not defined");
        this.canvas.add(this.shapePath);
        this.shapePath.on("moving", this.moveHandler.bind(this));

        // Refresh the control point listeners
        if (this.controlPoints) {
            this.controlPoints.forEach((p) => {
                p.bringToFront();
            });
        }

        return this.shapePath;
    }
}

/**
 * Represents a control point for a MarcherShape object, which is part of a path in a canvas.
 * The control point is associated with a specific point and coordinate index in the path.
 * It handles the movement and modification of the control point, and updates the corresponding
 * coordinates in the path.
 */
class ShapePointController extends fabric.Circle {
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
    incomingPoint: ShapePointController | null;
    /** The point directly after this one in the path */
    outgoingPoint: ShapePointController | null;
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
        // if (this.outgoingPoint && !(this.outgoingPoint.incomingPoint === this))
        //     this.outgoingPoint.incomingPoint = this;

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
            this.left - this.marcherShape.curveOffset.fromInitial.x;
        (
            this.marcherShape.shapePath.path[
                this.pointIndex
            ] as unknown as number[]
        )[this.coordIndex + 1] =
            this.top - this.marcherShape.curveOffset.fromInitial.y;
        this.marcherShape.shapePath.setCoords();
        this.marcherShape.shapePath.dirty = true;
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
        if (!this.marcherShape.shapePath.path) {
            console.error("The parent path does not have a path");
            return;
        }
        const pathPoint = this.marcherShape.shapePath.path[
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
        this.marcherShape.shapePath.objectCaching = false;
        if (this.marcherShape.shapePath.path && this.left && this.top) {
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
        if (!this.marcherShape.shapePath.path) {
            console.error("The parent path does not have a path");
            return;
        }

        this.marcherShape.recreatePath(
            this.marcherShape.shapePath.path as unknown as PathPoint[],
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

export class ShapePath extends fabric.Path {
    /**
     *
     * @param points The points to draw the path from
     * @param offset The offset to apply to the given path
     */
    constructor(points: ShapePoint[]) {
        super(ShapePoint.pointsToString(points), {
            fill: "",
            strokeWidth: 2,
            stroke: CanvasColors.SHAPE,
            objectCaching: true,
            hasControls: false,
            borderColor: "#0d6efd",
            borderScaleFactor: 2,
            // selectable: false,
            hoverCursor: "default",
        });
    }

    get points(): ShapePoint[] {
        if (!this.path) {
            console.error("The path is not defined");
            return [];
        }
        return ShapePoint.fromArray(this.path as any as PathPoint[]);
    }
}

/**
 * Represents a single point in a shape path, with a command and coordinates.
 * The `ShapePoint` class provides methods to work with and manipulate these points.
 */
export class ShapePoint {
    command: string;
    coordinates: { x: number; y: number }[];

    private constructor(
        command: string,
        coordinates: { x: number; y: number }[],
    ) {
        this.command = command;
        this.coordinates = coordinates;
    }

    /**
     * Converts the ShapePoint to a string representation in SVG path format
     * @returns A string in the format "command x, y "
     */
    toString() {
        const array = this.toArray();
        return `${this.command} ${array.slice(1).join(", ")} `;
    }

    /**
     * Converts an array of ShapePoints into a single SVG path string
     * @param points Array of ShapePoint objects to convert
     * @returns Combined string of all points in SVG path format
     */
    static pointsToString(points: ShapePoint[]) {
        let output = "";
        for (const p of points) output += p.toString();
        return output;
    }

    static fromArray(array: PathPoint[]): ShapePoint[] {
        const points: ShapePoint[] = [];
        for (const point of array) {
            const command = point[0] as string;
            const coordinates = point.slice(1) as number[];
            const coordPairs: { x: number; y: number }[] = [];
            for (let i = 0; i < coordinates.length; i += 2) {
                if (i + 1 >= coordinates.length) {
                    console.warn(
                        `Warning: Incomplete coordinate pair for command ${command}`,
                    );
                    break;
                }
                coordPairs.push({ x: coordinates[i], y: coordinates[i + 1] });
            }

            points.push(new ShapePoint(command, coordPairs));
        }
        return points;
    }

    /**
     * Applies an offset to the coordinates of the ShapePoint.
     * @param offset - An object containing the x and y offsets to apply.
     */
    applyOffset(offset: { x: number; y: number }) {
        for (const point of this.coordinates) {
            point.x += offset.x;
            point.y += offset.y;
        }
    }

    /**
     * Converts the ShapePoint into an array format with command as first element
     * @returns Tuple with command string followed by coordinate numbers
     */
    toArray(): PathPoint {
        return [
            this.command,
            ...this.coordinates.flatMap((coord) => [coord.x, coord.y]),
        ];
    }

    /**
     * Converts an array of ShapePoints into an array of command-coordinate tuples
     * @param points Array of ShapePoint objects to convert
     * @returns Array of tuples, each containing a command string and coordinates
     */
    static pointsToArray(points: ShapePoint[]): Array<PathPoint> {
        return points.map((point) => point.toArray());
    }

    /******************** GENERATORS *********************/
    /**
     * Creates a Move command ShapePoint
     * @param x X coordinate to move to
     * @param y Y coordinate to move to
     * @returns New ShapePoint with "M" command
     */
    static Move(x: number, y: number): ShapePoint {
        return new ShapePoint("M", [{ x, y }]);
    }

    /**
     * Creates a Quadratic curve command ShapePoint
     * @param cx Control point X coordinate
     * @param cy Control point Y coordinate
     * @param x End point X coordinate
     * @param y End point Y coordinate
     * @returns New ShapePoint with "Q" command
     */
    static Quadratic(cx: number, cy: number, x: number, y: number): ShapePoint {
        return new ShapePoint("Q", [
            { x: cx, y: cy },
            { x, y },
        ]);
    }

    /**
     * Creates a Cubic Bézier curve command ShapePoint.
     * @param cx1 The X coordinate of the first control point.
     * @param cy1 The Y coordinate of the first control point.
     * @param cx2 The X coordinate of the second control point.
     * @param cy2 The Y coordinate of the second control point.
     * @param x The X coordinate of the end point.
     * @param y The Y coordinate of the end point.
     * @returns A new ShapePoint with the "C" command.
     */
    static Cubic(
        cx1: number,
        cy1: number,
        cx2: number,
        cy2: number,
        x: number,
        y: number,
    ): ShapePoint {
        return new ShapePoint("C", [
            { x: cx1, y: cy1 },
            { x: cx2, y: cy2 },
            { x, y },
        ]);
    }

    static Line(x: number, y: number): ShapePoint {
        return new ShapePoint("L", [{ x, y }]);
    }

    static Close(): ShapePoint {
        return new ShapePoint("Z", []);
    }

    static Arch(rx: number, ry: number, x: number, y: number): ShapePoint {
        return new ShapePoint("A", [
            { x: rx, y: ry },

            { x, y },
        ]);
    }

    // /**
    //  * Creates a "smooth" cubic Bézier curve ShapePoint to the specified coordinates, using the previous control point as a reference.
    //  * @param cx2 The X coordinate of the second control point.
    //  * @param cy2 The Y coordinate of the second control point.
    //  * @param x The X coordinate of the end point.
    //  * @param y The Y coordinate of the end point.
    //  * @returns A new ShapePoint with the "S" command.
    //  */
    // static S(cx2: number, cy2: number, x: number, y: number): ShapePoint {
    //     return new ShapePoint("C", [
    //         { x: cx2, y: cy2 },
    //         { x, y },
    //     ]);
    // }
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
