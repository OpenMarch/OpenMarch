import { fabric } from "fabric";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { CanvasColors } from "../../../components/canvas/CanvasConstants";
import MarcherPage from "../MarcherPage";
import CanvasMarcher from "./CanvasMarcher";

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

    /**
     * Handles the movement of the shape by updating the control points' coordinates
     *
     * @param e The event that triggered the move
     */
    moveHandler(e: fabric.IEvent) {
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
                ...m.marcherPage,
                x: m.marcherPage.x + this.moveOffset.fromInitial.x,
                y: m.marcherPage.y + this.moveOffset.fromInitial.y,
            };
            m.setMarcherCoords(newMarcherPage, false);
        });
    }

    /**
     * Handles the modification of the shape by recreating the path based on the updated shape path.
     * This method is called when the shape is modified, such as when control points are moved.
     * It updates the canvas to reflect the new shape by recreating the path using the updated coordinates.
     *
     * @param e The fabric.js event object that triggered the modification.
     */
    modifiedHandler(e: fabric.IEvent) {
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
                ...canvasMarcher.marcherPage,
                x: newCoordinate.x,
                y: newCoordinate.y,
            });
            this.canvasMarchers[i].setMarcherCoords(newMarcherPage);
        }
        if (this.canvas) {
            this.canvas.requestRenderAll();
        }
    }

    get canvasMarchers() {
        return this._canvasMarchers;
    }

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

        // Loop through the SVG path and separate it into individual paths
        for (const svgPoint of shapePath.points) {
            if (svgPoint.command === "M") activeString = svgPoint.toString();
            else {
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

        if (itemIds.length < svgSegmentLengths.length + 1)
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

            // If this is the last segment and we are including the end point, we need to reduce the spacing by 1
            const isLastSegment = i === svgSegmentLengths.length - 1;
            const spacing =
                segmentLength / (itemsOnSegment - (isLastSegment ? 1 : 0));
            // Don't include the start point if it is not included
            for (let j = 0; j < itemsOnSegment; j++) {
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
 * Represents a control point for a StaticMarcherShape object, which is part of a path in a canvas.
 * The control point is associated with a specific point and coordinate index in the path.
 * It handles the movement and modification of the control point, and updates the corresponding
 * coordinates in the path.
 */
class ShapePointController extends fabric.Circle {
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
            stroke: CanvasColors.SHAPE,
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
        const VanillaPoint = this.marcherShape.shapePath.path[
            this.pointIndex
        ] as unknown as number[];
        const point = {
            left: VanillaPoint[this.coordIndex],
            top: VanillaPoint[this.coordIndex + 1],
        };
        return point;
    }

    /**
     * Handles the movement of the parent path by updating the control point's coordinates
     */
    handleParentMove() {
        const VanillaPoint = this.getPathCoordinates();
        if (!VanillaPoint) {
            throw new Error("The point does not have coordinates");
        }
        this.left =
            VanillaPoint.left + this.marcherShape.moveOffset.fromInitial.x;
        this.top =
            VanillaPoint.top + this.marcherShape.moveOffset.fromInitial.y;

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
            this.marcherShape.distributeMarchers();
            this.marcherShape.bringControlPointsToFront();
        }
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
 * The fabric.Path object that represents the path of the shape.
 */
export class ShapePath extends fabric.Path {
    /**
     * @param points The points to draw the path from
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
        });
        this.disableControl();
    }

    enableControl() {
        this.stroke = CanvasColors.SHAPE;
        this.strokeWidth = 2;
        this.strokeDashArray = [];
        this.selectable = true;
        this.hoverCursor = "move";
    }

    disableControl() {
        this.stroke = CanvasColors.TEMP_PATH;
        this.strokeWidth = 1;
        this.strokeDashArray = [5, 3];
        this.selectable = false;
        this.hoverCursor = "default";
    }

    get points(): ShapePoint[] {
        if (!this.path) {
            console.error("The path is not defined");
            return [];
        }
        return ShapePoint.fromArray(this.path as any as VanillaPoint[]);
    }

    /**
     * String representation of all the points in the path.
     *
     * @returns A string representation of the path. E.g. "M 0 0 L 100 100"
     */
    toString() {
        return this.points.map((point) => point.toString()).join(" ");
    }

    equals(other: ShapePath) {
        return this.toString() === other.toString();
    }
}

export enum SvgCommandEnum {
    MOVE = "M",
    LINE = "L",
    QUADRATIC = "Q",
    CUBIC = "C",
    CLOSE = "Z",
}

type Coordinate = {
    x: number;
    y: number;
};

interface SgvCommand {
    readonly readableDescription: string;
    readonly command: SvgCommandEnum;
    readonly numberOfCoordinates: number;
}

export const SvgCommands: {
    [key in SvgCommandEnum]: SgvCommand;
} = {
    [SvgCommandEnum.MOVE]: {
        readableDescription: "Move",
        command: SvgCommandEnum.MOVE,
        numberOfCoordinates: 1,
    },
    [SvgCommandEnum.LINE]: {
        readableDescription: "Line",
        command: SvgCommandEnum.LINE,
        numberOfCoordinates: 1,
    },
    [SvgCommandEnum.QUADRATIC]: {
        readableDescription: "Quadratic Curve",
        command: SvgCommandEnum.QUADRATIC,
        numberOfCoordinates: 2,
    },
    [SvgCommandEnum.CUBIC]: {
        readableDescription: "Cubic Curve",
        command: SvgCommandEnum.CUBIC,
        numberOfCoordinates: 6,
    },
    [SvgCommandEnum.CLOSE]: {
        readableDescription: "Close",
        command: SvgCommandEnum.CLOSE,
        numberOfCoordinates: 0,
    },
};
/**
 * Represents a single point in a shape path, with a command and coordinates.
 * The `ShapePoint` class provides methods to work with and manipulate these points.
 */
export class ShapePoint {
    command: SvgCommandEnum;
    coordinates: Coordinate[];

    private constructor(command: SvgCommandEnum, coordinates: Coordinate[]) {
        this.command = command;
        this.coordinates = coordinates;
    }

    static checkCommand(command: string): SvgCommandEnum {
        if (
            !Object.values(SvgCommandEnum).includes(command as SvgCommandEnum)
        ) {
            throw new Error(`Invalid command: ${command}`);
        }
        return command as SvgCommandEnum;
    }

    static checkCoordinatesWithCommand(
        command: SvgCommandEnum,
        coordinates: Coordinate[],
    ) {
        switch (command) {
            case SvgCommandEnum.MOVE:
            case SvgCommandEnum.LINE: {
                const expected = 1;
                if (coordinates.length !== expected) {
                    throw new Error(
                        `Invalid number of coordinates for ${command} command. Expected ${expected}, got ${coordinates.length}`,
                    );
                }
                break;
            }
            case SvgCommandEnum.QUADRATIC: {
                const expected = 2;
                if (coordinates.length !== expected) {
                    throw new Error(
                        `Invalid number of coordinates for ${command} command. Expected ${expected}, got ${coordinates.length}`,
                    );
                }
                break;
            }
            case SvgCommandEnum.CUBIC: {
                const expected = 3;
                if (coordinates.length !== expected) {
                    throw new Error(
                        `Invalid number of coordinates for ${command} command. Expected ${expected}, got ${coordinates.length}`,
                    );
                }
                break;
            }
            case SvgCommandEnum.CLOSE: {
                const expected = 0;
                if (coordinates.length !== 0) {
                    throw new Error(
                        `Invalid number of coordinates for ${command} command. Expected ${expected}, got ${coordinates.length}`,
                    );
                }
                break;
            }
        }
    }

    /**
     * Converts the ShapePoint to a string representation in SVG path format
     * @returns A string in the format "command x, y "
     */
    toString() {
        const array = this.toArray();
        return `${this.command} ${array.slice(1).join(" ")} `;
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

    /**
     * Converts an array of command-coordinate tuples into an array of ShapePoint objects.
     * @param array - An array of command-coordinate tuples, where the first element is the command string and the remaining elements are the coordinate values.
     * @returns An array of ShapePoint objects representing the input array.
     */
    static fromArray(array: VanillaPoint[]): ShapePoint[] {
        const points: ShapePoint[] = [];
        for (const point of array) {
            const command = point[0] as string;
            const coordinates = point.slice(1) as number[];
            const coordPairs: Coordinate[] = [];
            for (let i = 0; i < coordinates.length; i += 2) {
                if (i + 1 >= coordinates.length) {
                    console.warn(
                        `Warning: Incomplete coordinate pair for command ${command}`,
                    );
                    break;
                }
                coordPairs.push({ x: coordinates[i], y: coordinates[i + 1] });
            }

            points.push(new ShapePoint(this.checkCommand(command), coordPairs));
        }
        return points;
    }

    /**
     * Applies an offset to the coordinates of the ShapePoint in place.
     *
     * @param offset - An object containing the x and y offsets to apply.
     * @returns The modified ShapePoint object (which is the same object).
     */
    applyOffset(offset: Coordinate) {
        for (const point of this.coordinates) {
            point.x += offset.x;
            point.y += offset.y;
        }
        return this;
    }

    /**
     * Converts the ShapePoint into an array format with command as first element
     * @returns Tuple with command string followed by coordinate numbers
     */
    toArray(): VanillaPoint {
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
    static pointsToArray(points: ShapePoint[]): VanillaPoint[] {
        return points.map((point) => point.toArray());
    }

    /**
     * Creates an array of `ShapePoint` objects from an SVG path string.
     *
     * This method takes advantage of the fact that the `fabric.Path` class can parse SVG paths.
     *
     * @param svgPath - The SVG path string to parse.
     * @returns An array of `ShapePoint` objects representing the parsed path.
     */
    static fromString(svgPath: string): ShapePoint[] {
        // Take advantage of the fact that fabric.Path can parse SVG paths
        const tempPath = new fabric.Path(svgPath);
        const points = ShapePoint.fromArray(
            tempPath.path as any as VanillaPoint[],
        );
        return points;
    }

    /******************** GENERATORS *********************/
    static createShapePoint(
        command: SvgCommandEnum,
        coordinates: Coordinate[],
    ): ShapePoint {
        this.checkCoordinatesWithCommand(command, coordinates);
        return new ShapePoint(command, coordinates);
    }

    /**
     * Creates a Move command ShapePoint
     * @param x X coordinate to move to
     * @param y Y coordinate to move to
     * @returns New ShapePoint with "M" command
     */
    static Move(coordinate: Coordinate): ShapePoint {
        return new ShapePoint(SvgCommandEnum.MOVE, [coordinate]);
    }

    /**
     * Creates a Quadratic curve command ShapePoint
     * @param cx Control point X coordinate
     * @param cy Control point Y coordinate
     * @param x End point X coordinate
     * @param y End point Y coordinate
     * @returns New ShapePoint with "Q" command
     */
    static Quadratic(
        controlPoint: Coordinate,
        endPoint: Coordinate,
    ): ShapePoint {
        return new ShapePoint(SvgCommandEnum.QUADRATIC, [
            { x: controlPoint.x, y: controlPoint.y },
            { x: endPoint.x, y: endPoint.y },
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
        controlPoint1: Coordinate,
        controlPoint2: Coordinate,
        endPoint: Coordinate,
    ): ShapePoint {
        return new ShapePoint(SvgCommandEnum.CUBIC, [
            { x: controlPoint1.x, y: controlPoint1.y },
            { x: controlPoint2.x, y: controlPoint2.y },
            { x: endPoint.x, y: endPoint.y },
        ]);
    }

    /**
     * Creates a Line command ShapePoint.
     * @param x The X coordinate of the end point.
     * @param y The Y coordinate of the end point.
     * @returns A new ShapePoint with the "L" command.
     */
    static Line(endPoint: Coordinate): ShapePoint {
        return new ShapePoint(SvgCommandEnum.LINE, [endPoint]);
    }

    /**
     * Creates a ShapePoint with the "Z" command, which closes the current path by drawing a straight line from the current point to the start point of the path.
     * @returns A new ShapePoint with the "Z" command.
     */
    static Close(): ShapePoint {
        return new ShapePoint(SvgCommandEnum.CLOSE, []);
    }

    // /**
    //  * Creates an Arc command ShapePoint.
    //  * @param rx The radius of the ellipse in the X-axis.
    //  * @param ry The radius of the ellipse in the Y-axis.
    //  * @param x The X coordinate of the end point.
    //  * @param y The Y coordinate of the end point.
    //  * @returns A new ShapePoint with the "A" command.
    //  */
    // static Arch(rx: number, ry: number, x: number, y: number): ShapePoint {
    //     return new ShapePoint("A", [
    //         { x: rx, y: ry },

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
