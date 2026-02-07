import {
    Path,
    type ControlPointConfig,
    type Point,
} from "../../../../path-utility copy";
import { fabric } from "fabric";
import FabricControlPoint from "./ControlPoint";

const numberOfChildren = 20;
const midPointRadius = 4;
const midPointFill = "#4A90E2";

export default class OmPath<T extends fabric.Canvas> {
    private _pathObj: Path;
    private _fabricPath: fabric.Path;
    private _canvas: T;
    private _children: fabric.Object[] = [];
    private _fabricControlPoints: FabricControlPoint[] = [];
    private _midSegmentPoints: fabric.Object[] = [];

    constructor(
        pathObj: Path,
        canvas: T,
        config?: ControlPointConfig,
        pathOptions?: fabric.IPathOptions,
    ) {
        this._pathObj = pathObj;
        this._fabricPath = new fabric.Path(pathObj.toSvgString(), {
            selectable: false,
            width: 1000,
            height: 1000,
            ...pathOptions,
        });
        this._canvas = canvas;

        canvas.add(this._fabricPath);
        canvas.requestRenderAll();

        const coordinates =
            this._pathObj.getEvenlySpacedPoints(numberOfChildren);
        for (let i = 0; i < numberOfChildren; i++) {
            const pt = coordinates[i]!;
            const child = new fabric.Circle({
                radius: 5,
                fill: "red",
                originX: "center",
                originY: "center",
                left: pt.x,
                top: pt.y,
            });
            this._children.push(child);
            canvas.add(child);
        }

        this.createVertexControlPoints();
        this.createMidSegmentPoints();
        canvas.requestRenderAll();
    }

    private createVertexControlPoints(): void {
        const controlPoints = this.pathObj.segments.flatMap((segment) =>
            segment.getControlPoints(0),
        );
        for (const controlPoint of controlPoints) {
            const fp = new FabricControlPoint(
                controlPoint,
                (newPoint: Point) => {
                    this.moveControlPoint(controlPoint.id, newPoint);
                },
                this._canvas,
            );
            this._fabricControlPoints.push(fp);
        }
    }

    private createMidSegmentPoints(): void {}

    get canvas(): T {
        return this._canvas;
    }

    get pathObj(): Path {
        return this._pathObj;
    }

    set pathObj(pathObj: Path) {
        this._pathObj = pathObj;
        this.updatePath();
    }

    updatePath() {
        if (this._fabricPath) {
            // Use fabric's utility to parse the SVG string into path commands
            const newPathCommands = (fabric.util as any).parsePath(
                this._pathObj.toSvgString(),
            );

            // Set the new path commands on the existing fabric object
            this._fabricPath.objectCaching = false;
            this._fabricPath.set("path", newPathCommands);

            // Tell fabric to recalculate the object's dimensions and position
            this._fabricPath.setCoords();
            this._fabricPath.calcOwnMatrix();

            const coordinates =
                this._pathObj.getEvenlySpacedPoints(numberOfChildren);

            for (let i = 0; i < numberOfChildren; i++) {
                const pt = coordinates[i]!;
                const child = this._children[i]!;
                child.set("left", pt.x);
                child.set("top", pt.y);
            }

            // Request a re-render of the canvas
            this._canvas.requestRenderAll();
        }
    }

    /**
     * Hides the path by removing it from the canvas.
     */
    hide() {
        if (this._fabricPath) this._canvas.remove(this._fabricPath);
    }

    /**
     * Adds the path to the canvas.
     */
    addToCanvas() {
        this._canvas.add(this._fabricPath);
    }
}
