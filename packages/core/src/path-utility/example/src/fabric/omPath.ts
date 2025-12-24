import { ControlPointManager, Path, type Point } from "@openmarch/core";
import { fabric } from "fabric";
import FabricControlPoint from "./ControlPoint";

export default class OmPath<T extends fabric.Canvas> {
    private _pathObj: Path;
    private _fabricPath: fabric.Path;
    private _canvas: T;
    private _controlPointManager: ControlPointManager;

    constructor(pathObj: Path, canvas: T, pathOptions?: fabric.IPathOptions) {
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

        this._controlPointManager = new ControlPointManager(this._pathObj);
        this._controlPointManager.addMoveCallback(() => {
            // The path object is now mutated, so we just need to update the fabric object.
            this.updatePath();
        });

        const controlPoints = this._controlPointManager.getAllControlPoints();
        for (const controlPoint of controlPoints) {
            new FabricControlPoint(
                controlPoint,
                (newPoint: Point) => {
                    this._controlPointManager.moveControlPoint(
                        controlPoint.id,
                        newPoint,
                    );
                },
                canvas,
            );
        }
    }

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
