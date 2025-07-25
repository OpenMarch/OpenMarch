import { IControllableSegment, IPath, Point } from "@openmarch/path-utility";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { MarcherPathSegment } from "./MarcherPathSegment";
import { ControlPoint } from "./ControlPoint";

export class MarcherPath {
    private _path: IPath;
    private _canvas: OpenMarchCanvas;
    private _segments: MarcherPathSegment[] = [];
    private _controlPoints: ControlPoint[] = [];
    private _areControlsEnabled = false;

    constructor(path: IPath, canvas: OpenMarchCanvas) {
        this._path = path;
        this._canvas = canvas;
        this._render();
    }

    private _render() {
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
                const cp = new ControlPoint(
                    controlPoint,
                    this._canvas,
                    this._onControlPointMove.bind(this),
                );
                this._controlPoints.push(cp);
            }
        }
    }

    public disableControls() {
        this._controlPoints.forEach((cp) => cp.destroy());
        this._controlPoints = [];
        this._areControlsEnabled = false;
    }

    private _onControlPointMove(id: string, newPoint: Point) {
        const controllableSegments = this.path.segments.filter(
            (segment) => "getControlPoints" in segment,
        ) as IControllableSegment[];

        for (let i = 0; i < controllableSegments.length; i++) {
            const segment = controllableSegments[i];
            const controlPoints = segment.getControlPoints(i);
            const controlPoint = controlPoints.find((cp) => cp.id === id);

            if (controlPoint) {
                const newSegment = segment.updateControlPoint(
                    controlPoint.type,
                    controlPoint.pointIndex,
                    newPoint,
                );
                const newSegments = [...this.path.segments];
                newSegments[i] = newSegment;
                // This will trigger a rerender
                this.path = { ...this.path, segments: newSegments };
                break;
            }
        }
    }

    get path(): IPath {
        return this._path;
    }

    set path(newPath: IPath) {
        this._path = newPath;
        this._render();
    }

    public destroy() {
        this._destroy();
    }
}
