import { ControlPointManager, Path, type Point } from "@openmarch/path-utility";
import { fabric } from "fabric";
import FabricControlPoint from "./ControlPoint";

export default class OmPath<T extends fabric.Canvas> {
    private _pathObj: Path;
    private _fabricPath: fabric.Path;
    private _canvas: T;
    private _controlPointManager: ControlPointManager;
    private _pathOptions?: fabric.IPathOptions;

    constructor(pathObj: Path, canvas: T, pathOptions?: fabric.IPathOptions) {
        this._pathObj = pathObj;
        this._pathOptions = pathOptions;
        this._fabricPath = new fabric.Path(pathObj.toSvgString(), pathOptions);
        this._canvas = canvas;

        canvas.add(this._fabricPath);
        canvas.requestRenderAll();

        this._controlPointManager = new ControlPointManager(this._pathObj);
        this._controlPointManager.addMoveCallback(() => {
            // Update our reference to the new path from the control point manager
            this._pathObj = this._controlPointManager.path;
            this.recreatePath();
        });

        const controlPoints = this._controlPointManager.getAllControlPoints();
        for (const controlPoint of controlPoints) {
            console.log("controlPoint", controlPoint);
            new FabricControlPoint(
                controlPoint,
                (newPoint: Point) => {
                    // Capture the old segment before moving the control point
                    const oldSegment =
                        this._pathObj.segments[controlPoint.segmentIndex];
                    console.log("oldSegment", oldSegment);
                    console.log("oldPath reference:", this._pathObj);

                    this._controlPointManager.moveControlPoint(
                        controlPoint.id,
                        newPoint,
                    );

                    // Get the new segment after the move
                    const newSegment =
                        this._pathObj.segments[controlPoint.segmentIndex];
                    console.log("newSegment", newSegment);
                    console.log("newPath reference:", this._pathObj);
                    console.log(
                        "controlPointManager path reference:",
                        this._controlPointManager.path,
                    );

                    // Also log the difference to make it clear what changed
                    console.log("Segment changed:", oldSegment !== newSegment);
                    console.log(
                        "Path reference changed:",
                        oldSegment !== newSegment,
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
        this.recreatePath();
    }

    recreatePath() {
        if (this._fabricPath) {
            this._canvas.remove(this._fabricPath);
        }
        this._fabricPath = new fabric.Path(
            this._pathObj.toSvgString(),
            this._pathOptions,
        );
        this._canvas.add(this._fabricPath);
        this._canvas.requestRenderAll();
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
