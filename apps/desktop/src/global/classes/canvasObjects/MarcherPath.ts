import { IControllableSegment, IPath, Point } from "@openmarch/core";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { MarcherPathSegment } from "./MarcherPathSegment";
import { ControlPoint } from "./ControlPoint";

export class MarcherPath {
    private _path: IPath;
    private _canvas: OpenMarchCanvas;
    private _segments: MarcherPathSegment[] = [];
    private _controlPoints: ControlPoint[] = [];
    private _areControlsEnabled = false;
    private _isMoving = false;

    constructor(path: IPath, canvas: OpenMarchCanvas) {
        this._path = path;
        this._canvas = canvas;
        this._render();
    }

    private _render() {
        console.log("PATH RENDER");
        this._destroy();
        this._segments = this._path.segments.map(
            (segment) => new MarcherPathSegment(segment, this._canvas),
        );
        this._segments.forEach((segment) => segment.render());
        if (this._areControlsEnabled) {
            this.enableControls();
        }
        this._canvas.requestRenderAll();
    }

    private _destroy() {
        console.log("PATH DESTROY");
        this.disableControls();
        this._segments.forEach((segment) => segment.destroy());
        this._segments = [];
    }

    public enableControls() {
        this.disableControls();
        this._areControlsEnabled = true;
        const controllableSegments = this._path.segments.filter(
            (segment) => "getControlPoints" in segment,
        ) as IControllableSegment[];

        for (let i = 0; i < controllableSegments.length; i++) {
            const segment = controllableSegments[i];
            const controlPoints = segment.getControlPoints(i);
            for (const controlPoint of controlPoints) {
                const cp = new ControlPoint(controlPoint, this, this._canvas);
                this._controlPoints.push(cp);
                this._canvas.add(cp);
            }
        }
        this._canvas.requestRenderAll();
    }

    public set isMoving(moving: boolean) {
        this._isMoving = moving;
        // if (!moving) {
        //     // After moving, do a full re-render to sync control points
        //     this._render();
        // }
    }

    public disableControls() {
        this._controlPoints.forEach((cp) => cp.destroy());
        this._controlPoints = [];
        this._areControlsEnabled = false;
    }

    private _bringControlsToFront() {
        for (const cp of this._controlPoints) {
            cp.bringToFront();
        }
    }

    get path(): IPath {
        return this._path;
    }

    set path(newPath: IPath) {
        this._path = newPath;

        if (this._isMoving) {
            // Soft render: only update path segments, not controls
            this._segments.forEach((segment) => segment.destroy());
            this._segments = this._path.segments.map(
                (segment) => new MarcherPathSegment(segment, this._canvas),
            );
            this._segments.forEach((segment) => segment.render());
            this._bringControlsToFront();
            this._canvas.requestRenderAll();
        }
        // else {
        //     // Full render: update everything
        //     this._render();
        // }
    }

    public destroy() {
        this._destroy();
    }
}
