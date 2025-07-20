import { fabric } from "fabric";
import OpenMarchCanvas from "./OpenMarchCanvas";
import MarcherPage from "../MarcherPage";
import CanvasMarcher from "./CanvasMarcher";
import { ShapePoint } from "./ShapePoint";
import { Coordinate, SvgCommandEnum } from "./SvgCommand";
import { ShapePath } from "./ShapePath";
import { ShapePointController } from "./ShapePointController";
import { roundCoordinatesHandler } from "./handlers/RoundCoordinates";

/**
 * An SVG point in the StaticMarcherShape path.
 *
 * This is the lowest type of the point and is how a path's point is represented in fabric.js
 */
export type VanillaPoint = [string, ...number[]];

/**
 * A canvas path with control points.
 * The StaticMarcherShape class handles the creation, movement, and redrawing of the path and its control points.
 *
 * This class does not interact with the database at all.
 */
export class StaticMarcherShape {
    readonly SUPPORTED_SvgCommandEnumS = ["M", "L", "Q", "C", "Z"];

    /** The canvas this StaticMarcherShape belongs to */
    canvas?: OpenMarchCanvas;
    /** The control points of this shape */
    controlPoints: ShapePointController[];

    _controlEnabled: boolean;

    /** A tracker to check if the shape has been edited */
    dirty: boolean = false;

    /**
     * Represents the initial position and offset of a move in the StaticMarcherShape.
     * The `initialPosition` property holds the initial x and y coordinates of the shape.
     * The `fromInitial` property holds the x and y offsets from the initial position.
     */
    moveOffset: {
        initialPosition: Coordinate;
        fromInitial: Coordinate;
    } = {
        initialPosition: { x: 0, y: 0 },
        fromInitial: { x: 0, y: 0 },
    };

    /**
     * The path of the StaticMarcherShape object, which represents the shape of the canvas path.
     */
    private _shapePath: ShapePath;

    /** The marchers that are currently on this shape in the order that they are on the shape */
    private _canvasMarchers: CanvasMarcher[];

    /**
     * Constructs a new `StaticMarcherShape` instance with the provided canvas, canvas marchers, and shape points.
     *
     * This constructor initializes the shape path, control points, and other properties of the `StaticMarcherShape` class.
     * It creates control points for each coordinate in the provided shape points, and sets up the necessary event handlers and canvas interactions.
     *
     * After construction, all of the items are added to the canvas.
     *
     * @param {Object} params - The parameters for constructing the `StaticMarcherShape`.
     * @param {OpenMarchCanvas} params.canvas - The canvas this `StaticMarcherShape` belongs to.
     * @param {CanvasMarcher[]} params.canvasMarchers - The marchers that are currently on this shape.
     * @param {ShapePoint[]} params.points - The points that define the shape of this `StaticMarcherShape`.
     */
    constructor({
        canvas,
        canvasMarchers,
        points,
        controlEnabled = false,
    }: {
        canvas: OpenMarchCanvas;
        canvasMarchers: CanvasMarcher[];
        points: ShapePoint[];
        controlEnabled?: boolean;
    }) {
        ShapePath.fieldTheme = canvas.fieldProperties.theme;
        this.canvas = canvas;
        this._shapePath = this.recreatePath(ShapePoint.pointsToArray(points));
        this._canvasMarchers = canvasMarchers;
        this.controlPoints = [];

        if (controlEnabled) {
            this._controlEnabled = false;
            this.enableControl();
        } else {
            this._controlEnabled = true;
            this.disableControl();
        }

        this.distributeMarchers();
    }

    /**
     * Enables the control of the StaticMarcherShape by creating control points for each coordinate in the shape path, adding them to the canvas, and enabling control on the shape path.
     */
    enableControl() {
        if (!this.canvas) {
            console.error("Canvas is not defined");
            return;
        }
        if (this._controlEnabled) return; // Control already enabled
        const points = this._shapePath.points;
        const newControlPoints: ShapePointController[] = [];
        for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
            const point = points[pointIndex];
            // Create a control point for each coordinate in the point
            for (
                let coordinateIndex = 0;
                coordinateIndex < point.coordinates.length;
                coordinateIndex++
            ) {
                const controlPoint = new ShapePointController({
                    marcherShape: this,
                    pointIndex,
                    coordIndex: 1 + coordinateIndex * 2,
                    canvas: this.canvas,
                    incomingPoint:
                        // If the point is the first point in the path or a line, there is no incoming point
                        pointIndex > 0 && point.command !== "L"
                            ? newControlPoints[newControlPoints.length - 1]
                            : null,
                });
                newControlPoints.push(controlPoint);
            }
        }
        this.controlPoints = newControlPoints;
        this.controlPoints.forEach((p) => p.drawOutgoingLine());
        this.canvas.add(...this.controlPoints);
        this.bringControlPointsToFront();

        this._shapePath.enableControl();
        this._controlEnabled = true;
    }

    /**
     * Disables the control of the StaticMarcherShape by destroying the control points, disabling control on the shape path, and setting the control enabled flag to false.
     */
    disableControl() {
        if (!this._controlEnabled) return; // Control already disabled
        for (const controlPoint of this.controlPoints) controlPoint.destroy();
        this._shapePath.disableControl();
        this._controlEnabled = false;
    }

    /**
     * Brings the control points of the StaticMarcherShape to the front of the canvas.
     * This ensures the control points are visible and not obscured by other canvas objects.
     */
    bringControlPointsToFront() {
        if (this.controlPoints)
            this.controlPoints.forEach((p) => {
                p.bringToFront();
            });
    }

    private _moveStartPoint?: { xPixels: number; yPixels: number };
    /**
     * Handles the movement of the shape by updating the control points' coordinates
     *
     * @param e The event that triggered the move
     */
    moveHandler(e: fabric.IEvent<MouseEvent>) {
        if (!this._moveStartPoint) {
            if (
                this._shapePath.left === undefined ||
                this._shapePath.top === undefined
            ) {
                console.error("The shape does not have coordinates");
                return;
            }
            this._moveStartPoint = {
                xPixels: this._shapePath.left,
                yPixels: this._shapePath.top,
            };
        }
        roundCoordinatesHandler(this._shapePath, e, this._moveStartPoint);
        if (!this._shapePath) {
            console.error("The shapePath is not defined");
            return;
        }
        if (
            this._shapePath.left === undefined ||
            this._shapePath.top === undefined
        ) {
            console.error("The shape does not have coordinates");
            return;
        }

        this.moveOffset.fromInitial = {
            x: this._shapePath.left - this.moveOffset.initialPosition.x,
            y: this._shapePath.top - this.moveOffset.initialPosition.y,
        };
        this.controlPoints.forEach((p) => {
            p.handleParentMove();
        });
        this.canvasMarchers.forEach((m) => {
            const newMarcherPage = {
                ...m.coordinate,
                x: m.coordinate.x + this.moveOffset.fromInitial.x,
                y: m.coordinate.y + this.moveOffset.fromInitial.y,
            };
            m.setMarcherCoords(newMarcherPage, false);
        });
        this.dirty = true;
    }

    /**
     * Handles the modification of the shape by recreating the path based on the updated shape path.
     * This method is called when the shape is modified, such as when control points are moved.
     * It updates the canvas to reflect the new shape by recreating the path using the updated coordinates.
     *
     * @param e The fabric.js event object that triggered the modification.
     */
    modifiedHandler(e: fabric.IEvent) {
        this._moveStartPoint = undefined;
        this.recreatePath(this._shapePath.path as any as VanillaPoint[]);
    }

    /**
     * Updates the StaticMarcherShape with a new SVG path.
     * This method converts the SVG path string into an array of VanillaPoint objects,
     * which are then used to recreate the shape path on the canvas.
     * After updating the path, the method also updates the control points to match the new shape.
     *
     * @param svgPath - The SVG path string to be used to update the shape.
     */
    updateWithSvg(svgPath: string) {
        const points = ShapePoint.fromString(svgPath);
        const vanillaPoints: VanillaPoint[] = points.map((p) => {
            const output: VanillaPoint = [p.command];
            for (const coordinate of p.coordinates)
                output.push(coordinate.x, coordinate.y);
            return output;
        });
        this.recreatePath(vanillaPoints);
        this.controlPoints.forEach((p) => {
            p.handleParentMove();
        });
    }

    /**
     * Redraws the path of the StaticMarcherShape object on the canvas.
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
    recreatePath(pathArg: VanillaPoint[]) {
        if (this._shapePath && this.canvas) {
            this.canvas.remove(this._shapePath);
        }

        const points = ShapePoint.fromArray(pathArg);
        points.forEach((p) => p.applyOffset(this.moveOffset.fromInitial));

        this._shapePath = new ShapePath(points);
        if (
            this._shapePath.left === undefined ||
            this._shapePath.top === undefined
        )
            throw new Error("The shape does not have coordinates");

        this.moveOffset = {
            initialPosition: {
                x: this._shapePath.left,
                y: this._shapePath.top,
            },
            fromInitial: { x: 0, y: 0 },
        };
        if (!this.canvas) throw new Error("The canvas is not defined");
        this.canvas.add(this._shapePath);
        this._shapePath.on("moving", this.moveHandler.bind(this));
        this._shapePath.on("modified", this.modifiedHandler.bind(this));

        this.canvas.sendCanvasMarchersToFront();
        this.bringControlPointsToFront();
        if (this._controlEnabled) this._shapePath.enableControl();
        else this._shapePath.disableControl();

        return this._shapePath;
    }

    /**
     * Destroys the StaticMarcherShape by removing the shape path and control points from the canvas.
     */
    destroy() {
        if (!this.canvas) {
            console.error("Canvas is not defined");
            return;
        }
        this.disableControl();
        if (this._shapePath) this.canvas.remove(this._shapePath);
        for (const point of this.controlPoints) {
            this.canvas.remove(point);
            if (point.outgoingLine) this.canvas.remove(point.outgoingLine);
        }
    }

    /**
     * Distributes the marchers along the path of the StaticMarcherShape object.
     * This method calculates the new coordinates for each marcher based on the
     * SVG path and places the marchers at those coordinates.
     * If the number of marchers does not match the number of coordinates,
     * an error is thrown.
     */
    distributeMarchers() {
        if (!this._shapePath)
            throw new Error("No path exists to distribute marchers on");

        const newCoordinates = StaticMarcherShape.distributeAlongPath({
            itemIds: this.canvasMarchers.map((m) => ({ id: m.id })),
            svgPath: this._shapePath,
        });

        // Loop to create and place the dots along the path
        for (let i = 0; i < newCoordinates.length; i++) {
            const canvasMarcher = this.canvasMarchers[i];
            const newCoordinate = newCoordinates[i];
            const newMarcherPage = new MarcherPage({
                ...(canvasMarcher.coordinate as MarcherPage),
                x: newCoordinate.x,
                y: newCoordinate.y,
            });
            this.canvasMarchers[i].setMarcherCoords(newMarcherPage);
        }
        if (this.canvas) {
            this.canvas.requestRenderAll();
        }
    }

    /**
     * Getter for the `_canvasMarchers` property, which represents the array of CanvasMarcher objects associated with this StaticMarcherShape.
     * @returns {CanvasMarcher[]} The array of CanvasMarcher objects.
     */
    get canvasMarchers() {
        return this._canvasMarchers;
    }

    /**
     * Sets the `canvasMarchers` property and distributes the marchers along the path of the StaticMarcherShape object.
     * This method calculates the new coordinates for each marcher based on the SVG path and places the marchers at those coordinates.
     * It also brings the control points to the front of the canvas.
     * @param {CanvasMarcher[]} canvasMarchers - The array of CanvasMarcher objects to be associated with this StaticMarcherShape.
     */
    set canvasMarchers(canvasMarchers: CanvasMarcher[]) {
        this._canvasMarchers = canvasMarchers;
        this.distributeMarchers();
        this.bringControlPointsToFront();
    }

    /**
     * Distributes a set of items (e.g. marchers) evenly along an SVG path.
     *
     * @param itemIds - An array of objects with `id` properties, representing the items to be distributed.
     * @param svgPath - The SVG path along which the items will be distributed.
     * @returns An array of objects with `id`, `x`, and `y` properties, representing the coordinates where the items should be placed.
     */
    static distributeAlongPath({
        itemIds,
        svgPath,
    }: {
        itemIds: { id: number }[];
        svgPath: string | ShapePath;
    }): { id: number; x: number; y: number }[] {
        const shapePath =
            typeof svgPath === "string"
                ? new ShapePath(ShapePoint.fromString(svgPath))
                : svgPath;

        const separatePaths: string[] = [];
        let activeString = "";
        const firstCoord = shapePath.points[0].coordinates[0];

        // Loop through the SVG path and separate it into individual paths
        for (const svgPoint of shapePath.points) {
            if (svgPoint.command === SvgCommandEnum.MOVE)
                activeString = svgPoint.toString();
            else if (svgPoint.command === SvgCommandEnum.CLOSE) {
                separatePaths.push(
                    activeString + ` L ${firstCoord.x} ${firstCoord.y}`,
                );
                activeString = `M ${firstCoord.x} ${firstCoord.y}`;
            } else {
                separatePaths.push(activeString + " " + svgPoint.toString());

                // Update the active string to the end coordinate of the current point
                const coordsLength = svgPoint.coordinates.length;
                const endCoordinate = svgPoint.coordinates[coordsLength - 1];
                activeString = `M ${endCoordinate.x} ${endCoordinate.y}`;
            }
        }
        // Calculate the length of each segment of the SVG path
        const svgSegmentLengths: number[] = [];
        const svgPathObjects: SVGPathElement[] = [];
        const svgNamespace = "http://www.w3.org/2000/svg";
        for (const pathString of separatePaths) {
            const tempSvgPath = document.createElementNS(svgNamespace, "path");
            svgPathObjects.push(tempSvgPath);
            tempSvgPath.setAttribute("d", pathString.toString());

            svgSegmentLengths.push(tempSvgPath.getTotalLength());
        }

        // The itemIds check is just to prevent printing on initial creation
        if (itemIds.length < svgSegmentLengths.length + 1 && itemIds.length > 0)
            console.warn(
                "The number of marchers is less than the number of segments in the path. This means there are not enough marchers to place on each point. The shape will be distributed unevenly.",
            );

        const totalLength = svgSegmentLengths.reduce((a, b) => a + b, 0);
        let itemsRemaining = itemIds.length;
        const itemsPerSegment: number[] = svgSegmentLengths.map((_) => 0);
        // Add one marcher to each segment
        for (let i = 0; i < svgSegmentLengths.length; i++) {
            if (itemsRemaining === 0) break;
            itemsPerSegment[i] = 1;
            itemsRemaining -= 1;
        }

        // Calculate how many items should be placed on each segment
        for (let i = 0; i < svgSegmentLengths.length; i++) {
            // Only factor in the items length minus the number of segments plus 1.
            // This is because each segment needs to have at least one marcher on the segment.
            // We need to add 1 for the ending segment since it will have 2 points.
            const svgSegmentLength = svgSegmentLengths[i];
            itemsPerSegment[i] += Math.round(
                (svgSegmentLength / totalLength) * itemsRemaining,
            );
        }
        const totalItems = itemsPerSegment.reduce((a, b) => a + b, 0);
        if (totalItems === itemIds.length + 1) {
            // find the segment with the most items and reduce it by 1
            const maxIndex = itemsPerSegment.indexOf(
                Math.max(...itemsPerSegment),
            );
            itemsPerSegment[maxIndex] -= 1;
        } else if (totalItems === itemIds.length - 1) {
            // find the segment with the most items and reduce it by 1
            const minIndex = itemsPerSegment.indexOf(
                Math.min(...itemsPerSegment),
            );
            itemsPerSegment[minIndex] += 1;
        } else if (totalItems !== itemIds.length) {
            console.warn(
                "Mismatch between number of marchers and number of segments.",
                {
                    totalItems,
                    itemIds: itemIds.length,
                },
            );
        }

        // Place marchers evenly on each segment based on length
        // Ensure that every segment has at least one marcher (on the point) and that the last point has a marcher on it.
        const output: { id: number; x: number; y: number }[] = [];
        let currentItemIndex = 0;
        for (let i = 0; i < svgSegmentLengths.length; i++) {
            const segmentLength = svgSegmentLengths[i];
            const itemsOnSegment = itemsPerSegment[i];
            const command = shapePath.points[i + 1].command;
            const isAfterClose =
                i > 0 && shapePath.points[i].command === SvgCommandEnum.CLOSE;

            // If this is the last segment and we are including the end point, we need to reduce the spacing by 1
            const isLastSegment =
                i === svgSegmentLengths.length - 1 &&
                command !== SvgCommandEnum.CLOSE;
            const spacing =
                segmentLength / (itemsOnSegment - (isLastSegment ? 1 : 0));

            // Don't include the start point if it is not included
            for (let j = isAfterClose ? 1 : 0; j < itemsOnSegment; j++) {
                const point = svgPathObjects[i].getPointAtLength(spacing * j);
                output.push({
                    id: itemIds[currentItemIndex].id,
                    x: point.x,
                    y: point.y,
                });
                currentItemIndex++;
            }
        }

        return output;
    }

    /**
     * Compares this `StaticMarcherShape` instance to another, checking if their `shapePath` properties are equal.
     * This checks the SVG path string, not the points.
     *
     * @param other - The other `StaticMarcherShape` instance to compare against.
     * @returns `true` if the `shapePath` properties are equal, `false` otherwise.
     */
    equals(other: StaticMarcherShape): boolean {
        return this.shapePath.equals(other.shapePath);
    }

    /****************** GETTERS AND SETTERS ******************/
    get shapePath(): ShapePath {
        return this._shapePath;
    }

    setShapePathPoints(points: ShapePoint[]) {
        const controlWasEnabled = this._controlEnabled;

        this.destroy();
        this._shapePath = this.recreatePath(ShapePoint.pointsToArray(points));
        this.distributeMarchers();
        if (controlWasEnabled) {
            this._controlEnabled = false;
            this.enableControl();
        } else {
            this._controlEnabled = true;
            this.disableControl();
        }
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
