import { Path } from "@openmarch/path-utility";
import { fabric } from "fabric";

export default class OmPath<T extends fabric.Canvas> {
    private _pathObj: Path;
    private _fabricPath: fabric.Path;
    private _canvas: T;

    constructor(pathObj: Path, canvas: T) {
        this._pathObj = pathObj;
        this._fabricPath = new fabric.Path(pathObj.toSvgString());
        this._canvas = canvas;

        canvas.add(this._fabricPath);
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
        this._fabricPath = new fabric.Path(this._pathObj.toSvgString());
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
