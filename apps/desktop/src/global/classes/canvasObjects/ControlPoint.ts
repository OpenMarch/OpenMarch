import { fabric } from "fabric";
import {
    ControlPoint as IControlPoint,
    IControllableSegment,
    Point,
    Path,
} from "@openmarch/core";
import OpenMarchCanvas from "./OpenMarchCanvas";
import { MarcherPath } from "./MarcherPath";
import { rgbaToString } from "@openmarch/core";

export class ControlPoint extends fabric.Circle {
    private _canvas: OpenMarchCanvas;
    private _controlPoint: IControlPoint;
    private _path: MarcherPath;

    constructor(
        controlPoint: IControlPoint,
        path: MarcherPath,
        canvas: OpenMarchCanvas,
    ) {
        super({
            strokeWidth: 4,
            radius: 6,
            fill: "#fff",
            stroke: rgbaToString(canvas.fieldProperties.theme.shape),
            hasBorders: false,
            originX: "center",
            originY: "center",
            hasControls: false,
            hoverCursor: "pointer",
            left: controlPoint.point.x,
            top: controlPoint.point.y,
        });

        this._controlPoint = controlPoint;
        this._canvas = canvas;
        this._path = path;

        this.on("moving", this._onMoving);
        this.on("mousedown", this._onMouseDown);
        this.on("mouseup", this._onMouseUp);
    }

    private _onMouseDown() {
        this._path.isMoving = true;
    }

    private _onMouseUp() {
        this._path.isMoving = false;
    }

    private _onMoving() {
        if (!this.left || !this.top) return;

        const newPoint: Point = { x: this.left, y: this.top };

        const currentSegment = this._path.path.segments[
            this._controlPoint.segmentIndex
        ] as IControllableSegment;

        if (!currentSegment || !("updateControlPoint" in currentSegment)) {
            return;
        }

        const newSegment = currentSegment.updateControlPoint(
            this._controlPoint.type,
            this._controlPoint.pointIndex,
            newPoint,
        );

        const originalIndex = this._controlPoint.segmentIndex;

        const newSegments = [...this._path.path.segments];
        newSegments[originalIndex] = newSegment;

        const newControlPoints = (
            newSegment as IControllableSegment
        ).getControlPoints(originalIndex);
        const updatedControlPoint = newControlPoints.find(
            (cp) =>
                cp.type === this._controlPoint.type &&
                cp.pointIndex === this._controlPoint.pointIndex,
        );

        if (updatedControlPoint) {
            this.left = updatedControlPoint.point.x;
            this.top = updatedControlPoint.point.y;
        }

        // This will trigger a rerender
        this._path.path = new Path(newSegments);
    }

    public destroy() {
        this._canvas.remove(this);
    }
}
